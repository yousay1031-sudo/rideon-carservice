import { NavLink, Outlet } from 'react-router-dom'

const nav = [
  { to: '/dashboard',    label: 'ダッシュボード', icon: '🏠' },
  { to: '/reservations', label: '予約管理',       icon: '📅' },
  { to: '/report',       label: '日報',           icon: '📊' },
  { to: '/customers',    label: '顧客管理',       icon: '👤' },
]

export default function Layout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* サイドバー */}
      <nav style={{
        width: 200, background: '#1E293B', color: '#fff',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid #334155' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>RIDE ON!!</div>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>洗車管理システム</div>
        </div>
        <div style={{ flex: 1, padding: '8px 0' }}>
          {nav.map(n => (
            <NavLink key={n.to} to={n.to} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 16px', textDecoration: 'none',
              color: isActive ? '#fff' : '#94A3B8',
              background: isActive ? '#2563EB' : 'transparent',
              fontSize: 14, fontWeight: isActive ? 600 : 400,
              borderRadius: 6, margin: '2px 8px',
            })}>
              <span style={{ fontSize: 16 }}>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
      {/* メインコンテンツ */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  )
}
