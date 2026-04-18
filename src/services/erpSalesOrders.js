import { supabase } from '@/lib/supabase'
import { recordRetailRestock, recordRetailSale } from '@/services/erpInventory'
import { listProductColors, resolveColorBucketKey } from '@/lib/stockByColor'

const LOCAL_KEY = 'nuur_erp_sales_orders_v1'

function uid() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {}
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function toNum(v) {
  return Number(v) || 0
}

function loadLocalOrders() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveLocalOrders(orders) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(orders))
  } catch {}
}

function isSalesTablesMissing(err) {
  const msg = String(err?.message || err || '')
  return /erp_sales_orders|erp_sales_order_items|relation|does not exist|schema cache|PGRST/i.test(msg)
}

function isMissingStatusColumns(err) {
  const msg = String(err?.message || err || '')
  return /status|canceled_at|cancelled_at|updated_at|42703|column/i.test(msg)
}

function normalizeOrderRows(rows) {
  return (rows || []).map((row) => {
    const items = (row.items || []).map((it) => ({
      id: String(it.id || ''),
      product_id: String(it.product_id || ''),
      product_name: String(it.product_name || ''),
      category_name: String(it.category_name || 'Kategoriyasiz'),
      color_name: it.color_name == null ? null : String(it.color_name),
      quantity: Math.max(0, Math.floor(toNum(it.quantity))),
      unit_price_usd: Math.max(0, toNum(it.unit_price_usd)),
      line_total_usd: Math.max(0, toNum(it.line_total_usd)),
    }))
    return {
      id: String(row.id || ''),
      seller_user_id: row.seller_user_id == null ? null : String(row.seller_user_id),
      seller_email: String(row.seller_email || ''),
      customer_name: String(row.customer_name || 'Mijoz ko`rsatilmagan'),
      total_usd: Math.max(0, toNum(row.total_usd)),
      total_items: Math.max(0, Math.floor(toNum(row.total_items))),
      status: String(row.status || 'paid'),
      canceled_at: row.canceled_at || null,
      paid_at: row.paid_at || row.created_at || new Date().toISOString(),
      created_at: row.created_at || row.paid_at || new Date().toISOString(),
      items,
    }
  })
}

function normColor(v) {
  const s = String(v ?? '').trim()
  return s || null
}

function lineKey(productId, colorName) {
  return `${String(productId || '')}::${normColor(colorName) || ''}`
}

