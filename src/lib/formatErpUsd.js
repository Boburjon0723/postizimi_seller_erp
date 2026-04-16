/**
 * ERP / CRM katalog narxlari — CRM dagi `sale_price` va `product_erp_pricing` bilan bir xil: USD.
 */

const usd2 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatErpUsd(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  const v = Number(n)
  if (v <= 0) return '—'
  return usd2.format(v)
}

export function formatErpUsdAllowZero(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return usd2.format(Number(n))
}
