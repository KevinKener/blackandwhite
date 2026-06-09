import { useState, useEffect, useCallback } from 'react'
import { getOrders, createOrder, completeOrder, type Order, ApiError } from '../lib/api.ts'
import { supabase } from '../lib/supabase.ts'

const PAGE_SIZE = 20

type StatusFilter = 'all' | 'pending' | 'completed'

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Auth context
  const [userRole, setUserRole] = useState<'owner' | 'manager' | null>(null)
  const [userLocationId, setUserLocationId] = useState<string | null>(null)

  // New order modal
  const [showNewOrder, setShowNewOrder] = useState(false)
  const [locationId, setLocationId] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Complete order modal
  const [completingOrder, setCompletingOrder] = useState<Order | null>(null)
  const [customerPhone, setCustomerPhone] = useState('')
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState('')
  const [lastResult, setLastResult] = useState<{ points: number; phone: string } | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const meta = data.session?.user?.app_metadata as Record<string, unknown> | undefined
      setUserRole((meta?.role as 'owner' | 'manager') ?? null)
      setUserLocationId(typeof meta?.location_id === 'string' ? meta.location_id : null)
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getOrders({ page, limit: PAGE_SIZE, status: status === 'all' ? undefined : status })
      setOrders(res.data)
      setTotal(res.total)
    } catch {
      setError('No se pudieron cargar los pedidos.')
    } finally {
      setLoading(false)
    }
  }, [page, status])

  useEffect(() => { load() }, [load])

  async function handleCreateOrder(e: React.FormEvent) {
    e.preventDefault()
    const resolvedLocationId = userRole === 'manager' ? userLocationId : locationId.trim()
    if (!resolvedLocationId) return
    setCreating(true)
    setCreateError('')
    try {
      await createOrder(resolvedLocationId)
      setShowNewOrder(false)
      setLocationId('')
      load()
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Error al crear el pedido.')
    } finally {
      setCreating(false)
    }
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault()
    if (!completingOrder || !customerPhone.trim()) return
    setCompleting(true)
    setCompleteError('')
    try {
      const result = await completeOrder(completingOrder.id, customerPhone.trim())
      setLastResult({ points: result.points_earned, phone: customerPhone.trim() })
      setCompletingOrder(null)
      setCustomerPhone('')
      load()
    } catch (err) {
      setCompleteError(err instanceof ApiError ? err.message : 'Error al completar el pedido.')
    } finally {
      setCompleting(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pedidos</h1>
        <button
          onClick={() => setShowNewOrder(true)}
          className="bg-black text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
        >
          + Nuevo pedido
        </button>
      </div>

      {/* Toast */}
      {lastResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800 flex items-center justify-between">
          <span>Pedido completado — {lastResult.points} puntos asignados a {lastResult.phone}</span>
          <button onClick={() => setLastResult(null)} className="text-green-600 hover:text-green-800 font-medium">✕</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'pending', 'completed'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => { setStatus(s); setPage(1) }}
            className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
              status === s
                ? 'bg-black text-white border-black'
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            {{ all: 'Todos', pending: 'Pendientes', completed: 'Completados' }[s]}
          </button>
        ))}
      </div>

      {/* Table */}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Cargando…</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No hay pedidos.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Estado</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Fecha</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">
                    {order.customers?.phone ?? <span className="text-gray-400 italic">Sin cliente</span>}
                    {order.customers?.name && (
                      <span className="text-gray-400 ml-1">({order.customers.name})</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      order.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {order.status === 'completed' ? 'Completado' : 'Pendiente'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(order.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {order.status === 'pending' && (
                      <button
                        onClick={() => { setCompletingOrder(order); setCompleteError('') }}
                        className="text-sm text-black font-medium hover:underline"
                      >
                        Completar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{total} pedidos</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Anterior
            </button>
            <span className="px-3 py-1.5">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* New Order Modal */}
      {showNewOrder && (
        <Modal title="Nuevo pedido" onClose={() => setShowNewOrder(false)}>
          <form onSubmit={handleCreateOrder} className="space-y-4">
            {userRole === 'manager' ? (
              <p className="text-sm text-gray-500">Se creará un pedido para tu local.</p>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ID del local</label>
                <input
                  type="text"
                  required
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  placeholder="uuid del local"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            )}
            {createError && <p className="text-sm text-red-600">{createError}</p>}
            <button
              type="submit"
              disabled={creating}
              className="w-full bg-black text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              {creating ? 'Creando…' : 'Crear pedido'}
            </button>
          </form>
        </Modal>
      )}

      {/* Complete Order Modal */}
      {completingOrder && (
        <Modal title="Completar pedido" onClose={() => { setCompletingOrder(null); setCustomerPhone('') }}>
          <form onSubmit={handleComplete} className="space-y-4">
            <p className="text-sm text-gray-500">Ingresá el teléfono del cliente para asignar los puntos.</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
              <input
                type="tel"
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+54 9 11 1234-5678"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            {completeError && <p className="text-sm text-red-600">{completeError}</p>}
            <button
              type="submit"
              disabled={completing}
              className="w-full bg-black text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              {completing ? 'Completando…' : 'Confirmar y asignar puntos'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
