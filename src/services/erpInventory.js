import { supabase } from '@/lib/supabase'
import { mergeProductErpPricingRow } from '@/lib/productErpPricingMerge'
import {
  deriveInventoryStatusFromQty,
  mergeErpStoreInventoryRow,
} from '@/lib/productInventoryMerge'
import {
  buildStockByColorMap,
  numStock,
  productHasColorVariants,
  resolveColorBucketKey,
  sumStockByColor,
} from '@/lib/stockByColor'

/**
 * ERP katalog: CRM `sale_price` yo‘q — do‘kon narxi faqat `product_erp_pricing`.
 * Do‘kon zaxirasi: `erp_store_inventory`.
 */
const ERP_CATALOG_SELECT = `
  id,
  size,
  category_id,
  name,
  name_uz,
  name_ru,
  name_en,
  description,
  description_uz,
  description_ru,
  description_en,
  image_url,
  images,
  category,
  colors,
  color,
  created_at,
  categories(name),
  erp_store_inventory(quantity, stock_by_color, avg_cost_usd, stock_value_usd, status),
  product_erp_pricing(unit_price_uzs)
`.replace(/\s+/g, ' ')

const ERP_CATALOG_SELECT_NO_ERP_PRICE = `
  id,
  size,
  category_id,
  name,
  name_uz,
  name_ru,
  name_en,
  description,
  description_uz,
  description_ru,
  description_en,
  image_url,
  images,
  category,
  colors,
  color,
  created_at,
  categories(name),
  erp_store_inventory(quantity, stock_by_color, avg_cost_usd, stock_value_usd, status)
`.replace(/\s+/g, ' ')

function mergeErpProductRow(p) {
  return mergeProductErpPricingRow(mergeErpStoreInventoryRow(p))
}

function isMissingValueColumnsError(err) {
  const m = String(err?.message || err || '')
  return /avg_cost_usd|stock_value_usd|42703|column|schema/i.test(m)
}

async function upsertErpStoreInventory(productId, { quantity, stockByColor, avgCostUsd, stockValueUsd }) {
  const q = Math.max(0, Math.floor(Number(quantity) || 0))
  const status = deriveInventoryStatusFromQty(q)
  const payload = {
    product_id: productId,
    quantity: q,
    stock_by_color: stockByColor ?? null,
    status,
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
      status,
      updated_at: payload.updated_at,
    }
    ;({ error } = await supabase.from('erp_store_inventory').upsert(fallback, {
      onConflict: 'product_id',
    }))
  }
  return error
}

/**
 * Do‘konda naqd/terminal sotuv — faqat `erp_store_inventory` dan ayirish.
 */
