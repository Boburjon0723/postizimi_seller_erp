import { useState } from 'react'
import { Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/auth-context'
import { defaultPathForRole } from '@/lib/authRole'
import { isSupabaseConfigured } from '@/lib/supabase'
import { 
  Lock, 
  Mail, 
  ChevronRight, 
  AlertCircle,
  ShieldCheck
} from 'lucide-react'

export default function LoginPage() {
  const { signIn, loading: authLoading, session, role, authError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()
  const configured = isSupabaseConfigured()

  const from = location.state?.from?.pathname

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!configured) {
      setError('Supabase sozlamalari topilmadi.')
      return
    }
    setSubmitting(true)
    try {
      const { defaultPath } = await signIn(email, password)
      navigate(from && from !== '/login' ? from : defaultPath, { replace: true })
    } catch (err) {
      setError(err?.message || 'Login yoki parol xato')
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading) {
    return (
      <div className="erp-auth-loading">
        <div className="erp-spinner" />
        <p>Xavfsiz kirish tekshirilmoqda...</p>
      </div>
    )
  }

  if (session && role) {
    return (
      <Navigate
        to={from && from !== '/login' ? from : defaultPathForRole(role)}
        replace
      />
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-logo-large">
            <ShieldCheck size={48} />
          </div>
          <h1>Nuur Home ERP</h1>
          <p className="erpf-page-sub">
            Boshqaruv tizimiga xavfsiz kirish
          </p>
        </div>

        {!configured && (
          <div className="erp-banner warn">
            <AlertCircle size={18} />
            <span><code>.env</code> fayl sozlanmagan.</span>
          </div>
        )}

        {(error || authError) && (
          <div className="erp-banner err">
            <AlertCircle size={18} />
            <span>{error || authError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="erp-field">
            <span>Email manzil</span>
            <div className="erp-input-wrapper">
              <Mail className="input-icon" size={18} />
              <input
                className="erp-input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@nuurhome.uz"
              />
            </div>
          </div>
          <div className="erp-field">
            <span>Parol</span>
            <div className="erp-input-wrapper">
              <Lock className="input-icon" size={18} />
              <input
                className="erp-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>
          </div>
          <button
            type="submit"
            className="erpf-btn-solid login-btn"
            disabled={submitting}
          >
            {submitting ? 'Kirilmoqda...' : (
              <>
                Tizimga kirish <ChevronRight size={20} style={{ marginLeft: '8px' }} />
              </>
            )}
          </button>
        </form>

        <p className="login-footer">
          © 2024 Nuur Home ERP · Versiya 2.0.0
        </p>
      </div>
    </div>
  )
}

