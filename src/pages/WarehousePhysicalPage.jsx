import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ErpShell from '@/components/ErpShell'
import { formatErpUsdAllowZero } from '@/lib/formatErpUsd'
import {
  buildStockByColorMap,
  orderedColorKeysForStock,
  productHasColorVariants,
} from '@/lib/stockByColor'
import {
  fetchProductsForErp,
  getProductDisplayCategory,
  getProductDisplayName,
  getProductUnitPrice,
} from '@/services/erpInventory'
import {
  RefreshCw,
  Search,
  Filter,
  Printer,
  Download,
  Warehouse,
  ChevronRight,
  ChevronDown,
  Tag,
} from 'lucide-react'

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function productLabel(p) {
  const sz = String(p?.size || '').trim()
  const nm = getProductDisplayName(p)
  if (sz && nm && nm !== '—') return `${sz} · ${nm}`
  return sz || nm || '—'
}

function buildModel(products, searchRaw, categoryFilter) {
  const q = String(searchRaw || '')
    .trim()
    .toLowerCase()
  let list = products.filter((p) => Math.max(0, Number(p.stock) || 0) > 0)
  if (categoryFilter !== 'all') {
    list = list.filter((p) => getProductDisplayCategory(p) === categoryFilter)
  }
  if (q) {
    list = list.filter((p) => {
      const name = getProductDisplayName(p).toLowerCase()
      const size = String(p.size || '').toLowerCase()
      const cat = getProductDisplayCategory(p).toLowerCase()
      return (
        name.includes(q) ||
        size.includes(q) ||
        cat.includes(q) ||
        String(p.id || '')
          .toLowerCase()
          .includes(q)
      )
    })
  }

  const byCat = new Map()
  for (const p of list) {
    const c = getProductDisplayCategory(p)
    if (!byCat.has(c)) byCat.set(c, [])
    byCat.get(c).push(p)
  }

  const categories = [...byCat.keys()].sort((a, b) =>
    a.localeCompare(b, 'uz', { sensitivity: 'base' })
  )

  const flatRows = []
  let idx = 1
  let grandP = 0
  let grandU = 0

  for (const cat of categories) {
    const items = [...byCat.get(cat)].sort((a, b) =>
      getProductDisplayName(a).localeCompare(getProductDisplayName(b), 'uz', { sensitivity: 'base' })
    )
    let subP = 0
    let subU = 0
    for (const p of items) {
      const qty = Math.max(0, Math.floor(Number(p.stock) || 0))
      const price = getProductUnitPrice(p)
      const line = Math.round(qty * price * 100) / 100
      subP += qty
      subU += line
      flatRows.push({
        kind: 'data',
        idx: idx++,
        product: p,
        category: cat,
        qty,
        price,
        line,
      })
    }
    grandP += subP
    grandU += subU
    flatRows.push({
      kind: 'subtotal',
      category: cat,
      qty: subP,
      usd: Math.round(subU * 100) / 100,
    })
  }

  return {
    flatRows,
    grandPieces: grandP,
    grandUsd: Math.round(grandU * 100) / 100,
  }
}

