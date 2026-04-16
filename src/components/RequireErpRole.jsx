import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/auth-context'

export default function RequireErpRole({ children }) {
  const { role, loading } = useAuth()

  if (loading) {
    return (
      <div className="erp-auth-loading">
        <div className="erp-spinner" />
      </div>
    )
  }

  if (role !== 'erp') {
    return <Navigate to="/sotuvchi" replace />
  }

  return children
}