export async function createSalesOrder({
  sellerUserId,
  sellerEmail,
  customerName,
  items,
  totalUsd,
  paidAt,
}) {
  const cleanItems = (items || [])
    .map((it) => ({
      product_id: String(it.productId || ''),
      product_name: String(it.name || ''),
      category_name: String(it.categoryName || 'Kategoriyasiz'),
      color_name: it.colorLabel ? String(it.colorLabel) : null,
      quantity: Math.max(0, Math.floor(toNum(it.qty))),
      unit_price_usd: Math.max(0, toNum(it.unitPrice)),
    }))
    .filter((it) => it.product_id && it.quantity > 0)
    .map((it) => ({
      ...it,
      line_total_usd: Math.round(it.quantity * it.unit_price_usd * 100) / 100,
    }))

  if (!cleanItems.length) {
    return { success: false, error: 'Buyurtma uchun mahsulotlar topilmadi' }
  }

  const payloadOrder = {
    seller_user_id: sellerUserId || null,
    seller_email: sellerEmail || '',
    customer_name: String(customerName || '').trim() || 'Mijoz ko`rsatilmagan',
    total_usd: Math.max(0, toNum(totalUsd)),
    total_items: cleanItems.reduce((s, x) => s + x.quantity, 0),
    status: 'paid',
    paid_at: paidAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  let created = null
  let orderError = null
  ;({ data: created, error: orderError } = await supabase
    .from('erp_sales_orders')
    .insert([payloadOrder])
    .select('id')
    .single())

  if (orderError && isMissingStatusColumns(orderError)) {
    const legacyPayload = {
      seller_user_id: payloadOrder.seller_user_id,
      seller_email: payloadOrder.seller_email,
      customer_name: payloadOrder.customer_name,
      total_usd: payloadOrder.total_usd,
      total_items: payloadOrder.total_items,
      paid_at: payloadOrder.paid_at,
    }
    ;({ data: created, error: orderError } = await supabase
      .from('erp_sales_orders')
      .insert([legacyPayload])
      .select('id')
      .single())
  }

  if (!orderError && created?.id) {
    const rows = cleanItems.map((it) => ({
      order_id: created.id,
      ...it,
    }))
    const { error: itemErr } = await supabase.from('erp_sales_order_items').insert(rows)
    if (itemErr) {
      return { success: false, error: itemErr.message }
    }
    return { success: true, orderId: String(created.id), source: 'supabase' }
  }

  if (!isSalesTablesMissing(orderError)) {
    return { success: false, error: orderError?.message || 'Buyurtmani saqlashda xato' }
  }

  // Fallback: lokal saqlash (test/deploy oldidan ham ishlashi uchun).
  const localOrders = loadLocalOrders()
  const now = new Date().toISOString()
  const localOrderId = uid()
  const newOrder = {
    id: localOrderId,
    ...payloadOrder,
    status: 'paid',
    canceled_at: null,
    created_at: now,
    items: cleanItems.map((it) => ({ id: uid(), ...it })),
  }
  localOrders.unshift(newOrder)
  saveLocalOrders(localOrders)
  return { success: true, orderId: localOrderId, source: 'local' }
}

export async function fetchSalesOrders({ limit = 200 } = {}) {
  let { data, error } = await supabase
    .from('erp_sales_orders')
    .select(
      `
      id,
      seller_user_id,
      seller_email,
      customer_name,
      total_usd,
      total_items,
      status,
      canceled_at,
      paid_at,
      created_at,
      items:erp_sales_order_items(
        id,
        product_id,
        product_name,
        category_name,
        color_name,
        quantity,
        unit_price_usd,
        line_total_usd
      )
    `
    )
    .order('paid_at', { ascending: false })
    .limit(limit)

  if (error && isMissingStatusColumns(error)) {
    ;({ data, error } = await supabase
      .from('erp_sales_orders')
      .select(
        `
        id,
        seller_user_id,
        seller_email,
        customer_name,
        total_usd,
        total_items,
        paid_at,
        created_at,
        items:erp_sales_order_items(
          id,
          product_id,
          product_name,
          category_name,
          color_name,
          quantity,
          unit_price_usd,
          line_total_usd
        )
      `
      )
      .order('paid_at', { ascending: false })
      .limit(limit))
  }

  if (!error) return normalizeOrderRows(data)
  if (!isSalesTablesMissing(error)) {
    throw new Error(error.message || 'Buyurtmalarni yuklashda xato')
  }
  const localRows = loadLocalOrders().slice(0, limit)
  return normalizeOrderRows(localRows)
}

export async function fetchSalesMonthlyAnalytics(monthKey) {
  const all = await fetchSalesOrders({ limit: 3000 })
  const key = String(monthKey || '').trim()
  const filtered = key
    ? all.filter(
        (o) =>
          String(o.status || 'paid') !== 'cancelled' &&
          String(o.paid_at || o.created_at || '').slice(0, 7) === key
      )
    : all.filter((o) => String(o.status || 'paid') !== 'cancelled')

  const byCategory = new Map()
  const byCustomer = new Map()
  const byProduct = new Map()
  let totalUsd = 0
  let totalPieces = 0

  for (const order of filtered) {
    const customer = String(order.customer_name || 'Mijoz ko`rsatilmagan')
    const c = byCustomer.get(customer) || {
      customer_name: customer,
      orders_count: 0,
      pieces: 0,
      total_usd: 0,
    }
    c.orders_count += 1

    for (const item of order.items || []) {
      const cat = String(item.category_name || 'Kategoriyasiz')
      const prodName = String(item.product_name || 'Nomsiz mahsulot')
      const qty = Math.max(0, Math.floor(toNum(item.quantity)))
      const line = Math.max(0, toNum(item.line_total_usd))
      
      // By Category
      const k = byCategory.get(cat) || { category_name: cat, pieces: 0, total_usd: 0 }
      k.pieces += qty
      k.total_usd += line
      byCategory.set(cat, k)

      // By Product (id bo‘yicha — ombor bilan bog‘lash uchun)
      const pid = String(item.product_id || '').trim()
      const prodKey = pid ? `id:${pid}` : `name:${prodName}`
      const p =
        byProduct.get(prodKey) || {
          product_id: pid || null,
          product_name: prodName,
          pieces: 0,
          total_usd: 0,
        }
      if (!p.product_id && pid) p.product_id = pid
      p.pieces += qty
      p.total_usd += line
      byProduct.set(prodKey, p)

      c.pieces += qty
      c.total_usd += line
      totalUsd += line
      totalPieces += qty
    }

    byCustomer.set(customer, c)
  }

  const categories = [...byCategory.values()]
    .sort((a, b) => b.total_usd - a.total_usd || b.pieces - a.pieces)
    .map((x) => ({ ...x, total_usd: Math.round(x.total_usd * 100) / 100 }))

  const customers = [...byCustomer.values()]
    .sort((a, b) => b.total_usd - a.total_usd || b.orders_count - a.orders_count)
    .map((x) => ({ ...x, total_usd: Math.round(x.total_usd * 100) / 100 }))

  const products = [...byProduct.values()]
    .sort((a, b) => b.total_usd - a.total_usd || b.pieces - a.pieces)
    .map((x) => ({ ...x, total_usd: Math.round(x.total_usd * 100) / 100 }))

  return {
    ordersCount: filtered.length,
    totalPieces,
    totalUsd: Math.round(totalUsd * 100) / 100,
    categories,
    customers,
    products,
  }
}

export async function updateSalesOrderCustomer(orderId, customerName) {
  const clean = String(customerName || '').trim() || 'Mijoz ko`rsatilmagan'
  if (!orderId) return { success: false, error: 'Buyurtma ID topilmadi' }

  let { error } = await supabase
    .from('erp_sales_orders')
    .update({ customer_name: clean, updated_at: new Date().toISOString() })
    .eq('id', orderId)

  if (error && isMissingStatusColumns(error)) {
    ;({ error } = await supabase.from('erp_sales_orders').update({ customer_name: clean }).eq('id', orderId))
  }

  if (!error) return { success: true }
  if (!isSalesTablesMissing(error)) return { success: false, error: error.message || 'Tahrirlashda xato' }

  const localRows = loadLocalOrders()
  const idx = localRows.findIndex((x) => String(x.id) === String(orderId))
  if (idx < 0) return { success: false, error: 'Buyurtma topilmadi' }
  localRows[idx] = { ...localRows[idx], customer_name: clean, updated_at: new Date().toISOString() }
  saveLocalOrders(localRows)
  return { success: true }
}

/**
 * Buyurtma tahrirlash:
 * - newItems bo'yicha omborga delta qo'llanadi (+ -> sale, - -> restock)
 * - keyin buyurtma itemlari va jami summalar yangilanadi
 */
export async function updateSalesOrderItems(orderId, newItems) {
  if (!orderId) return { success: false, error: 'Buyurtma ID topilmadi' }

  const all = await fetchSalesOrders({ limit: 3000 })
  const order = all.find((x) => String(x.id) === String(orderId))
  if (!order) return { success: false, error: 'Buyurtma topilmadi' }
  if (String(order.status || 'paid') === 'cancelled') {
    return { success: false, error: 'Bekor qilingan buyurtmani tahrirlab bo‘lmaydi' }
  }

  const cleanItems = (newItems || [])
    .map((it) => ({
      product_id: String(it.product_id || '').trim(),
      product_name: String(it.product_name || '').trim() || 'Nomsiz mahsulot',
      category_name: String(it.category_name || '').trim() || 'Kategoriyasiz',
      color_name: normColor(it.color_name),
      quantity: Math.max(0, Math.floor(toNum(it.quantity))),
      unit_price_usd: Math.max(0, toNum(it.unit_price_usd)),
    }))
    .filter((it) => it.product_id && it.quantity > 0)
    .map((it) => ({
      ...it,
      line_total_usd: Math.round(it.quantity * it.unit_price_usd * 100) / 100,
    }))

  if (!cleanItems.length) {
    return { success: false, error: 'Buyurtmada kamida bitta mahsulot bo‘lishi kerak' }
  }

  // Rang validatsiyasi: variantli mahsulotlarda faqat mavjud rang qabul qilinadi.
  const productIds = [...new Set(cleanItems.map((x) => String(x.product_id)).filter(Boolean))]
  if (productIds.length) {
    const { data: rows, error: pErr } = await supabase
      .from('products')
      .select('id, colors, color')
      .in('id', productIds)
    if (pErr) {
      return { success: false, error: pErr.message || 'Mahsulot ranglarini tekshirishda xato' }
    }
    const pMap = new Map((rows || []).map((r) => [String(r.id), r]))
    for (const it of cleanItems) {
      const p = pMap.get(String(it.product_id))
      if (!p) return { success: false, error: `Mahsulot topilmadi: ${it.product_name}` }
      const colors = listProductColors(p)
      if (!colors.length) {
        it.color_name = null
        continue
      }
      const resolved = resolveColorBucketKey(p, it.color_name)
      if (!resolved) {
        return {
          success: false,
          error: `${it.product_name} uchun rang noto‘g‘ri. Mavjud ranglardan birini tanlang.`,
        }
      }
      it.color_name = resolved
    }
  }

  const prevMap = new Map()
  for (const it of order.items || []) {
    prevMap.set(lineKey(it.product_id, it.color_name), {
      product_id: String(it.product_id || ''),
      color_name: normColor(it.color_name),
      quantity: Math.max(0, Math.floor(toNum(it.quantity))),
    })
  }

  const nextMap = new Map()
  for (const it of cleanItems) {
    const k = lineKey(it.product_id, it.color_name)
    const prev = nextMap.get(k)
    if (prev) {
      prev.quantity += it.quantity
    } else {
      nextMap.set(k, { product_id: it.product_id, color_name: it.color_name, quantity: it.quantity })
    }
  }

  const deltas = []
  const keys = new Set([...prevMap.keys(), ...nextMap.keys()])
  for (const k of keys) {
    const a = prevMap.get(k)?.quantity || 0
    const b = nextMap.get(k)?.quantity || 0
    const d = b - a
    if (!d) continue
    const ref = nextMap.get(k) || prevMap.get(k)
    deltas.push({
      product_id: ref.product_id,
      color_name: ref.color_name,
      delta: d,
    })
  }

  // 1) Ombor sinxronizatsiya
  const applied = []
  try {
    for (const d of deltas) {
      if (d.delta > 0) {
        const res = await recordRetailSale({
          productId: d.product_id,
          colorRaw: d.color_name,
          quantity: d.delta,
        })
        if (!res?.success) {
          throw new Error(res?.error || 'Ombordan ayirishda xato')
        }
        applied.push({ type: 'sale', ...d })
      } else {
        const qty = Math.abs(d.delta)
        const res = await recordRetailRestock({
          productId: d.product_id,
          colorRaw: d.color_name,
          quantity: qty,
        })
        if (!res?.success) {
          throw new Error(res?.error || 'Omborga qaytarishda xato')
        }
        applied.push({ type: 'restock', product_id: d.product_id, color_name: d.color_name, delta: qty })
      }
    }
  } catch (e) {
    // 1.1) rollback
    for (let i = applied.length - 1; i >= 0; i -= 1) {
      const a = applied[i]
      if (a.type === 'sale') {
        await recordRetailRestock({
          productId: a.product_id,
          colorRaw: a.color_name,
          quantity: a.delta,
        })
      } else {
        await recordRetailSale({
          productId: a.product_id,
          colorRaw: a.color_name,
          quantity: a.delta,
        })
      }
    }
    return { success: false, error: e?.message || 'Tahrirlashda xato' }
  }

  // 2) Buyurtma yozuvini yangilash
  const totalItems = cleanItems.reduce((s, x) => s + x.quantity, 0)
  const totalUsd = Math.round(cleanItems.reduce((s, x) => s + x.line_total_usd, 0) * 100) / 100

  let updateError = null
  ;({ error: updateError } = await supabase
    .from('erp_sales_orders')
    .update({
      total_items: totalItems,
      total_usd: totalUsd,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId))

  if (updateError && isMissingStatusColumns(updateError)) {
    ;({ error: updateError } = await supabase
      .from('erp_sales_orders')
      .update({ total_items: totalItems, total_usd: totalUsd })
      .eq('id', orderId))
  }

  if (!updateError) {
    const { error: delErr } = await supabase.from('erp_sales_order_items').delete().eq('order_id', orderId)
    if (!delErr) {
      const payload = cleanItems.map((it) => ({ order_id: orderId, ...it }))
      const { error: insErr } = await supabase.from('erp_sales_order_items').insert(payload)
      if (!insErr) return { success: true }
      updateError = insErr
    } else {
      updateError = delErr
    }
  }

  if (updateError && !isSalesTablesMissing(updateError)) {
    return { success: false, error: updateError.message || 'Buyurtma yozuvini yangilashda xato' }
  }

  const localRows = loadLocalOrders()
  const idx = localRows.findIndex((x) => String(x.id) === String(orderId))
  if (idx < 0) return { success: false, error: 'Buyurtma topilmadi' }
  localRows[idx] = {
    ...localRows[idx],
    total_items: totalItems,
    total_usd: totalUsd,
    updated_at: new Date().toISOString(),
    items: cleanItems.map((it) => ({ id: uid(), ...it })),
  }
  saveLocalOrders(localRows)
  return { success: true }
}

export async function cancelSalesOrder(orderId) {
  if (!orderId) return { success: false, error: 'Buyurtma ID topilmadi' }

  // Avval status ustunlari mavjudligini tekshiramiz (aks holda omborni qaytarib yubormaymiz).
  const { error: probeErr } = await supabase.from('erp_sales_orders').select('status').limit(1)
  if (probeErr && isMissingStatusColumns(probeErr)) {
    return {
      success: false,
      error:
        'Buyurtma statusi ustunlari yo‘q. `supabase_erp_sales_orders_status.sql` ni ishga tushiring.',
    }
  }

  const all = await fetchSalesOrders({ limit: 3000 })
  const order = all.find((x) => String(x.id) === String(orderId))
  if (!order) return { success: false, error: 'Buyurtma topilmadi' }
  if (String(order.status || 'paid') === 'cancelled') {
    return { success: true, alreadyCancelled: true }
  }

  // Omborga qaytarish
  for (const item of order.items || []) {
    const res = await recordRetailRestock({
      productId: item.product_id,
      colorRaw: item.color_name,
      quantity: item.quantity,
    })
    if (!res?.success) {
      return {
        success: false,
        error: `${item.product_name || 'Mahsulot'} ni omborga qaytarishda xato: ${res?.error || 'xato'}`,
      }
    }
  }

  let { error } = await supabase
    .from('erp_sales_orders')
    .update({
      status: 'cancelled',
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)

  if (error && isMissingStatusColumns(error)) {
    return {
      success: false,
      error:
        'Buyurtma statusi ustunlari yo‘q. `supabase_erp_sales_orders_status.sql` ni ishga tushiring.',
    }
  }
  if (!error) return { success: true }
  if (!isSalesTablesMissing(error)) return { success: false, error: error.message || 'Bekor qilishda xato' }

  const localRows = loadLocalOrders()
  const idx = localRows.findIndex((x) => String(x.id) === String(orderId))
  if (idx < 0) return { success: false, error: 'Buyurtma topilmadi' }
  localRows[idx] = {
    ...localRows[idx],
    status: 'cancelled',
    canceled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  saveLocalOrders(localRows)
  return { success: true }
}

export async function fetchDashboardMetrics() {
  const all = await fetchSalesOrders({ limit: 2000 })
  const now = new Date()
  const currentMonth = now.toISOString().slice(0, 7)
  
  // 7-day range for chart
  const last7Days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    last7Days.push({
      date: d.toISOString().slice(0, 10),
      day: d.toLocaleDateString('uz-UZ', { weekday: 'short' }),
      total: 0
    })
  }

  const monthlySales = all.filter(o => String(o.paid_at || o.created_at || '').slice(0, 7) === currentMonth)
  const totalUsd = monthlySales.reduce((s, x) => s + x.total_usd, 0)
  const totalPieces = monthlySales.reduce((s, x) => s + x.total_items, 0)

  // Populate chart
  for (const day of last7Days) {
    const daySales = all.filter(o => String(o.paid_at || o.created_at || '').slice(0, 10) === day.date)
    day.total = daySales.reduce((s, x) => s + x.total_usd, 0)
  }

  return {
    monthlyTotalUsd: Math.round(totalUsd * 100) / 100,
    monthlyTotalPieces: totalPieces,
    recentSales: all.slice(0, 10), // Last 10 sales
    salesDynamics: last7Days.map(d => ({ day: d.day, v: d.total }))
  }
}