function printTable({ flatRows, grandPieces, grandUsd }) {
  let body = ''
  for (const row of flatRows) {
    if (row.kind === 'data') {
      const lab = escHtml(productLabel(row.product))
      const cat = escHtml(row.category)
      body += `<tr>
        <td class="n">${row.idx}</td>
        <td>${lab}</td>
        <td>${cat}</td>
        <td class="num">${row.qty}</td>
        <td class="num">${formatErpUsdAllowZero(row.price)}</td>
        <td class="num">${formatErpUsdAllowZero(row.line)}</td>
      </tr>`
    } else {
      const title = escHtml(String(row.category).toUpperCase())
      body += `<tr class="sub">
        <td colspan="3"><strong>${title} — kategoriya bo‘yicha jami</strong></td>
        <td class="num"><strong>${row.qty}</strong></td>
        <td class="num">—</td>
        <td class="num"><strong>${formatErpUsdAllowZero(row.usd)}</strong></td>
      </tr>`
    }
  }
  body += `<tr class="grand">
    <td colspan="3"><strong>JAMI</strong></td>
    <td class="num"><strong>${grandPieces}</strong></td>
    <td class="num">—</td>
    <td class="num"><strong>${formatErpUsdAllowZero(grandUsd)}</strong></td>
  </tr>`

  const html = `<!DOCTYPE html><html lang="uz"><head><meta charset="utf-8"/><title>Fizik ombor</title>
<style>
body{font-family:system-ui,sans-serif;padding:24px;color:#0f172a;font-size:13px;}
h1{font-size:18px;margin:0 0 6px;}
p{margin:0 0 16px;color:#64748b;font-size:13px;}
.meta{margin-bottom:20px;color:#334155;}
table{width:100%;border-collapse:collapse;}
th,td{border:1px solid #94a3b8;padding:8px 10px;}
th{background:#334155;color:#fff;text-align:left;font-size:11px;text-transform:uppercase;}
td.num{text-align:right;font-variant-numeric:tabular-nums;}
tr.sub td{background:#ffedd5;}
tr.grand td{background:#d1fae5;}
</style></head><body>
<h1>Fizik ombor (zaxira &gt; 0)</h1>
<p>Faqat hozir omborda dona bor mahsulotlar — jami dona va qiymat pastki qatorda.</p>
<div class="meta">Jami dona: <strong>${grandPieces}</strong> · taxminiy qiymat: <strong>${formatErpUsdAllowZero(grandUsd)}</strong></div>
<table>
<thead><tr><th>#</th><th>Mahsulot</th><th>Kategoriya</th><th>Dona</th><th>Sotuv narxi</th><th>Qator qiymati</th></tr></thead>
<tbody>${body}</tbody>
</table>
<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},280)})</script>
</body></html>`

  const w = window.open('', '_blank', 'width=1100,height=800')
  if (!w) {
    window.alert('Chop etish uchun yangi oyna ochilmadi.')
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
}

function exportCsv({ flatRows, grandPieces, grandUsd }) {
  const sep = ';'
  const lines = [
    '\uFEFF#;Mahsulot;Kategoriya;Dona;Sotuv narxi (USD);Qator qiymati (USD)',
  ]
  for (const row of flatRows) {
    if (row.kind === 'data') {
      const lab = productLabel(row.product).replaceAll(';', ',')
      lines.push(
        [
          row.idx,
          lab,
          row.category,
          row.qty,
          String(row.price).replace('.', ','),
          String(row.line).replace('.', ','),
        ].join(sep)
      )
    } else {
      lines.push(
        ['', `${row.category} — jami`, '', row.qty, '', String(row.usd).replace('.', ',')].join(sep)
      )
    }
  }
  lines.push(['', 'JAMI', '', grandPieces, '', String(grandUsd).replace('.', ',')].join(sep))
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  a.href = URL.createObjectURL(blob)
  a.download = `fizik-ombor-${stamp}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function ProductColorBreakdown({ product }) {
  const hasVariants = productHasColorVariants(product)
  if (!hasVariants) {
    return (
      <div className="wh-phys-detail-inner">
        <p className="erpf-empty-state" style={{ margin: 0 }}>
          Bu mahsulot rang bo‘yicha ajratilmagan — jami qoldiq yuqoridagi «Dona» ustunida.
        </p>
      </div>
    )
  }
  const colorMap = buildStockByColorMap(product)
  const keys = orderedColorKeysForStock(product, colorMap)
  return (
    <div className="wh-phys-detail-inner">
      <div className="erpf-detail-header" style={{ marginBottom: '0.65rem' }}>
        <Tag size={16} aria-hidden />
        <span>Ranglar bo‘yicha qoldiq</span>
      </div>
      <div className="erpf-color-grid">
        {keys.map((c) => (
          <article key={c} className="erpf-color-card">
            <span className="erpf-color-name">{c}</span>
            <strong className="erpf-color-qty">{Math.floor(Number(colorMap[c]) || 0)}</strong>
          </article>
        ))}
      </div>
    </div>
  )
}

export default function WarehousePhysicalPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [openProductId, setOpenProductId] = useState(null)

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
    void load()
  }, [load])

  useEffect(() => {
    setOpenProductId(null)
  }, [search, categoryFilter])

  const categoryOptions = useMemo(() => {
    const s = new Set()
    for (const p of products) {
      if (Math.max(0, Number(p.stock) || 0) > 0) {
        s.add(getProductDisplayCategory(p))
      }
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'uz', { sensitivity: 'base' }))
  }, [products])

  const model = useMemo(
    () => buildModel(products, search, categoryFilter),
    [products, search, categoryFilter]
  )

  const { flatRows, grandPieces, grandUsd } = model

  const toggleProductRow = useCallback((productId) => {
    const k = String(productId ?? '')
    if (!k) return
    setOpenProductId((prev) => (prev === k ? null : k))
  }, [])

  return (
    <ErpShell searchPlaceholder="Mahsulot qidirish...">
      <div className="wh-phys-toolbar">
        <div className="wh-phys-toolbar__search">
          <Search size={18} className="wh-phys-toolbar__icon" aria-hidden />
          <input
            type="search"
            className="wh-phys-toolbar__input"
            placeholder="Mahsulot qidirish..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="wh-phys-toolbar__filters">
          <Filter size={16} aria-hidden />
          <select
            className="erp-input wh-phys-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">Hammasi</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="erpf-icon-btn" title="Yangilash" onClick={() => void load()}>
          <RefreshCw size={20} className={loading ? 'spin' : ''} />
        </button>
        <button
          type="button"
          className="erpf-btn-outline wh-phys-btn-print"
          onClick={() => printTable(model)}
          disabled={loading || flatRows.length === 0}
        >
          <Printer size={18} />
          Jadvalni chop etish
        </button>
        <button
          type="button"
          className="erpf-btn-solid wh-phys-btn-export"
          onClick={() => exportCsv(model)}
          disabled={loading || flatRows.length === 0}
        >
          <Download size={18} />
          Eksport (CSV)
        </button>
      </div>

      <div className="erpf-page-head wh-phys-head">
        <div>
          <h1 className="erpf-page-title wh-phys-title">
            <Warehouse size={28} className="wh-phys-title-ico" aria-hidden />
            Fizik ombor (zaxira &gt; 0)
          </h1>
          <p className="erpf-page-sub">
            Faqat hozir omborda dona bor mahsulotlar — jami dona va qiymat pastki qatorda.
          </p>
          <p className="wh-phys-cross">
            <Link to="/ombor" className="wh-phys-link">
              ← Klassik ombor ko‘rinishi
            </Link>
          </p>
        </div>
        <div className="wh-phys-summary">
          <span>
            Jami dona: <strong>{grandPieces}</strong>
          </span>
          <span className="wh-phys-summary-sep">·</span>
          <span>
            Taxminiy qiymat: <strong>{formatErpUsdAllowZero(grandUsd)}</strong>
          </span>
          <button
            type="button"
            className="erpf-btn-outline wh-phys-btn-print wh-phys-btn-print--sm"
            onClick={() => printTable(model)}
            disabled={loading || flatRows.length === 0}
          >
            <Printer size={16} />
            Chop etish
          </button>
        </div>
      </div>

      {error && <div className="erp-banner err" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="wh-phys-card">
        <div className="erpf-table-scroll">
          <table className="erpf-table wh-phys-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Mahsulot</th>
                <th>Kategoriya</th>
                <th style={{ textAlign: 'right' }}>Dona</th>
                <th style={{ textAlign: 'right' }}>Sotuv narxi</th>
                <th style={{ textAlign: 'right' }}>Qator qiymati</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="erp-spinner" />
                  </td>
                </tr>
              ) : flatRows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    Zaxirada mahsulot yo‘q yoki qidiruv natijasi bo‘sh.
                  </td>
                </tr>
              ) : (
                <>
                  {flatRows.map((row, i) =>
                    row.kind === 'data' ? (
                      <Fragment key={`d-${row.product.id}-${row.idx}`}>
                        <tr>
                          <td>{row.idx}</td>
                          <td>
                            <button
                              type="button"
                              className="wh-phys-prod-btn"
                              onClick={() => toggleProductRow(row.product.id)}
                              aria-expanded={openProductId === String(row.product.id)}
                              aria-controls={`wh-phys-detail-${row.product.id}`}
                              id={`wh-phys-trigger-${row.product.id}`}
                            >
                              <span className="wh-phys-prod-chevron" aria-hidden>
                                {openProductId === String(row.product.id) ? (
                                  <ChevronDown size={17} />
                                ) : (
                                  <ChevronRight size={17} />
                                )}
                              </span>
                              <span className="wh-phys-sku">{productLabel(row.product)}</span>
                            </button>
                          </td>
                          <td>{row.category}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {row.qty}
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {formatErpUsdAllowZero(row.price)}
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                            {formatErpUsdAllowZero(row.line)}
                          </td>
                        </tr>
                        {openProductId === String(row.product.id) && (
                          <tr className="wh-phys-detail-row">
                            <td colSpan={6} id={`wh-phys-detail-${row.product.id}`} role="region" aria-labelledby={`wh-phys-trigger-${row.product.id}`}>
                              <div className="erpf-color-breakdown">
                                <ProductColorBreakdown product={row.product} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ) : (
                      <tr key={`s-${row.category}-${i}`} className="wh-phys-subtotal-row">
                        <td colSpan={3}>
                          <strong>{String(row.category).toUpperCase()}</strong>
                          <span className="wh-phys-sub-lbl"> — kategoriya bo‘yicha jami</span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{row.qty}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>—</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>
                          {formatErpUsdAllowZero(row.usd)}
                        </td>
                      </tr>
                    )
                  )}
                  <tr className="wh-phys-grand-row">
                    <td colSpan={3}>
                      <strong>JAMI</strong>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800 }}>{grandPieces}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>—</td>
                    <td style={{ textAlign: 'right', fontWeight: 800 }}>
                      {formatErpUsdAllowZero(grandUsd)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ErpShell>
  )
}
