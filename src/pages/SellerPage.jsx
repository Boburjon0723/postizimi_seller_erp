import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import SellerNavDrawer from '@/components/SellerNavDrawer'
import SellerMobileBottomNav from '@/components/SellerMobileBottomNav'
import { useAuth } from '@/context/auth-context'
import { formatErpUsdAllowZero } from '@/lib/formatErpUsd'
import { isSupabaseConfigured } from '@/lib/supabase'
import { buildStockByColorMap, listProductColors } from '@/lib/stockByColor'
import {
  fetchProductsForErp,
  getProductDisplayCategory,
  getProductDisplayName,
  getProductImageUrl,
  getProductUnitPrice,
  recordRetailRestock,
  recordRetailSale,
} from '@/services/erpInventory'
import { createSalesOrder } from '@/services/erpSalesOrders'
import { 
  Home, 
  Receipt, 
  Package, 
  BarChart3, 
  LogOut, 
  Search, 
  Bell, 
  Settings, 
  User,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  X,
  CreditCard,
  ChevronRight,
  Menu,
} from 'lucide-react'

export default function SellerPage() {
  const { signOut, role, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState([])
  const [category, setCategory] = useState('all')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [colorQtyDraft, setColorQtyDraft] = useState({})
  const [modalError, setModalError] = useState('')
  const [addingToCart, setAddingToCart] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [cartClearing, setCartClearing] = useState(false)
  const [lineBusy, setLineBusy] = useState({})
  const [customerName, setCustomerName] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const searchInputRef = useRef(null)

  const configured = isSupabaseConfigured()

  const cartPieces = useMemo(
    () => cart.reduce((s, i) => s + (Number(i.qty) || 0), 0),
    [cart]
  )

  const load = useCallback(async () => {
    if (!configured) {
      setLoading(false)
      return
    }
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
  }, [configured])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (location.state?.openCart) {
      setMobileCartOpen(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, location.pathname, navigate])

  const filtered = useMemo(() => {
    let res = products
    if (category !== 'all') {
      res = res.filter((p) => getProductDisplayCategory(p) === category)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      res = res.filter((p) => {
        const name = String(getProductDisplayName(p) || '').toLowerCase()
        const code = String(p.size || '').toLowerCase()
        return name.includes(q) || code.includes(q)
      })
    }
    return res
  }, [products, search, category])

  const sectionTitle = category === 'all' ? 'Barcha mahsulotlar' : category

  const categories = useMemo(() => {
    const map = new Map()
    for (const p of products) {
      const key = getProductDisplayCategory(p)
      if (!key) continue
      map.set(key, (map.get(key) || 0) + 1)
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }))
  }, [products])

  function addToCart(p) {
    const stockMap = buildStockByColorMap(p)
    const colorNames = listProductColors(p)
    const draft = {}
    if (colorNames.length > 0) {
      colorNames.forEach((c) => {
        draft[c] = ''
      })
    } else {
      draft.__default__ = ''
    }
    setColorQtyDraft(draft)
    setModalError('')
    setSelectedProduct({
      ...p,
      _colorStockMap: stockMap,
      _colorNames: colorNames,
    })
  }

  async function updateQty(id, delta) {
    if (!id || !delta) return
    const line = cart.find((x) => x.id === id)
    if (!line) return
    if (lineBusy[id]) return

    setLineBusy((prev) => ({ ...prev, [id]: true }))
    setError(null)
    try {
      if (delta > 0) {
        const res = await recordRetailSale({
          productId: line.productId,
          colorRaw: line.colorRaw,
          quantity: delta,
        })
        if (!res?.success) {
          setError(res?.error || 'Ombordan ayirishda xato')
          return
        }
      } else {
        const res = await recordRetailRestock({
          productId: line.productId,
          colorRaw: line.colorRaw,
          quantity: Math.abs(delta),
        })
        if (!res?.success) {
          setError(res?.error || 'Omborga qaytarishda xato')
          return
        }
      }

      setCart((prev) =>
        prev
          .map((item) => {
            if (item.id !== id) return item
            const next = Math.max(0, item.qty + delta)
            return next === 0 ? null : { ...item, qty: next }
          })
          .filter(Boolean)
      )
      await load()
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLineBusy((prev) => ({ ...prev, [id]: false }))
    }
  }

  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + ((Number(item.unitPrice) || 0) * item.qty), 0)
  }, [cart])

  const total = subtotal

  function closeProductModal() {
    setSelectedProduct(null)
    setColorQtyDraft({})
    setModalError('')
  }

  function onDraftChange(key, value, maxAvailable) {
    const raw = String(value ?? '')
    const digitsOnly = raw.replace(/[^\d]/g, '')
    if (!digitsOnly) {
      setColorQtyDraft((prev) => ({ ...prev, [key]: '' }))
      return
    }
    const parsed = Math.floor(Number(digitsOnly) || 0)
    if (parsed <= 0) {
      setColorQtyDraft((prev) => ({ ...prev, [key]: '' }))
      return
    }
    const capped = Math.min(parsed, Math.max(0, Number(maxAvailable) || 0))
    setColorQtyDraft((prev) => ({ ...prev, [key]: capped > 0 ? String(capped) : '' }))
  }

  async function addSelectedToCart() {
    if (!selectedProduct) return
    const p = selectedProduct
    const stockMap = p._colorStockMap || {}
    const names = p._colorNames || []
    const rows =
      names.length > 0
        ? names.map((c) => ({ key: c, label: c, available: Math.max(0, Number(stockMap[c]) || 0) }))
        : [{ key: '__default__', label: 'Umumiy', available: Math.max(0, Number(p.stock) || 0) }]

    const toAdd = []
    for (const row of rows) {
      const raw = String(colorQtyDraft[row.key] ?? '').trim()
      if (!raw) continue
      const n = Math.max(0, Math.floor(Number(raw) || 0))
      if (n <= 0) continue
      if (n > row.available) {
        setModalError(`${row.label} uchun qoldiqdan ko‘p kiritildi (mavjud: ${row.available})`)
        return
      }
      toAdd.push({ ...row, qty: n })
    }

    if (!toAdd.length) {
      setModalError('Kamida bitta rang uchun miqdor kiriting')
      return
    }

    setAddingToCart(true)
    try {
      const successRows = []
      const failed = []
      for (const row of toAdd) {
        const res = await recordRetailSale({
          productId: p.id,
          colorRaw: row.key === '__default__' ? null : row.key,
          quantity: row.qty,
        })
        if (!res?.success) {
          failed.push(`${row.label}: ${res?.error || 'xato'}`)
        } else {
          successRows.push(row)
        }
      }

      if (successRows.length) {
        setCart((prev) => {
          const next = [...prev]
          for (const row of successRows) {
            const lineId = `${p.id}::${row.key}`
            const idx = next.findIndex((x) => x.id === lineId)
            if (idx >= 0) {
              next[idx] = { ...next[idx], qty: next[idx].qty + row.qty }
            } else {
              next.push({
                id: lineId,
                productId: p.id,
                name: getProductDisplayName(p),
                imageUrl: getProductImageUrl(p),
                unitPrice: getProductUnitPrice(p),
                categoryName: getProductDisplayCategory(p),
                colorLabel: row.label,
                colorRaw: row.key === '__default__' ? null : row.key,
                qty: row.qty,
              })
            }
          }
          return next
        })
      }

      await load()

      if (failed.length) {
        setModalError(`Ba'zi ranglar qo‘shilmadi:\n${failed.join('\n')}`)
        return
      }
      closeProductModal()
    } catch (e) {
      setModalError(e?.message || String(e))
    } finally {
      setAddingToCart(false)
    }
  }

  async function handleCheckout() {
    if (!cart.length || checkoutLoading) return
    setCheckoutLoading(true)
    setError(null)
    setNotice('')
    try {
      const saved = await createSalesOrder({
        sellerUserId: user?.id || null,
        sellerEmail: user?.email || '',
        customerName,
        items: cart,
        totalUsd: subtotal,
        paidAt: new Date().toISOString(),
      })
      if (!saved?.success) {
        setError(saved?.error || 'Buyurtmani saqlashda xato')
        return
      }
      setCart([])
      setCustomerName('')
      setMobileCartOpen(false)
      setNotice(`To‘lov yakunlandi. Buyurtma: #${String(saved.orderId).slice(0, 8)}`)
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setCheckoutLoading(false)
    }
  }

  async function handleClearCart() {
    if (!cart.length || cartClearing) return
    setCartClearing(true)
    setError(null)
    try {
      const errs = []
      for (const line of cart) {
        const res = await recordRetailRestock({
          productId: line.productId,
          colorRaw: line.colorRaw,
          quantity: line.qty,
        })
        if (!res?.success) {
          errs.push(`${line.name}: ${res?.error || 'xato'}`)
        }
      }
      if (errs.length) {
        setError(`Savatni tozalashda xatolar:\n${errs.join('\n')}`)
      } else {
        setCart([])
        setNotice("Savat tozalandi va mahsulotlar omborga qaytarildi")
      }
      await load()
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setCartClearing(false)
    }
  }

  if (!configured) {
    return <div className="erp-page"><h1>Sotuvchi</h1><div className="erp-banner warn">Supabase ni ulang.</div></div>
  }

  return (
    <div className="pos-screen pos-modern-screen">
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
            <p>Admin Paneli</p>
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

      <section className="pos-main pos-modern-main">
        <div className="pos-sticky-header">
          <header className="pos-topbar pos-modern-topbar">
            <div
              className="erpf-search-wrapper pos-desktop-search-wrap"
              style={{ flex: 1, maxWidth: '420px' }}
            >
              <Search className="erpf-search-icon" size={18} />
              <input
                ref={searchInputRef}
                type="search"
                className="erpf-search"
                placeholder="Mahsulotlarni qidirish"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div className="pos-modern-topbar-actions pos-desktop-topbar-actions">
              <button type="button" className="erpf-icon-btn">
                <Bell size={20} />
              </button>
              <button type="button" className="erpf-icon-btn" onClick={() => navigate('/')}>
                <Settings size={20} />
              </button>
              <div className="erpf-avatar">
                <User size={20} />
              </div>
            </div>
          </header>

          <div className="pos-category-pills">
            <button
              type="button"
              className={`pos-pill ${category === 'all' ? 'active' : ''}`}
              onClick={() => setCategory('all')}
            >
              Barchasi
            </button>
            {categories.map((cat) => (
              <button
                key={cat.name}
                type="button"
                className={`pos-pill ${category === cat.name ? 'active' : ''}`}
                onClick={() => setCategory(cat.name)}
                title={`${cat.name} (${cat.count})`}
              >
                {cat.name.length > 10 ? `${cat.name.slice(0, 8)}…` : cat.name}
              </button>
            ))}
          </div>

          <div className="pos-products-section-head">
            <span className="pos-products-kicker">Kategoriya</span>
            <div className="pos-products-title-row">
              <h2 className="pos-products-heading">{sectionTitle}</h2>
              <span className="pos-products-count-badge">{filtered.length}</span>
            </div>
          </div>
        </div>

        {error && <div className="erp-banner err" style={{ marginTop: '1rem' }}>{error}</div>}
        {notice && <div className="erp-banner ok" style={{ marginTop: '1rem' }}>{notice}</div>}

        <div className="pos-cards pos-modern-grid">
          {loading ? (
             <div className="erp-spinner" style={{ gridColumn: '1/-1', margin: '4rem auto' }} />
          ) : filtered.length === 0 ? (
            <div className="pos-empty-state">
              <Package size={48} />
              <p>Mahsulot topilmadi</p>
            </div>
          ) : filtered.map((p) => {
              const price = getProductUnitPrice(p)
              const name = getProductDisplayName(p)
              const img = getProductImageUrl(p)
              const qty = Math.max(0, Number(p.stock) || 0)
              const sku = String(p.size || '').trim() || '—'
              return (
                <article key={p.id} className="pos-card-modern" onClick={() => addToCart(p)}>
                  <div className="pos-card-img-box">
                    <span className="pos-card-art-badge">ART. {sku}</span>
                    {img ? (
                      <img src={img} alt="" className="pos-card-img" />
                    ) : (
                      <div className="pos-card-placeholder">{name[0]}</div>
                    )}
                  </div>
                  <div className="pos-card-content">
                    <div className="pos-card-title-row">
                      <h3>{name}</h3>
                      <span className={`pos-card-stock-pill ${qty <= 5 ? 'low' : ''}`}>{qty} ta</span>
                    </div>
                    <div className="pos-card-price-row">
                      <span className="pos-card-price-label">Narxi</span>
                      <strong className="pos-card-price-value">{formatErpUsdAllowZero(price)}</strong>
                    </div>
                    <div className="pos-card-footer">
                      <span />
                      <div
                        className="pos-card-add"
                        onClick={(e) => {
                          e.stopPropagation()
                          addToCart(p)
                        }}
                        role="presentation"
                      >
                        <Plus size={18} strokeWidth={2.5} />
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
        </div>
      </section>

      {mobileCartOpen && (
        <button
          type="button"
          className="pos-cart-backdrop"
          aria-label="Savatni yopish"
          onClick={() => setMobileCartOpen(false)}
        />
      )}

      <aside
        className={`pos-cart pos-modern-cart ${mobileCartOpen ? 'pos-cart-sheet-open' : ''}`}
      >
        <div className="pos-cart-head">
          <button
            type="button"
            className="pos-cart-menu-btn pos-mobile-only"
            aria-label="Menyu"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu size={22} />
          </button>
          <h2>Joriy Savdo</h2>
          <div className="pos-cart-head-actions">
            <button
              type="button"
              className="pos-cart-search-btn pos-mobile-only"
              aria-label="Qidiruv"
            >
              <Search size={20} />
            </button>
            <button
              type="button"
              className="erpf-icon-btn pos-cart-close-mobile"
              aria-label="Yopish"
              onClick={() => setMobileCartOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
        </div>
        
        <div className="pos-cart-body">
          <div className="customer-input-section">
            <label>Mijoz nomi yoki telefoni</label>
            <div className="customer-input-wrapper">
              <input
                type="text"
                className="pos-customer-input"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Masalan: +998 90 123 45 67"
              />
              <User size={20} className="user-add-icon" />
            </div>
          </div>

          {cart.length === 0 ? (
            <div className="pos-cart-empty">
               <div className="empty-cart-icon"><ShoppingCart size={40} /></div>
               <p>Savat bo'sh</p>
            </div>
          ) : (
            <div className="pos-cart-list">
              {cart.map(item => (
                <div key={item.id} className="pos-cart-item-modern">
                  <div className="pos-cart-item-img-box">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="pos-cart-item-img" />
                    ) : (
                      <div className="item-placeholder">{item.name[0]}</div>
                    )}
                  </div>
                  <div className="pos-cart-item-info">
                    <strong>{item.name}</strong>
                    <span className="info-price">{formatErpUsdAllowZero(item.unitPrice)}</span>
                  </div>
                  <div className="pos-cart-item-actions">
                    <button
                      type="button"
                      className="qty-btn"
                      onClick={() => updateQty(item.id, -1)}
                      disabled={Boolean(lineBusy[item.id])}
                    >
                      <Minus size={14} />
                    </button>
                    <span className="qty-val">{item.qty}</span>
                    <button
                      type="button"
                      className="qty-btn"
                      onClick={() => updateQty(item.id, 1)}
                      disabled={Boolean(lineBusy[item.id])}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {cart.length > 0 && (
            <div className="pos-price-summary-card">
              <div className="summary-row">
                <span>Subtotal</span>
                <strong>{formatErpUsdAllowZero(subtotal)}</strong>
              </div>
              <div className="summary-row total">
                <span>Jami summa</span>
                <div className="total-amount-box">
                  <strong>{formatErpUsdAllowZero(total)}</strong>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="pos-cart-footer-modern">
          <button
            className="pos-checkout-btn-green"
            disabled={cart.length === 0 || checkoutLoading || cartClearing}
            onClick={handleCheckout}
          >
            {checkoutLoading ? 'Yakunlanmoqda…' : (
              <>
                <CreditCard size={20} /> To‘lovni amalga oshirish
              </>
            )}
          </button>
        </div>
      </aside>

      <button
        type="button"
        className="pos-mobile-cart-float"
        onClick={() => setMobileCartOpen(true)}
      >
        <span className="pos-mcf-cart-ico">
          <ShoppingCart size={22} />
          {cartPieces > 0 && <span className="pos-mcf-badge">{cartPieces}</span>}
        </span>
        <span className="pos-mcf-center">
          <span className="pos-mcf-label">SAVAT</span>
          <span className="pos-mcf-sub">
            {cartPieces} ta mahsulot
          </span>
        </span>
        <span className="pos-mcf-total">
          JAMI {formatErpUsdAllowZero(subtotal)}
        </span>
      </button>

      <SellerMobileBottomNav />

      {selectedProduct && (
        <div className="pos-modal-overlay" onClick={closeProductModal}>
          <div className="pos-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="pos-modal-head">
              <div className="modal-title-box">
                <h3>{getProductDisplayName(selectedProduct)}</h3>
                <div className="modal-meta">
                  <span className="meta-size">{selectedProduct.size || 'Standard'}</span>
                  <span className="meta-price">{formatErpUsdAllowZero(getProductUnitPrice(selectedProduct))}</span>
                </div>
              </div>
              <button type="button" className="erpf-icon-btn" onClick={closeProductModal}>
                <X size={20} />
              </button>
            </div>

            <div className="pos-modal-body">
              <div className="pos-modal-content">
                <div className="pos-modal-img-box">
                  {getProductImageUrl(selectedProduct) ? (
                    <img src={getProductImageUrl(selectedProduct)} alt="" className="pos-modal-img" />
                  ) : (
                    <div className="modal-placeholder">{getProductDisplayName(selectedProduct)[0]}</div>
                  )}
                </div>

                <div className="pos-modal-panel">
                  <header>
                    <h4>Ranglar va Miqdor</h4>
                    <p>Savatga qo'shish uchun ranglarni tanlang</p>
                  </header>

                  <div className="pos-modal-rows">
                    {(selectedProduct._colorNames?.length
                      ? selectedProduct._colorNames.map((c) => ({
                          key: c,
                          label: c,
                          available: Math.max(0, Number(selectedProduct._colorStockMap?.[c]) || 0),
                        }))
                      : [
                          {
                            key: '__default__',
                            label: 'Umumiy',
                            available: Math.max(0, Number(selectedProduct.stock) || 0),
                          },
                        ]).map((row) => (
                      <div key={row.key} className="pos-modal-row">
                        <div className="row-info">
                          <strong>{row.label}</strong>
                          <span className={`row-stock ${row.available <= 5 ? 'low' : ''}`}>
                            {row.available} ta mavjud
                          </span>
                        </div>
                        <div className="row-input-group touch-qty-control">
                          <button
                            type="button"
                            className="qty-btn"
                            onClick={() => onDraftChange(row.key, Math.max(0, (Number(colorQtyDraft[row.key]) || 0) - 1), row.available)}
                            disabled={addingToCart}
                          >
                            <Minus size={16} />
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            className="erp-input modal-qty-input"
                            placeholder="0"
                            value={colorQtyDraft[row.key] ?? ''}
                            onChange={(e) => onDraftChange(row.key, e.target.value, row.available)}
                            disabled={row.available <= 0 || addingToCart}
                          />
                          <button
                            type="button"
                            className="qty-btn"
                            onClick={() => onDraftChange(row.key, (Number(colorQtyDraft[row.key]) || 0) + 1, row.available)}
                            disabled={addingToCart || (Number(colorQtyDraft[row.key]) || 0) >= row.available}
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {modalError && <div className="erp-banner err" style={{ marginTop: '1rem' }}>{modalError}</div>}
            </div>

            <div className="pos-modal-footer">
              <button type="button" className="erpf-btn-solid" onClick={addSelectedToCart} disabled={addingToCart}>
                {addingToCart ? 'Qo‘shilmoqda…' : (
                  <>
                    Savatga qo'shish
                  </>
                )}
              </button>
              <button type="button" className="erpf-btn-outline" onClick={closeProductModal}>
                Bekor qilish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

