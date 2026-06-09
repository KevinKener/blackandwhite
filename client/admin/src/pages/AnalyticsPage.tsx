import { useState, useEffect } from 'react'
import { getAnalyticsSummary, type AnalyticsSummary } from '../lib/api.ts'

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getAnalyticsSummary()
      .then(setData)
      .catch(() => setError('No se pudieron cargar las métricas.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-sm text-gray-400 py-8 text-center">Cargando…</p>
  if (error) return <p className="text-sm text-red-600 py-8 text-center">{error}</p>
  if (!data) return null

  const completionRate = data.orders.total > 0
    ? Math.round((data.orders.completed / data.orders.total) * 100)
    : 0

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Métricas</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Pedidos totales" value={data.orders.total} />
        <StatCard label="Completados" value={data.orders.completed} sub={`${completionRate}% del total`} accent="green" />
        <StatCard label="Pendientes" value={data.orders.pending} accent={data.orders.pending > 0 ? 'yellow' : undefined} />
        <StatCard label="Clientes" value={data.customers.total} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Puntos emitidos" value={data.points.total_issued} sub="total histórico" />
        <StatCard label="Puntos activos" value={data.points.active_balance} sub="no vencidos" accent="green" />
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: number
  sub?: string
  accent?: 'green' | 'yellow'
}) {
  const accentClass = accent === 'green'
    ? 'text-green-700'
    : accent === 'yellow'
    ? 'text-yellow-600'
    : 'text-gray-900'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold ${accentClass}`}>{value.toLocaleString('es-AR')}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}