export async function recordRetailSale({ productId, colorRaw, quantity }) {
  const deductQty = Math.max(0, Math.floor(Number(quantity) || 0))
  if (!productId || deductQty <= 0) {
    return { success: false, error: 'Mahsulot yoki miqdor noto‘g‘ri' }
  }

  const { data: raw, error: fetchError } = await supabase
    .from('products')
    .select(
      `
      id,
      name,
      colors,
      color,
      erp_store_inventory(quantity, stock_by_color, avg_cost_usd, stock_value_usd)
    `
    )
    .eq('id', productId)
    .single()

  if (fetchError) return { success: false, error: fetchError.message }

  const product = mergeErpStoreInventoryRow(raw)

  const currentStock = numStock(product.stock)
  const currentValue = Math.max(
    0,
    Number(product.stock_value_usd) ||
      currentStock * Math.max(0, Number(product.avg_cost_usd) || 0)
  )
  const currentAvgCost = currentStock > 0 ? currentValue / currentStock : 0
  const deductValue = Math.min(currentValue, Math.max(0, deductQty * currentAvgCost))
  const newValue = Math.max(0, Math.round((currentValue - deductValue) * 100) / 100)
  let newStock
  let newStockByColor
  let colorKeyResolved = null
  let reasonExtra = ''

  if (!productHasColorVariants(product)) {
    if (currentStock < deductQty) {
      return { success: false, error: `Omborda yetarli emas (qoldiq: ${currentStock})` }
    }
    newStock = currentStock - deductQty
    const invErr = await upsertErpStoreInventory(productId, {
      quantity: newStock,
      stockByColor: null,
      avgCostUsd: newStock > 0 ? newValue / newStock : 0,
      stockValueUsd: newValue,
    })
    if (invErr) return { success: false, error: invErr.message }
  } else {
    const bucketKey = resolveColorBucketKey(product, colorRaw)
    if (bucketKey) {
      const map = buildStockByColorMap(product)
      const cur = Number(map[bucketKey]) || 0
      if (cur < deductQty) {
        return {
          success: false,
          error: `Bu rang bo‘yicha yetarli emas (qoldiq: ${cur})`,
        }
      }
      map[bucketKey] = Math.max(0, cur - deductQty)
      newStock = sumStockByColor(map)
      newStockByColor = map
      colorKeyResolved = bucketKey
      const invErr = await upsertErpStoreInventory(productId, {
        quantity: newStock,
        stockByColor: newStockByColor,
        avgCostUsd: newStock > 0 ? newValue / newStock : 0,
        stockValueUsd: newValue,
      })
      if (invErr) return { success: false, error: invErr.message }
    } else {
      if (currentStock < deductQty) {
        return { success: false, error: `Omborda yetarli emas (qoldiq: ${currentStock})` }
      }
      newStock = currentStock - deductQty
      reasonExtra = ' [Rang mos kelmedi — faqat jami zaxira]'
      const invErr = await upsertErpStoreInventory(productId, {
        quantity: newStock,
        stockByColor: product.stock_by_color ?? null,
        avgCostUsd: newStock > 0 ? newValue / newStock : 0,
        stockValueUsd: newValue,
      })
      if (invErr) return { success: false, error: invErr.message }
    }
  }

  const label = product.name || productId
  await supabase.from('stock_movements').insert([
    {
      product_id: productId,
      change_amount: -deductQty,
      previous_stock: currentStock,
      new_stock: newStock,
      reason: `Sotuv: Do‘kon (ERP) — ${label}${reasonExtra}`,
      type: 'sale',
      order_id: null,
      color_key: colorKeyResolved,
    },
  ])

  return {
    success: true,
    productId,
    newStock,
    colorKey: colorKeyResolved,
  }
}

/**
 * Savatdan qaytarish / bekor qilish: do‘kon omboriga qty qo‘shib beradi.
 */
