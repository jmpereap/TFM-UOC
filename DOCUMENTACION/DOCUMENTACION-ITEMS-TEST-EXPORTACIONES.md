# Documentación: Ítems de Test y Exportaciones

## a) TypeScript Type / Zod Schema del ítem

### Tipo TypeScript

```ts
// types/mcq.ts
export type OptionKey = 'A' | 'B' | 'C' | 'D'

export type Difficulty = 'basico' | 'medio' | 'avanzado'

export type MCQItem = {
  pregunta: string
  opciones: Record<OptionKey, string>
  correcta: OptionKey
  justificacion: string
  difficulty: Difficulty
  referencia: {
    ley: string
    paginas: string // "p. X–Y"
    articulo?: string
    parrafo?: string
  }
}
```

### Schema JSON usado en callModel.ts

```ts
// lib/qa/callModel.ts (líneas 19-57)
const questionSchema = {
  name: 'mcq_items',
  schema: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        pregunta: { type: 'string' },
        opciones: {
          type: 'object',
          properties: {
            A: { type: 'string' },
            B: { type: 'string' },
            C: { type: 'string' },
            D: { type: 'string' },
          },
          required: ['A', 'B', 'C', 'D'],
          additionalProperties: false,
        },
        correcta: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
        justificacion: { type: 'string' },
        difficulty: { type: 'string', enum: ['basico', 'medio', 'avanzado'] },
        referencia: {
          type: 'object',
          properties: {
            ley: { type: 'string' },
            paginas: { type: 'string' },
            articulo: { type: 'string' },
            parrafo: { type: 'string' },
          },
          required: ['ley', 'paginas'],
          additionalProperties: true,
        },
      },
      required: ['pregunta', 'opciones', 'correcta', 'justificacion', 'difficulty', 'referencia'],
      additionalProperties: false,
    },
  },
} as const
```

**Archivo:** `types/mcq.ts`  
**Endpoint que devuelve:** `/api/generate` (POST)  
**Nota:** El tipo `MCQItem` también está definido en `lib/qa/callModel.ts` (líneas 10-17) con la misma estructura, pero la definición canónica está en `types/mcq.ts`

---

## b) Función de transformación a CSV

```ts
// app/api/export/route.ts (líneas 16-34)
function itemsToCSV(items: MCQItem[], includeCorrect: boolean): string {
  const escape = (s: string) => '"' + String(s ?? '').replace(/"/g, '""') + '"'
  const header = includeCorrect
    ? ['pregunta', 'A', 'B', 'C', 'D', 'correcta', 'justificacion', 'ley', 'paginas', 'articulo', 'parrafo']
    : ['pregunta', 'A', 'B', 'C', 'D', 'justificacion', 'ley', 'paginas', 'articulo', 'parrafo']
  const rows = items.map((it) => {
    const base = [it.pregunta, it.opciones.A, it.opciones.B, it.opciones.C, it.opciones.D]
    const tail = [
      it.justificacion,
      it.referencia.ley,
      it.referencia.paginas,
      it.referencia.articulo ?? '',
      it.referencia.parrafo ?? '',
    ]
    const arr = includeCorrect ? [...base, it.correcta, ...tail] : [...base, ...tail]
    return arr.map(escape).join(',')
  })
  return [header.join(','), ...rows].join('\n')
}
```

### Mapeo CSV - Nombres de columnas y orden

**Con respuestas correctas (`includeCorrect: true`):**
1. `pregunta`
2. `A`
3. `B`
4. `C`
5. `D`
6. `correcta`
7. `justificacion`
8. `ley`
9. `paginas`
10. `articulo`
11. `parrafo`

**Sin respuestas correctas (`includeCorrect: false`):**
1. `pregunta`
2. `A`
3. `B`
4. `C`
5. `D`
6. `justificacion`
7. `ley`
8. `paginas`
9. `articulo`
10. `parrafo`

**Notas:**
- Los valores se escapan con comillas dobles (`"`) y las comillas internas se duplican (`""`)
- Los campos opcionales (`articulo`, `parrafo`) se exportan como cadena vacía si no existen
- El orden es siempre: pregunta → opciones (A-D) → correcta (si aplica) → justificacion → referencia completa

