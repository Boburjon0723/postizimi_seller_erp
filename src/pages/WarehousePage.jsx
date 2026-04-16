import { useCallback, useEffect, useMemo, useState } from 'react'
import ErpShell from '@/components/ErpShell'
import { formatErpUsdAllowZero } from '@/lib/formatErpUsd'
import {
  buildStockByColorMap,
  listProductColors,
  productHasColorVariants,
} from '@/lib/stockByColor'
import {
  fetchProductsForErp,
  getProductDisplayCategory,
  getProductDisplayDescription,
  getProductDisplayName,
  getProductImageUrl,
  getProductStockValueUsd,
  getProductUnitPrice,
  updateErpProductUnitPrice,
} from '@/services/erpInventory'
import { 
  RefreshCw, 
  Plus, 
  Package, 
  AlertTriangle, 
  Clock, 
  DollarSign,
  ChevronDown,
  ChevronRight,
  Save,
  Tag,
  Search,
  Box
} from 'lucide-react'

function stockStatus(stock) {
  if (stock <= 0) return { label: 'Tugagan', cls: 'crit' }
  if (stock <= 5) return { label: 'Kam qoldi', cls: 'low' }
  return { label: 'Sotuvda', cls: 'ok' }
}

export default function WarehousePage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [category, setCategory] = useState('all')
  const [sortBy, setSortBy] = useState('new')
  const [brokenImgIds, setBrokenImgIds] = useState(() => new Set())
  const [expandedById, setExpandedById] = useState({})
  const [priceDraftById, setPriceDraftById] = useState({})
  const [priceSavingId, setPriceSavingId] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const rows = await fetchProductsForErp()
      setProducts(rows)
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const categories = useMemo(() => {
    const set = new Set()
    for (const p of products) {
      set.add(getProductDisplayCategory(p))
    }
    return Array.from(set).filter(Boolean).slice(0, 6)
  }, [products])

  const filteredRows = useMemo(() => {
    const base =
      category === 'all'
        ? products
        : products.filter((p) => getProductDisplayCategory(p) === category)
    const rows = [...base]
    if (sortBy === 'name') {
      rows.sort((a, b) => getProductDisplayName(a).localeCompare(getProductDisplayName(b)))
    } else if (sortBy === 'stock') {
      rows.sort((a, b) => Number(b.stock || 0) - Number(a.stock || 0))
    } else {
      rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    }
    return rows
  }, [products, category, sortBy])

  const stat = useMemo(() => {
    let critical = 0
    let low = 0
    let totalValue = 0
    for (const p of products) {
      const stock = Math.max(0, Number(p.stock) || 0)
      if (stock <= 0) critical += 1
      else if (stock <= 5) low += 1
      totalValue += getProductStockValueUsd(p)
    }
    return {
      total: products.length,
      critical,
      low,
      value: totalValue,
    }
  }, [products])

  function toggleExpand(productId) {
    const key = String(productId || '')
    if (!key) return
    setExpandedById((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function getPriceDraftValue(product) {
    const key = String(product?.id || '')
    if (!key) return ''
    if (Object.prototype.hasOwnProperty.call(priceDraftById, key)) {
      return priceDraftById[key]
    }
    const base = getProductUnitPrice(product)
    return Number.isFinite(base) ? String(base) : '0'
  }

  function onPriceChange(productId, nextRaw) {
    const key = String(productId || '')
    setPriceDraftById((prev) => ({ ...prev, [key]: nextRaw }))
  }

  async function savePrice(product) {
    const key = String(product?.id || '')
    const raw = getPriceDraftValue(product)
    const price = Number(raw)
    if (!Number.isFinite(price) || price < 0) {
      setError('Narx noto‘g‘ri. 0 yoki undan katta son kiriting.')
      return
    }
    setPriceSavingId(key)
    setError(null)
    try {
      const res = await updateErpProductUnitPrice(key, price)
      if (!res.success) {
        setError(res.error || 'Narx saqlanmadi')
        return
      }
      const nextPrice = Number(res.unit_price_usd) || 0
      setProducts((prev) =>
        prev.map((p) => (String(p.id) === key ? { ...p, erp_unit_price_uzs: nextPrice } : p))
      )
      setPriceDraftById((prev) => ({ ...prev, [key]: String(nextPrice) }))
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setPriceSavingId(null)
    }
  }

  return (
    <ErpShell>
      <div className="erpf-page-head">
        <div>
          <h1 className="erpf-page-title">Ombor Nazorati 📦</h1>
          <p className="erpf-page-sub">Hozirda {stat.total} turdagi mahsulot mavjud.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" className="erpf-icon-btn" onClick={load} title="Yangilash">
            <RefreshCw size={20} className={loading ? 'spin' : ''} />
          </button>
          <button type="button" className="erpf-btn-solid">
            <Plus size={20} style={{ marginRight: '8px' }} />
            Mahsulot Qo'shish
          </button>
        </div>
      </div>

      <div className="erpf-wh-stats">
        <article className="erpf-wh-stat">
          <div className="erpf-wh-ico"><Box size={22} /></div>
          <div>
            <strong>{stat.total}</strong>
            <small>Jami turlar</small>
          </div>
        </article>
        <article className="erpf-wh-stat">
          <div className="erpf-wh-ico" style={{ color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.1)' }}>
            <AlertTriangle size={22} />
          </div>
          <div>
            <strong className={stat.critical > 0 ? 'qty-warn' : ''}>{stat.critical}</strong>
            <small>Tugaganlar</small>
          </div>
        </article>
        <article className="erpf-wh-stat">
          <div className="erpf-wh-ico" style={{ color: 'var(--warning)', background: 'rgba(245, 158, 11, 0.1)' }}>
            <Clock size={22} />
          </div>
          <div>
            <strong>{stat.low}</strong>
            <small>Kam qolganlar</small>
          </div>
        </article>
        <article className="erpf-wh-stat">
          <div className="erpf-wh-ico" style={{ color: 'var(--success)', background: 'rgba(16, 185, 129, 0.1)' }}>
            <DollarSign size={22} />
          </div>
          <div>
            <strong>{formatErpUsdAllowZero(stat.value)}</strong>
            <small>Jami qiymat (USD)</small>
          </div>
        </article>
      </div>

      <div className="erpf-table-card">
        <div className="erpf-table-head" style={{ padding: '1rem 1.5rem' }}>
          <div className="erpf-chip-group">
            <button
              type="button"
              className={category === 'all' ? 'active' : ''}
              onClick={() => setCategory('all')}
            >
              Barchasi
            </button>
            {categories.map((cat) => (
              <button
                type="button"
                key={cat}
                className={category === cat ? 'active' : ''}
                onClick={() => setCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <select
              className="erp-input"
              style={{ width: '200px', fontSize: '0.875rem', paddingRight: '2.5rem' }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="new">Eng yangi</option>
              <option value="name">Nomi bo'yicha</option>
              <option value="stock">Miqdori bo'yicha</option>
            </select>
          </div>
        </div>

        {error && <div className="erp-banner err" style={{ margin: '1rem' }}>{error}</div>}

        <div className="erpf-table-scroll">
          <table className="erpf-table">
            <thead>
              <tr>
                <th>Mahsulot</th>
                <th>SKU / O'lcham</th>
                <th>Kategoriya</th>
                <th>Miqdor</th>
                <th style={{ width: '260px' }}>Narx (USD)</th>
                <th>Holat</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '4rem' }}><div className="erp-spinner" /></td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '4rem' }}><p style={{ color: 'var(--text-muted)' }}>Mahsulotlar topilmadi.</p></td></tr>
              ) : (
                filteredRows.map((r) => {
                  const name = getProductDisplayName(r)
                  const desc = getProductDisplayDescription(r)
                  const qty = Math.max(0, Number(r.stock) || 0)
                  const status = stockStatus(qty)
                  const price = getProductUnitPrice(r)
                  const thumbUrl = getProductImageUrl(r)
                  const rid = String(r.id)
                  const showImg = Boolean(thumbUrl) && !brokenImgIds.has(rid)
                  const expanded = Boolean(expandedById[rid])
                  const hasColorVariants = productHasColorVariants(r)
                  const colorNames = listProductColors(r)
                  const colorMap = hasColorVariants ? buildStockByColorMap(r) : {}
                  const priceDraft = getPriceDraftValue(r)
                  const saving = priceSavingId === rid

                  return (
                    [
                      <tr key={rid} className={expanded ? 'row-active' : ''}>
                        <td>
                          <button
                            type="button"
                            className="erpf-product-open"
                            onClick={() => toggleExpand(r.id)}
                            aria-expanded={expanded}
                          >
                            <div className="erpf-product-cell">
                              {showImg ? (
                                <img
                                  className="erpf-wh-thumb"
                                  src={thumbUrl}
                                  alt=""
                                  loading="lazy"
                                  onError={() => setBrokenImgIds((prev) => new Set(prev).add(rid))}
                                />
                              ) : (
                                <div className="erpf-wh-thumb-placeholder">
                                  {name[0].toUpperCase()}
                                </div>
                              )}
                              <div className="erpf-product-text">
                                <span style={{ fontWeight: '600', color: 'var(--text)' }}>{name}</span>
                                {desc && <span className="erpf-table-subtext">{desc}</span>}
                                <span className="erpf-open-hint">
                                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                  {expanded ? 'Ranglarni yopish' : 'Ranglar kesimi'}
                                </span>
                              </div>
                            </div>
                          </button>
                        </td>
                        <td><span className="erpf-badge">{r.size || 'Standard'}</span></td>
                        <td><div className="erpf-cell-tag">{getProductDisplayCategory(r)}</div></td>
                        <td className={qty <= 5 ? 'qty-warn' : ''}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <strong>{qty}</strong>
                            <small>dona</small>
                          </div>
                        </td>
                        <td>
                          <div className="erpf-price-edit">
                            <div className="erpf-price-input-group">
                              <DollarSign size={14} className="input-prefix" />
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="erp-input erp-input-sm"
                                value={priceDraft}
                                onChange={(e) => onPriceChange(r.id, e.target.value)}
                              />
                            </div>
                            <button
                              type="button"
                              className={`erpf-btn-save ${saving ? 'loading' : ''}`}
                              disabled={saving}
                              onClick={() => savePrice(r)}
                            >
                              <Save size={16} />
                            </button>
                            <div className="erpf-current-price">
                              {formatErpUsdAllowZero(price)}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`erpf-status ${status.cls === 'ok' ? 'ok' : 'wait'}`}>
                            {status.label}
                          </span>
                        </td>
                      </tr>,
                      expanded && (
                        <tr key={`detail-${rid}`} className="erpf-row-detail">
                          <td colSpan={6}>
                            <div id={`erp-color-breakdown-${rid}`} className="erpf-color-breakdown">
                              <div className="erpf-detail-header">
                                <Tag size={16} />
                                <span>Ranglar bo'yicha qoldiqlar</span>
                              </div>
                              {!hasColorVariants ? (
                                <p className="erpf-empty-state">
                                  Bu mahsulot rang bo‘yicha ajratilmagan.
                                </p>
                              ) : (
                                <div className="erpf-color-grid">
                                  {colorNames.map((c) => (
                                    <article key={c} className="erpf-color-card">
                                      <span className="erpf-color-name">{c}</span>
                                      <strong className="erpf-color-qty">
                                        {Math.floor(Number(colorMap[c]) || 0)}
                                      </strong>
                                    </article>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ),
                    ]
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ErpShell>
  )
}

