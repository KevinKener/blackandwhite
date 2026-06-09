import { useState, useEffect, FormEvent } from 'react'
import { getSettings, updateSettings, type TenantSettings, ApiError } from '../lib/api.ts'
import { supabase } from '../lib/supabase.ts'

export default function SettingsPage() {
  const [settings, setSettings] = useState<TenantSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [isOwner, setIsOwner] = useState(false)

  // Form state
  const [pointsPerOrder, setPointsPerOrder] = useState('')
  const [pointsForReward, setPointsForReward] = useState('')
  const [expiryDays, setExpiryDays] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const meta = data.session?.user?.app_metadata as Record<string, unknown> | undefined
      setIsOwner(meta?.role === 'owner')
    })

    getSettings()
      .then((s) => {
        setSettings(s)
        setPointsPerOrder(String(s.points_per_order))
        setPointsForReward(String(s.points_for_reward))
        setExpiryDays(String(s.expiry_days))
      })
      .catch(() => setError('No se pudieron cargar las configuraciones.'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)

    try {
      const updated = await updateSettings({
        points_per_order: Number(pointsPerOrder),
        points_for_reward: Number(pointsForReward),
        expiry_days: Number(expiryDays),
      })
      setSettings(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-gray-400 py-8 text-center">Cargando…</p>

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-xl font-semibold">Configuración de puntos</h1>

      {!isOwner && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
          Solo el dueño puede modificar estas configuraciones.
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <Field
          label="Puntos por pedido"
          description="Cuántos puntos gana el cliente por cada pedido completado."
          value={pointsPerOrder}
          onChange={setPointsPerOrder}
          disabled={!isOwner}
        />
        <Field
          label="Puntos para recompensa"
          description="Cuántos puntos necesita el cliente para canjear una recompensa."
          value={pointsForReward}
          onChange={setPointsForReward}
          disabled={!isOwner}
        />
        <Field
          label="Días de vencimiento"
          description="Los puntos vencen a esta cantidad de días desde que se ganaron."
          value={expiryDays}
          onChange={setExpiryDays}
          disabled={!isOwner}
        />

        {settings && (
          <p className="text-xs text-gray-400">
            Última actualización: {new Date(settings.updated_at).toLocaleDateString('es-AR', {
              day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-600">Configuración guardada.</p>}

        {isOwner && (
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-black text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50 hover:bg-gray-800 transition-colors"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        )}
      </form>

      {settings && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-sm text-gray-600 space-y-1">
          <p className="font-medium text-gray-800 mb-2">Regla actual</p>
          <p>El cliente gana <strong>{settings.points_per_order}</strong> punto{settings.points_per_order > 1 ? 's' : ''} por pedido.</p>
          <p>Con <strong>{settings.points_for_reward}</strong> puntos puede canjear una recompensa ({Math.ceil(settings.points_for_reward / settings.points_per_order)} pedidos).</p>
          <p>Los puntos vencen a los <strong>{settings.expiry_days}</strong> días ({Math.round(settings.expiry_days / 30)} meses).</p>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string
  description: string
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-0.5">{label}</label>
      <p className="text-xs text-gray-400 mb-1.5">{description}</p>
      <input
        type="number"
        min={1}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-50 disabled:text-gray-400"
      />
    </div>
  )
}
