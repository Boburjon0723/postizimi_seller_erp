import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import ErpShell from '@/components/ErpShell'
import { isSupabaseConfigured } from '@/lib/supabase'
import { fetchDashboardMetrics } from '@/services/erpSalesOrders'
import { fetchProductsForErp } from '@/services/erpInventory'
import { formatErpUsdAllowZero } from '@/lib/formatErpUsd'
import { 
  TrendingUp, 
  Users, 
  Package, 
  DollarSign, 
  Plus, 
  ArrowRight,
  AlertCircle,
  Clock,
  ChevronRight,
  RefreshCw
} from 'lucide-react'

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState({
    monthlyTotalUsd: 0,
    monthlyTotalPieces: 0,
    recentSales: [],
    salesDynamics: []
  })
  const [lowInventory, setLowInventory] = useState([])
  const [totalProductsCount, setTotalProductsCount] = useState(0)
  const [error, setError] = useState('')

  const ok = isSupabaseConfigured()

  const loadData = async () => {
    setLoading(true)
    try {
      const [m, p] = await Promise.all([
        fetchDashboardMetrics(),
        fetchProductsForErp()
      ])
      setMetrics(m)
      
      const low = p.filter(x => Number(x.stock) < 5).slice(0, 5)
      setLowInventory(low)
      setTotalProductsCount(p.length)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (ok) loadData()
  }, [ok])

  const todayStr = useMemo(() => {
    return new Date().toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' })
  }, [])

  const maxDynamics = Math.max(...metrics.salesDynamics.map(d => d.v), 1)

  return (
    <ErpShell searchPlaceholder="Dokumentlarni qidirish...">
      {!ok && (
        <div className="erp-banner warn">
          <AlertCircle size={18} />
          <span><strong>Diqqat:</strong> Supabase ulanmagan. <code>.env</code> faylni tekshiring.</span>
        </div>
      )}

      <div className="erpf-page-head">
        <div>
          <h1 className="erpf-page-title">Xush kelibsiz! 👋</h1>
          <p className="erpf-page-sub">Bugun: {todayStr} · Tizim dinamik ma'lumotlar bilan ishlamoqda.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button type="button" className="erpf-icon-btn" onClick={loadData} disabled={loading}>
            <RefreshCw size={20} className={loading ? 'spin' : ''} />
          </button>
          <Link to="/sotuvchi" className="erpf-btn-solid">
            <Plus size={20} style={{ marginRight: '8px' }} />
            Yangi Savdo
          </Link>
        </div>
      </div>

      {loading && !metrics.recentSales.length ? (
        <div style={{ padding: '10rem 0', textAlign: 'center' }}>
          <div className="erp-spinner" style={{ margin: '0 auto 1.5rem' }} />
          <p style={{ color: 'var(--text-muted)' }}>Ma'lumotlar yuklanmoqda...</p>
        </div>
      ) : (
        <>
          <div className="erpf-stat-grid animate-fade-in">
            <article className="erpf-stat-card">
              <div className="erpf-stat-head">
                <div className="erpf-stat-icon"><DollarSign size={20} /></div>
                <small>Oylik daromad</small>
              </div>
              <strong>{formatErpUsdAllowZero(metrics.monthlyTotalUsd)}</strong>
              <span className="erpf-trend up">
                <TrendingUp size={14} /> Joriy oy
              </span>
            </article>

            <article className="erpf-stat-card blue">
              <div className="erpf-stat-head">
                <div className="erpf-stat-icon"><TrendingUp size={20} /></div>
                <small>Sotilgan mahsulotlar</small>
              </div>
              <strong>{metrics.monthlyTotalPieces} ta</strong>
              <span className="erpf-trend neutral">Oxirgi 30 kun</span>
            </article>

            <article className="erpf-stat-card peach">
              <div className="erpf-stat-head">
                <div className="erpf-stat-icon"><Package size={20} /></div>
                <small>Jami mahsulotlar</small>
              </div>
              <strong>{totalProductsCount} ta</strong>
              <span className={`erpf-trend ${lowInventory.length > 0 ? 'warn' : 'up'}`}>
                <AlertCircle size={14} /> {lowInventory.length} ta kam qoldiq
              </span>
            </article>
          </div>

          <div className="erpf-content-grid animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <section className="erpf-chart-card">
              <div className="erpf-chart-head">
                <div>
                  <h3>Sotuvlar dinamikasi (USD)</h3>
                  <p>Oxirgi 7 kundagi ko'rsatkichlar</p>
                </div>
              </div>
              <div className="erpf-bars">
                {metrics.salesDynamics.map((x) => (
                  <div key={x.day} className="erpf-bar-col">
                    <div 
                      className="erpf-bar" 
                      style={{ height: `${(x.v / maxDynamics) * 100}%` }} 
                      title={`${x.v} USD`} 
                    />
                    <span>{x.day}</span>
                  </div>
                ))}
              </div>
            </section>

            <aside className="erpf-right-stack">
              <section className="erpf-right-card">
                <h4>Kam qoldiqlar</h4>
                <div className="erpf-mini-list">
                  {lowInventory.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '1rem 0' }}>Barcha mahsulotlar yetarli</p>
                  ) : lowInventory.map((x) => (
                    <div key={x.id} className="erpf-mini-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name_uz || x.name}</strong>
                        <small>SKU: {x.size || 'Nomaʼlum'}</small>
                      </div>
                      <em className="qty-warn">{x.stock || 0} dona</em>
                    </div>
                  ))}
                </div>
              </section>
              <section className="erpf-right-card">
                <h4>Tizim holati</h4>
                <div className="erpf-mini-list">
                    <div className="erpf-mini-row">
                      <div className="erpf-mini-ico"><Clock size={14} /></div>
                      <div>
                        <strong>Ma'lumotlar yangilandi</strong>
                        <small>Hozirgina · Tizim</small>
                      </div>
                    </div>
                    <div className="erpf-mini-row">
                      <div className="erpf-mini-ico"><AlertCircle size={14} style={{ color: 'var(--success)' }} /></div>
                      <div>
                        <strong>Supabase ulanishi</strong>
                        <small>Faol · Stabil</small>
                      </div>
                    </div>
                </div>
              </section>
            </aside>
          </div>

          <section className="erpf-table-card animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="erpf-table-head">
              <div className="erpf-table-title">
                <h3>Oxirgi savdolar</h3>
                <p>Oxirgi 10 ta muvaffaqiyatli bitimlar ro'yxati</p>
              </div>
              <Link to="/sotuvchi/buyurtmalar" className="erpf-btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                Barchasini ko'rish <ArrowRight size={16} />
              </Link>
            </div>
            <div className="erpf-table-scroll">
              <table className="erpf-table">
                <thead>
                  <tr>
                    <th>Mijoz</th>
                    <th>Mahsulotlar</th>
                    <th>Vaqt</th>
                    <th>Summa</th>
                    <th>Holat</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.recentSales.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Hozircha savdolar mavjud emas</td></tr>
                  ) : metrics.recentSales.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="erpf-cell-user">
                          <div className="erpf-user-avatar">{row.customer_name?.[0] || 'M'}</div>
                          <span style={{ color: 'var(--text)', fontWeight: '500' }}>{row.customer_name}</span>
                        </div>
                      </td>
                      <td>{row.total_items} ta mahsulot</td>
                      <td>{new Date(row.paid_at || row.created_at).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td style={{ fontWeight: '600', color: 'var(--primary)' }}>{formatErpUsdAllowZero(row.total_usd)}</td>
                      <td>
                        <span className="erpf-badge success">Muvaffaqiyatli</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </ErpShell>
  )
}

