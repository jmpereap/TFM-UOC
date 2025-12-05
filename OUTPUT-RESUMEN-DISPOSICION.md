### OUTPUT-RESUMEN-DISPOSICION

## a) Tipo TS / Zod del output del endpoint

### Endpoint

```ts
// app/api/mental-outline/extract-disposition-ai/route.ts
export async function POST(req: NextRequest) { ... }
```

**Salida JSON (forma efectiva):**

```ts
type ExtractDispositionAIResponse = {
  ok: boolean
  dispositionType: string          // "Adicional" | "Transitoria" | "Derogatoria" | "Final"
  dispositionNumber: string        // Texto tal cual (ej: "Disposición adicional primera", puede ser cadena vacía)
  title: string | null             // Rúbrica sin el prefijo "Disposición ...", o null
  fullText: string                 // Texto completo extraído de la disposición (puede ser cadena vacía)
  resumen: string                  // Resumen final (ver reglas de fallbacks)
  startsAtIndex: number | null     // Índice 0-based en rawText donde empieza la disposición, o null
  endsAtIndex: number | null       // Índice 0-based donde termina, o null
  nextHeaderPreview: string | null // Fragmento breve de lo que sigue a la disposición, o null
}
```

**Campos obligatorios:**

- `ok`: boolean.
- `dispositionType`: string (la que viene del payload o la IA).
- `dispositionNumber`: string (si la IA no lo devuelve, se usa el del payload).
- `fullText`: string (puede ser `''`).
- `resumen`: string (si no se genera resumen se rellena con `fullText`).

**Campos opcionales (pueden ser `null`):**

- `title`
- `startsAtIndex`
- `endsAtIndex`
- `nextHeaderPreview`

**Errores de validación:**

- Si falta `dispositionType` o `lawName`:

```ts
{ ok: false, error: 'dispositionType requerido' } // 400
{ ok: false, error: 'lawName requerido' }         // 400
```

- Si faltan páginas (`pagesFullRaw` / `pagesFull`):

```ts
{ ok: false, error: 'pagesFullRaw o pagesFull requerido' } // 400
```

- Si hay error interno/IA:

```ts
{ ok: false, error: string } // 500
```

No existe Zod schema explícito para este output; el tipo se deduce de la estructura que retorna el endpoint.

---

## b) Reglas de limpieza y umbrales

### b.1. Limpieza de índice y texto base

En el endpoint:

- Se construye `fullText` concatenando las páginas normalizadas:

```ts
const fullText = normalizedPages.map(page => page.text || '').join('\n\n')
```

- Para extraer la disposición se llama a:

```ts
let chunk = extractChunkFromDisposition(fullText, dispositionType, dispositionNumber, 12000)
chunk = removeIndexLines(chunk) // limpieza agresiva extra
```

`extractChunkFromDisposition`:

- Primero elimina líneas del índice con `removeIndexLines(fullText)`.
- Busca el patrón:
  - Con número: `Disposición [Tipo] [Número]`
  - Sin número: `Disposición [Tipo]`
- Ignora líneas que parecen índice (`... 16`, muchos puntos, etc.).
- Extrae un **chunk de 12.000 caracteres** a partir del inicio detectado.
- Vuelve a pasar `removeIndexLines` sobre ese chunk.

### b.2. Limpieza “Página X” y umbrales en el resumen

El resumen se genera con la misma función que los artículos:  
`generateArticleSummaryWithAI(textoCompleto, rubrica, tipoDisposicion)`.

Dentro de `generateArticleSummaryWithAI`:

```ts
// Mínimo para intentar resumir
if (!textoCompleto || textoCompleto.trim().length < 20) {
  return ''
}

// Limpieza de "Página X"
let textoLimpio = textoCompleto.replace(/P[áa]gina\s+\d+/gi, '').trim()
textoCompleto = textoLimpio

// Si es demasiado corto (tras limpieza): no resumir
if (textoCompleto.length < 100) {
  logEvent('articleSummary.ai.skip_short_text', { ... })
  return ''
}
```

**Validación del resumen mínimo y truncado máximo:**

```ts
resumen = resumen.trim()
if (resumen.length < 20) {
  logEvent('articleSummary.ai.short_response', { ... })
  return ''
}

if (resumen.length > 1200) {
  const ultimoPunto = resumen.lastIndexOf('.', 1200)
  if (ultimoPunto > 600) {
    resumen = resumen.substring(0, ultimoPunto + 1)
  } else {
    const ultimoPuntoComa = resumen.lastIndexOf(';', 1200)
    if (ultimoPuntoComa > 600) {
      resumen = resumen.substring(0, ultimoPuntoComa + 1)
    } else {
      resumen = resumen.substring(0, 1200) + '...'
    }
  }
}
```

