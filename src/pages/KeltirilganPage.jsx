import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ErpShell from '@/components/ErpShell'
import { isSupabaseConfigured } from '@/lib/supabase'
import {
  buildGroupedInboundRows,
  flattenInboundTableRows,
  formatInboundUsdAllowZero,
} from '@/lib/inboundCrmTable'
import {
  acceptInboundRequest,
  fetchInboundRequests,
  replayAcceptedInboundRequest,
  rejectInboundRequest,
} from '@/services/erpInboundRequests'
import { fetchProductMapByIds, getProductImageUrl } from '@/services/erpInventory'
import { 
  RefreshCw, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Eye, 
  Check, 
  RotateCcw,
  FileText,
  AlertTriangle,
  ChevronRight,
  User,
  Hash
} from 'lucide-react'

function formatDt(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('uz-UZ', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return String(iso)
  }
}

export default function KeltirilganPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestHighlight = searchParams.get('request')
  const rowRefs = useRef({})

  const configured = isSupabaseConfigured()
  const [pending, setPending] = useState([])
  const [accepted, setAccepted] = useState([])
  const [rejected, setRejected] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actingId, setActingId] = useState(null)
  const [repairingId, setRepairingId] = useState(null)

  const [detailRow, setDetailRow] = useState(null)
  const [detailGroups, setDetailGroups] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)

  const inboundTable = useMemo(
    () => flattenInboundTableRows(detailGroups, { showPrices: true }),
    [detailGroups]
  )

  const crmTableRows = useMemo(() => {
    let stripe = 0
    return inboundTable.rows.map((row, ri) => {
      if (row.type === 'cat-header') {
        return (
          <tr key={`ch-${ri}`} className="erp-crm-cat-header-row">
            <td colSpan={row.colSpan}>Kategoriya: {row.label}</td>
          </tr>
        )
      }
      if (row.type === 'cat-subtotal') {
        return (
          <tr key={`cs-${ri}`} className="erp-crm-cat-subtotal-row">
            <td colSpan={5} style={{ textAlign: 'right' }}>
              Kategoriya jami
            </td>
            <td className="erp-crm-mono">{row.pieces}</td>
            <td className="erp-crm-mono erp-crm-price-empty">—</td>
            <td className="erp-crm-mono" style={{ textAlign: 'right' }}>
              {formatInboundUsdAllowZero(row.money ?? 0)}
            </td>
            <td className="erp-crm-print-note-cell" />
          </tr>
        )
      }
      const g = row.group
      const imgUrl = getProductImageUrl(g.product || {})
      const stripClass = stripe % 2 === 0 ? 'erp-crm-strip-a' : 'erp-crm-strip-b'
      stripe += 1
      return (
        <tr
          key={`${g.bucketKey}-${row.displayIndex}`}
          className={`erp-crm-data-row ${stripClass}`}
        >
          <td className="erp-crm-mono">{row.displayIndex}</td>
          <td className="erp-crm-prod-img-cell">
            {imgUrl ? (
              <div className="erp-crm-prod-thumb-wrap">
                <img className="erp-crm-prod-thumb" src={imgUrl} alt="" />
              </div>
            ) : (
              <span className="erp-crm-prod-no-img">—</span>
            )}
          </td>
          <td className="erp-crm-mono">{g.sizeDisplay}</td>
          <td className="erp-crm-colors-stack">
            {g.colorPairs.map(([label], ci) => (
              <div key={`c-${ci}`} className="erp-crm-stack-line">
                {label}
              </div>
            ))}
          </td>
          <td className="erp-crm-qty-stack erp-crm-mono">
            {g.colorPairs.map(([, qty], qi) => (
              <div key={`q-${qi}`} className="erp-crm-stack-line">
                {qty}
              </div>
            ))}
          </td>
          <td className="erp-crm-mono">{g.totalPieces}</td>
          <td className="erp-crm-mono erp-crm-narx-cell" style={{ textAlign: 'right' }}>
            {g.unitPrice != null ? formatInboundUsdAllowZero(g.unitPrice) : '—'}
          </td>
          <td className="erp-crm-mono erp-crm-narx-cell" style={{ textAlign: 'right' }}>
            {g.lineMoney != null ? formatInboundUsdAllowZero(g.lineMoney) : '—'}
          </td>
          <td className="erp-crm-print-note-cell" />
        </tr>
      )
    })
  }, [inboundTable])

  const load = useCallback(async () => {
    if (!configured) {
      setLoading(false)
      return
    }
    setError(null)
    setLoading(true)
    try {
      const [p, a, r] = await Promise.all([
        fetchInboundRequests({ status: 'pending' }),
        fetchInboundRequests({ status: 'accepted' }),
        fetchInboundRequests({ status: 'rejected' }),
      ])
      setPending(p || [])
      setAccepted((a || []).slice(0, 30))
      setRejected((r || []).slice(0, 30))
    } catch (e) {
      setError(e?.message || String(e))
      setPending([])
      setAccepted([])
      setRejected([])
    } finally {
      setLoading(false)
    }
  }, [configured])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!requestHighlight || loading) return
    const el = rowRefs.current[requestHighlight]
    if (el?.scrollIntoView) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [requestHighlight, loading, pending])

  const closeDetail = useCallback(() => {
    setDetailRow(null)
    setDetailGroups([])
    setDetailError(null)
    setDetailLoading(false)
  }, [])

  useEffect(() => {
    if (!detailRow) return
    const onKey = (e) => {
      if (e.key === 'Escape') closeDetail()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailRow, closeDetail])

  const openDetail = useCallback(async (r) => {
    setDetailRow(r)
    setDetailLoading(true)
    setDetailError(null)
    setDetailGroups([])
    const items = Array.isArray(r.items) ? r.items : []
    try {
      const map = await fetchProductMapByIds(items.map((i) => i.product_id))
      setDetailGroups(buildGroupedInboundRows(items, map))
    } catch (e) {
      setDetailError(e?.message || String(e))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const pendingCount = useMemo(() => pending.length, [pending])

  async function handleAccept(id) {
    setActingId(id)
    setError(null)
    try {
      const res = await acceptInboundRequest(id)
      if (!res.success) {
        setError(res.error || 'Qabul qilinmadi')
        return
      }
      if (requestHighlight === id) {
        const next = new URLSearchParams(searchParams)
        next.delete('request')
        setSearchParams(next, { replace: true })
      }
      await load()
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setActingId(null)
    }
  }

  async function handleReject(id) {
    setActingId(id)
    setError(null)
    try {
      const res = await rejectInboundRequest(id)
      if (!res.success) {
        setError(res.error || 'Rad etilmadi')
        return
      }
      if (requestHighlight === id) {
        const next = new URLSearchParams(searchParams)
        next.delete('request')
        setSearchParams(next, { replace: true })
      }
      await load()
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setActingId(null)
    }
  }

  async function handleRepair(id) {
    const ok =
      typeof window === 'undefined'
        ? true
        : window.confirm(
            'Bu amal qabul qilingan kirimni omborga qayta qo‘shadi (miqdor yana oshadi). Davom etilsinmi?'
          )
    if (!ok) return

    setRepairingId(id)
    setError(null)
    try {
      const res = await replayAcceptedInboundRequest(id)
      if (!res.success) {
        setError(res.error || 'Qayta qo‘llash bajarilmadi')
        return
      }
      await load()
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setRepairingId(null)
    }
  }

  if (!configured) {
    return (
      <ErpShell>
        <div className="erp-banner warn">Supabase .env sozlanmagan.</div>
      </ErpShell>
    )
  }

  return (
    <ErpShell searchPlaceholder="Kirim bo‘yicha qidirish...">
      <div className="erpf-page-head">
        <div>
          <h1 className="erpf-page-title">Keltirilgan / CRM jo‘natuvlari ✈️</h1>
          <p className="erpf-page-sub">
            CRM dan «ERP» tugmasi bilan yuborilgan buyurtmalar bu yerda tasdiqlanadi.
          </p>
        </div>
        <button type="button" className="erpf-icon-btn" onClick={() => load()} title="Yangilash">
          <RefreshCw size={20} className={loading ? 'spin' : ''} />
        </button>
      </div>

      <div className="erpf-wh-stats">
        <article className="erpf-wh-stat">
          <div className="erpf-wh-ico" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)' }}>
            <Clock size={22} />
          </div>
          <div>
            <strong>{pendingCount}</strong>
            <small>Kutilmoqda</small>
          </div>
        </article>
        <article className="erpf-wh-stat">
          <div className="erpf-wh-ico" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <strong>{accepted.length}</strong>
            <small>Qabul qilindi</small>
          </div>
        </article>
        <article className="erpf-wh-stat">
          <div className="erpf-wh-ico" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)' }}>
            <XCircle size={22} />
          </div>
          <div>
            <strong>{rejected.length}</strong>
            <small>Rad etildi</small>
          </div>
        </article>
      </div>

      {error && <div className="erp-banner err" style={{ marginBottom: '1.5rem' }}>{error}</div>}

      {requestHighlight && (
        <div className="erp-banner warn" style={{ marginBottom: '1.5rem' }}>
          <AlertTriangle size={18} />
          <span>CRM dan ochilgan so‘rov: <code>{requestHighlight}</code></span>
        </div>
      )}

      <div className="erpf-content-grid" style={{ gridTemplateColumns: '1fr' }}>
        <section className="erpf-table-card">
          <div className="erpf-table-head">
            <div className="erpf-table-title">
              <h3>Tekshirish (Kutilmoqda)</h3>
              <p>CRM tizimidan yuborilgan va tasdiqlanishi kerak bo'lgan so'rovlar</p>
            </div>
          </div>
          <div className="erpf-table-scroll">
            <table className="erpf-table">
              <thead>
                <tr>
                  <th>Buyurtma</th>
                  <th>Mijoz</th>
                  <th>Miqdor</th>
                  <th>Yuborilgan vaqt</th>
                  <th style={{ textAlign: 'right' }}>Amallar</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '4rem' }}><div className="erp-spinner" /></td></tr>
                ) : pending.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Kutilayotgan jo‘natuv yo‘q.</td></tr>
                ) : (
                  pending.map((r) => {
                    const items = Array.isArray(r.items) ? r.items : []
                    const isHi = requestHighlight === r.id
                    return (
                      <tr
                        key={r.id}
                        ref={(el) => { rowRefs.current[r.id] = el }}
                        className={isHi ? 'row-highlight' : ''}
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Hash size={16} style={{ color: 'var(--primary)' }} />
                            <strong>{r.order_number_snapshot || r.order_id?.slice(0, 8)}</strong>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <User size={16} style={{ color: 'var(--text-muted)' }} />
                            <span>{r.customer_name_snapshot || '—'}</span>
                          </div>
                        </td>
                        <td><span className="erpf-badge">{items.length} qator</span></td>
                        <td><span style={{ fontSize: '0.875rem' }}>{formatDt(r.created_at)}</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button type="button" className="erpf-icon-btn" onClick={() => openDetail(r)} title="Ko'rish">
                              <Eye size={18} />
                            </button>
                            <button type="button" className="erpf-icon-btn success" onClick={() => handleAccept(r.id)} disabled={actingId === r.id} title="Qabul qilish">
                              <Check size={18} />
                            </button>
                            <button type="button" className="erpf-icon-btn danger" onClick={() => handleReject(r.id)} disabled={actingId === r.id} title="Rad etish">
                              <XCircle size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="erpf-content-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <section className="erpf-table-card">
            <div className="erpf-table-head">
              <div className="erpf-table-title">
                <h3>Qabul qilinganlar</h3>
                <p>Oxirgi 30 ta qabul qilingan jo'natuvlar</p>
              </div>
            </div>
            <div className="erpf-table-scroll">
              <table className="erpf-table">
                <thead>
                  <tr>
                    <th>Buyurtma</th>
                    <th>Vaqt</th>
                    <th style={{ textAlign: 'right' }}>Amal</th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && accepted.length === 0 ? (
                    <tr><td colSpan={3} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Yo'q</td></tr>
                  ) : (
                    accepted.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <strong>№ {r.order_number_snapshot || r.order_id?.slice(0, 8)}</strong>
                            <small style={{ color: 'var(--text-muted)' }}>{r.customer_name_snapshot || '—'}</small>
                          </div>
                        </td>
                        <td><span style={{ fontSize: '0.8rem' }}>{formatDt(r.accepted_at)}</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                             <button type="button" className="erpf-icon-btn" onClick={() => openDetail(r)}><Eye size={16} /></button>
                             <button type="button" className="erpf-icon-btn warning" onClick={() => handleRepair(r.id)} disabled={repairingId === r.id} title="Qayta qo'shish"><RotateCcw size={16} /></button>
                          </div>
                        </td>
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
                <h3>Rad etilganlar</h3>
                <p>Oxirgi 30 ta rad etilgan so'rovlar</p>
              </div>
            </div>
            <div className="erpf-table-scroll">
              <table className="erpf-table">
                <thead>
                  <tr>
                    <th>Buyurtma</th>
                    <th>Vaqt</th>
                    <th style={{ textAlign: 'right' }}>Amal</th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && rejected.length === 0 ? (
                    <tr><td colSpan={3} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Yo'q</td></tr>
                  ) : (
                    rejected.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <strong>№ {r.order_number_snapshot || r.order_id?.slice(0, 8)}</strong>
                            <small style={{ color: 'var(--text-muted)' }}>{r.customer_name_snapshot || '—'}</small>
                          </div>
                        </td>
                        <td><span style={{ fontSize: '0.8rem' }}>{formatDt(r.created_at)}</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <button type="button" className="erpf-icon-btn" onClick={() => openDetail(r)}><Eye size={16} /></button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {detailRow && (
        <div className="erpf-modal-backdrop" onClick={closeDetail}>
          <div className="erpf-modal-panel erpf-modal-panel--crm-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="erpf-modal-head">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <FileText size={20} style={{ color: 'var(--primary)' }} />
                  <h3 id="inbound-detail-title" style={{ margin: 0 }}>Buyurtma tafsilotlari</h3>
                </div>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  № {detailRow.order_number_snapshot || detailRow.order_id?.slice(0, 8)} · {detailRow.customer_name_snapshot || '—'}
                </p>
              </div>
              <button type="button" className="erpf-icon-btn" onClick={closeDetail}>
                <XCircle size={20} />
              </button>
            </div>
            <div className="erpf-modal-body">
              {detailLoading ? (
                <div style={{ padding: '4rem', textAlign: 'center' }}><div className="erp-spinner" /></div>
              ) : detailError ? (
                <div className="erp-banner err">{detailError}</div>
              ) : (
                <>
                  <div className="erpf-modal-summary" style={{ marginBottom: '1.5rem', display: 'flex', gap: '2rem' }}>
                     <div className="summary-item">
                        <small>Jami miqdor</small>
                        <strong>{inboundTable.totalPar} par</strong>
                     </div>
                     <div className="summary-item">
                        <small>Umumiy summa</small>
                        <strong>{formatInboundUsdAllowZero(inboundTable.totalMoney ?? 0)}</strong>
                     </div>
                  </div>
                  <div className="erp-crm-print-sheet">
                    <table className="erp-crm-items-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Rasm</th>
                          <th>Kod</th>
                          <th className="erp-crm-th-rang">Rang</th>
                          <th className="erp-crm-th-miqdor">Miqdor</th>
                          <th>Jami par</th>
                          <th className="erp-crm-th-narx">1 dona narxi</th>
                          <th className="erp-crm-th-line-sum">Qator summasi</th>
                          <th className="erp-crm-th-izoh">Izoh</th>
                        </tr>
                      </thead>
                      <tbody>
                        {crmTableRows}
                        <tr className="erp-crm-grand-total-row">
                          <td colSpan={5} style={{ textAlign: 'right' }}>Jami</td>
                          <td className="erp-crm-mono">{inboundTable.totalPar}</td>
                          <td className="erp-crm-mono erp-crm-price-empty">—</td>
                          <td className="erp-crm-mono" style={{ textAlign: 'right' }}>
                            {formatInboundUsdAllowZero(inboundTable.totalMoney ?? 0)}
                          </td>
                          <td className="erp-crm-print-note-cell" />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </ErpShell>
  )
}

