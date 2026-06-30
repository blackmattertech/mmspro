import { Outlet, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function AdminLayout() {
  const { signOut } = useAuth()
  return (
    <div className="admin-layout">
      <nav className="admin-sidebar">
        <div className="logo">Admin Panel</div>
        <Link to="/admin/dashboard">Dashboard</Link>
        <Link to="/admin/users">Users</Link>
        <button onClick={signOut}>Sign Out</button>
      </nav>
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  )
}