**Timeouts y tokens:**

- Extracción de disposición:
  - Timeout: `30s`.
  - `max tokens`: `4000`.
- Resumen IA:
  - Timeout: `30s`.
  - `max tokens`: `1500`.

### b.3. Reglas de fallback en el endpoint

En el endpoint de disposiciones:

```ts
let resumen = ''
const textoCompleto = extractedDisposition.fullText.trim()
const rubricaDisposicion = extractedDisposition.title || ''
const numeroDisposicion = extractedDisposition.dispositionNumber || ''

if (textoCompleto && textoCompleto.length > 0) {
  if (textoCompleto.length < 20) {
    // Disposición muy corta → el “resumen” es el texto completo
    resumen = textoCompleto
  } else {
    // IA
    const tipoDisposicion = `${dispositionType} ${numeroDisposicion ? numeroDisposicion : ''}`.trim()
    resumen = await generateArticleSummaryWithAI(textoCompleto, rubricaDisposicion, tipoDisposicion)

    // Limpieza final
    if (resumen) {
      resumen = resumen.replace(/\s+/g, ' ').trim()
      if (resumen.length < 20 || !/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(resumen)) {
        resumen = ''
      }
    }
  }
} else {
  resumen = ''
}

// Fallback final
if (!resumen && textoCompleto && textoCompleto.length > 0) {
  resumen = textoCompleto
}
```

**Comportamiento resumido:**

- Disposición muy corta (< 20 chars) → `resumen = fullText`.
- IA devuelve vacío / demasiado corto / error → `resumen = fullText`.
- En la respuesta JSON:

```ts
resumen: resumen || extractedDisposition.fullText
```

---

## c) Ejemplos reales de salida

### c.1. Disposición adicional (colaboración Estado–CCAA)

**Log:** `logs/extract-disposition-ai-2025-12-01T07-47-03-777Z.json`

```json
{
  "ok": true,
  "dispositionType": "Adicional",
  "dispositionNumber": "Disposición adicional primera",
  "title": null,
  "fullText": "Disposición adicional primera. Se establece un régimen de colaboración entre el Estado y las Comunidades Autónomas para la gestión de los servicios públicos. 1. Las Comunidades Autónomas podrán asumir la gestión de los servicios públicos que se determinen por ley, en los términos que se establezcan en los respectivos Estatutos de Autonomía. 2. El Estado garantizará la financiación adecuada para el desarrollo de estas competencias, de acuerdo con los principios de solidaridad y equidad. 3. Las Comunidades Autónomas deberán rendir cuentas al Estado sobre la gestión de los servicios públicos que asuman, conforme a lo que se establezca en la normativa aplicable.",
  "resumen": "Disposición adicional primera establece un régimen de colaboración entre el Estado y las Comunidades Autónomas para la gestión de servicios públicos. 1. Las Comunidades Autónomas podrán gestionar los servicios públicos que se determinen por ley, según lo establecido en sus Estatutos de Autonomía. 2. El Estado garantizará la financiación adecuada para el desarrollo de estas competencias, siguiendo los principios de solidaridad y equidad. 3. Las Comunidades Autónomas deberán rendir cuentas al Estado sobre la gestión de los servicios públicos que asuman, conforme a la normativa aplicable.",
  "startsAtIndex": 0,
  "endsAtIndex": 370,
  "nextHeaderPreview": "TÍTULO I"
}
```

Características:

- Disposición con varios apartados numerados (1, 2, 3).
- El resumen reestructura el contenido en 3 puntos principales, manteniendo el sentido jurídico.

### c.2. Disposición transitoria segunda (aplicación gradual)

**Log:** `logs/extract-disposition-ai-2025-12-01T08-33-09-689Z.json`

