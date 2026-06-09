import { useState, useEffect, useCallback, FormEvent } from 'react'
import { getRedemptions, createRedemption, getCustomers, type Redemption, type Customer, ApiError } from '../lib/api.ts'

const PAGE_SIZE = 20

export default function RedemptionsPage() {
  const [redemptions, setRedemptions] = useState<Redemption[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // New redemption modal
  const [showNew, setShowNew] = useState(false)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [points, setPoints] = useState('')
  const [rewardType, setRewardType] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [lastResult, setLastResult] = useState<{ phone: string; points: number; newBalance: number } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getRedemptions({ page, limit: PAGE_SIZE })
      setRedemptions(res.data)
      setTotal(res.total)
    } catch {
      setError('No se pudieron cargar los canjes.')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { load() }, [load])

  // Debounced customer search
  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      try {
        const res = await getCustomers({ search: search.trim(), limit: 5 })
        setSearchResults(res.data)
      } catch { /* ignore */ }
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!selectedCustomer) return
    const pts = Number(points)
    if (!pts || pts < 1) { setCreateError('Ingresá una cantidad válida de puntos.'); return }
    if (!rewardType.trim()) { setCreateError('Ingresá el tipo de recompensa.'); return }

    setCreating(true)
    setCreateError('')
    try {
      const result = await createRedemption(selectedCustomer.id, pts, rewardType.trim())
      setLastResult({ phone: selectedCustomer.phone, points: pts, newBalance: result.new_balance })
      setShowNew(false)
      resetModal()
      load()
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Error al registrar el canje.')
    } finally {
      setCreating(false)
    }
  }

  function resetModal() {
    setSearch('')
    setSearchResults([])
    setSelectedCustomer(null)
    setPoints('')
    setRewardType('')
    setCreateError('')
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Canjes</h1>
        <button
          onClick={() => { setShowNew(true); resetModal() }}
          className="bg-black text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
        >
          + Registrar canje
        </button>
      </div>

      {lastResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800 flex items-center justify-between">
          <span>Canje registrado — {lastResult.points} puntos de {lastResult.phone}. Saldo restante: {lastResult.newBalance}</span>
          <button onClick={() => setLastResult(null)} className="text-green-600 hover:text-green-800 font-medium">✕</button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Cargando…</p>
      ) : redemptions.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No hay canjes registrados.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Recompensa</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Puntos</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {redemptions.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">
                    {r.customers?.phone ?? '—'}
                    {r.customers?.name && <span className="text-gray-400 ml-1">({r.customers.name})</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.reward_type}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">−{r.points_redeemed}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(r.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{total} canjes</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Anterior</button>
            <span className="px-3 py-1.5">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Siguiente</button>
          </div>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Registrar canje</h2>
              <button onClick={() => { setShowNew(false); resetModal() }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              {/* Customer search */}
              {!selectedCustomer ? (
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Buscar cliente *</label>
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Teléfono o nombre…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  />
                  {searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 z-10">
                      {searchResults.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setSelectedCustomer(c); setSearch(''); setSearchResults([]) }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                        >
                          <span className="font-medium">{c.phone}</span>
                          {c.name && <span className="text-gray-400 ml-1">— {c.name}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-sm font-medium">{selectedCustomer.phone}{selectedCustomer.name && ` — ${selectedCustomer.name}`}</span>
                  <button type="button" onClick={() => setSelectedCustomer(null)} className="text-gray-400 hover:text-gray-600 text-sm">Cambiar</button>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Recompensa *</label>
                <input
                  type="text"
                  value={rewardType}
                  onChange={e => setRewardType(e.target.value)}
                  placeholder="Ej: Bebida gratis"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Puntos a canjear *</label>
                <input
                  type="number"
                  min={1}
                  value={points}
                  onChange={e => setPoints(e.target.value)}
                  placeholder="10"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              {createError && <p className="text-sm text-red-600">{createError}</p>}

              <button
                type="submit"
                disabled={creating || !selectedCustomer}
                className="w-full bg-black text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50 hover:bg-gray-800"
              >
                {creating ? 'Registrando…' : 'Confirmar canje'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
