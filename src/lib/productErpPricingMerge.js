/**
 * `product_erp_pricing` — do‘kon (ERP) narxi (USD, CRM `sale_price` bilan mos).
 */
export function mergeProductErpPricingRow(product) {
  if (!product || typeof product !== 'object') return product
  const pr = product.product_erp_pricing
  const row = Array.isArray(pr) ? pr[0] : pr
  const next = { ...product }
  if (row && typeof row === 'object') {
    const u = Number(row.unit_price_uzs)
    next.erp_unit_price_uzs = Number.isFinite(u) && u >= 0 ? u : null
  } else {
    next.erp_unit_price_uzs = null
  }
  delete next.product_erp_pricing
  return next
}