```json
{
  "ok": true,
  "dispositionType": "Transitoria",
  "dispositionNumber": "Disposición transitoria segunda",
  "title": null,
  "fullText": "Disposición transitoria segunda.\nLa aplicación de lo dispuesto en el artículo 2 de esta Ley se realizará de forma gradual, de acuerdo con el calendario que se establezca en el desarrollo normativo correspondiente.\n1. En el primer año de aplicación, se llevará a cabo la adaptación de los procedimientos administrativos a las nuevas exigencias establecidas en esta Ley.\n2. En el segundo año, se procederá a la formación del personal encargado de la gestión de los procedimientos adaptados.\n3. En el tercer año, se evaluará el funcionamiento de los nuevos procedimientos y se realizarán las modificaciones necesarias para su mejora.\n4. La entrada en vigor de las disposiciones que regulen la aplicación de esta Ley se producirá en el plazo máximo de tres años desde su publicación en el Boletín Oficial del Estado.",
  "resumen": "La aplicación del artículo 2 de esta Ley se realizará de forma gradual, siguiendo un calendario normativo. 1. En el primer año, se adaptarán los procedimientos administrativos a las nuevas exigencias de la Ley. 2. En el segundo año, se formará al personal encargado de gestionar los procedimientos adaptados. 3. En el tercer año, se evaluará el funcionamiento de los nuevos procedimientos y se realizarán las modificaciones necesarias para su mejora. La entrada en vigor de las disposiciones que regulen la aplicación de esta Ley será en un plazo máximo de tres años desde su publicación en el Boletín Oficial del Estado.",
  "startsAtIndex": 0,
  "endsAtIndex": 408,
  "nextHeaderPreview": "TÍTULO I\nDe los derechos y deberes fundamentales"
}
```

Características:

- Disposición con esquema temporal en 4 puntos (adaptación, formación, evaluación, entrada en vigor).
- El resumen recoge el enfoque gradual y explicita el plazo máximo de tres años.

### c.3. Disposición transitoria primera (entrada en vigor y desarrollo reglamentario)

**Log:** `logs/extract-disposition-ai-2025-12-01T10-35-05-724Z.json`

```json
{
  "ok": true,
  "dispositionType": "Transitoria",
  "dispositionNumber": "Disposición transitoria primera",
  "title": null,
  "fullText": "Disposición transitoria primera. La entrada en vigor de la presente Ley se producirá a los seis meses de su publicación en el Boletín Oficial del Estado. No obstante, las disposiciones que requieran un desarrollo reglamentario podrán entrar en vigor en la fecha que se determine en el mismo. Las normas que se dicten en desarrollo de esta Ley deberán ser aprobadas en el plazo de un año desde su entrada en vigor. En el caso de que no se produzca dicho desarrollo reglamentario, la Ley se entenderá derogada.",
  "resumen": "1. La entrada en vigor de la Ley será a los seis meses de su publicación en el Boletín Oficial del Estado. 2. Las disposiciones que requieran desarrollo reglamentario podrán entrar en vigor en la fecha que se establezca en dicho desarrollo. 3. Las normas que se dicten para desarrollar esta Ley deberán ser aprobadas en un plazo de un año desde su entrada en vigor. 4. Si no se produce el desarrollo reglamentario, la Ley se considerará derogada.",
  "startsAtIndex": 0,
  "endsAtIndex": 292,
  "nextHeaderPreview": "TÍTULO I"
}
```

Características:

- Disposición de extensión media (~500 caracteres de `fullText`).
- El resumen convierte el texto en una enumeración clara de 4 puntos:
  - Plazo de entrada en vigor.
  - Fechas de disposiciones reglamentarias.
  - Plazo para dictar normas de desarrollo.
  - Consecuencia de falta de desarrollo (derogación).

*(En estos logs no aparece un caso de “solo rúbrica” como `fullText`, pero el código contempla ese escenario: si la disposición sólo tiene encabezado, el resumen será esa misma rúbrica o quedará vacío si es demasiado corta.)*

---

## d) Exportación (CSV/JSON) y convención de nombre

- **JSON (respuesta del endpoint)**:
  - `/api/mental-outline/extract-disposition-ai` devuelve directamente el JSON descrito en el apartado (a); esa es la “exportación” oficial de resúmenes de disposiciones.
  - El frontend usa:
    - `fullText` para generar fichas de disposición.
    - `resumen` para mostrar el resumen al usuario.

- **CSV**:
  - No existe ninguna función que exporte **resúmenes de disposiciones** a CSV.
  - Tampoco hay convención de columnas CSV específica para disposiciones.

- **Convención de nombres de archivo**:
  - El endpoint no añade cabecera `Content-Disposition`; el JSON se devuelve “en crudo”.
  - Los únicos archivos en disco asociados son **logs internos**:
    - `logs/extract-disposition-ai-YYYY-MM-DDTHH-MM-SS-SSSZ.json`
  - No hay nombre de archivo estándar para descargar estos resúmenes (a diferencia de `preguntas.csv` o las fichas TXT/PDF).


