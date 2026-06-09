import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.ts'

const navItems = [
  { to: '/orders', label: 'Pedidos' },
  { to: '/customers', label: 'Clientes' },
  { to: '/analytics', label: 'Métricas' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-black text-white">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <span className="font-bold text-lg tracking-tight">Black & White</span>
          <div className="flex items-center gap-6">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `text-sm font-medium transition-colors ${isActive ? 'text-white' : 'text-gray-400 hover:text-white'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <button
              onClick={handleSignOut}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Salir
            </button>
          </div>
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
