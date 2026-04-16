import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/auth-context'
import DashboardPage from '@/pages/DashboardPage'

/** Faqat `erp` roli — boshqaruv paneli. `seller` — sotuvchi sahifasiga. */
export default function ErpHome() {
  const { role, loading } = useAuth()

  if (loading) {
    return (
      <div className="erp-auth-loading">
        <div className="erp-spinner" />
      </div>
    )
  }

  if (role === 'seller') {
    return <Navigate to="/sotuvchi" replace />
  }

  return <DashboardPage />
}
