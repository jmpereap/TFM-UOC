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
**Tipo exportado desde:** `lib/qa/callModel.ts` (también se re-exporta desde `types/mcq.ts`)

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
4. **Normalización:** La dificultad se normaliza en `callModel.ts` (líneas 105-112) para manejar variaciones de escritura






