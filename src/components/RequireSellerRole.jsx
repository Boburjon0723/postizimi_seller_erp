import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/auth-context'
import { canAccessSeller } from '@/lib/authRole'

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
    return <Navigate to="/" replace />
  }

  return children
}