export async function recordRetailRestock({ productId, colorRaw, quantity }) {
  const addQty = Math.max(0, Math.floor(Number(quantity) || 0))
  if (!productId || addQty <= 0) {
    return { success: false, error: 'Mahsulot yoki miqdor noto‘g‘ri' }
  }

  const { data: raw, error: fetchError } = await supabase
    .from('products')
    .select(
      `
      id,
      name,
      colors,
      color,
      erp_store_inventory(quantity, stock_by_color, avg_cost_usd, stock_value_usd)
    `
    )
    .eq('id', productId)
    .single()

  if (fetchError) return { success: false, error: fetchError.message }

  const product = mergeErpStoreInventoryRow(raw)
  const currentStock = numStock(product.stock)
  const currentValue = Math.max(
    0,
    Number(product.stock_value_usd) ||
      currentStock * Math.max(0, Number(product.avg_cost_usd) || 0)
  )
  const avgCost = currentStock > 0 ? currentValue / currentStock : 0

  let newStock
  let newStockByColor
  let colorKeyResolved = null
  let reasonExtra = ''

  if (!productHasColorVariants(product)) {
    newStock = currentStock + addQty
    const newValue = Math.round((currentValue + avgCost * addQty) * 100) / 100
    const invErr = await upsertErpStoreInventory(productId, {
      quantity: newStock,
      stockByColor: null,
      avgCostUsd: newStock > 0 ? newValue / newStock : 0,
      stockValueUsd: newValue,
    })
    if (invErr) return { success: false, error: invErr.message }
  } else {
    const map = buildStockByColorMap(product)
    const bucketKey = resolveColorBucketKey(product, colorRaw)
    if (bucketKey) {
      map[bucketKey] = (Number(map[bucketKey]) || 0) + addQty
      colorKeyResolved = bucketKey
    } else {
      const fallbackColor = String(colorRaw || 'Nomaʼlum rang').trim() || 'Nomaʼlum rang'
      map[fallbackColor] = (Number(map[fallbackColor]) || 0) + addQty
      colorKeyResolved = fallbackColor
      reasonExtra = ' [Rang mos kelmadi — fallback bucket]'
    }
    newStock = sumStockByColor(map)
    newStockByColor = map
    const newValue = Math.round((currentValue + avgCost * addQty) * 100) / 100
    const invErr = await upsertErpStoreInventory(productId, {
      quantity: newStock,
      stockByColor: newStockByColor,
      avgCostUsd: newStock > 0 ? newValue / newStock : 0,
      stockValueUsd: newValue,
    })
    if (invErr) return { success: false, error: invErr.message }
  }

  const label = product.name || productId
  await supabase.from('stock_movements').insert([
    {
      product_id: productId,
      change_amount: addQty,
      previous_stock: currentStock,
      new_stock: newStock,
      reason: `Savatdan qaytarish: Do‘kon (ERP) — ${label}${reasonExtra}`,
      type: 'restock',
      order_id: null,
      color_key: colorKeyResolved,
    },
  ])

  return { success: true, productId, newStock, colorKey: colorKeyResolved }
}

export async function fetchProductsForErp() {
  let res = await supabase
    .from('products')
    .select(ERP_CATALOG_SELECT)
    .order('created_at', { ascending: false })

  if (res.error && /product_erp_pricing|relationship|schema cache/i.test(String(res.error.message))) {
    res = await supabase
      .from('products')
      .select(ERP_CATALOG_SELECT_NO_ERP_PRICE)
      .order('created_at', { ascending: false })
  }

  if (!res.error) {
    return (res.data || []).map(mergeErpProductRow)
  }

  const legacy = await supabase
    .from('products')
    .select('*, categories(name)')
    .order('created_at', { ascending: false })

  // Eski bazalar: `erp_store_inventory` / `product_erp_pricing` yo‘q — to‘g‘ridan-to‘g‘ri `products` qatori.
  if (!legacy.error) return legacy.data || []

  const plain = await supabase.from('products').select('*').order('created_at', { ascending: false })
  if (!plain.error) return plain.data || []

  throw new Error(
    [res.error?.message, legacy.error?.message].filter(Boolean).join(' · ') ||
      'Mahsulotlarni yuklashda xato'
  )
}

/**
 * ERP mahsulot narxini (USD) alohida belgilash.
 * CRM `sale_price` dan mustaqil: `product_erp_pricing.unit_price_uzs` maydoniga yoziladi.
 */
export async function updateErpProductUnitPrice(productId, unitPriceUsd) {
  const p = Number(unitPriceUsd)
  if (!productId || !Number.isFinite(p) || p < 0) {
    return { success: false, error: 'Narx noto‘g‘ri' }
  }
  const rounded = Math.round(p * 100) / 100
  const { error } = await supabase.from('product_erp_pricing').upsert(
    {
      product_id: productId,
      unit_price_uzs: rounded,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'product_id' }
  )
  if (error) return { success: false, error: error.message }
  return { success: true, unit_price_usd: rounded }
}

