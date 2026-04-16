import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/auth-context'
import { 
  LayoutDashboard, 
  Package, 
  Truck, 
  Calendar, 
  BarChart3, 
  Settings, 
  LogOut, 
  Bell,
  Search,
  User
} from 'lucide-react'

const NAV = [
  { to: '/', label: 'Boshqaruv paneli', icon: <LayoutDashboard size={20} />, end: true },
  { to: '/ombor', label: 'Ombor', icon: <Package size={20} />, end: true },
  { to: '/keltirilgan', label: 'Keltirilgan', icon: <Truck size={20} />, end: true },
  { to: '/keltirilgan/hisobot', label: 'Keltirilgan (oylar)', icon: <Calendar size={20} />, end: true },
  { to: '/analitika', label: 'Tahliliy maʼlumotlar', icon: <BarChart3 size={20} />, end: true },
]

export default function ErpShell({ searchPlaceholder = 'Mahsulotlarni qidirish...', children }) {
  const navigate = useNavigate()
  const { signOut, role } = useAuth()

  async function handleLogout() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="erp-figma">
      <aside className="erpf-sidebar">
        <div className="erpf-brand">
          <div className="brand-icon">NH</div>
          <div>
            <h2>Nuur Home</h2>
            <p>{role === 'erp' ? 'Boshqaruv Tizimi' : 'Sotuvchi Paneli'}</p>
          </div>
        </div>
        <nav className="erpf-nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `erpf-nav-item${isActive ? ' active' : ''}`}
            >
              <span className="erpf-nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="erpf-side-bottom">
          <button type="button" className="erpf-nav-item">
            <span className="erpf-nav-icon"><Settings size={20} /></span> Sozlamalar
          </button>
          <button type="button" className="erpf-nav-item danger" onClick={handleLogout}>
            <span className="erpf-nav-icon"><LogOut size={20} /></span> Chiqish
          </button>
        </div>
      </aside>

      <section className="erpf-main">
        <header className="erpf-topbar">
          <div className="erpf-search-wrapper">
            <Search className="erpf-search-icon" size={18} />
            <input className="erpf-search" placeholder={searchPlaceholder} />
          </div>
          <div className="erpf-actions">
            <button type="button" title="Bildirishnomalar" className="erpf-icon-btn">
              <Bell size={20} />
            </button>
            <div className="erpf-user-profile">
              <div className="erpf-avatar">
                <User size={18} />
              </div>
            </div>
          </div>
        </header>
        <div className="erpf-content">
          {children}
        </div>
      </section>
    </div>
  )
}

