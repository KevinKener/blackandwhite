export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6 text-center">
      <div>
        <p className="text-white/20 text-6xl font-bold mb-6">404</p>
        <p className="text-white text-lg font-medium mb-2">Link no encontrado</p>
        <p className="text-white/50 text-sm">
          Este link no existe o ya no es válido.
          <br />
          Pedile al local que te envíe el link correcto.
        </p>
      </div>
    </div>
  )
}