---

## c) Exportación PDF

### Función principal

```ts
// app/api/export/route.ts (líneas 36-107)
async function itemsToPDF(items: MCQItem[], lawName?: string): Promise<Uint8Array>
```

### Componente/Plantilla

La exportación PDF se genera directamente usando `pdf-lib` (no hay componente React separado). La función `itemsToPDF` crea el documento programáticamente.

### Campos que imprime el PDF

**Por cada ítem:**

1. **Número y pregunta** (en negrita):
   - Formato: `Q{idx+1}. {pregunta}`
   - Ejemplo: `Q1. ¿Cuál es el plazo máximo para presentar un recurso?`

2. **Opciones** (en texto normal):
   - `A) {opciones.A}`
   - `B) {opciones.B}`
   - `C) {opciones.C}`
   - `D) {opciones.D}`

3. **Referencia** (en texto normal):
   - Formato base: `Referencia: {ley}, {paginas}`
   - Si existe `articulo`: añade `, art. {articulo}`
   - Si existe `parrafo`: añade `, párr. {parrafo}`
   - Ejemplo: `Referencia: Ley Orgánica 3/2023, p. 12–16, art. 45, párr. 1`

**Cabecera de página:**
- Título: `"Preguntas"` o `"Preguntas — {lawName}"` (si se proporciona `lawName`)

**Campos NO impresos:**
- ❌ `justificacion` (no se incluye en el PDF)
- ❌ `correcta` (no se incluye en el PDF)
- ❌ `difficulty` (no se incluye en el PDF)

### Detalles técnicos del PDF

- **Fuente:** Helvetica (normal y bold)
- **Tamaño de página:** A4 (595.28 x 841.89 puntos)
- **Márgenes:** 50 puntos
- **Altura de línea:** 14 puntos
- **Tamaño de fuente:** 11 puntos (contenido), 12 puntos (título)
- **Salto de página:** Automático cuando el espacio es insuficiente
- **Biblioteca:** `pdf-lib` (`PDFDocument`, `StandardFonts`)

---

## d) Campos de metadatos

**⚠️ IMPORTANTE:** El tipo `MCQItem` **NO incluye campos de metadatos** como:
- ❌ `schema_version`
- ❌ `model`
- ❌ `prompt_version`
- ❌ `source_pdf_hash`

Los metadatos existen en otros tipos del sistema (por ejemplo, `mentalOutline.metadata`), pero **no se propagan al ítem final** que devuelve `/api/generate`.

**Información disponible en el ítem:**
- `referencia.ley`: Nombre de la ley
- `referencia.paginas`: Rango de páginas (formato "p. X–Y")
- `referencia.articulo`: Artículo (opcional)
- `referencia.parrafo`: Párrafo (opcional)
- `difficulty`: Nivel de dificultad ('basico' | 'medio' | 'avanzado')

---

## e) Ejemplos reales de ítems (3 por dificultad)

### Ejemplo 1: Dificultad "basico"

```json
{
  "pregunta": "¿Cuál es el plazo máximo para presentar un recurso según la ley?",
  "opciones": {
    "A": "15 días",
    "B": "30 días",
    "C": "45 días",
    "D": "60 días"
  },
  "correcta": "B",
  "justificacion": "Según el artículo 45, el plazo máximo para presentar un recurso es de 30 días naturales desde la notificación.",
  "difficulty": "basico",
  "referencia": {
    "ley": "Ley Orgánica 3/2023",
    "paginas": "p. 12–16",
    "articulo": "45",
    "parrafo": "1"
  }
}
```

### Ejemplo 2: Dificultad "medio"

