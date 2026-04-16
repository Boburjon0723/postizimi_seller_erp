import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthProvider'
import RequireAuth from '@/components/RequireAuth'
import Layout from '@/pages/Layout'
import LoginPage from '@/pages/LoginPage'
import RequireErpRole from '@/components/RequireErpRole'
import ErpHome from '@/pages/ErpHome'
import SellerPage from '@/pages/SellerPage'
import SellerOrdersPage from '@/pages/SellerOrdersPage'
import WarehousePage from '@/pages/WarehousePage'
import KeltirilganPage from '@/pages/KeltirilganPage'
import KeltirilganMonthlyPage from '@/pages/KeltirilganMonthlyPage'
import AnalitikaPage from '@/pages/AnalitikaPage'
import './App.css'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<ErpHome />} />
        <Route
          path="ombor"
          element={
            <RequireErpRole>
              <WarehousePage />
            </RequireErpRole>
          }
        />
        <Route
          path="keltirilgan"
          element={
            <RequireErpRole>
              <KeltirilganPage />
            </RequireErpRole>
          }
        />
        <Route
          path="keltirilgan/hisobot"
          element={
            <RequireErpRole>
              <KeltirilganMonthlyPage />
            </RequireErpRole>
          }
        />
        <Route
          path="analitika"
          element={
            <RequireErpRole>
              <AnalitikaPage />
            </RequireErpRole>
          }
        />
        <Route path="sotuvchi" element={<SellerPage />} />
        <Route path="sotuvchi/buyurtmalar" element={<SellerOrdersPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
