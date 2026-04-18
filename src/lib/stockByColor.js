import { normalizeModelKey } from '@/lib/validators'

function normalizeOrderItemColorKey(color) {
  const raw = (color != null ? String(color) : '').trim() || '—'
  return normalizeModelKey(raw)
}

export function numStock(v) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

export function listProductColors(p) {
  const arr = Array.isArray(p?.colors) ? p.colors : []
  const names = arr.map((c) => String(c ?? '').trim()).filter(Boolean)
  const uniq = [...new Set(names)]
  if (uniq.length) return uniq
  const legacy = p?.color != null ? String(p.color).trim() : ''
  return legacy ? [legacy] : []
}

export function parseStockByColor(p) {
  let raw = p?.stock_by_color
  if (raw == null) return {}
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return {}
    try {
      raw = JSON.parse(s)
    } catch {
      return {}
    }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = {}
    for (const [k, v] of Object.entries(raw)) {
      const n = Number(v)
      if (Number.isFinite(n) && n >= 0) o[k] = Math.floor(n)
    }
    return o
  }
  return {}
}

export function sumStockByColor(map) {
  if (!map || typeof map !== 'object') return 0
  return Object.values(map).reduce(
    (s, n) => s + (Number.isFinite(Number(n)) ? Math.max(0, Math.floor(Number(n))) : 0),
    0
  )
}

export function buildStockByColorMap(product) {
  const fromDb = parseStockByColor(product)
  const colors = listProductColors(product)
  const keys = [...colors]
  const known = new Set(keys.map((c) => normalizeOrderItemColorKey(c)))
  for (const dbKey of Object.keys(fromDb)) {
    const nk = normalizeOrderItemColorKey(dbKey)
    if (!known.has(nk)) {
      keys.push(dbKey)
      known.add(nk)
    }
  }
  if (!keys.length) return {}
  const out = {}
  let sumDb = 0
  for (const c of keys) {
    const v = fromDb[c]
    const n = v != null && Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0
    out[c] = n
    sumDb += n
  }
  if (sumDb > 0) return out
  const total = numStock(product.stock)
  if (total <= 0) return Object.fromEntries(keys.map((c) => [c, 0]))
  const per = Math.floor(total / keys.length)
  const rem = total - per * keys.length
  keys.forEach((c, i) => {
    out[c] = per + (i === 0 ? rem : 0)
  })
  return out
}

export function productHasColorVariants(p) {
  return listProductColors(p).length > 0
}

/**
 * Rang kartochkalari tartibi: avvalo mahsulot katalogidagi ranglar, keyin `stock_by_color`dagi
 * qo‘shimcha kalitlar (nom mos kelmasa ham ko‘rinadi — aks holda zaxira 5, ranglar 0 ko‘rinishi bo‘lardi).
 */
export function orderedColorKeysForStock(product, colorMap) {
  const catalog = listProductColors(product)
  const m = colorMap && typeof colorMap === 'object' ? colorMap : {}
  const inMap = Object.keys(m)
  const rest = inMap.filter(
    (k) => !catalog.some((c) => normalizeOrderItemColorKey(c) === normalizeOrderItemColorKey(k))
  )
  rest.sort((a, b) => a.localeCompare(b, 'uz', { sensitivity: 'base' }))
  return [...catalog, ...rest]
}

export function resolveColorBucketKey(product, orderColorRaw) {
  const keys = listProductColors(product)
  if (!keys.length) return null
  const needle = normalizeOrderItemColorKey(orderColorRaw)
  for (const k of keys) {
    if (normalizeOrderItemColorKey(k) === needle) return k
  }
  return null
}
