import { useCallback, useEffect, useMemo, useState } from 'react'
import ErpShell from '@/components/ErpShell'
import HorizontalBarChart from '@/components/HorizontalBarChart'
import { formatErpUsdAllowZero } from '@/lib/formatErpUsd'
import { fetchSalesMonthlyAnalytics } from '@/services/erpSalesOrders'
import { 
  BarChart3, 
  Calendar, 
  ShoppingCart, 
  DollarSign, 
  RefreshCw,
  TrendingUp,
  Users,
  PieChart,
  Package
} from 'lucide-react'

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7)
}

export default function AnalitikaPage() {
  const [monthKey, setMonthKey] = useState(currentMonthKey())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState({
    ordersCount: 0,
    totalPieces: 0,
    totalUsd: 0,
    categories: [],
    customers: [],
    products: [],
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await fetchSalesMonthlyAnalytics(monthKey)
      setData(rows)
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [monthKey])

  useEffect(() => {
    load()
  }, [load])

  const monthLabel = useMemo(() => {
    if (!monthKey) return 'Barcha davr'
    const d = new Date(`${monthKey}-01T00:00:00`)
    if (Number.isNaN(d.getTime())) return monthKey
    return d.toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long' })
  }, [monthKey])

  return (
    <ErpShell>
      <div className="erpf-page-head">
        <div>
          <h1 className="erpf-page-title">Tahliliy maʼlumotlar 📈</h1>
          <p className="erpf-page-sub">Kategoriya va mijozlar bo'yicha oylik sotuvlar (USD)</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <input
            type="month"
            className="erp-input"
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value)}
            style={{ minWidth: '180px' }}
          />
          <button type="button" className="erpf-icon-btn" onClick={load} disabled={loading} title="Yangilash">
            <RefreshCw size={20} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      <div className="erpf-stat-grid">
        <article className="erpf-stat-card">
          <div className="erpf-stat-head">
            <div className="erpf-stat-icon"><Calendar size={20} /></div>
            <small>Davr</small>
          </div>
          <strong>{monthLabel}</strong>
          <span className="erpf-trend neutral">Tanlangan oy</span>
        </article>

        <article className="erpf-stat-card blue">
          <div className="erpf-stat-head">
            <div className="erpf-stat-icon"><ShoppingCart size={20} /></div>
            <small>Buyurtmalar soni</small>
          </div>
          <strong>{data.ordersCount}</strong>
          <span className="erpf-trend up">
            <TrendingUp size={14} /> Muvaffaqiyatli
          </span>
        </article>

        <article className="erpf-stat-card peach">
          <div className="erpf-stat-head">
            <div className="erpf-stat-icon"><DollarSign size={20} /></div>
            <small>Jami savdo</small>
          </div>
          <strong>{formatErpUsdAllowZero(data.totalUsd)}</strong>
          <span className="erpf-trend neutral">{data.totalPieces} ta mahsulot</span>
        </article>
      </div>

      {error && <div className="erp-banner err" style={{ marginBottom: '1.5rem' }}>{error}</div>}

      <div className="erpf-content-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
        {loading ? (
          <div className="erp-spinner" style={{ margin: '4rem auto', gridColumn: '1/-1' }} />
        ) : (
          <>
            <HorizontalBarChart 
              title="Kategoriya bo'yicha sotuv" 
              data={data.categories.map(c => ({ label: c.category_name, value: c.total_usd }))} 
            />
            
            <HorizontalBarChart 
              title="Top mahsulotlar" 
              data={(data.products || []).slice(0, 5).map(p => ({ label: p.product_name, value: p.total_usd }))} 
            />
          </>
        )}
      </div>
      
      <div className="erpf-content-grid" style={{ gridTemplateColumns: '1fr', gap: '2rem', marginTop: '2rem' }}>

        <section className="erpf-table-card">
          <div className="erpf-table-head">
            <div className="erpf-table-title">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={18} style={{ color: '#3b82f6' }} />
                <h3>Mijoz bo'yicha sotuv</h3>
              </div>
              <p>Xaridlar soni va umumiy summa bo'yicha mijozlar</p>
            </div>
          </div>
          <div className="erpf-table-scroll">
            <table className="erpf-table">
              <thead>
                <tr>
                  <th>Mijoz</th>
                  <th>Buyurtmalar</th>
                  <th>Miqdor</th>
                  <th>Jami (USD)</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '4rem' }}><div className="erp-spinner" /></td></tr>
                ) : data.customers.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Ma'lumot topilmadi</td></tr>
                ) : (
                  data.customers.map((row) => (
                    <tr key={row.customer_name}>
                      <td style={{ color: 'var(--text)', fontWeight: '500' }}>{row.customer_name}</td>
                      <td>{row.orders_count} ta</td>
                      <td>{row.pieces} ta</td>
                      <td style={{ fontWeight: '600', color: 'var(--primary)' }}>{formatErpUsdAllowZero(row.total_usd)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </ErpShell>
  )
}

