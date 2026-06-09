import { BrowserRouter, Routes, Route } from 'react-router-dom'
import PointsPage from './pages/PointsPage.tsx'
import NotFoundPage from './pages/NotFoundPage.tsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/puntos/:token" element={<PointsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
