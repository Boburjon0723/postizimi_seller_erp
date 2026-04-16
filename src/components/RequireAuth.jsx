import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/auth-context'
import { isSupabaseConfigured } from '@/lib/supabase'

export default function RequireAuth({ children }) {
  const { session, loading, authError } = useAuth()
  const location = useLocation()

  if (!isSupabaseConfigured()) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (loading) {
    return (
      <div className="erp-auth-loading">
        <div className="erp-spinner" />
        <p>Sessiya tekshirilmoqda…</p>
      </div>
    )
  }

  if (authError && !session) {
    return (
      <div className="erp-auth-loading">
        <p className="erp-banner err">{authError}</p>
        <p>Sahifani yangilab qayta urinib ko‘ring.</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return children
}
