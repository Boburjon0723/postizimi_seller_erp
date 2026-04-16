import { useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '@/context/auth-context'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

function playFallbackBeep() {
  if (typeof window === 'undefined') return
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return
  try {
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.35)
  } catch {
    // AudioContext bloklangan bo'lsa jim o'tamiz.
  }
}

function notifyInbound(row) {
  const shortId = String(row?.order_id || '').slice(0, 8)
  const orderNumber = row?.order_number_snapshot || shortId || 'Noma’lum'
  const customerName = row?.customer_name_snapshot || 'Mijoz ko‘rsatilmagan'
  const requestId = row?.id || ''
  const body = `CRMdan yangi buyurtma jo'natildi: № ${orderNumber} · ${customerName}`

  if (typeof window === 'undefined') return
  if (!('Notification' in window)) {
    playFallbackBeep()
    return
  }

  const showNotification = () => {
    try {
      const n = new Notification('Yangi CRM buyurtmasi', {
        body,
        tag: requestId ? `erp-inbound-${requestId}` : 'erp-inbound',
      })
      n.onclick = () => {
        window.focus()
        if (requestId) window.location.assign(`/keltirilgan?request=${requestId}`)
      }
    } catch {
      playFallbackBeep()
    }
  }

  if (Notification.permission === 'granted') {
    showNotification()
    return
  }

  if (Notification.permission === 'default') {
    Notification.requestPermission()
      .then((perm) => {
        if (perm === 'granted') showNotification()
        else playFallbackBeep()
      })
      .catch(() => playFallbackBeep())
    return
  }

  playFallbackBeep()
}

export default function Layout() {
  const configured = isSupabaseConfigured()
  const { role } = useAuth()
  const seenIdsRef = useRef(new Set())
  const toastTimerRef = useRef(null)
  const [inboundToast, setInboundToast] = useState(null)

  // Logic: Most ERP pages now use ErpShell inside them.
  // SellerPage uses pos-screen.
  // This Layout acts as a simple container for the routes.

  function openInboundRequest(requestId) {
    if (typeof window === 'undefined') return
    if (!requestId) return
    window.location.assign(`/keltirilgan?request=${requestId}`)
  }

  function showInboundToast(row) {
    const shortId = String(row?.order_id || '').slice(0, 8)
    const orderNumber = row?.order_number_snapshot || shortId || 'Noma’lum'
    const customerName = row?.customer_name_snapshot || 'Mijoz ko‘rsatilmagan'
    const requestId = row?.id ? String(row.id) : ''
    setInboundToast({
      requestId,
      title: `Yangi CRM buyurtmasi: № ${orderNumber}`,
      body: customerName,
    })
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
    }
    toastTimerRef.current = window.setTimeout(() => {
      setInboundToast(null)
      toastTimerRef.current = null
    }, 7000)
  }

  useEffect(() => {
    if (!configured) return
    if (!(role === 'erp' || role === 'admin')) return

    const channel = supabase
      .channel(`erp-inbound-alerts-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'erp_inbound_requests',
          filter: 'status=eq.pending',
        },
        (payload) => {
          const row = payload?.new || {}
          const id = row?.id ? String(row.id) : ''
          if (!id) return
          if (seenIdsRef.current.has(id)) return
          seenIdsRef.current.add(id)
          if (seenIdsRef.current.size > 200) {
            const first = seenIdsRef.current.values().next().value
            if (first) seenIdsRef.current.delete(first)
          }
          showInboundToast(row)
          notifyInbound(row)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [configured, role])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current)
      }
    }
  }, [])

  return (
    <div className="erp-app-container">
      <Outlet />
      {inboundToast && (
        <div className="erp-inbound-toast" role="status" aria-live="polite">
          <div className="erp-inbound-toast-title">{inboundToast.title}</div>
          <div className="erp-inbound-toast-body">{inboundToast.body}</div>
          <div className="erp-inbound-toast-actions">
            <button
              type="button"
              className="erp-inbound-toast-btn"
              onClick={() => openInboundRequest(inboundToast.requestId)}
            >
              Ko'rish
            </button>
            <button
              type="button"
              className="erp-inbound-toast-btn erp-inbound-toast-btn-ghost"
              onClick={() => setInboundToast(null)}
            >
              Yopish
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
