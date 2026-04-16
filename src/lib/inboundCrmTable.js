import { normalizeModelKey } from '@/lib/validators'

export { formatErpUsd as formatInboundUsd, formatErpUsdAllowZero as formatInboundUsdAllowZero } from '@/lib/formatErpUsd'

function parseQty(v) {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

function normalizeOrderItemColorKey(color) {
  const raw = (color != null ? String(color) : '').trim() || '—'
  return normalizeModelKey(raw)
}

function naturalCompareModelCode(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), 'uz', { numeric: true, sensitivity: 'base' })
}

function categoryLabelFromProduct(p) {
  if (!p) return ''
  const cat = p.categories
  if (cat && typeof cat === 'object') {
    const n = (cat.name_uz || cat.name || '').trim()
    if (n) return n
  }
  if (p.category != null && String(p.category).trim() !== '') {
    return String(p.category).trim()
  }
  return ''
}

/**
 * CRM `items` dagi `unit_price_usd` (buyurtma vaqti) ustuvor; yo‘q bo‘lsa katalog `erp_unit_price_uzs`.
 */
function resolveInboundLineUnitUsd(oi, product) {
  const snap = oi?.unit_price_usd
  if (snap != null && Number.isFinite(Number(snap)) && Number(snap) >= 0) {
    return Math.round(Number(snap) * 100) / 100
  }
  if (!product) return null
  const rawU = product.erp_unit_price_uzs
  if (rawU != null && Number.isFinite(Number(rawU)) && Number(rawU) >= 0) {
    return Math.round(Number(rawU) * 100) / 100
  }
  return null
}

/**
 * CRM `handleErpRetailInbound` items: `{ product_id, color, quantity }[]`
 * Chop etishdagi kabi: bir SKU (product + size) → bitta qator, ranglar vertikal.
 */
export function buildGroupedInboundRows(rawItems, productMap) {
  const items = Array.isArray(rawItems) ? rawItems : []
  const buckets = new Map()

  for (let idx = 0; idx < items.length; idx++) {
    const oi = items[idx]
    const pid = oi?.product_id != null ? String(oi.product_id) : ''
    if (!pid) continue

    const p = productMap.get(pid) || null
    const sizeRaw = p?.size != null ? String(p.size).trim() : ''
    const sizeKey = sizeRaw ? normalizeModelKey(sizeRaw) : ''
    const bucketKey = sizeKey ? `pid:${pid}:sz:${sizeKey}` : `pid:${pid}:nosz`

    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, {
        bucketKey,
        product_id: pid,
        product: p,
        sizeDisplay: sizeRaw || '—',
        lines: [],
        minOrder: idx,
      })
    }
    const b = buckets.get(bucketKey)
    b.lines.push(oi)
    b.minOrder = Math.min(b.minOrder, idx)
  }

  const groups = []
  for (const b of buckets.values()) {
    const colorMap = new Map()
    for (const oi of b.lines) {
      const raw = (oi.color != null ? String(oi.color).trim() : '') || '—'
      const nk = normalizeOrderItemColorKey(oi.color)
      const q = parseQty(oi.quantity)
      const prev = colorMap.get(nk)
      const nextQty = (prev ? prev.qty : 0) + q
      colorMap.set(nk, { label: prev?.label ?? raw, qty: nextQty })
    }
    const colorPairs = Array.from(colorMap.values()).map(({ label, qty }) => [label, qty])
    const totalPieces = colorPairs.reduce((s, [, q]) => s + q, 0)

    let sumMoney = 0
    let anyResolved = false
    for (const oi of b.lines) {
      const q = parseQty(oi.quantity)
      if (q <= 0) continue
      const u = resolveInboundLineUnitUsd(oi, b.product)
      if (u == null) continue
      anyResolved = true
      sumMoney += u * q
    }
    const lineMoney =
      anyResolved && totalPieces > 0 ? Math.round(sumMoney * 100) / 100 : null
    const unitPrice =
      anyResolved && totalPieces > 0
        ? Math.round((sumMoney / totalPieces) * 100) / 100
        : null

    groups.push({
      ...b,
      colorPairs,
      totalPieces,
      unitPrice,
      lineMoney,
      categoryLabel: categoryLabelFromProduct(b.product),
    })
  }

  groups.sort((a, b) => {
    const na = (a.categoryLabel || '\uFFFF').toLowerCase()
    const nb = (b.categoryLabel || '\uFFFF').toLowerCase()
    const c = na.localeCompare(nb, 'uz')
    if (c !== 0) return c
    const cm = naturalCompareModelCode(a.sizeDisplay, b.sizeDisplay)
    if (cm !== 0) return cm
    return a.minOrder - b.minOrder
  })

  return groups
}

/**
 * CRM chop etish tartibi: kategoriya sarlavhalari + oraliq jamlar.
 * `showPrices: true` — ustunlar: … Jami par | 1 dona narxi (USD) | Qator (USD) | Izoh (jami colSpan 9).
 */
export function flattenInboundTableRows(groups, options = {}) {
  const showPrices = options.showPrices === true
  const colSpan = showPrices ? (options.colSpan ?? 9) : (options.colSpan ?? 7)
  const g = Array.isArray(groups) ? groups : []
  const totalPar = g.reduce((s, x) => s + (Number(x.totalPieces) || 0), 0)
  const totalMoney = showPrices
    ? Math.round(g.reduce((s, x) => s + (Number(x.lineMoney) || 0), 0) * 100) / 100
    : 0
  const hasCategoryMeta = g.some((x) => Boolean(x.categoryLabel))
  const rows = []
  let displayIndex = 1

  if (!hasCategoryMeta) {
    for (const gr of g) {
      rows.push({ type: 'data', group: gr, displayIndex: displayIndex++ })
    }
    return { rows, totalPar, totalMoney, colSpan, showPrices }
  }

  let currentKey = null
  let secPieces = 0
  let secMoney = 0

  const catKey = (gr) => gr.categoryLabel || '__none__'

  for (const gr of g) {
    const key = catKey(gr)
    if (currentKey !== null && key !== currentKey) {
      rows.push({
        type: 'cat-subtotal',
        pieces: secPieces,
        money: showPrices ? secMoney : undefined,
        colSpan,
        showPrices,
      })
      secPieces = 0
      secMoney = 0
    }
    if (key !== currentKey) {
      rows.push({ type: 'cat-header', label: gr.categoryLabel || '—', colSpan })
      currentKey = key
    }
    rows.push({ type: 'data', group: gr, displayIndex: displayIndex++ })
    secPieces += Number(gr.totalPieces) || 0
    secMoney += Number(gr.lineMoney) || 0
  }

  if (currentKey !== null) {
    rows.push({
      type: 'cat-subtotal',
      pieces: secPieces,
      money: showPrices ? secMoney : undefined,
      colSpan,
      showPrices,
    })
  }

  return { rows, totalPar, totalMoney, colSpan, showPrices }
}

export function computeInboundTotalsFromRow(row, productMap) {
  const items = Array.isArray(row?.items) ? row.items : []
  const groups = buildGroupedInboundRows(items, productMap)
  const pieces = groups.reduce((s, g) => s + (Number(g.totalPieces) || 0), 0)
  const money = groups.reduce((s, g) => s + (Number(g.lineMoney) || 0), 0)
  return { pieces, money, groups }
}
