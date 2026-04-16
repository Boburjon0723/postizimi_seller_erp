import { Home, Receipt, BarChart3, LogOut, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

export default function SellerNavDrawer({ open, onClose, role, onSignOut }) {
  const navigate = useNavigate()
  const location = useLocation()

  if (!open) return null

  function go(path) {
    navigate(path)
    onClose()
  }

  return (
    <div className="pos-mobile-drawer-overlay" role="presentation" onClick={onClose}>
      <aside
        className="pos-mobile-drawer"
        role="dialog"
        aria-label="Menyu"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pos-mobile-drawer-head">
          <div className="pos-modern-brand" style={{ marginBottom: 0 }}>
            <div className="brand-logo-small">NH</div>
            <div>
              <h2>Savdo Terminali</h2>
              <p>Admin</p>
            </div>
          </div>
          <button type="button" className="erpf-icon-btn" onClick={onClose} aria-label="Yopish">
            <X size={22} />
          </button>
        </div>
        <nav className="pos-modern-nav">
          <button
            type="button"
            className={`pos-modern-nav-item ${location.pathname === '/sotuvchi' ? 'active' : ''}`}
            onClick={() => go('/sotuvchi')}
          >
            <Home size={20} /> <span>Asosiy</span>
          </button>
          <button
            type="button"
            className={`pos-modern-nav-item ${location.pathname === '/sotuvchi/buyurtmalar' ? 'active' : ''}`}
            onClick={() => go('/sotuvchi/buyurtmalar')}
          >
            <Receipt size={20} /> <span>Buyurtmalar</span>
          </button>
          {role === 'erp' && (
            <button type="button" className="pos-modern-nav-item" onClick={() => go('/analitika')}>
              <BarChart3 size={20} /> <span>Hisobotlar</span>
            </button>
          )}
        </nav>
        <div className="pos-modern-side-bottom">
          <button
            type="button"
            className="pos-modern-nav-item danger"
            onClick={() => {
              onClose()
              onSignOut()
            }}
          >
            <LogOut size={20} /> <span>Chiqish</span>
          </button>
        </div>
      </aside>
    </div>
  )
}
