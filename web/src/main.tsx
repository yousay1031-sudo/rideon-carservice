import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import Layout from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import ReservationsPage from './pages/ReservationsPage'
import ReportPage from './pages/ReportPage'
import CustomersPage from './pages/CustomersPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<Layout />}>
          <Route index element={<Navigate to='/dashboard' replace />} />
          <Route path='dashboard' element={<DashboardPage />} />
          <Route path='reservations' element={<ReservationsPage />} />
          <Route path='report' element={<ReportPage />} />
          <Route path='customers' element={<CustomersPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
)
