# Documentación: Resúmenes de Artículos

## a) TypeScript Type / Zod Schema del Output

### Tipo TypeScript del Response

```ts
// app/api/mental-outline/extract-article/route.ts (líneas 1121-1128)

type ExtractArticleResponse = {
  ok: boolean
  numero_articulo: string
  rubrica_articulo: string
  texto_completo: string
  resumen: string | null
  paginas: number[]
}
```

**Campos obligatorios:**
- `ok`: `boolean` - Indica si la operación fue exitosa
- `numero_articulo`: `string` - Número del artículo (ej: "1", "5", "10")
- `rubrica_articulo`: `string` - Rúbrica/título del artículo (puede estar vacía `""`)
- `texto_completo`: `string` - Texto completo del artículo extraído (nunca vacío si `ok: true`)
- `resumen`: `string | null` - Resumen generado por IA (puede ser `null` si falla la generación)
- `paginas`: `number[]` - Array de números de página donde aparece el artículo

**Campos opcionales:**
- ❌ No hay campos opcionales en el tipo actual

**Nota:** No existe un schema Zod formal para validar este tipo. La validación se hace implícitamente en el código.

### Tipo de Error Response

```ts
type ExtractArticleErrorResponse = {
  ok: false
  error: string
}
```

**Códigos de estado HTTP:**
- `200`: Éxito
- `400`: Error de validación (campos requeridos faltantes)
- `404`: Artículo no encontrado en el PDF
- `500`: Error interno del servidor

---

## b) Reglas de limpieza y umbrales

### Umbrales mínimos

**Texto del artículo:**
- **Mínimo para extracción:** No hay umbral mínimo explícito, pero se valida que el texto extraído tenga contenido
- **Mínimo para resumen con IA:** 100 caracteres (`lib/utils/articleSummary.ts` línea 51)
- **Mínimo para resumen extractivo:** 20 caracteres (`lib/utils/articleSummary.ts` línea 167)
- **Mínimo de resumen válido:** 20 caracteres (`lib/utils/articleSummary.ts` línea 112)

**Longitud máxima:**
- **Resumen generado por IA:** 1200 caracteres (truncado si excede)
- **Resumen extractivo:** 600 caracteres (truncado si excede)

### Reglas de limpieza del texto

**Función `cleanArticleText()`** (`app/api/mental-outline/extract-article/route.ts` líneas 407-425):

```ts
function cleanArticleText(text: string): string {
  return text
    // Eliminar líneas que son solo números (números de página en el pie)
    .replace(/^\s*\d+\s*$/gm, '')
    // Eliminar líneas con solo puntos y números (formato de índice)
    .replace(/^\s*\.+\s*\d+\s*$/gm, '')
    // Eliminar líneas del índice que tienen formato "Artículo X. Texto... 15"
    .replace(/^\s*Artículo\s+\d+\.\s+[^.]+\s+\.{3,}\s+\d+\s*$/gm, '')
    // Eliminar múltiples puntos consecutivos del índice (más de 5 puntos)
    .replace(/\.{6,}/g, '')
    // Normalizar saltos de línea múltiples (máximo 2 saltos seguidos)
    .replace(/\n{3,}/g, '\n\n')
    // Limpiar espacios al inicio y final de cada línea
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0) // Eliminar líneas vacías
    .join('\n')
    .trim()
}
```

**Limpieza adicional en `generateArticleSummaryWithAI()`** (`lib/utils/articleSummary.ts` líneas 23-27):

```ts
// Limpiar el patrón "Página X" del texto antes de enviarlo a la IA
let textoLimpio = textoCompleto.replace(/P[áa]gina\s+\d+/gi, '').trim()
```

### Manejo de cabeceras y pies de página

**Patrones de detección:**

```ts
// Cabeceras del BOE
const RX_BOE_HEADER = /BOLET[ÍI]N\s+OFICIAL\s+DEL\s+ESTADO|LEGISLACI[ÓO]N\s+CONSOLIDADA/gi

// Pies de página (definido en lib/legal/fragments.ts)
const RX_BOE_FOOTER = /.../ // Patrón para pies de página del BOE
```

**Reglas de eliminación:**

1. **Cabeceras:** Se eliminan SIEMPRE del texto del artículo (línea 301):
   ```ts
   textoArticulo = textoArticulo.replace(RX_BOE_HEADER, '').replace(RX_BOE_FOOTER, '').trim()
   ```

2. **Pies de página:** Se eliminan SIEMPRE del texto del artículo (línea 301)

3. **Verificación de continuación:** Si el artículo termina en una cabecera/pie, se verifica si continúa en la siguiente página:
   - Si hay un delimitador después (siguiente artículo, TÍTULO, etc.) → El artículo terminó, se elimina el pie
   - Si NO hay delimitador → El artículo continúa, NO se elimina el pie