```json
{
  "pregunta": "¿Cuál de las siguientes afirmaciones sobre la competencia del órgano es correcta según la ley?",
  "opciones": {
    "A": "El órgano es competente cuando el asunto afecta a más de una comunidad autónoma y requiere coordinación.",
    "B": "El órgano solo es competente para asuntos de carácter local sin trascendencia estatal.",
    "C": "La competencia se determina exclusivamente por el lugar de residencia del interesado.",
    "D": "No existe ningún órgano competente para estos asuntos según la normativa vigente."
  },
  "correcta": "A",
  "justificacion": "El artículo 23 establece que el órgano es competente cuando el asunto afecta a más de una comunidad autónoma y requiere coordinación, tal como se indica en el apartado 2 del mismo artículo.",
  "difficulty": "medio",
  "referencia": {
    "ley": "Ley Orgánica 3/2023",
    "paginas": "p. 45–48",
    "articulo": "23",
    "parrafo": "2"
  }
}
```

### Ejemplo 3: Dificultad "avanzado"

```json
{
  "pregunta": "Un ciudadano presenta una solicitud el día 15 de marzo de 2024. El órgano competente notifica la resolución el día 10 de abril del mismo año. El ciudadano, disconforme con la decisión, decide interponer un recurso. ¿Cuál es la fecha límite para presentar el recurso, considerando que el plazo es de 30 días naturales y que el día 1 de mayo es festivo?",
  "opciones": {
    "A": "9 de mayo de 2024",
    "B": "10 de mayo de 2024",
    "C": "11 de mayo de 2024",
    "D": "12 de mayo de 2024"
  },
  "correcta": "B",
  "justificacion": "Según el artículo 45.1, el plazo para interponer recurso es de 30 días naturales desde la notificación. La notificación fue el 10 de abril, por lo que el plazo vence el 10 de mayo. Aunque el día 1 de mayo es festivo, los días festivos no suspenden el cómputo de plazos administrativos según el artículo 30.2, por lo que la fecha límite es el 10 de mayo de 2024.",
  "difficulty": "avanzado",
  "referencia": {
    "ley": "Ley Orgánica 3/2023",
    "paginas": "p. 45–52",
    "articulo": "45",
    "parrafo": "1"
  }
}
```

---

## f) Límites definidos

### Generación (`/api/generate`)

| Límite | Valor | Ubicación |
|--------|-------|-----------|
| **Máximo de preguntas por solicitud** | 20 | `app/api/generate/route.ts` línea 15: `n: z.number().int().min(1).max(20)` |
| **Timeout máximo del endpoint** | 120 segundos | `app/api/generate/route.ts` línea 37: `maxDuration = 120` |
| **Timeout dinámico por bloque** | 30-90 segundos | `app/api/generate/route.ts` líneas 142-144: base 30s + 1s por cada 1000 caracteres de prompt |
| **Longitud máxima de texto de bloque** | 10,000 caracteres | `app/api/generate/route.ts` línea 117: `truncateByChars(b.text, 10000)` |
| **Concurrencia (bloques en paralelo)** | 4 bloques máximo | `app/api/generate/route.ts` línea 197: `withLimit(4, tasks)` |
| **Máximo de tokens en respuesta del modelo** | 1200 tokens | `lib/qa/callModel.ts` línea 98: `max_tokens: 1200` |

### Exportación (`/api/export`)

| Límite | Valor | Notas |
|--------|-------|-------|
| **Mínimo de ítems** | 1 | Valida que `items.length > 0` |
| **Máximo de ítems** | ❌ Sin límite | No hay validación de máximo |
| **Paginación** | ❌ No implementada | Todos los ítems se exportan en un solo archivo |
| **Tamaño máximo de archivo** | ❌ Sin límite | Depende de la capacidad del servidor/cliente |

**Nota:** Aunque no hay límites explícitos en la exportación, el límite práctico viene del límite de generación (máximo 20 ítems por solicitud).

---

## g) Convención de nombres de archivo

### Nombres fijos

Todos los archivos exportados usan nombres **fijos** sin variación:

- **CSV:** `preguntas.csv`
- **JSON:** `preguntas.json`
- **PDF:** `preguntas.pdf`

### Ubicación en código

```ts
// app/api/export/route.ts

// JSON (línea 125)
'Content-Disposition': 'attachment; filename=preguntas.json'

// CSV (línea 137)
'Content-Disposition': 'attachment; filename=preguntas.csv'

// PDF (línea 147)
'Content-Disposition': 'attachment; filename=preguntas.pdf'
```

