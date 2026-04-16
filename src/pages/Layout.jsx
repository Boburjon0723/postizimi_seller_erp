import { Outlet, useLocation } from 'react-router-dom'

export default function Layout() {
  const location = useLocation()
  
  // Logic: Most ERP pages now use ErpShell inside them.
  // SellerPage uses pos-screen.
  // This Layout acts as a simple container for the routes.
  
  return (
    <div className="erp-app-container">
      <Outlet />
    </div>
  )
}
