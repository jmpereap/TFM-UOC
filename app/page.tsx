import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">TFM UOC IA</h1>
      <p className="mt-2 text-gray-600">Proyecto base listo para extender.</p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/upload"
          className="rounded border p-4 transition hover:bg-gray-50"
        >
          <h2 className="font-medium">Subir PDF y ver bloques →</h2>
          <p className="text-sm text-gray-600">Parseo y división en bloques.</p>
        </Link>

        <Link
          href="/generate"
          className="rounded border p-4 transition hover:bg-gray-50"
        >
          <h2 className="font-medium">Generar preguntas →</h2>
          <p className="text-sm text-gray-600">Demo con resultados mock.</p>
        </Link>
      </div>
    </main>
  )
}