**⚠️ Nota importante:** No hay variación dinámica del nombre de archivo (por ejemplo, por fecha, ley, o número de ítems). El nombre es siempre `preguntas.{ext}` independientemente del contenido o momento de exportación.

---

## Archivos relacionados

- **Tipos:** `types/mcq.ts`
- **Endpoint de generación:** `app/api/generate/route.ts`
- **Endpoint de exportación:** `app/api/export/route.ts`
- **Función de llamada al modelo:** `lib/qa/callModel.ts`
- **Construcción de prompts:** `lib/qa/prompt.ts`
- **Utilidad de truncado:** `lib/utils/truncate.ts`

---

## Resumen de flujo

1. **Generación:** Cliente → `/api/generate` → `callModel()` → Retorna `MCQItem[]`
2. **Exportación:** Cliente → `/api/export` → `itemsToCSV()` / `itemsToPDF()` → Descarga archivo
3. **Validación:** El schema JSON se valida en `callModel.ts` antes de retornar los ítems
4. **Normalización:** La dificultad se normaliza en `callModel.ts` (líneas 115-123) para manejar variaciones de escritura (acepta "basico"/"básico"/"basic", "medio"/"medium"/"intermedio", "avanzado"/"advanced", y por defecto usa "medio" si no se puede determinar)

---

# Documentación: Esquema Mental y Fichas

## a) TypeScript Type del Esquema Mental

### Tipo TypeScript

```ts
// types/mentalOutline.ts
export type FrontMatterEntry = {
  present: boolean
  anchor: string | null
  pages: number[] | null
}

export type Articulo = {
  numero: string
  articulo_texto: string
  pagina_articulo: number
  pages?: number[]
  anchor?: string
  texto_completo?: string
  resumen?: string
}

export type Seccion = {
  codigo_seccion?: string
  subtitulo_seccion?: string
  pagina_inicio_seccion: number
  pagina_fin_seccion: number
  articulos: Articulo[]
  ordinal?: string
  seccion_texto?: string
  pages?: number[]
  anchor?: string
}

export type Capitulo = {
  codigo_capitulo?: string
  subtitulo_capitulo?: string
  pagina_inicio_capitulo: number
  pagina_fin_capitulo: number
  articulos_sin_seccion?: Articulo[]
  secciones: Seccion[]
  ordinal?: string
  capitulo_texto?: string
  pages?: number[]
  anchor?: string
  articulos?: Articulo[]
}

export type Titulo = {
  codigo_titulo?: string
  subtitulo_titulo?: string
  pagina_inicio_titulo: number
  pagina_fin_titulo: number
  articulos_sin_capitulo?: Articulo[]
  capitulos: Capitulo[]
  ordinal?: string
  titulo_texto?: string
  pages?: number[]
  anchor?: string
  articulos?: Articulo[]
}

export type DisposicionItem = {
  numero: string
  texto_encabezado: string
  pagina_disposicion: number
  pages?: number[]
  anchor?: string
}

export type MentalOutline = {
  metadata: {
    document_title: string
    source: string
    language: string
    generated_at: string
  }
  front_matter: {
    preambulo: FrontMatterEntry
    exposicion_motivos: FrontMatterEntry
  }
  titulos: Titulo[]
  disposiciones: {
    adicionales: DisposicionItem[]
    transitorias: DisposicionItem[]
    derogatorias: DisposicionItem[]
    finales: DisposicionItem[]
  }
}
```

**Archivo:** `types/mentalOutline.ts`  
**Endpoints que devuelven:** 
- `/api/mental-outline` (POST) - Genera esquema mental básico
- `/api/mental-outline/generate-direct` (POST) - Genera esquema desde índice
- `/api/mental-outline/generate-from-bookmarks` (POST) - Genera esquema desde bookmarks del PDF
- `/api/mental-outline/chunk` (POST) - Genera esquema por chunks (procesamiento incremental)

---

## b) Endpoints de Generación del Esquema Mental

### `/api/mental-outline` (POST)

Genera un esquema mental básico desde las páginas del PDF.

