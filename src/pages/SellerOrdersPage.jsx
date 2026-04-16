import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/auth-context'
import SellerNavDrawer from '@/components/SellerNavDrawer'
import SellerMobileBottomNav from '@/components/SellerMobileBottomNav'
import { formatErpUsdAllowZero } from '@/lib/formatErpUsd'
import {
  cancelSalesOrder,
  fetchSalesOrders,
  updateSalesOrderItems,
} from '@/services/erpSalesOrders'
import {
  fetchProductsForErp,
  getProductDisplayCategory,
  getProductDisplayName,
  getProductImageUrl,
  getProductUnitPrice,
} from '@/services/erpInventory'
import { listProductColors } from '@/lib/stockByColor'
import { 
  Home, 
  Receipt, 
  BarChart3, 
  LogOut, 
  Printer, 
  RefreshCw,
  ShoppingCart,
  DollarSign,
  Box,
  Ban,
  Pencil,
  Menu,
} from 'lucide-react'

function formatDateTime(value) {
  const d = value ? new Date(value) : null
  if (!d || Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('uz-UZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Buyurtma qatorlarini kategoriya → mahsulot bo‘yicha guruhlaydi (bir xil mahsulotning ranglari bitta qatorga). */
function buildPrintGroups(items) {
  const categories = []
  const catIndex = new Map()
  for (const it of items || []) {
    const catName = String(it.category_name || 'Kategoriyasiz').trim() || 'Kategoriyasiz'
    let idx = catIndex.get(catName)
    if (idx === undefined) {
      idx = categories.length
      catIndex.set(catName, idx)
      categories.push({ name: catName, productOrder: [], productMap: new Map() })
    }
    const cat = categories[idx]
    const pid = String(it.product_id || '').trim()
    const key = pid ? `id:${pid}` : `name:${String(it.product_name || '').trim() || 'unknown'}`
    if (!cat.productMap.has(key)) {
      cat.productMap.set(key, { product_id: pid, variants: [] })
      cat.productOrder.push(key)
    }
    cat.productMap.get(key).variants.push(it)
  }
  return categories.map((c) => ({
    name: c.name,
    products: c.productOrder.map((k) => c.productMap.get(k)),
  }))
}

export default function SellerOrdersPage() {
  const { signOut, role } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [rowBusyId, setRowBusyId] = useState('')
  const [editOrder, setEditOrder] = useState(null)
  const [editItems, setEditItems] = useState([])
  const [editBusy, setEditBusy] = useState(false)
  const [newProductCode, setNewProductCode] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [rows, prod] = await Promise.all([
        fetchSalesOrders({ limit: 300 }),
        fetchProductsForErp(),
      ])
      setOrders(rows)
      setProducts(prod || [])
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const totals = useMemo(() => {
    let sum = 0
    let pieces = 0
    for (const o of orders.filter((x) => String(x.status || 'paid') !== 'cancelled')) {
      sum += Number(o.total_usd) || 0
      pieces += Number(o.total_items) || 0
    }
    return { sum, pieces }
  }, [orders])

  function printOrder(order) {
    const productById = new Map((products || []).map((p) => [String(p.id), p]))
    const groups = buildPrintGroups(order.items || [])
    const tbodyParts = []
    let globalIdx = 0

    for (const cat of groups) {
      tbodyParts.push(
        `<tr class="cat-head"><td colspan="8">Kategoriya: ${esc(cat.name)}</td></tr>`
      )
      let catPieces = 0
      let catUsd = 0
      for (const grp of cat.products) {
        globalIdx += 1
        const p = grp.product_id ? productById.get(String(grp.product_id)) : null
        const imgUrl = getProductImageUrl(p)
        const kod =
          String(p?.size || '').trim() ||
          (grp.product_id ? String(grp.product_id).slice(0, 8) : '—')
        const imgCell = imgUrl
          ? `<td class="cell-img"><img src="${esc(imgUrl)}" alt="" /></td>`
          : `<td class="cell-img"><div class="img-ph" aria-hidden="true">—</div></td>`

        const colorOrder = []
        const aggByColor = new Map()
        for (const v of grp.variants) {
          const q = Math.max(0, Math.floor(Number(v.quantity) || 0))
          const cn =
            v.color_name != null && String(v.color_name).trim() !== ''
              ? String(v.color_name).trim()
              : '—'
          const lineUsd = Math.max(0, Number(v.line_total_usd) || 0)
          if (!aggByColor.has(cn)) {
            colorOrder.push(cn)
            aggByColor.set(cn, { qty: 0, lineTotalUsd: 0 })
          }
          const a = aggByColor.get(cn)
          a.qty += q
          a.lineTotalUsd += lineUsd
        }
        const lines = colorOrder.map((cn) => {
          const a = aggByColor.get(cn) || { qty: 0, lineTotalUsd: 0 }
          const unitUsd = a.qty > 0 ? a.lineTotalUsd / a.qty : 0
          return {
            label: esc(cn),
            qty: a.qty,
            unitUsd,
            lineTotalUsd: a.lineTotalUsd,
          }
        })
        const totalPieces = lines.reduce((s, l) => s + l.qty, 0)
        const productUsd = lines.reduce((s, l) => s + l.lineTotalUsd, 0)
        catPieces += totalPieces
        catUsd += productUsd

        const rangHtml = lines
          .map((l) => `<div class="stack-line">${l.label}</div>`)
          .join('')
        const miqdorHtml = lines
          .map((l) => `<div class="stack-line stack-num">${l.qty}</div>`)
          .join('')
        const narxHtml = lines
          .map((l) => `<div class="stack-line stack-num">${formatErpUsdAllowZero(l.unitUsd)}</div>`)
          .join('')
        const summaHtml = lines
          .map((l) => `<div class="stack-line stack-num">${formatErpUsdAllowZero(l.lineTotalUsd)}</div>`)
          .join('')

        const zebra = globalIdx % 2 === 0 ? 'prod-zebra-b' : 'prod-zebra-a'
        tbodyParts.push(`
          <tr class="prod-row ${zebra}">
            <td class="td-center">${globalIdx}</td>
            ${imgCell}
            <td class="td-center td-kod">${esc(kod)}</td>
            <td class="td-rang"><div class="stack">${rangHtml}</div></td>
            <td class="td-miqdor"><div class="stack">${miqdorHtml}</div></td>
            <td class="td-narx"><div class="stack">${narxHtml}</div></td>
            <td class="td-summa"><div class="stack">${summaHtml}</div></td>
            <td class="td-center td-jami-par">${totalPieces}</td>
          </tr>
        `)
      }
      tbodyParts.push(
        `<tr class="cat-total"><td colspan="6" class="cat-total-label">Kategoriya jami</td><td class="td-summa">${formatErpUsdAllowZero(catUsd)}</td><td class="td-center">${catPieces}</td></tr>`
      )
    }

    const rows = tbodyParts.join('')

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Buyurtma #${esc(String(order.id).slice(0, 8))}</title>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #0f172a; line-height: 1.5; }
            .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
            h1 { margin: 0; font-size: 24px; color: #1e293b; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
            .meta-item { font-size: 14px; }
            .meta-label { color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; margin-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th, td { border: 1px solid #cbd5e1; padding: 10px 12px; font-size: 13px; vertical-align: middle; }
            thead th { background: #fef3c7; font-weight: 700; color: #1e293b; text-align: center; }
            .td-center { text-align: center; }
            .td-kod { font-weight: 600; }
            .td-rang { text-align: left; }
            .td-miqdor { text-align: right; width: 88px; }
            .td-narx { text-align: right; min-width: 88px; }
            .td-summa { text-align: right; min-width: 92px; font-weight: 600; }
            .td-jami-par { font-weight: 700; min-width: 72px; }
            .stack { display: flex; flex-direction: column; gap: 0; }
            .stack-line { padding: 4px 0; line-height: 1.35; }
            .stack-line + .stack-line { border-top: 1px solid #e2e8f0; }
            .stack-num { font-variant-numeric: tabular-nums; }
            .cat-head td { background: #dcfce7; font-weight: 700; text-align: left; color: #14532d; }
            .cat-total td { background: #e0f2fe; }
            .cat-total-label { text-align: right !important; font-weight: 600; color: #0c4a6e; }
            .prod-zebra-a { background: #eff6ff; }
            .prod-zebra-b { background: #ffffff; }
            .cell-img { width: 72px; text-align: center; }
            .cell-img img { width: 56px; height: 56px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0; display: block; margin: 0 auto; }
            .img-ph { width: 56px; height: 56px; margin: 0 auto; background: #f1f5f9; border-radius: 8px; border: 1px dashed #cbd5e1; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #94a3b8; }
            .total-box { display: flex; justify-content: flex-end; }
            .total-card { background: #f1f5f9; padding: 20px; border-radius: 8px; min-width: 200px; }
            .total-row { display: flex; justify-content: space-between; font-weight: 700; font-size: 18px; color: #0f172a; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Buyurtma #${esc(String(order.id).slice(0, 8))}</h1>
          </div>
          <div class="meta">
            <div class="meta-item">
              <div class="meta-label">Sana</div>
              ${esc(formatDateTime(order.paid_at))}
            </div>
            <div class="meta-item">
              <div class="meta-label">Mijoz</div>
              ${esc(order.customer_name || 'Mijoz ko`rsatilmagan')}
            </div>
            <div class="meta-item">
              <div class="meta-label">Sotuvchi</div>
              ${esc(order.seller_email || '-')}
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Rasm</th>
                <th>Kod</th>
                <th>Rang</th>
                <th>Miqdor</th>
                <th>Narx</th>
                <th>Jami summa</th>
                <th>Jami par</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="total-box">
            <div class="total-card">
              <div class="total-row">
                <span>Buyurtma jami (USD):</span>
                <span>${formatErpUsdAllowZero(order.total_usd)}</span>
              </div>
            </div>
          </div>
          <script>
            window.addEventListener('load', function () {
              setTimeout(function () { window.print(); }, 300);
            });
          </script>
        </body>
      </html>
    `
    const w = window.open('', '_blank', 'width=1000,height=760')
    if (!w) return
    w.document.open()
    w.document.write(html)
    w.document.close()
  }

  async function onCancelOrder(order) {
    if (!order?.id) return
    if (String(order.status || 'paid') === 'cancelled') return
    const yes = window.confirm(
      'Buyurtma bekor qilinsinmi? Bu amal mahsulotlarni omborga qaytaradi.'
    )
    if (!yes) return

    setRowBusyId(String(order.id))
    setError('')
    setNotice('')
    try {
      const res = await cancelSalesOrder(order.id)
      if (!res?.success) {
        setError(res?.error || 'Bekor qilishda xato')
        return
      }
      setNotice('Buyurtma bekor qilindi va mahsulotlar omborga qaytarildi')
      await load()
    } finally {
      setRowBusyId('')
    }
  }

  function openOrderEditor(order) {
    if (!order) return
    if (String(order.status || 'paid') === 'cancelled') return
    const rows = (order.items || []).map((it) => ({
      product: products.find((p) => String(p.id) === String(it.product_id)),
      id: String(it.id || `${it.product_id}-${it.color_name || ''}`),
      product_id: String(it.product_id || ''),
      product_name: String(it.product_name || ''),
      category_name: String(it.category_name || 'Kategoriyasiz'),
      color_name: it.color_name || '',
      quantity: Math.max(1, Number(it.quantity) || 1),
      unit_price_usd: Math.max(0, Number(it.unit_price_usd) || 0),
    })).map((line) => {
      const colors = line.product ? listProductColors(line.product) : []
      const first = colors[0] || ''
      return {
        ...line,
        color_name: colors.length ? (line.color_name || first) : '',
      }
    }).map(({ product, ...rest }) => rest)
    setEditOrder(order)
    setEditItems(rows)
  }

  function closeOrderEditor() {
    if (editBusy) return
    setEditOrder(null)
    setEditItems([])
    setNewProductCode('')
  }

  function updateEditLine(lineId, patch) {
    setEditItems((prev) => prev.map((x) => (x.id === lineId ? { ...x, ...patch } : x)))
  }

  function removeEditLine(lineId) {
    setEditItems((prev) => prev.filter((x) => x.id !== lineId))
  }

  function addNewEditLine(product) {
    const p = product || products?.[0]
    if (!p) return
    const colors = listProductColors(p)
    setEditItems((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        product_id: String(p.id),
        product_name: getProductDisplayName(p),
        category_name: getProductDisplayCategory(p),
        color_name: colors[0] || '',
        quantity: 1,
        unit_price_usd: Math.max(0, Number(getProductUnitPrice(p)) || 0),
      },
    ])
  }

  function addByCode() {
    const code = String(newProductCode || '').trim().toLowerCase()
    setError('')
    if (!code) {
      setError('Mahsulot kodini kiriting')
      return
    }
    const p = products.find((x) => String(x.size || '').trim().toLowerCase() === code)
    if (!p) {
      setError('Bu kod bo‘yicha mahsulot topilmadi')
      return
    }
    addNewEditLine(p)
    setNewProductCode('')
  }

  function onChangeProductForLine(lineId, productId) {
    const p = products.find((x) => String(x.id) === String(productId))
    if (!p) return
    const colors = listProductColors(p)
    updateEditLine(lineId, {
      product_id: String(p.id),
      product_name: getProductDisplayName(p),
      category_name: getProductDisplayCategory(p),
      color_name: colors[0] || '',
      unit_price_usd: Math.max(0, Number(getProductUnitPrice(p)) || 0),
    })
  }

  function getProductColorsForLine(line) {
    const p = products.find((x) => String(x.id) === String(line.product_id))
    return p ? listProductColors(p) : []
  }

  async function saveOrderItemsEdit() {
    if (!editOrder?.id || editBusy) return
    if (!editItems.length) {
      setError('Buyurtmada kamida bitta mahsulot bo‘lishi kerak')
      return
    }
    setEditBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await updateSalesOrderItems(
        editOrder.id,
        editItems.map((it) => ({
          product_id: it.product_id,
          product_name: it.product_name,
          category_name: it.category_name,
          color_name: String(it.color_name || '').trim() || null,
          quantity: Math.max(1, Math.floor(Number(it.quantity) || 0)),
          unit_price_usd: Math.max(0, Number(it.unit_price_usd) || 0),
        }))
      )
      if (!res?.success) {
        setError(res?.error || 'Buyurtmani tahrirlashda xato')
        return
      }
      setNotice('Buyurtma mahsulotlari yangilandi')
      closeOrderEditor()
      await load()
    } finally {
      setEditBusy(false)
    }
  }

  return (
    <div className="pos-screen pos-modern-screen pos-orders-screen-wrap">
      <SellerNavDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        role={role}
        onSignOut={signOut}
      />

      <aside className="pos-modern-sidebar">
        <div className="pos-modern-brand">
          <div className="brand-logo-small">NH</div>
          <div>
            <h2>Savdo Terminali</h2>
            <p>Buyurtmalar Ro'yxati</p>
          </div>
        </div>

        <nav className="pos-modern-nav">
          <button
            type="button"
            className={`pos-modern-nav-item ${location.pathname === '/sotuvchi' ? 'active' : ''}`}
            onClick={() => navigate('/sotuvchi')}
          >
            <Home size={20} /> <span>Asosiy</span>
          </button>
          <button
            type="button"
            className={`pos-modern-nav-item ${location.pathname === '/sotuvchi/buyurtmalar' ? 'active' : ''}`}
            onClick={() => navigate('/sotuvchi/buyurtmalar')}
          >
            <Receipt size={20} /> <span>Buyurtmalar</span>
          </button>
          {role === 'erp' && (
            <button type="button" className="pos-modern-nav-item" onClick={() => navigate('/analitika')}>
              <BarChart3 size={20} /> <span>Hisobotlar</span>
            </button>
          )}
        </nav>

        <div className="pos-modern-side-bottom">
          <button type="button" className="pos-modern-nav-item danger" onClick={signOut}>
            <LogOut size={20} /> <span>Chiqish</span>
          </button>
        </div>
      </aside>

      <main className="pos-orders-main">
        <div className="pos-mobile-appbar pos-orders-mobile-appbar">
          <button
            type="button"
            className="pos-mobile-appbar-menu"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Menyu"
          >
            <Menu size={22} />
          </button>
          <h1 className="pos-mobile-appbar-title">Buyurtmalar</h1>
          <button
            type="button"
            className="erpf-icon-btn"
            onClick={load}
            disabled={loading}
            title="Yangilash"
            aria-label="Yangilash"
          >
            <RefreshCw size={20} className={loading ? 'spin' : ''} />
          </button>
        </div>

        <div className="pos-orders-head">
          <div>
            <h1 className="erpf-page-title">Buyurtmalar 📦</h1>
            <p className="erpf-page-sub">To'lov qilingan savdo buyurtmalari ro'yxati</p>
          </div>
          <button
            type="button"
            className="erpf-icon-btn pos-orders-refresh-desktop"
            onClick={load}
            disabled={loading}
            title="Yangilash"
          >
            <RefreshCw size={20} className={loading ? 'spin' : ''} />
          </button>
        </div>

        <div className="pos-orders-stats" style={{ marginBottom: '2rem' }}>
          <article className="pos-orders-stat">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <ShoppingCart size={18} style={{ color: 'var(--text-muted)' }} />
              <small>Jami buyurtmalar</small>
            </div>
            <strong>{orders.length} ta</strong>
          </article>
          <article className="pos-orders-stat">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <Box size={18} style={{ color: 'var(--text-muted)' }} />
              <small>Jami mahsulotlar</small>
            </div>
            <strong>{totals.pieces} ta</strong>
          </article>
          <article className="pos-orders-stat">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <DollarSign size={18} style={{ color: 'var(--primary)' }} />
              <small>Umumiy summa</small>
            </div>
            <strong>{formatErpUsdAllowZero(totals.sum)}</strong>
          </article>
        </div>

        {error && <div className="erp-banner err" style={{ marginBottom: '1rem' }}>{error}</div>}
        {notice && <div className="erp-banner ok" style={{ marginBottom: '1.5rem' }}>{notice}</div>}

        <div className="erpf-table-card">
          <div className="erpf-table-head">
            <div className="erpf-table-title">
              <h3>Buyurtmalar ro'yxati</h3>
              <p>Hozirda 300 tagacha oxirgi buyurtmalar ko'rsatiladi</p>
            </div>
          </div>
          <div className="erpf-table-scroll">
            <table className="erpf-table">
              <thead>
                <tr>
                  <th>Buyurtma</th>
                  <th>Sana</th>
                  <th>Mijoz</th>
                  <th>Miqdor</th>
                  <th>Jami</th>
                  <th>Holat</th>
                  <th>Amal</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '4rem' }}><div className="erp-spinner" /></td></tr>
                ) : orders.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Buyurtmalar topilmadi</td></tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <span className="erpf-badge">#{String(order.id).slice(0, 8)}</span>
                        </div>
                      </td>
                      <td>{formatDateTime(order.paid_at)}</td>
                      <td><strong>{order.customer_name || 'Mijoz ko`rsatilmagan'}</strong></td>
                      <td><span className="erpf-badge">{order.total_items} ta</span></td>
                      <td style={{ fontWeight: '700', color: 'var(--primary)' }}>{formatErpUsdAllowZero(order.total_usd)}</td>
                      <td>
                        <span className={`erpf-badge ${String(order.status || 'paid') === 'cancelled' ? 'err' : 'ok'}`}>
                          {String(order.status || 'paid') === 'cancelled' ? 'Bekor qilingan' : 'To`langan'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                          <button type="button" className="erpf-icon-btn" onClick={() => printOrder(order)} title="Chop etish">
                            <Printer size={16} />
                          </button>
                          <button
                            type="button"
                            className="erpf-icon-btn"
                            onClick={() => openOrderEditor(order)}
                            disabled={String(order.status || 'paid') === 'cancelled' || rowBusyId === String(order.id)}
                            title="Tahrirlash"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            className="erpf-icon-btn danger"
                            onClick={() => onCancelOrder(order)}
                            disabled={String(order.status || 'paid') === 'cancelled' || rowBusyId === String(order.id)}
                            title="Bekor qilish"
                          >
                            <Ban size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {editOrder && (
        <div className="pos-modal-overlay" onClick={closeOrderEditor}>
          <div className="pos-modal-card pos-order-edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pos-modal-head">
              <div className="modal-title-box">
                <h3>Buyurtmani tahrirlash #{String(editOrder.id).slice(0, 8)}</h3>
                <div className="modal-meta">
                  <span className="meta-size">{formatDateTime(editOrder.paid_at)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  className="erp-input"
                  style={{ minWidth: '180px' }}
                  value={newProductCode}
                  onChange={(e) => setNewProductCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addByCode()
                    }
                  }}
                  placeholder="Kod kiriting (masalan N-007)"
                />
                <button type="button" className="erpf-btn-outline" onClick={addByCode}>
                  + Kod bilan qo‘shish
                </button>
              </div>
            </div>

            <div className="pos-modal-body">
              <div className="order-edit-list">
                {editItems.map((line) => {
                  const colorOptions = getProductColorsForLine(line)
                  return (
                    <div key={line.id} className="order-edit-row">
                      <select
                        className="erp-input"
                        value={line.product_id}
                        onChange={(e) => onChangeProductForLine(line.id, e.target.value)}
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {String(p.size || '—')} — {getProductDisplayName(p)}
                          </option>
                        ))}
                      </select>
                      {colorOptions.length ? (
                        <select
                          className="erp-input"
                          value={line.color_name || colorOptions[0]}
                          onChange={(e) => updateEditLine(line.id, { color_name: e.target.value })}
                        >
                          {colorOptions.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input className="erp-input" value="Rangsiz" disabled />
                      )}
                      <input
                        className="erp-input"
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(e) =>
                          updateEditLine(line.id, { quantity: Math.max(1, Number(e.target.value) || 1) })
                        }
                      />
                      <input
                        className="erp-input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unit_price_usd}
                        onChange={(e) =>
                          updateEditLine(line.id, { unit_price_usd: Math.max(0, Number(e.target.value) || 0) })
                        }
                      />
                      <button
                        type="button"
                        className="erpf-icon-btn danger"
                        onClick={() => removeEditLine(line.id)}
                        title="Qatorni o‘chirish"
                      >
                        <Ban size={16} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="pos-modal-footer">
              <button type="button" className="erpf-btn-outline" onClick={closeOrderEditor} disabled={editBusy}>
                Bekor qilish
              </button>
              <button type="button" className="erpf-btn-solid" onClick={saveOrderItemsEdit} disabled={editBusy}>
                {editBusy ? 'Saqlanmoqda…' : 'Saqlash'}
              </button>
            </div>
          </div>
        </div>
      )}

      <SellerMobileBottomNav />
    </div>
  )
}

