import { buildGroupedInboundRows, computeInboundTotalsFromRow } from '@/lib/inboundCrmTable'
import { supabase } from '@/lib/supabase'
import { fetchProductMapByIds } from '@/services/erpInventory'
import { applyErpStoreInboundFromItems } from '@/services/erpStoreInboundApply'

const INBOUND_SELECT_FULL =
  'id, order_id, status, items, order_number_snapshot, customer_name_snapshot, created_at, accepted_at, accepted_total_uzs, accepted_total_pieces'
const INBOUND_SELECT_BASE =
  'id, order_id, status, items, order_number_snapshot, customer_name_snapshot, created_at, accepted_at'

function isMissingTotalsColumnError(err) {
  const m = String(err?.message || err || '')
  return /accepted_total|42703|column|schema/i.test(m)
}

export async function fetchInboundRequests({ status } = {}) {
  function build(sel) {
    let q = supabase.from('erp_inbound_requests').select(sel)
    if (status) q = q.eq('status', status)
    if (status === 'accepted') {
      return q.order('accepted_at', { ascending: false }).limit(100)
    }
    return q.order('created_at', { ascending: false }).limit(100)
  }
  let { data, error } = await build(INBOUND_SELECT_FULL)
  if (error && isMissingTotalsColumnError(error)) {
    ;({ data, error } = await build(INBOUND_SELECT_BASE))
  }
  if (error) throw error
  return data || []
}

/** Oyma-oy hisobot: barcha qabul qilingan kirimlar. */
export async function fetchAcceptedInboundReport({ limit = 500 } = {}) {
  const full =
    'id, order_id, items, order_number_snapshot, customer_name_snapshot, accepted_at, accepted_total_uzs, accepted_total_pieces'
  const base =
    'id, order_id, items, order_number_snapshot, customer_name_snapshot, accepted_at'

  let { data, error } = await supabase
    .from('erp_inbound_requests')
    .select(full)
    .eq('status', 'accepted')
    .order('accepted_at', { ascending: false })
    .limit(limit)

  if (error && isMissingTotalsColumnError(error)) {
    ;({ data, error } = await supabase
      .from('erp_inbound_requests')
      .select(base)
      .eq('status', 'accepted')
      .order('accepted_at', { ascending: false })
      .limit(limit))
  }

  if (error) throw error
  return data || []
}

/**
 * Barcha qabul qilingan CRM kirimlarining jami summasi (USD; `accepted_total_uzs` maydoni).
 * Yozuvlarda jami bo‘lmasa, `items` dan qayta hisoblanadi (oylik hisobot bilan bir xil).
 */
export async function fetchAcceptedInboundUsdGrandTotal() {
  const raw = await fetchAcceptedInboundReport({ limit: 10000 })
  const needs = raw.filter(
    (r) => r.accepted_total_uzs == null || r.accepted_total_pieces == null
  )
  const pidSet = new Set()
  for (const r of needs) {
    for (const it of Array.isArray(r.items) ? r.items : []) {
      if (it?.product_id) pidSet.add(String(it.product_id))
    }
  }
  const map = pidSet.size ? await fetchProductMapByIds([...pidSet]) : new Map()
  let total = 0
  for (const r of raw) {
    let usd = Number(r.accepted_total_uzs)
    if (!Number.isFinite(usd)) {
      const { money } = computeInboundTotalsFromRow(r, map)
      usd = Number(money) || 0
    }
    total += usd
  }
  return Math.round(total * 100) / 100
}

/**
 * «Qabul qilish» — `erp_store_inventory` to‘ldiriladi, so‘rov `accepted` bo‘ladi.
 */