**Función `removeFooterIfArticleEndsOnPage()`** (líneas 430-557):
- Solo elimina el pie si:
  1. El pie está en las últimas líneas del artículo
  2. Hay un delimitador después del artículo
  3. El texto extraído NO es significativamente más corto que el texto completo (diferencia < 50 caracteres)
  4. El texto extraído termina igual que el artículo completo

### Reglas de truncado del resumen

**Resumen generado por IA** (`lib/utils/articleSummary.ts` líneas 122-135):

```ts
// Limitar longitud si es muy largo (aumentado a 1200 caracteres)
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

**Resumen extractivo** (`lib/utils/articleSummary.ts` líneas 313-327):

```ts
// Si el resumen es muy largo, truncarlo inteligentemente (aumentar límite a 600)
if (resumen.length > 600) {
  // Intentar cortar en un punto lógico
  const ultimoPunto = resumen.lastIndexOf('.', 600)
  if (ultimoPunto > 300) {
    resumen = resumen.substring(0, ultimoPunto + 1)
  } else {
    // Si no hay punto cercano, buscar punto y coma o dos puntos
    const ultimoPuntoComa = resumen.lastIndexOf(';', 600)
    if (ultimoPuntoComa > 300) {
      resumen = resumen.substring(0, ultimoPuntoComa + 1)
    } else {
      resumen = resumen.substring(0, 600) + '...'
    }
  }
}
```

### Reglas de detección de contenido de índice

**Detección de contenido de índice** (líneas 806-808):

```ts
const isIndexContent = extractedData.texto_articulo && 
  ((extractedData.texto_articulo.match(/\.\s*\./g) || []).length > 5 ||
  extractedData.texto_articulo.match(/^\.\s*\./m))
