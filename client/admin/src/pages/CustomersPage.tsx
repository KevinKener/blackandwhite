import { useState, useEffect, useCallback } from 'react'
import { getCustomers, createCustomer, type Customer, ApiError } from '../lib/api.ts'

const PAGE_SIZE = 20
const CUSTOMER_PWA_BASE = import.meta.env.VITE_CUSTOMER_PWA_URL ?? 'http://localhost:5174'

function registrationUrl(token: string) {
  return `${CUSTOMER_PWA_BASE}/puntos/${token}`
}

function whatsappLink(phone: string, url: string) {
  const text = encodeURIComponent(`Hola! Acá podés ver tus puntos de fidelización en Black & White: ${url}`)
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${text}`
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // New customer modal
  const [showNew, setShowNew] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getCustomers({ page, limit: PAGE_SIZE, search: debouncedSearch || undefined })
      setCustomers(res.data)
      setTotal(res.total)
    } catch {
      setError('No se pudieron cargar los clientes.')
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch])

  useEffect(() => { load() }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newPhone.trim()) return
    setCreating(true)
    setCreateError('')
    try {
      await createCustomer(newPhone.trim(), newName.trim() || undefined)
      setShowNew(false)
      setNewPhone('')
      setNewName('')
      load()
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Error al crear el cliente.')
    } finally {
      setCreating(false)
    }
  }

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(registrationUrl(token))
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Clientes</h1>
        <button
          onClick={() => setShowNew(true)}
          className="bg-black text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
        >
          + Nuevo cliente
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por teléfono o nombre…"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Cargando…</p>
      ) : customers.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">
          {debouncedSearch ? 'Sin resultados.' : 'No hay clientes registrados.'}
        </p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Teléfono</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Desde</th>
                <th className="px-4 py-3 text-gray-500 font-medium text-right">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.map((c) => {
                const url = registrationUrl(c.registration_token)
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-medium">{c.phone}</td>
                    <td className="px-4 py-3 text-gray-600">{c.name ?? <span className="text-gray-400 italic">—</span>}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(c.created_at).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2 items-center">
                        <button
                          onClick={() => copyLink(c.registration_token)}
                          className="text-xs text-gray-500 hover:text-black border border-gray-200 rounded px-2 py-1 transition-colors"
                          title="Copiar link"
                        >
                          {copied === c.registration_token ? '✓ Copiado' : 'Copiar link'}
                        </button>
                        <a
                          href={whatsappLink(c.phone, url)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-green-700 hover:text-green-900 border border-green-200 rounded px-2 py-1 transition-colors"
                          title="Enviar por WhatsApp"
                        >
                          WhatsApp
                        </a>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{total} clientes</span>
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

      {/* New Customer Modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Nuevo cliente</h2>
              <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono *</label>
                <input
                  type="tel"
                  required
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+54 9 11 1234-5678"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre (opcional)</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Juan García"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              {createError && <p className="text-sm text-red-600">{createError}</p>}
              <button
                type="submit"
                disabled={creating}
                className="w-full bg-black text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
              >
                {creating ? 'Creando…' : 'Crear cliente'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