**Parámetros de entrada:**
```typescript
{
  lawName: string
  source: string
  pagesFull: Array<{ num: number; text: string }>
}
```

**Respuesta:**
```typescript
{
  ok: boolean
  outline: MentalOutline
}
```

### `/api/mental-outline/generate-direct` (POST)

Genera un esquema mental directamente desde el índice del documento.

**Parámetros de entrada:**
```typescript
{
  lawName: string
  source: string
  pagesFull: Array<{ num: number; text: string }>
}
```

**Respuesta:**
```typescript
{
  ok: boolean
  schema: MentalOutline
}
```

### `/api/mental-outline/generate-from-bookmarks` (POST)

Genera un esquema mental desde los bookmarks del PDF.

**Parámetros de entrada:**
```typescript
{
  lawName: string
  source: string
  bookmarks: Array<BookmarkItem>
}
```

**Respuesta:**
```typescript
{
  ok: boolean
  schema: MentalOutline
  stats?: {
    titulos: number
    capitulos: number
    secciones: number
    articulos: number
    disposiciones: number
  }
}
```

### `/api/mental-outline/chunk` (POST)

Genera un esquema mental procesando el PDF por chunks (páginas).

**Parámetros de entrada:**
```typescript
{
  lawName: string
  source: string
  schema: MentalOutline | null  // Esquema acumulado (null en el primer chunk)
  metadata: {
    document_title: string
    source: string
    language: string
    generated_at: string
  }
  pagesFull: Array<{ num: number; text: string }>  // Chunk de páginas
  indice?: string  // Texto del índice detectado
}
```

**Respuesta:**
```typescript
{
  ok: boolean
  schema: MentalOutline
}
```

**Nota:** Este endpoint se llama múltiples veces en secuencia, acumulando el esquema en cada llamada.

---

## c) Fichas de Artículos

### Tipo TypeScript de Datos de Ficha

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

### Endpoint: `/api/mental-outline/generate-fiche` (POST)

Genera una ficha formateada de un artículo.

**Parámetros de entrada:**
```typescript
{
  articleAnchor: string
  lawName?: string
  mentalOutline: MentalOutline
  articleData: {
    numero_articulo?: string
    numero?: string
    rubrica_articulo?: string
    articulo_texto?: string
    texto_completo?: string  // Prioridad 1: Texto completo extraído por IA
    texto_articulo?: string  // Prioridad 2: Texto del artículo
    resumen?: string         // Prioridad 3: Resumen generado por IA (fallback)
  }
}
```

**Respuesta:**
```typescript
{
  ok: boolean
  fiche: string  // Texto formateado de la ficha
  format: 'text'
}
```

### Estructura de la Ficha de Artículo

La ficha se genera en formato de texto plano con la siguiente estructura:

```
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

**Características:**
- Respeta los saltos de línea (`\n`) que vienen de la IA
- Incluye contexto jerárquico (Título, Capítulo, Sección) si está disponible
- Elimina la rúbrica del inicio del texto si coincide con el texto completo
- Prioridad del texto: `texto_completo` → `texto_articulo` → `resumen`

**Archivo de formato:** `lib/outline/formatFiche.ts`  
**Función:** `formatFiche(data: FicheData): string`

---

## d) Fichas de Disposiciones

### Tipo TypeScript de Datos de Ficha

```ts
// lib/outline/formatFicheDisposition.ts
export type FicheDispositionData = {
  lawName: string
  dispositionNumber: string
  dispositionRubrica: string
  dispositionText: string
  dispositionType: 'adicionales' | 'transitorias' | 'derogatorias' | 'finales'
}
```

### Endpoint: `/api/mental-outline/generate-fiche-disposition` (POST)

Genera una ficha formateada de una disposición.

**Parámetros de entrada:**
```typescript
{
  dispositionAnchor: string
  lawName?: string
  mentalOutline: MentalOutline
  dispositionData: {
    tipo: string  // "Adicional", "Transitoria", "Derogatoria", "Final"
    numero?: string
    numero_disposicion?: string
    texto_encabezado?: string
    rubrica_disposicion?: string
    fullText?: string        // Prioridad 1: Texto completo extraído por IA
    texto_completo?: string  // Prioridad 2: Texto completo de la disposición
    resumen?: string         // Prioridad 3: Resumen generado por IA (fallback)
  }
  dispositionType?: 'adicionales' | 'transitorias' | 'derogatorias' | 'finales'
}
```

**Respuesta:**
```typescript
{
  ok: boolean
  fiche: string  // Texto formateado de la ficha
  format: 'text'
}
```

### Estructura de la Ficha de Disposición

La ficha se genera en formato de texto plano con la siguiente estructura:

```
═══════════════════════════════════════════════════════════
                  FICHA DE DISPOSICIÓN