export async function acceptInboundRequest(requestId) {
  // Tez yo‘l: server-side RPC (set-based, atomik).
  const rpc = await supabase.rpc('accept_erp_inbound_request', { p_request_id: requestId })
  if (!rpc.error) {
    const payload = rpc.data || {}
    if (payload?.success === false) {
      return { success: false, error: payload.error || 'Qabul qilinmadi' }
    }
    return { success: true }
  }

  // RPC hali o‘rnatilmagan eski muhitlar uchun fallback.
  const rpcMsg = String(rpc.error?.message || '')
  const rpcMissing = /accept_erp_inbound_request|function|does not exist|PGRST/i.test(rpcMsg)
  if (!rpcMissing) {
    return { success: false, error: rpc.error?.message || 'Qabul qilishda xato' }
  }

  const { data: row, error: fetchErr } = await supabase
    .from('erp_inbound_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchErr || !row) {
    return { success: false, error: fetchErr?.message || 'So‘rov topilmadi' }
  }
  if (row.status !== 'pending') {
    return { success: false, error: 'Bu so‘rov allaqachon qayta ishlangan' }
  }

  const items = Array.isArray(row.items) ? row.items : []
  const orderId = row.order_id
  const orderNum = row.order_number_snapshot || orderId

  const res = await applyErpStoreInboundFromItems(orderId, orderNum, items)
  if (!res?.success) {
    const errText = (res?.errors || []).map((e) => `${e.product_id}: ${e.error}`).join('\n')
    return { success: false, error: errText || 'Kirim yozilmadi' }
  }

  let accepted_total_uzs = null
  let accepted_total_pieces = null
  try {
    const map = await fetchProductMapByIds(items.map((i) => i.product_id))
    const groups = buildGroupedInboundRows(items, map)
    accepted_total_uzs = groups.reduce((s, g) => s + (Number(g.lineMoney) || 0), 0)
    accepted_total_pieces = groups.reduce((s, g) => s + (Number(g.totalPieces) || 0), 0)
  } catch {
    accepted_total_uzs = null
    accepted_total_pieces = null
  }

  const stamp = new Date().toISOString()
  const extras = {}
  if (accepted_total_uzs != null) extras.accepted_total_uzs = accepted_total_uzs
  if (accepted_total_pieces != null) extras.accepted_total_pieces = accepted_total_pieces

  let { error: upErr } = await supabase
    .from('erp_inbound_requests')
    .update({
      status: 'accepted',
      accepted_at: stamp,
      ...extras,
    })
    .eq('id', requestId)
    .eq('status', 'pending')

  if (upErr && isMissingTotalsColumnError(upErr) && Object.keys(extras).length > 0) {
    ;({ error: upErr } = await supabase
      .from('erp_inbound_requests')
      .update({ status: 'accepted', accepted_at: stamp })
      .eq('id', requestId)
      .eq('status', 'pending'))
  }

  if (upErr) {
    return { success: false, error: upErr.message }
  }

  return { success: true }
}

/** «Rad etish» — zaxira yozilmaydi, so‘rov holati `rejected` bo‘ladi. */
export async function rejectInboundRequest(requestId) {
  const { data: row, error: fetchErr } = await supabase
    .from('erp_inbound_requests')
    .select('id, status')
    .eq('id', requestId)
    .single()

  if (fetchErr || !row) {
    return { success: false, error: fetchErr?.message || 'So‘rov topilmadi' }
  }
  if (row.status !== 'pending') {
    return { success: false, error: 'Bu so‘rov allaqachon qayta ishlangan' }
  }

  const { error: upErr } = await supabase
    .from('erp_inbound_requests')
    .update({ status: 'rejected' })
    .eq('id', requestId)
    .eq('status', 'pending')

  if (upErr) return { success: false, error: upErr.message }
  return { success: true }
}

/**
 * Repair: oldin qabul qilingan kirimni omborga qayta qo‘llash.
 * Ehtiyot: bu amal zaxirani yana oshiradi (idempotent emas).
 */
export async function replayAcceptedInboundRequest(requestId) {
  const { data: row, error: fetchErr } = await supabase
    .from('erp_inbound_requests')
    .select('id, status, order_id, order_number_snapshot, items')
    .eq('id', requestId)
    .single()

  if (fetchErr || !row) {
    return { success: false, error: fetchErr?.message || 'So‘rov topilmadi' }
  }
  if (row.status !== 'accepted') {
    return { success: false, error: 'Faqat qabul qilingan so‘rovni qayta qo‘llash mumkin' }
  }

  const items = Array.isArray(row.items) ? row.items : []
  const orderId = row.order_id
  const orderNum = row.order_number_snapshot || orderId
  const res = await applyErpStoreInboundFromItems(orderId, orderNum, items)
  if (!res?.success) {
    const errText = (res?.errors || []).map((e) => `${e.product_id}: ${e.error}`).join('\n')
    return { success: false, error: errText || 'Qayta qo‘llash bajarilmadi' }
  }
  return { success: true, results: res.results || [] }
}
