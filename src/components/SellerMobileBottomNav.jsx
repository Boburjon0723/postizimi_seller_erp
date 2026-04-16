import { Home, Receipt } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'

export default function SellerMobileBottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isHome = pathname === '/sotuvchi'
  const isOrders = pathname === '/sotuvchi/buyurtmalar'

  return (
    <nav className="pos-mobile-bottom-nav" aria-label="Pastki navigatsiya">
      <button
        type="button"
        className={`pos-mnav-item ${isHome ? 'active' : ''}`}
        onClick={() => navigate('/sotuvchi')}
      >
        <div className="pos-mnav-icon-box">
          <Home size={22} strokeWidth={isHome ? 2.5 : 2} />
        </div>
        <span>ASOSIY</span>
      </button>

      <button
        type="button"
        className={`pos-mnav-item ${isOrders ? 'active' : ''}`}
        onClick={() => navigate('/sotuvchi/buyurtmalar')}
      >
        <div className="pos-mnav-icon-box">
          <Receipt size={22} strokeWidth={isOrders ? 2.5 : 2} />
        </div>
        <span>BUYURTMALAR</span>
      </button>
    </nav>
  )
}