```

**Criterios:**
- Más de 5 ocurrencias de puntos seguidos (`\.\s*\.`)
- Línea que empieza con puntos (`^\.\s*\.`)

Si se detecta contenido de índice, se activa el fallback para buscar en todo el PDF.

### Reglas de fallback

**Condiciones para activar fallback** (líneas 810-812):

```ts
const isTooShort = extractedData.texto_articulo && extractedData.texto_articulo.length < 50
const shouldUseFallback = !extractedData.found || isIndexContent || isTooShort
```

**Fallback activado si:**
1. El artículo no se encontró (`!extractedData.found`)
2. El contenido parece ser de índice (`isIndexContent`)
3. El texto es demasiado corto (`< 50 caracteres`)

**Estrategia de fallback:**
1. Buscar todas las ocurrencias de "Artículo X" en todo el PDF
2. Validar cada match para verificar que no sea contenido de índice
3. Extraer el artículo desde el match válido más prometedor
4. Si no se encuentra, intentar extracción normal en todo el PDF

---

## c) Ejemplos reales de salida

### Ejemplo 1: Artículo corto (solo rúbrica)

```json
{
  "ok": true,
  "numero_articulo": "1",
  "rubrica_articulo": "Objeto y ámbito de aplicación",
  "texto_completo": "Objeto y ámbito de aplicación",
  "resumen": "Objeto y ámbito de aplicación",
  "paginas": [5]
}
```

**Nota:** Cuando el artículo solo tiene rúbrica y no tiene texto adicional, el `texto_completo` es igual a la `rubrica_articulo`, y el `resumen` también usa la rúbrica (líneas 1019-1028).

### Ejemplo 2: Artículo medio (con apartados)

```json
{
  "ok": true,
  "numero_articulo": "5",
  "rubrica_articulo": "Derecho a la información",
  "texto_completo": "1. Los ciudadanos tienen derecho a acceder a la información pública en los términos establecidos en esta Ley.\n\n2. Este derecho comprende:\na) El acceso a la información contenida en documentos públicos.\nb) La obtención de copias o certificados de los documentos solicitados.\n\n3. El ejercicio de este derecho se realizará conforme a lo dispuesto en el presente Título.",
  "resumen": "Establece el derecho de los ciudadanos a acceder a la información pública. Incluye el acceso a documentos públicos y la obtención de copias o certificados. El ejercicio se realiza conforme al presente Título.",
  "paginas": [13, 14]
}
```

### Ejemplo 3: Artículo largo (múltiples apartados y subapartados)

```json
{
  "ok": true,
  "numero_articulo": "23",
  "rubrica_articulo": "Competencia territorial",
  "texto_completo": "1. La competencia territorial se determinará conforme a las siguientes reglas:\na) En materia de procedimientos administrativos, será competente el órgano del lugar donde se presente la solicitud o donde se produzca el hecho determinante.\nb) En materia de recursos, será competente el órgano superior jerárquico del que dictó el acto recurrido.\n\n2. Excepcionalmente, cuando el asunto afecte a más de una comunidad autónoma o requiera coordinación entre diferentes administraciones, será competente el órgano estatal correspondiente.\n\n3. En caso de duda sobre la competencia territorial, se aplicará el principio de proximidad, siendo competente el órgano más cercano al domicilio del interesado.\n\n4. Las normas específicas de cada materia podrán establecer reglas especiales de competencia territorial, que prevalecerán sobre las establecidas en este artículo.",
  "resumen": "Regula la competencia territorial en procedimientos administrativos y recursos. Establece que será competente el órgano del lugar donde se presente la solicitud o donde se produzca el hecho determinante. En recursos, será competente el órgano superior jerárquico. Excepcionalmente, cuando el asunto afecte a más de una comunidad autónoma, será competente el órgano estatal. En caso de duda, se aplica el principio de proximidad. Las normas específicas pueden establecer reglas especiales que prevalecen sobre las generales.",
  "paginas": [45, 46, 47]
}
```

**Características:**
- Texto completo con múltiples apartados (1., 2., 3., 4.)
- Subapartados con letras (a), b))
- Resumen generado por IA que captura todos los puntos principales
- Múltiples páginas (45-47)

### Ejemplo 4: Artículo sin resumen (fallo de IA)

```json
{
  "ok": true,
  "numero_articulo": "10",
  "rubrica_articulo": "Plazos de resolución",
  "texto_completo": "Los plazos de resolución de los procedimientos administrativos serán los establecidos en la normativa específica de cada materia. En defecto de norma específica, el plazo será de tres meses.",
  "resumen": "Los plazos de resolución de los procedimientos administrativos serán los establecidos en la normativa específica de cada materia. En defecto de norma específica, el plazo será de tres meses.",
  "paginas": [20]
}
```

**Nota:** Si el resumen falla o está vacío, se usa el `texto_completo` como resumen (líneas 1105-1114, 1126).

---

## d) Exportación (CSV/JSON) y convención de nombre

**⚠️ IMPORTANTE:** No existe funcionalidad de exportación a CSV/JSON para resúmenes de artículos.

**Funcionalidad actual:**
- El endpoint `/api/mental-outline/extract-article` solo devuelve JSON como respuesta HTTP
- No hay endpoint de exportación dedicado
- No hay función de descarga de archivos
- No hay convención de nombres de archivo

**Estructura JSON del response:**
- El JSON se devuelve directamente en el body de la respuesta HTTP
- Content-Type: `application/json`
- No hay headers de descarga (`Content-Disposition`)

**Si se implementara exportación, sugerencias:**

**Estructura CSV sugerida:**

| Columna | Descripción | Ejemplo |
|---------|-------------|---------|
| `numero_articulo` | Número del artículo | `1`, `5`, `23` |
| `rubrica_articulo` | Rúbrica/título | `Objeto y ámbito de aplicación` |
| `texto_completo` | Texto completo extraído | `1. Los ciudadanos...` |
| `resumen` | Resumen generado | `Establece el derecho...` |
| `paginas` | Páginas (separadas por `;`) | `13;14;15` |
| `longitud_texto` | Longitud del texto completo | `450` |
| `longitud_resumen` | Longitud del resumen | `120` |

**Convención de nombres sugerida:**
- **JSON:** `resumenes-articulos-{timestamp}.json` o `{lawName}-resumenes.json`
- **CSV:** `resumenes-articulos-{timestamp}.csv` o `{lawName}-resumenes.csv`

---

## Archivos relacionados

- **Endpoint principal:** `app/api/mental-outline/extract-article/route.ts`
- **Generación de resumen con IA:** `lib/utils/articleSummary.ts` → `generateArticleSummaryWithAI()`
- **Generación de resumen extractivo:** `lib/utils/articleSummary.ts` → `generateArticleSummary()`
- **Patrones de cabeceras/pies:** `lib/legal/fragments.ts` → `RX_BOE_FOOTER`
- **Llamada al modelo:** `lib/qa/callModel.ts` → `callModelJSON()`

---

## Resumen de flujo

1. **Request:** Cliente → `/api/mental-outline/extract-article` (POST)
   - Payload: `{ articuloNumero, articuloPagina, pagesFull, pagesFullRaw, sourceFromBookmarks }`

2. **Extracción:** 
   - Localizar página del artículo en el PDF
   - Extraer texto usando `extractArticleFromText()`
   - Limpiar cabeceras, pies de página y contenido de índice

3. **Generación de resumen:**
   - Si texto < 20 caracteres → usar texto completo como resumen
   - Si texto >= 20 caracteres → llamar a `generateArticleSummaryWithAI()`
   - Si IA falla → usar texto completo como resumen

4. **Response:** 
   - `{ ok: true, numero_articulo, rubrica_articulo, texto_completo, resumen, paginas }`
   - O `{ ok: false, error: "..." }` en caso de error

---

## Parámetros de configuración

**Timeout para generación de resumen:**
- `30000` ms (30 segundos) - `lib/utils/articleSummary.ts` línea 86

**Máximo de tokens para resumen:**
- `1500` tokens - `lib/utils/articleSummary.ts` línea 87

**Rango de páginas analizadas:**
- 3 páginas antes del artículo
- 8 páginas después del artículo
- Total: hasta 11 páginas analizadas (`app/api/mental-outline/extract-article/route.ts` líneas 760-761)






