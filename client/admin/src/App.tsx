import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute.tsx'
import Layout from './components/Layout.tsx'
import LoginPage from './pages/LoginPage.tsx'
import OrdersPage from './pages/OrdersPage.tsx'
import CustomersPage from './pages/CustomersPage.tsx'
import AnalyticsPage from './pages/AnalyticsPage.tsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Navigate to="/orders" replace />} />
                  <Route path="/orders" element={<OrdersPage />} />
                  <Route path="/customers" element={<CustomersPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
