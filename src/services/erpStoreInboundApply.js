import { supabase } from '@/lib/supabase'
import {
  mergeErpStoreInventoryRow,
  deriveInventoryStatusFromQty,
} from '@/lib/productInventoryMerge'
import {
  buildStockByColorMap,
  numStock,
  productHasColorVariants,
  resolveColorBucketKey,
  sumStockByColor,
} from '@/lib/stockByColor'

function isMissingValueColumnsError(err) {
  const m = String(err?.message || err || '')
  return /avg_cost_usd|stock_value_usd|42703|column|schema/i.test(m)
}

async function upsertErpStoreInventory(productId, quantity, stockByColor, avgCostUsd, stockValueUsd) {
  const q = Math.max(0, Math.floor(Number(quantity) || 0))
  const payload = {
    product_id: productId,
    quantity: q,
    stock_by_color: stockByColor ?? null,
    status: deriveInventoryStatusFromQty(q),
    updated_at: new Date().toISOString(),
  }
  if (avgCostUsd != null) payload.avg_cost_usd = Math.max(0, Number(avgCostUsd) || 0)
  if (stockValueUsd != null) payload.stock_value_usd = Math.max(0, Number(stockValueUsd) || 0)

  let { error } = await supabase.from('erp_store_inventory').upsert(payload, {
    onConflict: 'product_id',
  })
  if (error && isMissingValueColumnsError(error)) {
    const fallback = {
      product_id: productId,
      quantity: q,
      stock_by_color: stockByColor ?? null,
      status: payload.status,
      updated_at: payload.updated_at,
    }
    ;({ error } = await supabase.from('erp_store_inventory').upsert(fallback, {
      onConflict: 'product_id',
    }))
  }
  return error
}

/**
 * CRM buyurtma qatorlari → `erp_store_inventory` (do‘kon zaxirasi).
 */
