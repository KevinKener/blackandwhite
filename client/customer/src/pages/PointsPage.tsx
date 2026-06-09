import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import NotFoundPage from './NotFoundPage.tsx'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

interface Transaction {
  id: string
  points_earned: number
  remaining_points: number
  expires_at: string
  created_at: string
}

interface CustomerData {
  customer: { name: string | null; phone: string }
  balance: number
  points_for_reward: number | null
  transactions: Transaction[]
}

type State =
  | { status: 'loading' }
  | { status: 'not_found' }
  | { status: 'error' }
  | { status: 'ok'; data: CustomerData }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function daysUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export default function PointsPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    if (!token) { setState({ status: 'not_found' }); return }

    fetch(`${API_BASE}/customers/by-token/${token}`)
      .then(async (res) => {
        if (res.status === 404) { setState({ status: 'not_found' }); return }
        if (!res.ok) { setState({ status: 'error' }); return }
        const data: CustomerData = await res.json()
        setState({ status: 'ok', data })
      })
      .catch(() => setState({ status: 'error' }))
  }, [token])

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white/50 text-sm">Cargando…</p>
      </div>
    )
  }

  if (state.status === 'not_found') return <NotFoundPage />

  if (state.status === 'error') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6 text-center">
        <div>
          <p className="text-white text-lg font-medium mb-2">Algo salió mal</p>
          <p className="text-white/50 text-sm">Intentá de nuevo en un momento.</p>
        </div>
      </div>
    )
  }

  const { data } = state
  const { customer, balance, points_for_reward, transactions } = data
  const greeting = customer.name ? `Hola, ${customer.name.split(' ')[0]}` : 'Hola'

  // Soonest-to-expire transaction with remaining points — warn if ≤ 30 days left
  const soonestExpiring = transactions.find((t) => t.remaining_points > 0)
  const soonestDays = soonestExpiring ? daysUntil(soonestExpiring.expires_at) : null
  const showExpiryWarning = soonestDays !== null && soonestDays <= 30

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="px-6 pt-12 pb-8">
        <p className="text-white/50 text-sm font-medium uppercase tracking-widest mb-1">Black & White</p>
        <h1 className="text-3xl font-bold">{greeting}</h1>
      </div>

      {/* Balance card */}
      <div className="mx-4 bg-white rounded-2xl p-6 text-black mb-6">
        <p className="text-sm text-gray-500 font-medium mb-1">Tus puntos</p>
        <p className="text-6xl font-bold tracking-tight">{balance}</p>
        {showExpiryWarning && soonestDays !== null && (
          <p className="text-xs text-orange-600 font-medium mt-3">
            {soonestDays === 0
              ? '¡Tenés puntos que vencen hoy!'
              : `${soonestExpiring!.remaining_points} punto${soonestExpiring!.remaining_points > 1 ? 's' : ''} vence${soonestExpiring!.remaining_points > 1 ? 'n' : ''} en ${soonestDays} día${soonestDays > 1 ? 's' : ''}`}
          </p>
        )}
      </div>

      {/* Reward goal */}
      {points_for_reward !== null && (
        <div className="mx-4 mb-6">
          {balance >= points_for_reward ? (
            <div className="bg-white/10 rounded-2xl px-5 py-4 text-center">
              <p className="text-white font-semibold text-base">¡Ya podés canjear una recompensa!</p>
              <p className="text-white/50 text-sm mt-1">Mostrá esta pantalla en el local.</p>
            </div>
          ) : (
            <div className="bg-white/10 rounded-2xl px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-white/70 text-sm">Próxima recompensa</p>
                <p className="text-white text-sm font-semibold">{balance} / {points_for_reward}</p>
              </div>
              <div className="w-full bg-white/20 rounded-full h-2">
                <div
                  className="bg-white rounded-full h-2 transition-all"
                  style={{ width: `${Math.min(100, Math.round((balance / points_for_reward) * 100))}%` }}
                />
              </div>
              <p className="text-white/50 text-xs mt-2">
                Te {points_for_reward - balance === 1 ? 'falta 1 punto' : `faltan ${points_for_reward - balance} puntos`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Transactions */}
      <div className="px-4 pb-12">
        <h2 className="text-sm font-medium text-white/50 uppercase tracking-widest mb-3">
          Historial ({transactions.length})
        </h2>

        {transactions.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-8">
            Todavía no acumulaste puntos.
          </p>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const days = daysUntil(tx.expires_at)
              const expired = tx.remaining_points === 0
              return (
                <div
                  key={tx.id}
                  className={`rounded-xl p-4 flex items-center justify-between ${
                    expired ? 'bg-white/5' : 'bg-white/10'
                  }`}
                >
                  <div>
                    <p className={`text-sm font-medium ${expired ? 'text-white/30' : 'text-white'}`}>
                      {formatDate(tx.created_at)}
                    </p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {expired
                        ? 'Canjeado'
                        : days === 0
                        ? 'Vence hoy'
                        : `Vence en ${days} día${days > 1 ? 's' : ''}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${expired ? 'text-white/20' : 'text-white'}`}>
                      +{tx.points_earned}
                    </p>
                    {!expired && tx.remaining_points < tx.points_earned && (
                      <p className="text-xs text-white/40">{tx.remaining_points} restantes</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
