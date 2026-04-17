import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '@/context/auth-context'
import { supabase } from '@/lib/supabase'

const SIGN_OUT_WAIT_MS = 8000

export default function AccessDeniedPage() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  async function handleOtherAccount() {
    if (busy) return
    setBusy(true)
    try {
      await Promise.race([
        signOut(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('signOut timeout')), SIGN_OUT_WAIT_MS)
        ),
      ])
    } catch {
      try {
        await supabase.auth.signOut({ scope: 'local' })
      } catch {
        // joriy tab uchun sessiyani tozalashga urinish
      }
    } finally {
      navigate('/login', { replace: true })
      setBusy(false)
    }
  }

  return (
    <div className="erp-auth-loading" style={{ gap: '0.75rem' }}>
      <ShieldAlert size={40} style={{ color: 'var(--danger)' }} />
      <p className="erp-banner err" style={{ maxWidth: 520, textAlign: 'center' }}>
        Sizning rolingiz bu bo'limga kirish uchun yetarli emas.
      </p>
      <button
        type="button"
        className="erpf-btn-solid"
        onClick={() => void handleOtherAccount()}
        disabled={busy}
      >
        {busy ? 'Chiqilmoqda…' : 'Boshqa akkaunt bilan kirish'}
      </button>
    </div>
  )
}