export async function applyErpStoreInboundFromItems(orderId, orderNumber, items) {
  if (!items?.length) return { success: true, results: [], errors: [] }

  const results = []
  const errors = []
  const movementRows = []

  // 1) Bir xil mahsulotni oldindan yig‘ib olamiz (network round-triplarni kamaytiradi).
  const grouped = new Map()
  for (const item of items) {
    const productId = item?.product_id ? String(item.product_id) : ''
    if (!productId) continue
    const addQty = Math.max(0, Math.floor(Number(item.quantity) || 0))
    if (addQty <= 0) {
      results.push({ product_id: productId, success: true, skipped: true })
      continue
    }
    if (!grouped.has(productId)) {
      grouped.set(productId, { totalQty: 0, byRawColor: new Map(), lines: [] })
    }
    const g = grouped.get(productId)
    g.totalQty += addQty
    const rawColor = item.color != null ? String(item.color).trim() : ''
    g.byRawColor.set(rawColor, (Number(g.byRawColor.get(rawColor)) || 0) + addQty)
    const unitPriceUsdRaw = item?.unit_price_usd
    const unitPriceUsd =
      unitPriceUsdRaw != null && Number.isFinite(Number(unitPriceUsdRaw)) && Number(unitPriceUsdRaw) >= 0
        ? Number(unitPriceUsdRaw)
        : null
    g.lines.push({ qty: addQty, rawColor, unitPriceUsd })
  }

  const productIds = [...grouped.keys()]
  if (!productIds.length) {
    return { success: true, results, errors }
  }

  // 2) Mahsulotlarni batch o‘qish (oldin har item uchun .single() qilinardi).
  const productById = new Map()
  const chunkSize = 100
  for (let i = 0; i < productIds.length; i += chunkSize) {
    const chunk = productIds.slice(i, i + chunkSize)
    const { data: rawRows, error: fetchError } = await supabase
      .from('products')
      .select(
        'id, name, colors, color, erp_store_inventory(quantity, stock_by_color, avg_cost_usd, stock_value_usd), product_erp_pricing(unit_price_uzs)'
      )
      .in('id', chunk)
    if (fetchError) {
      for (const pid of chunk) {
        errors.push({ product_id: pid, error: fetchError.message || 'Mahsulotni o‘qib bo‘lmadi' })
      }
      continue
    }
    for (const raw of rawRows || []) {
      const product = mergeErpStoreInventoryRow(raw)
      const pr = Array.isArray(raw?.product_erp_pricing) ? raw.product_erp_pricing[0] : raw?.product_erp_pricing
      const unitFallback =
        pr?.unit_price_uzs != null && Number.isFinite(Number(pr.unit_price_uzs)) && Number(pr.unit_price_uzs) >= 0
          ? Number(pr.unit_price_uzs)
          : 0
      productById.set(String(raw.id), { ...product, _inbound_unit_fallback_usd: unitFallback })
    }
  }

  // 3) Har mahsulot uchun bitta upsert qilish.
  for (const [productId, payload] of grouped.entries()) {
    const addQty = payload.totalQty

    try {
      const product = productById.get(String(productId))
      if (!product) {
        errors.push({ product_id: productId, error: 'Mahsulot topilmadi' })
        continue
      }

      const currentStock = numStock(product.stock)
      const currentValue = Math.max(
        0,
        Number(product.stock_value_usd) ||
          currentStock * Math.max(0, Number(product.avg_cost_usd) || 0)
      )
      const addValue = Math.round(
        payload.lines.reduce((s, line) => {
          const unit = line.unitPriceUsd != null ? line.unitPriceUsd : Number(product._inbound_unit_fallback_usd) || 0
          return s + Math.max(0, unit) * Math.max(0, Number(line.qty) || 0)
        }, 0) * 100
      ) / 100
      let newStock
      let newStockByColor
      let colorKeyResolved = null
      let reasonExtra = ''

      if (!productHasColorVariants(product)) {
        newStock = currentStock + addQty
        const newValue = Math.round((currentValue + addValue) * 100) / 100
        const newAvg = newStock > 0 ? newValue / newStock : 0
        const err = await upsertErpStoreInventory(productId, newStock, null, newAvg, newValue)
        if (err) throw err
      } else {
        const map = buildStockByColorMap(product)
        const unmatched = []

        for (const [rawColor, qty] of payload.byRawColor.entries()) {
          const bucketKey = resolveColorBucketKey(product, rawColor)
          if (bucketKey) {
            map[bucketKey] = (Number(map[bucketKey]) || 0) + qty
            colorKeyResolved = bucketKey
          } else {
            const fallbackColor = rawColor || 'Nomaʼlum rang'
            map[fallbackColor] = (Number(map[fallbackColor]) || 0) + qty
            unmatched.push(fallbackColor)
            colorKeyResolved = fallbackColor
          }
        }

        newStock = sumStockByColor(map)
        newStockByColor = map
        const newValue = Math.round((currentValue + addValue) * 100) / 100
        const newAvg = newStock > 0 ? newValue / newStock : 0
        if (unmatched.length) {
          reasonExtra = ` [Rang mos kelmadi — yangi rang bucket: ${[...new Set(unmatched)].join(', ')}]`
        }
        const err = await upsertErpStoreInventory(
          productId,
          newStock,
          newStockByColor,
          newAvg,
          newValue
        )
        if (err) throw err
      }

      movementRows.push({
        product_id: productId,
        change_amount: addQty,
        previous_stock: currentStock,
        new_stock: newStock,
        reason: `ERP kirimi: CRM topshirig‘i №${orderNumber || orderId}${reasonExtra}`,
        type: 'restock',
        order_id: orderId,
        color_key: colorKeyResolved,
      })

      results.push({ product_id: productId, success: true })
    } catch (err) {
      console.error('applyErpStoreInboundFromItems:', err)
      errors.push({ product_id: productId, error: err.message })
    }
  }

  // 4) Loglarni bitta insert bilan yozamiz.
  if (movementRows.length) {
    const { error: logError } = await supabase.from('stock_movements').insert(movementRows)
    if (logError) {
      console.warn('ERP kirim logi:', logError)
    }
  }

  return {
    success: errors.length === 0,
    results,
    errors,
  }
}