const INBOUND_PRODUCT_LABEL_SELECT = `
  id,
  name,
  name_uz,
  name_ru,
  name_en,
  size,
  image_url,
  images,
  category,
  categories (name, name_uz),
  product_erp_pricing (unit_price_uzs)
`
  .replace(/\s+/g, ' ')

/**
 * CRM kirim `items` ro‘yxati uchun — faqat nom va SKU (`size`) yuklash.
 * Ko‘p `id` uchun so‘rovlarni parchalaydi.
 */
export async function fetchProductMapByIds(rawIds) {
  const ids = [...new Set((rawIds || []).filter(Boolean).map((id) => String(id)))]
  const map = new Map()
  if (ids.length === 0) return map

  const chunkSize = 100
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from('products')
      .select(INBOUND_PRODUCT_LABEL_SELECT)
      .in('id', chunk)

    if (error) {
      throw new Error(error.message || 'Mahsulotlarni yuklashda xato')
    }
    for (const row of data || []) {
      map.set(String(row.id), mergeProductErpPricingRow(row))
    }
  }
  return map
}

export function getProductDisplayName(product) {
  if (!product) return '—'
  return (
    String(product.name_uz || '').trim() ||
    String(product.name_ru || '').trim() ||
    String(product.name_en || '').trim() ||
    String(product.name || '').trim() ||
    '—'
  )
}

export function getProductDisplayDescription(product) {
  if (!product) return ''
  return (
    String(product.description_uz || '').trim() ||
    String(product.description_ru || '').trim() ||
    String(product.description_en || '').trim() ||
    String(product.description || '').trim()
  )
}

export function getProductDisplayCategory(product) {
  if (!product) return '—'
  return (
    String(product?.categories?.name || '').trim() ||
    String(product.category || '').trim() ||
    'Kategoriyasiz'
  )
}

/**
 * Do‘kon (ERP) narxi — `product_erp_pricing` (bazada `unit_price_uzs` nomi, qiymat CRM `sale_price` bilan bir xil USD).
 */
export function getProductUnitPrice(product) {
  const erp = Number(product?.erp_unit_price_uzs)
  if (Number.isFinite(erp) && erp >= 0) return erp
  return 0
}

/**
 * Do‘kon omboridagi mahsulot qiymati (USD): qoldiq × joriy katalog narxi.
 * `erp_store_inventory.stock_value_usd` ishlatilmaydi — u odatda kirim/tan narx bo‘yicha;
 * sahifadagi «Jami qiymat» va narx tahriri esa joriy `product_erp_pricing` bilan mos bo‘lsin.
 */
export function getProductStockValueUsd(product) {
  const qty = Math.max(0, Number(product?.stock) || 0)
  const unit = getProductUnitPrice(product)
  return Math.round(qty * unit * 100) / 100
}

function trimUrl(value) {
  if (value == null) return ''
  const s = String(value).trim()
  return s || ''
}

/**
 * CRM `image_url` + `images` (massiv yoki JSON qator) — birinchi ochiq URL.
 */
export function getProductImageUrl(product) {
  if (!product) return ''

  let imgs = product.images
  if (typeof imgs === 'string') {
    const raw = imgs.trim()
    if (!raw) {
      imgs = null
    } else if (raw.startsWith('[') || raw.startsWith('{')) {
      try {
        imgs = JSON.parse(raw)
      } catch {
        imgs = null
      }
    } else if (/^https?:\/\//i.test(raw)) {
      return raw
    } else {
      imgs = null
    }
  }

  if (Array.isArray(imgs)) {
    for (const item of imgs) {
      if (typeof item === 'string') {
        const u = trimUrl(item)
        if (u) return u
      } else if (item && typeof item === 'object') {
        const u = trimUrl(item.url || item.src || item.path)
        if (u) return u
      }
    }
  }

  return (
    trimUrl(product.image_url) ||
    trimUrl(product.imageUrl) ||
    trimUrl(product.photo_url) ||
    ''
  )
}
