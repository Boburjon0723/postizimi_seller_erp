import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/auth-context'
import { canAccessErp, canAccessSeller } from '@/lib/authRole'

export default function RequireSellerRole({ children }) {
  const { role, loading } = useAuth()

  if (loading) {
    return (
      <div className="erp-auth-loading">
        <div className="erp-spinner" />
      </div>
    )
  }

  if (!canAccessSeller(role)) {
    if (canAccessErp(role)) return <Navigate to="/" replace />
    return <Navigate to="/403" replace />
  }

  return children
}
