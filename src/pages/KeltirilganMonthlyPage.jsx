import { useCallback, useEffect, useMemo, useState } from 'react'
import ErpShell from '@/components/ErpShell'
import { isSupabaseConfigured } from '@/lib/supabase'
import { computeInboundTotalsFromRow, formatInboundUsdAllowZero } from '@/lib/inboundCrmTable'
import { fetchAcceptedInboundReport } from '@/services/erpInboundRequests'
import { fetchProductMapByIds } from '@/services/erpInventory'
import { 
  Calendar, 
  Box, 
  DollarSign, 
  RefreshCw, 
  LayoutDashboard,
  Clock,
  ChevronRight,
  TrendingUp,
  FileText
} from 'lucide-react'

function monthKey(iso) {
  if (!iso) return 'unknown'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabelFromKey(key) {
  if (key === 'unknown') return '—'
  const [y, m] = key.split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return key
  const d = new Date(y, m - 1, 15)
  return d.toLocaleString('uz-UZ', { year: 'numeric', month: 'long' })
}

export default function KeltirilganMonthlyPage() {
  const configured = isSupabaseConfigured()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!configured) {
      setLoading(false)
      return
    }
    setError(null)
    setLoading(true)
    try {
      const raw = await fetchAcceptedInboundReport({ limit: 500 })
      const needs = raw.filter(
        (r) => r.accepted_total_uzs == null || r.accepted_total_pieces == null
      )
      const pidSet = new Set()
      for (const r of needs) {
        for (const it of Array.isArray(r.items) ? r.items : []) {
          if (it?.product_id) pidSet.add(String(it.product_id))
        }
      }
      const map = pidSet.size ? await fetchProductMapByIds([...pidSet]) : new Map()
      const enriched = raw.map((r) => {
        if (r.accepted_total_uzs != null && r.accepted_total_pieces != null) return r
        const { pieces, money } = computeInboundTotalsFromRow(r, map)
        return {
          ...r,
          accepted_total_pieces: pieces,
          accepted_total_uzs: money,
        }
      })
      setRows(enriched)
    } catch (e) {
      setError(e?.message || String(e))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [configured])

  useEffect(() => {
    void load()
  }, [load])

  const byMonth = useMemo(() => {
    const m = new Map()
    for (const r of rows) {
      const mk = monthKey(r.accepted_at)
      if (!m.has(mk)) {
        m.set(mk, { monthKey: mk, orders: 0, pieces: 0, usd: 0 })
      }
      const a = m.get(mk)
      a.orders += 1
      a.pieces += Number(r.accepted_total_pieces) || 0
      a.usd += Number(r.accepted_total_uzs) || 0
    }
    return [...m.values()].sort((x, y) => y.monthKey.localeCompare(x.monthKey))
  }, [rows])

  const grand = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.pieces += Number(r.accepted_total_pieces) || 0
        acc.usd += Number(r.accepted_total_uzs) || 0
        return acc
      },
      { pieces: 0, usd: 0 }
    )
  }, [rows])

  if (!configured) {
    return (
      <ErpShell>
        <div className="erp-banner warn">Supabase .env sozlanmagan.</div>
      </ErpShell>
    )
  }

  return (
    <ErpShell searchPlaceholder="Kirim hisobotida qidirish...">
      <div className="erpf-page-head">
        <div>
          <h1 className="erpf-page-title">Kirim Hisoboti — Oylar bo'yicha 📊</h1>
          <p className="erpf-page-sub">
            CRM dan qabul qilingan jo'natuvlarning oylik statistikasi.
          </p>
        </div>
        <button type="button" className="erpf-icon-btn" onClick={() => load()} title="Yangilash">
          <RefreshCw size={20} className={loading ? 'spin' : ''} />
        </button>
      </div>

      <div className="erpf-wh-stats" style={{ marginBottom: '1.5rem' }}>
        <article className="erpf-wh-stat">
          <div className="erpf-wh-ico" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
            <FileText size={22} />
          </div>
          <div>
            <strong>{rows.length}</strong>
            <small>Jami jo'natuvlar</small>
          </div>
        </article>
        <article className="erpf-wh-stat">
          <div className="erpf-wh-ico" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <Box size={22} />
          </div>
          <div>
            <strong>{grand.pieces}</strong>
            <small>Jami par miqdori</small>
          </div>
        </article>
        <article className="erpf-wh-stat">
          <div className="erpf-wh-ico" style={{ background: 'rgba(193, 164, 97, 0.1)', color: 'var(--primary)' }}>
            <DollarSign size={22} />
          </div>
          <div>
            <strong>{formatInboundUsdAllowZero(grand.usd)}</strong>
            <small>Umumiy summa</small>
          </div>
        </article>
      </div>

      {error && <div className="erp-banner err" style={{ marginBottom: '1.5rem' }}>{error}</div>}

      <div className="erpf-content-grid" style={{ gridTemplateColumns: '1fr' }}>
        <section className="erpf-table-card">
          <div className="erpf-table-head">
            <div className="erpf-table-title">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} style={{ color: 'var(--primary)' }} />
                <h3>Oylik jamlama</h3>
              </div>
            </div>
          </div>
          <div className="erpf-table-scroll">
            <table className="erpf-table">
              <thead>
                <tr>
                  <th>Oy</th>
                  <th>Jo'natuvlar</th>
                  <th>Miqdor (par)</th>
                  <th>Summa (USD)</th>
                  <th style={{ textAlign: 'right' }}>Holat</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '4rem' }}><div className="erp-spinner" /></td></tr>
                ) : byMonth.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Ma'lumot topilmadi</td></tr>
                ) : (
                  byMonth.map((b) => (
                    <tr key={b.monthKey}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <strong style={{ fontSize: '1rem' }}>{monthLabelFromKey(b.monthKey)}</strong>
                           <span className="erpf-badge" style={{ fontSize: '0.7rem' }}>{b.monthKey}</span>
                        </div>
                      </td>
                      <td><span style={{ fontWeight: '600' }}>{b.orders} ta</span></td>
                      <td>{b.pieces} par</td>
                      <td style={{ color: 'var(--primary)', fontWeight: '700' }}>{formatInboundUsdAllowZero(b.usd)}</td>
                      <td style={{ textAlign: 'right' }}><TrendingUp size={16} style={{ color: 'var(--success)', opacity: 0.6 }} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="erpf-table-card">
          <div className="erpf-table-head">
            <div className="erpf-table-title">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LayoutDashboard size={18} style={{ color: 'var(--primary)' }} />
                <h3>Barcha tranzaksiyalar</h3>
              </div>
              <p>Qabul qilingan barcha buyurtmalar ro'yxati</p>
            </div>
          </div>
          <div className="erpf-table-scroll">
            <table className="erpf-table">
              <thead>
                <tr>
                  <th>Buyurtma №</th>
                  <th>Mijoz</th>
                  <th>Sana/Vaqt</th>
                  <th>Miqdor</th>
                  <th>Summa</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '4rem' }}><div className="erp-spinner" /></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>—</td></tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileText size={14} style={{ color: 'var(--text-muted)' }} />
                          <strong>№ {r.order_number_snapshot || String(r.order_id).slice(0, 8)}</strong>
                        </div>
                      </td>
                      <td>{r.customer_name_snapshot || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          <Clock size={12} />
                          {r.accepted_at ? new Date(r.accepted_at).toLocaleString('uz-UZ', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                        </div>
                      </td>
                      <td><span className="erpf-badge">{r.accepted_total_pieces ?? '0'} par</span></td>
                      <td style={{ fontWeight: '600' }}>{formatInboundUsdAllowZero(r.accepted_total_uzs ?? 0)}</td>
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
