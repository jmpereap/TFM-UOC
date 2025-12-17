### OUTPUT-FICHA-ARTICULO

## a) Endpoint y payload que espera

### Endpoint

```ts
// app/api/mental-outline/generate-fiche/route.ts
export async function POST(req: Request): Promise<Response> { ... }
```

### Payload esperado

```ts
// Payload lógico (no hay Zod, se valida a mano)
type GenerateFichePayload = {
  articleAnchor: string        // ej: "art-1", "art-5"
  lawName?: string             // opcional; si viene vacío se usa metadata del outline
  mentalOutline: MentalOutline // esquema mental completo (types/mentalOutline.ts)
  articleData: {
    numero_articulo?: string
    numero?: string
    rubrica_articulo?: string
    articulo_texto?: string
    texto_completo?: string  // Prioridad 1: texto completo del artículo (IA)
    texto_articulo?: string  // Prioridad 2: texto del artículo
    resumen?: string         // Prioridad 3: resumen como fallback
  }
}
```

Reglas:

- `articleAnchor`: requerido, identifica el artículo en el esquema mental.
- `mentalOutline`: requerido (`MentalOutline` de `types/mentalOutline.ts`).
- `articleData`: requerido, debe aportar al menos una de las fuentes de texto (`texto_completo`, `texto_articulo` o `resumen`).
- `lawName`: opcional; si está vacío, se obtiene de:
  1. `mentalOutline.metadata.document_title`
  2. `mentalOutline.metadata.source`
  3. Fallback `"Documento sin título"`.

---

## b) Estructura exacta de salida

### Tipo de respuesta

```ts
type GenerateFicheResponse = {
  ok: boolean
  fiche: string       // Texto plano de la ficha, ya formateado
  format: 'text'      // Actualmente solo 'text'
}
```

- No se devuelven metadatos adicionales estructurados; los metadatos (título/capítulo/sección, nombre de documento) ya están “embebidos” en el propio string `fiche`.

---

## c) Reglas de formateo

### c.1. Tipos de entrada de `formatFiche`

```ts
// lib/outline/formatFiche.ts

export type FicheData = {
  lawName: string
  context: ArticleContext | null
  articleNumber: string
  articleRubrica: string
  articleText: string
}

export type ArticleContext = {
  titulo: {
    codigo?: string
    subtitulo?: string
    ordinal?: string
  } | null
  capitulo: {
    codigo?: string
    subtitulo?: string
    ordinal?: string
  } | null
  seccion: {
    codigo?: string
    subtitulo?: string
    ordinal?: string
  } | null
}
```

### c.2. Estructura de la ficha (plantilla)

La función `formatFiche` genera una ficha con esta estructura base:

```text
═══════════════════════════════════════════════════════════
                    FICHA DE ARTÍCULO
═══════════════════════════════════════════════════════════

📄 Documento: [Nombre del documento]

Estructura:
  📑 TÍTULO [ordinal] - [subtítulo]
  📖 CAPÍTULO [ordinal] - [subtítulo]  (si existe)
  📋 SECCIÓN [ordinal] - [subtítulo]   (si existe)

───────────────────────────────────────────────────────────

📌 Artículo [número]

───────────────────────────────────────────────────────────

Texto del artículo:

[Texto formateado del artículo respetando \n de la IA]

───────────────────────────────────────────────────────────
```

- Si **no hay contexto** (`context === null`), se omite el bloque “Estructura: …”.
- Si no hay capítulo o sección, se muestran solo los niveles disponibles (p.ej. solo título, o título + capítulo).

### c.3. Selección del texto del artículo

Prioridad para obtener `articleText`:

1. `articleData.texto_completo`
2. `articleData.texto_articulo`
3. `articleData.resumen`
4. Si no hay nada: `''` (y la ficha muestra un texto vacío o mensaje genérico según la versión).

### c.4. Manejo de la rúbrica

- `articleRubrica` proviene de:
  - `articleData.rubrica_articulo` o, en su defecto, `articleData.articulo_texto`.
- **No** se imprime ya un bloque independiente “Rúbrica: …”.
- Si la rúbrica aparece duplicada al inicio de `articleText` (por ejemplo porque `texto_completo` empieza con `"Artículo 1. Objeto de la Ley"` y además se ha pasado la rúbrica), la lógica de limpieza elimina esa cabecera inicial de `articleText` para evitar repetirla en el cuerpo.

### c.5. Respeto de saltos de línea y limpieza

El texto se procesa así (resumen de la lógica documentada en `RESUMEN-GENERACION-FICHAS-ARTICULO.md`):