═══════════════════════════════════════════════════════════

📄 Documento: [Nombre del documento]

───────────────────────────────────────────────────────────

📌 Disposición [Tipo] [número]

───────────────────────────────────────────────────────────

Texto de la disposición:

[Texto formateado de la disposición respetando \n de la IA]

───────────────────────────────────────────────────────────
```

**Características:**
- Respeta los saltos de línea (`\n`) que vienen de la IA
- Mantiene la indentación (espacios al inicio de las líneas)
- **No incluye contexto jerárquico** (a diferencia de los artículos)
- Incluye el tipo de disposición (Adicional, Transitoria, Derogatoria, Final)
- Elimina la rúbrica del inicio del texto si coincide con el texto completo
- Prioridad del texto: `fullText` → `texto_completo` → `resumen`

**Archivo de formato:** `lib/outline/formatFicheDisposition.ts`  
**Función:** `formatFicheDisposition(data: FicheDispositionData): string`

---

## e) Exportación de Fichas

### Descarga de Fichas

Las fichas se descargan directamente desde el frontend en dos formatos:

**1. Descarga como TXT:**
```typescript
const blob = new Blob([fiche], { type: 'text/plain;charset=utf-8' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = `Ficha_Articulo_${art.numero.replace(/\s+/g, '_')}.txt`  // Para artículos
// o
a.download = `Ficha_Disposicion_${tipoLabel}_${number || 'sin_numero'}.txt`  // Para disposiciones
a.click()
```

**2. Descarga como PDF:**
- Usa `pdf-lib` para generar el PDF
- Convierte el texto de la ficha a formato PDF
- Descarga como `Ficha_Articulo_{numero}.pdf` o `Ficha_Disposicion_{tipo}_{numero}.pdf`

**Ubicación en código:** `app/generate/page.tsx` (componentes `ArticleDetail` y `DispositionDetail`)

---

## f) Límites y Validaciones

### Esquema Mental

| Límite | Valor | Notas |
|--------|-------|-------|
| **Mínimo de páginas** | 1 | Valida que `pagesFull.length > 0` |
| **Máximo de páginas** | ❌ Sin límite | Depende de la capacidad del servidor |
| **Tamaño de chunk** | 3, 2, 1 páginas | `MENTAL_OUTLINE_CHUNK_SIZES = [3, 2, 1]` (procesamiento adaptativo) |
| **Timeout** | ❌ Sin límite explícito | Depende del timeout del endpoint (por defecto 120s) |

### Fichas

| Límite | Valor | Notas |
|--------|-------|-------|
| **Mínimo de texto** | 0 | Puede generar ficha sin texto (muestra "(Texto no disponible)") |
| **Máximo de texto** | ❌ Sin límite | Depende de la capacidad del servidor/cliente |
| **Validaciones requeridas** | `articleAnchor` / `dispositionAnchor`, `mentalOutline`, `articleData` / `dispositionData` | Todos son requeridos |

---

## g) Convención de Nombres de Archivo

### Fichas de Artículos

- **TXT:** `Ficha_Articulo_{numero}.txt`
  - Ejemplo: `Ficha_Articulo_1.txt`, `Ficha_Articulo_5.txt`
- **PDF:** `Ficha_Articulo_{numero}.pdf`
  - Ejemplo: `Ficha_Articulo_1.pdf`, `Ficha_Articulo_5.pdf`

**Ubicación en código:** `app/generate/page.tsx` (líneas ~553, ~793)

### Fichas de Disposiciones

- **TXT:** `Ficha_Disposicion_{tipo}_{numero}.txt`
  - Ejemplo: `Ficha_Disposicion_Adicional_primera.txt`, `Ficha_Disposicion_Transitoria_1.txt`
- **PDF:** `Ficha_Disposicion_{tipo}_{numero}.pdf`
  - Ejemplo: `Ficha_Disposicion_Adicional_primera.pdf`, `Ficha_Disposicion_Transitoria_1.pdf`

**Ubicación en código:** `app/generate/page.tsx` (líneas ~1080, ~1200+)

**Nota:** Los números se normalizan reemplazando espacios por guiones bajos (`replace(/\s+/g, '_')`).

---

## h) Ejemplos de Estructura

### Ejemplo de MentalOutline

```json
{
  "metadata": {
    "document_title": "Ley Orgánica 3/2018, de 5 de diciembre",
    "source": "BOE núm. 294, de 6 de diciembre de 2018",
    "language": "es",
    "generated_at": "2024-01-15"
  },
  "front_matter": {
    "preambulo": {
      "present": true,
      "anchor": "preambulo",
      "pages": [1, 2]
    },
    "exposicion_motivos": {
      "present": true,
      "anchor": "exposicion-motivos",
      "pages": [3, 4, 5]
    }
  },
  "titulos": [
    {
      "codigo_titulo": "TÍTULO I",
      "subtitulo_titulo": "Disposiciones generales",
      "pagina_inicio_titulo": 6,
      "pagina_fin_titulo": 50,
      "ordinal": "I",
      "articulos_sin_capitulo": [],
      "capitulos": [
        {
          "codigo_capitulo": "CAPÍTULO I",
          "subtitulo_capitulo": "De los derechos fundamentales",
          "pagina_inicio_capitulo": 6,
          "pagina_fin_capitulo": 30,
          "ordinal": "I",
          "articulos_sin_seccion": [
            {
              "numero": "1",
              "articulo_texto": "Objeto de la Ley",
              "pagina_articulo": 6,
              "anchor": "art-1"
            }
          ],
          "secciones": []
        }
      ]
    }
  ],
  "disposiciones": {
    "adicionales": [
      {
        "numero": "primera",
        "texto_encabezado": "Disposición adicional primera",
        "pagina_disposicion": 100,
        "anchor": "disp-adicional-1"
      }
    ],
    "transitorias": [],
    "derogatorias": [],
    "finales": []
  }
}
```

### Ejemplo de Ficha de Artículo

```
═══════════════════════════════════════════════════════════
                    FICHA DE ARTÍCULO
═══════════════════════════════════════════════════════════

📄 Documento: Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales

Estructura:
  📑 TÍTULO I - Disposiciones generales
  📖 CAPÍTULO I - De los derechos fundamentales

───────────────────────────────────────────────────────────

📌 Artículo 1

───────────────────────────────────────────────────────────

Texto del artículo:

La presente Ley Orgánica tiene por objeto garantizar y proteger el tratamiento de los datos personales y los derechos fundamentales de las personas físicas en relación con dicho tratamiento.

1. Esta Ley Orgánica se aplica al tratamiento de datos personales realizado por:
   a) Los responsables y encargados del tratamiento establecidos en territorio español.
   b) Los responsables y encargados del tratamiento no establecidos en territorio español cuando el tratamiento se relacione con la oferta de bienes o servicios a personas físicas en territorio español.

