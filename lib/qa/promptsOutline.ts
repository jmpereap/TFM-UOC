type OutlineSnippet = {
  unidad: string
  rango: string
  texto: string
}

export function buildOutlinePrompt({ lawName, snippets }: { lawName: string; snippets: OutlineSnippet[] }) {
  const body = JSON.stringify(snippets).slice(0, 20000)
  return `SYSTEM: Responde SOLO con un objeto JSON válido.
USER:
Construye un ESQUEMA (mapa mental) jerárquico de: ${lawName}.
Usa EXCLUSIVAMENTE la información de los fragmentos.
Mínimos: ≥6 nodos TÍTULO/Disposición y ≥10 hojas; cada TÍTULO con ≥1 hijo; labels ≤90 caracteres.
Fragmentos: ${body}
Salida JSON exacta con forma { "root": { "id":"root","label":"${lawName}","kind":"root","children":[{ "id":"titulo-i","label":"TÍTULO I …","kind":"titulo","pages":"p.X–Y","children":[{ "id":"cap-i","label":"Capítulo I …","kind":"capitulo","children":[{ "id":"art-1","label":"Fundamento (Art. 1)","kind":"articulo"}]}]}] } }`
}