```ts
const lineasTexto = textoFormateado.split('\n')

for (const linea of lineasTexto) {
  const lineaTrimmed = linea.trim()
  if (lineaTrimmed.length > 0) {
    lines.push(lineaTrimmed)
  } else {
    // Si la línea está vacía, mantener un salto de línea solo si no es el inicio
    if (lines.length > 0 && lines[lines.length - 1] !== '') {
      lines.push('')
    }
  }
}
```

Reglas:

- Se respeta el formato original de la IA:
  - No se añaden saltos de línea “inteligentes” extra antes de apartados numerados.
  - Se conservan los `\n` y las líneas vacías como separadores de párrafo.
- Limpieza adicional:
  - Eliminación de **líneas que son solo números** (números de página).
  - Normalización de espacios múltiples dentro de cada línea.
  - Eliminación de **líneas vacías iniciales** para que el texto no empiece con huecos.

---

## d) Ejemplos reales de fichas generadas (JSON)

### d.1. Ficha con Título, Capítulo y Sección completos

```json
{
  "fiche": "═══════════════════════════════════════════════════════════\n                    FICHA DE ARTÍCULO\n═══════════════════════════════════════════════════════════\n\n📄 Documento: Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales\n\nEstructura:\n  📑 TÍTULO I - Disposiciones generales\n  📖 CAPÍTULO I - De los derechos fundamentales\n  📋 SECCIÓN 1 - De la libertad\n\n───────────────────────────────────────────────────────────\n\n📌 Artículo 1\n\n───────────────────────────────────────────────────────────\n\nTexto del artículo:\n\nLa presente Ley Orgánica tiene por objeto garantizar y proteger el tratamiento de los datos personales y los derechos fundamentales de las personas físicas en relación con dicho tratamiento.\n\n1. Esta Ley Orgánica se aplica al tratamiento de datos personales realizado por:\n   a) Los responsables y encargados del tratamiento establecidos en territorio español.\n   b) Los responsables y encargados del tratamiento no establecidos en territorio español cuando el tratamiento se relacione con la oferta de bienes o servicios a personas físicas en territorio español.\n\n2. La presente Ley Orgánica se aplicará sin perjuicio de lo establecido en la normativa específica sectorial.\n\n───────────────────────────────────────────────────────────\n"
}
```

Características:

- `context.titulo`, `context.capitulo` y `context.seccion` están presentes.
- El cuerpo respeta los apartados numerados y letras que venían del texto IA.

### d.2. Ficha sin sección (solo Título y Capítulo)

```json
{
  "fiche": "═══════════════════════════════════════════════════════════\n                    FICHA DE ARTÍCULO\n═══════════════════════════════════════════════════════════\n\n📄 Documento: Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales\n\nEstructura:\n  📑 TÍTULO II - Principios de protección de datos\n  📖 CAPÍTULO I - Disposiciones generales\n\n───────────────────────────────────────────────────────────\n\n📌 Artículo 4\n\n───────────────────────────────────────────────────────────\n\nTexto del artículo:\n\nLos datos personales deberán ser exactos y, si fuera necesario, actualizados. Se adoptarán todas las medidas razonables para que se supriman o rectifiquen sin dilación los datos personales que resulten inexactos con respecto a los fines para los que se tratan.\n\n───────────────────────────────────────────────────────────\n"
}
```

Características:

- `context.seccion === null` → no se imprime la línea de sección.
- El título y el capítulo se muestran normalmente.

---

## e) Exportación a TXT / PDF y convención de nombres

La exportación de fichas se realiza **en el frontend**, a partir del string `fiche` devuelto por el endpoint:

### e.1. Exportación a TXT

```ts
// app/generate/page.tsx (componente ArticleDetail)
const blob = new Blob([fiche], { type: 'text/plain;charset=utf-8' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = `Ficha_Articulo_${art.numero.replace(/\s+/g, '_')}.txt`
a.click()
```

**Convención de nombre TXT:**

- `Ficha_Articulo_{numero}.txt`
- Los espacios en `{numero}` se reemplazan por `_`.
  - Ej.: `Ficha_Articulo_1.txt`, `Ficha_Articulo_3_bis.txt`.

### e.2. Exportación a PDF

- Se usa `pdf-lib` para convertir el texto `fiche` en PDF.
- El nombre de archivo sigue la misma convención:

```ts
// Esquema general
a.download = `Ficha_Articulo_${art.numero.replace(/\s+/g, '_')}.pdf`
```

**Convención de nombre PDF:**

- `Ficha_Articulo_{numero}.pdf`
- Mismo patrón de normalización de espacios que en TXT.

### e.3. No hay CSV

- No existe exportación de fichas a CSV.
- El único “formato estructurado” disponible es:
  - El JSON de entrada/salida del endpoint (`GenerateFichePayload` / `GenerateFicheResponse`).
  - Los logs internos (si se generan) con vista previa de la ficha y metadatos de contexto.