2. La presente Ley Orgánica se aplicará sin perjuicio de lo establecido en la normativa específica sectorial.

───────────────────────────────────────────────────────────
```

### Ejemplo de Ficha de Disposición

```
═══════════════════════════════════════════════════════════
                  FICHA DE DISPOSICIÓN
═══════════════════════════════════════════════════════════

📄 Documento: Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales

───────────────────────────────────────────────────────────

📌 Disposición Adicional primera

───────────────────────────────────────────────────────────

Texto de la disposición:

La presente Ley Orgánica entrará en vigor el día siguiente al de su publicación en el Boletín Oficial del Estado.

1. Quedan derogadas todas las disposiciones de igual o inferior rango que se opongan a lo establecido en la presente Ley Orgánica.

2. Se mantendrán en vigor, en tanto no se opongan a lo establecido en la presente Ley Orgánica, las disposiciones dictadas en desarrollo de la Ley Orgánica 15/1999, de 13 de diciembre, de Protección de Datos de Carácter Personal.

───────────────────────────────────────────────────────────
```

---

## Archivos Relacionados

### Esquema Mental
- **Tipos:** `types/mentalOutline.ts`
- **Endpoints:** 
  - `app/api/mental-outline/route.ts` (si existe)
  - `app/api/mental-outline/generate-direct/route.ts`
  - `app/api/mental-outline/generate-from-bookmarks/route.ts`
  - `app/api/mental-outline/chunk/route.ts`

### Fichas de Artículos
- **Endpoint:** `app/api/mental-outline/generate-fiche/route.ts`
- **Formateo:** `lib/outline/formatFiche.ts`
- **Contexto:** `lib/outline/getArticleContext.ts`
- **Frontend:** `app/generate/page.tsx` (componente `ArticleDetail`)

### Fichas de Disposiciones
- **Endpoint:** `app/api/mental-outline/generate-fiche-disposition/route.ts`
- **Formateo:** `lib/outline/formatFicheDisposition.ts`
- **Frontend:** `app/generate/page.tsx` (componente `DispositionDetail`)

---

## Resumen de Flujo

### Esquema Mental
1. **Generación:** Cliente → `/api/mental-outline/*` → Retorna `MentalOutline`
2. **Métodos disponibles:** Básico, Directo (desde índice), Bookmarks (desde PDF), Chunks (incremental)

### Fichas
1. **Extracción:** Cliente → `/api/mental-outline/extract-article-ai` o `/api/mental-outline/extract-disposition-ai` → Extrae texto completo
2. **Generación:** Cliente → `/api/mental-outline/generate-fiche` o `/api/mental-outline/generate-fiche-disposition` → Retorna ficha formateada
3. **Descarga:** Cliente descarga directamente como TXT o PDF desde el frontend

---

# Exportación Esquema No Legal

## a) Tipo / Respuesta

El esquema no legal se genera como texto plano en el frontend y no tiene un tipo estructurado más allá de la respuesta del endpoint.

- Endpoint: `/api/non-legal-outline` (POST)
- Respuesta: `{ ok: true, title: string, outline: string }`
- Almacenamiento en cliente: `localStorage` (`tfm.nonLegalOutline`, `tfm.nonLegalTitle`)

## b) Exportación TXT

**Implementación:** `app/generate/page.tsx` (vista “solo esquema no legal”).  
**Formato:** Texto plano, se descarga desde el navegador.

- Nombre sugerido: `{titulo_sin_espacios}.txt` (ej. `Esquema_mental.txt`)
- Codificación: `text/plain;charset=utf-8`
- Contenido: `outline` tal cual (viñetas en texto plano)

## c) Exportación PDF

**Implementación:** `app/generate/page.tsx` con `pdf-lib`.  
**Formato:** A4, fuente Helvetica.

- Nombre sugerido: `{titulo_sin_espacios}.pdf`
- Características:
  - Título en negrita (HelveticaBold), sanitizado (sin emojis/pictogramas).
  - Mantiene sangrías: se calcula indentación por espacios y bullets al inicio de línea, desplazando X según nivel.
  - Viñetas normalizadas a guiones para evitar problemas de codificación.
  - Salto de página automático, margen 50 pts, alto de línea 16 pts, tamaño de fuente 12 pts.
  - Se elimina emoji 🧠 u otros pictográficos para compatibilidad WinAnsi.

## d) Límites y notas

- Sin límite explícito de tamaño del outline; depende de la memoria del navegador.
- El PDF se genera 100% en cliente; no hay endpoint de exportación para el esquema no legal.

## e) Archivos relacionados

- `app/api/non-legal-outline/route.ts` — generación del outline no legal.
- `app/generate/page.tsx` — descarga TXT/PDF e interfaz de vista “solo esquema no legal”.






