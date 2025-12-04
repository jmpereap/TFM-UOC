# Resumen: Generación del Resumen de Artículos

## Introducción

El sistema genera resúmenes automáticos de artículos legales extraídos de PDFs usando **Inteligencia Artificial (IA)**. El proceso consta de **dos etapas principales**:

1. **Extracción del artículo completo** del PDF usando IA
2. **Generación del resumen** usando IA basado en el texto completo extraído

---

## Flujo General

```
Usuario hace clic en artículo
    ↓
Frontend: ArticleDetail useEffect
    ↓
POST /api/mental-outline/extract-article-ai
    ↓
Backend: Normaliza páginas y extrae chunk (12K chars)
    ↓
IA: Extrae texto completo del artículo (callModelJSON)
    ↓
Backend: Valida respuesta y obtiene fullText
    ↓
Backend: Llama generateArticleSummaryWithAI(fullText)
    ↓
IA: Genera resumen (callModelJSON con prompt específico)
    ↓
Backend: Valida y limpia resumen (máx 1200 chars)
    ↓
Backend: Retorna {fullText, resumen, title}
    ↓
Frontend: Muestra resumen en pantalla
```

---

## Etapa 1: Frontend - Inicio del Proceso

**Ubicación**: `app/generate/page.tsx` - Componente `ArticleDetail` (líneas 203-274)

### Cuándo se Activa

- Al hacer clic en un artículo del esquema mental
- Se ejecuta un `useEffect` que se dispara cuando cambia:
  - `art.anchor` (identificador único del artículo)
  - `lawName` (nombre de la ley)
  - `mentalOutline` (esquema mental completo)

### Proceso en el Frontend

1. **Extracción del número del artículo**:
   ```typescript
   const numeroMatch = art.numero.match(/(\d+|[IVXLCDM]+|bis|ter)/i)
   const articuloNumero = numeroMatch ? numeroMatch[1] : art.numero.replace(/Art[íi]culo\s+/i, '').trim()
   ```
   - Normaliza "Artículo 2" → "2"
   - Maneja números romanos, bis, ter, etc.

2. **Obtención del nombre de la ley**:
   ```typescript
   const lawNameToUse = lawName || mentalOutline?.metadata?.document_title || mentalOutline?.metadata?.source || 'Ley'
   ```
   - Prioridad: prop `lawName` → metadata del esquema → fallback "Ley"

3. **Llamada al endpoint**:
   ```typescript
   POST /api/mental-outline/extract-article-ai
   Body: {
     lawName: string,
     articleNumber: string,
     pagesFull: PageEntry[],
     pagesFullRaw?: PageEntry[],
     articuloPagina: number,
     sourceFromBookmarks: boolean
   }
   ```

4. **Procesamiento de la respuesta**:
   - Si `data.ok && data.fullText`:
     - Guarda `data.resumen` en estado `resumen` (para mostrar)
     - Guarda `data.fullText` en `articleData.texto_completo` (para generar ficha)
     - Guarda `data.title` en `articleData.rubrica_articulo`
   - Si hay error: muestra mensaje de error

---

## Etapa 2: Backend API - Extracción y Generación

**Ubicación**: `app/api/mental-outline/extract-article-ai/route.ts`

### Endpoint: `/api/mental-outline/extract-article-ai`

Este endpoint realiza **dos operaciones principales**:
1. Extrae el texto completo del artículo usando IA
2. Genera el resumen del artículo usando IA

---

### Paso 2.1: Preparación del Texto (líneas 183-264)

#### 2.1.1. Determinación del Origen de las Páginas

El sistema determina qué páginas usar según el origen del esquema mental:

**Desde Bookmarks** (`sourceFromBookmarks = true`):
- Usa `pagesFull` directamente (números de página exactos de los bookmarks)
- `extractFromFooter = false` (no necesita extraer números del pie de página)

**Desde Método Directo** (`sourceFromBookmarks = false`):
- Usa `pagesFullRaw` si está disponible (páginas completas del PDF)
- `extractFromFooter = true` (extrae números de página del pie de página)
- Si no hay `pagesFullRaw`, usa `pagesFull` como fallback

**Extracción de Números del Pie de Página** (si `extractFromFooter = true`):
- Busca en las últimas 10 líneas de cada página
- Patrón: líneas que contienen solo un número (1-3 dígitos, < 1000)
- Filtra números que parecen años (4 dígitos > 2000) o muy grandes

#### 2.1.2. Normalización de Páginas

```typescript
const normalizedPages: PageEntry[] = sourcePages.map((entry, idx) => {
  const text = typeof entry?.text === 'string' ? entry.text : ''
  let pageNum = typeof entry?.num === 'number' ? entry.num : idx + 1
  
  if (!extractFromFooter) {
    return { num: pageNum, text: text }
  }
  
  // Extraer número del pie de página si es necesario
  // ... lógica de extracción ...
  
  return { num: pageNum, text: text }
})
```

#### 2.1.3. Construcción del Texto Completo

```typescript
const fullText = normalizedPages.map(page => page.text || '').join('\n\n')
```

- Concatena todas las páginas con doble salto de línea (`\n\n`)

#### 2.1.4. Extracción del Chunk del Artículo

**Función**: `extractChunkFromArticle()` (líneas 81-143)

**Proceso**:

1. **Eliminación de líneas del índice**:
   - Función `removeIndexLines()` (líneas 19-78):
     - Detecta líneas con muchos puntos seguidos de números (patrón de índice)
     - Detecta líneas que terminan con números de página
     - Detecta líneas con formato "Artículo X. Título... ... ... 9"
     - Elimina estas líneas del texto

2. **Búsqueda del inicio del artículo**:
   ```typescript
   const articleStartPattern = new RegExp(
     `Artículo\\s+${normalizedNum}(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.`,
     'gi'
   )
   ```
   - Busca todas las ocurrencias del patrón
   - Valida que NO sea una línea del índice
   - Usa la primera ocurrencia válida

3. **Extracción del chunk**:
   - Extrae 12,000 caracteres desde el inicio del artículo encontrado
   - Si no encuentra el artículo, extrae los primeros 12,000 caracteres del texto sin índice

4. **Limpieza final**:
   - Aplica `removeIndexLines()` nuevamente al chunk extraído
   - Asegura que no haya líneas del índice que se colaron

#### 2.1.5. Determinación del Rango de Páginas (aproximado)

```typescript
if (articuloPagina > 0) {
  const articuloPageIndex = normalizedPages.findIndex(p => p.num === articuloPagina)
  if (articuloPageIndex >= 0) {
    const startPage = Math.max(0, articuloPageIndex - 2)
    const endPage = Math.min(normalizedPages.length, articuloPageIndex + 3)
    const startPageNum = normalizedPages[startPage]?.num || articuloPagina
    const endPageNum = normalizedPages[endPage - 1]?.num || articuloPagina
    pageRange = `páginas ${startPageNum}-${endPageNum}`
  }
}
```

- Calcula un rango aproximado de páginas donde está el artículo
- Usa ±2 páginas alrededor de `articuloPagina`

---

### Paso 2.2: Extracción del Texto Completo con IA (líneas 279-322)

#### 2.2.1. Construcción del JSON de Entrada

```typescript
const inputJson = {
  lawName: lawName,
  articleNumber: normalizeArticleNumber(articleNumber),
  rawText: chunk,  // Chunk de 12K caracteres
  pageHint: pageRange  // Rango aproximado de páginas
}
```

#### 2.2.2. Construcción del Prompt para la IA

**Función**: `buildExtractionPrompt()` (líneas 146-181)

**Prompt enviado a la IA**:
```
Eres un asistente jurídico especializado en legislación española. 

Tu tarea es EXTRAER de forma precisa el texto completo de un artículo concreto de una ley 
a partir de un fragmento de texto extraído de un PDF (puede contener varios artículos seguidos).

Instrucciones IMPORTANTES:
- SOLO debes devolver la información del artículo cuyo número se indica en el campo "articleNumber" del JSON de entrada.
- El artículo comienza en la primera línea que contenga literalmente "Artículo N." (N = articleNumber) y termina JUSTO ANTES de la cabecera del siguiente artículo
  (por ejemplo "Artículo N+1.", "Artículo 3 bis.", "Artículo 10.", etc.) o de una nueva TÍTULO/CAPÍTULO/SECCIÓN/DISPOSICIÓN.
- NO debes cortar el texto del artículo cuando aparezca una referencia interna como "artículo 2.2", "artículo 3", "artículo 18.4 de la Constitución" u otras similares
  dentro de los párrafos del artículo. Esas referencias forman parte del contenido del artículo y deben conservarse.
- Devuelve SIEMPRE el texto del artículo completo, incluyendo:
  - numeración de apartados (1., 2., 3., a), b), c)…)
  - referencias a otros artículos
  - frases que continúan en la siguiente línea
- No corrijas ni reescribas el texto; respeta el contenido original lo máximo posible (solo puedes ajustar espacios o saltos de línea menores).
- La salida debe ser EXCLUSIVAMENTE un JSON válido con el esquema indicado por el usuario, sin texto adicional.

JSON de entrada:
{inputJson}

Devuelve un JSON con este esquema:
{
  "articleNumber": string,        // número de artículo solicitado, por ejemplo "2"
  "title": string | null,         // título del artículo sin el prefijo "Artículo 2.", o null si no se puede determinar
  "fullText": string,             // texto completo del artículo desde "Artículo 2." hasta justo antes del siguiente artículo o gran bloque estructural
  "startsAtIndex": number | null, // índice (0-based) dentro de rawText donde empieza "Artículo 2.", si lo has podido localizar
  "endsAtIndex": number | null,   // índice (0-based) dentro de rawText donde termina el artículo (posición del primer carácter que ya NO pertenece al artículo)
  "nextHeaderPreview": string | null // un pequeño fragmento (máx. 120 caracteres) con el texto inmediatamente posterior al artículo, si existe
}
```

#### 2.2.3. Llamada a la IA

```typescript
const aiResponse = await callModelJSON(
  prompt,
  30000, // timeout 30s
  4000, // max tokens
  {
    endpoint: 'extract-article-ai',
    articleNumber,
    lawName
  }
)
```

**Parámetros**:
- **Timeout**: 30 segundos
- **Max tokens**: 4000
- **Modelo**: `OPENAI_MODEL` (variable de entorno, por defecto `gpt-4o-mini`)

#### 2.2.4. Validación de la Respuesta

```typescript
if (!aiResponse || typeof aiResponse !== 'object') {
  throw new Error('Respuesta inválida de la IA')
}

const extractedArticle = {
  articleNumber: String(aiResponse.articleNumber || articleNumber),
  title: aiResponse.title ? String(aiResponse.title) : null,
  fullText: String(aiResponse.fullText || ''),
  startsAtIndex: typeof aiResponse.startsAtIndex === 'number' ? aiResponse.startsAtIndex : null,
  endsAtIndex: typeof aiResponse.endsAtIndex === 'number' ? aiResponse.endsAtIndex : null,
  nextHeaderPreview: aiResponse.nextHeaderPreview ? String(aiResponse.nextHeaderPreview) : null
}
```

- Valida que la respuesta sea un objeto válido
- Extrae y normaliza todos los campos
- Usa valores por defecto si faltan campos

---

### Paso 2.3: Generación del Resumen (líneas 324-373)

#### 2.3.1. Validación Inicial

```typescript
const textoCompleto = extractedArticle.fullText.trim()
const rubricaArticulo = extractedArticle.title || ''
const numeroArticulo = extractedArticle.articleNumber

if (textoCompleto && textoCompleto.length > 0) {
  // Generar resumen
} else {
  // Error: no hay texto completo
}
```

- Si el texto tiene menos de 20 caracteres: usa el texto completo directamente como resumen
- Si el texto tiene 20+ caracteres: procede a generar resumen con IA

#### 2.3.2. Llamada a `generateArticleSummaryWithAI()`

```typescript
if (textoCompleto.length < 20) {
  resumen = textoCompleto
} else {
  try {
    resumen = await generateArticleSummaryWithAI(textoCompleto, rubricaArticulo, numeroArticulo)
    
    // Validar y limpiar el resumen
    if (resumen) {
      resumen = resumen.replace(/\s+/g, ' ').trim()
      if (resumen.length < 20 || !/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(resumen)) {
        resumen = ''
      }
    }
  } catch (error: any) {
    // Si hay error, usar el texto completo como resumen
    resumen = textoCompleto
  }
}
```

**Parámetros pasados**:
- `textoCompleto`: Texto completo del artículo extraído por IA
- `rubricaArticulo`: Título/rúbrica del artículo (puede ser null)
- `numeroArticulo`: Número del artículo (ej: "2")

#### 2.3.3. Fallback Final

```typescript
// Si el resumen está vacío pero hay texto completo, usar el texto completo como resumen
if (!resumen && textoCompleto && textoCompleto.length > 0) {
  resumen = textoCompleto
}
```

- Si el resumen está vacío después de la generación: usa el texto completo como resumen

#### 2.3.4. Respuesta al Frontend

```typescript
return NextResponse.json({
  ok: true,
  articleNumber: extractedArticle.articleNumber,
  title: extractedArticle.title,
  fullText: extractedArticle.fullText, // Texto completo para generar la ficha
  resumen: resumen || extractedArticle.fullText, // Resumen para mostrar al usuario
  startsAtIndex: extractedArticle.startsAtIndex,
  endsAtIndex: extractedArticle.endsAtIndex,
  nextHeaderPreview: extractedArticle.nextHeaderPreview
})
```

---

## Etapa 3: Generación del Resumen con IA

**Ubicación**: `lib/utils/articleSummary.ts` - Función `generateArticleSummaryWithAI()`

### Paso 3.1: Validación Inicial (líneas 16-18)

```typescript
if (!textoCompleto || textoCompleto.trim().length < 20) {
  return ''
}
```

- Si el texto tiene menos de 20 caracteres: retorna resumen vacío

### Paso 3.2: Limpieza del Texto (líneas 21-38)

```typescript
// Limpiar el patrón "Página X" del texto antes de enviarlo a la IA
let textoLimpio = textoCompleto.replace(/P[áa]gina\s+\d+/gi, '').trim()
textoCompleto = textoLimpio
```

- Elimina patrones "Página X" o "Pág. X" del texto
- Preserva el resto del contenido
- Logging del texto antes y después de la limpieza

### Paso 3.3: Validación de Longitud (líneas 49-58)

```typescript
if (textoCompleto.length < 100) {
  logEvent('articleSummary.ai.skip_short_text', {
    numeroArticulo: numeroArticulo,
    textoLength: textoCompleto.length,
    reason: 'Texto demasiado corto para resumir'
  })
  return ''
}
```

- Si el texto tiene menos de 100 caracteres: retorna resumen vacío (no tiene sentido resumir)

### Paso 3.4: Construcción del Prompt (líneas 61-82)

**Prompt enviado a la IA**:
```
Eres un experto en derecho español. Resume de forma clara y coherente el siguiente artículo legal.

${rubricaArticulo ? `Rúbrica: ${rubricaArticulo}\n\n` : ''}${numeroArticulo ? `Artículo ${numeroArticulo}\n\n` : ''}Texto del artículo:

${textoCompleto}

IMPORTANTE:
- NO INVENTES contenido. Solo resume lo que está escrito en el texto.
- Si el texto es demasiado corto o no tiene suficiente contenido para resumir, responde con {"resumen": ""} (resumen vacío).
- Si el texto no tiene apartados numerados o estructura compleja, simplemente parafrasea el contenido sin añadir información que no esté en el texto original.

Genera un resumen completo y detallado (máximo 1200 caracteres) que:
1. Sea coherente y bien estructurado
2. Capture TODOS los puntos principales del artículo (solo lo que está en el texto)
3. Incluya los apartados numerados (1., 2., 3., etc.) y sus contenidos principales
4. Incluya las letras (a), b), c), etc.) si son relevantes
5. Use lenguaje claro y preciso
6. Puede perder el formato original si es necesario para mayor claridad
7. NO añadas información que no esté explícitamente en el texto original

Responde SOLO con un objeto JSON que tenga un campo "resumen" con el texto del resumen. Si el texto no es resumible, usa {"resumen": ""}. Ejemplo: {"resumen": "Texto del resumen aquí"}
```

**Características del prompt**:
- Incluye la rúbrica si está disponible
- Incluye el número del artículo
- Enfatiza NO inventar contenido
- Especifica máximo 1200 caracteres
- Instruye a incluir apartados numerados y letras
- Formato de respuesta: JSON con campo `resumen`

### Paso 3.5: Llamada a la IA (líneas 84-93)

```typescript
const response = await callModelJSON(
  prompt,
  30000, // timeout de 30 segundos
  1500, // max tokens para el resumen
  {
    endpoint: 'article-summary-ai',
    numeroArticulo: numeroArticulo,
    textoLength: textoCompleto.length
  }
)
```

**Parámetros**:
- **Timeout**: 30 segundos
- **Max tokens**: 1500
- **Modelo**: `OPENAI_MODEL` (variable de entorno, por defecto `gpt-4o-mini`)

### Paso 3.6: Extracción del Resumen (líneas 96-108)

```typescript
let resumen = ''
if (response && typeof response === 'object') {
  // Buscar el campo 'resumen' en la respuesta
  resumen = (response as any).resumen || (response as any).summary || ''
} else if (typeof response === 'string') {
  // Si es string, intentar parsearlo
  try {
    const parsed = JSON.parse(response)
    resumen = parsed.resumen || parsed.summary || response
  } catch {
    resumen = response
  }
}
```

- Busca el campo `resumen` o `summary` en la respuesta JSON
- Si es string, intenta parsearlo como JSON
- Si falla, usa el string directamente

### Paso 3.7: Validación y Limpieza (líneas 111-135)

#### 3.7.1. Validación de Longitud Mínima

```typescript
resumen = resumen.trim()
if (resumen.length < 20) {
  logEvent('articleSummary.ai.short_response', {
    numeroArticulo: numeroArticulo,
    resumenLength: resumen.length,
    response: JSON.stringify(response)
  })
  return ''
}
```

- Si el resumen tiene menos de 20 caracteres: retorna vacío (probable error)

#### 3.7.2. Limpieza de Longitud Máxima

```typescript
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

- Si el resumen excede 1200 caracteres:
  - Busca el último punto antes de 1200 caracteres
  - Si no hay punto cercano (> 600 chars), busca punto y coma
  - Si no hay ninguno, trunca en 1200 con "..."

#### 3.7.3. Logging

```typescript
logEvent('articleSummary.ai.output', {
  numeroArticulo: numeroArticulo,
  resumenLength: resumen.length,
  resumen: resumen
})
```

- Registra el resumen generado para debugging

### Paso 3.8: Manejo de Errores (líneas 144-152)

```typescript
catch (error: any) {
  logEvent('articleSummary.ai.error', {
    numeroArticulo: numeroArticulo,
    error: error.message || String(error),
    textoLength: textoCompleto.length
  })
  console.error('Error generando resumen con IA:', error)
  return ''
}
```

- Si hay error: retorna resumen vacío
- Registra el error en logs

---

## Características Importantes

### 1. No Inventa Contenido

- El prompt indica explícitamente: **"NO INVENTES contenido. Solo resume lo que está escrito"**
- La IA está instruida para no añadir información que no esté en el texto original
- Si el texto es demasiado corto, la IA puede retornar resumen vacío

### 2. Preserva Estructura

- El prompt instruye a incluir apartados numerados (1., 2., 3., etc.)
- Instruye a incluir letras (a), b), c), etc.) si son relevantes
- Mantiene la estructura del artículo en el resumen

### 3. Fallbacks Múltiples

- Si el texto es muy corto (< 20 chars): usa el texto completo como resumen
- Si hay error en la IA: usa el texto completo como resumen
- Si el resumen es inválido (< 20 chars): usa el texto completo como resumen
- Si la IA retorna vacío: usa el texto completo como resumen

### 4. Límites y Parámetros

- **Resumen máximo**: 1200 caracteres
- **Chunk de extracción**: 12,000 caracteres
- **Timeout por llamada a IA**: 30 segundos
- **Max tokens para extracción**: 4000
- **Max tokens para resumen**: 1500
- **Longitud mínima para resumir**: 100 caracteres
- **Longitud mínima del resumen**: 20 caracteres

### 5. Logging Extensivo

El sistema registra eventos en cada etapa:

- `mentalOutline.extractArticleAI.request`: Inicio de extracción
- `mentalOutline.extractArticleAI.summary.request`: Inicio de generación de resumen
- `mentalOutline.extractArticleAI.summary.response`: Resumen generado
- `mentalOutline.extractArticleAI.summary.error`: Error en generación
- `articleSummary.texto_limpio`: Texto limpio antes de IA
- `articleSummary.ai.input`: Input a la IA
- `articleSummary.ai.output`: Output de la IA
- `articleSummary.ai.error`: Errores de la IA
- `articleSummary.ai.short_response`: Resumen muy corto
- `articleSummary.ai.skip_short_text`: Texto demasiado corto para resumir

### 6. Logging Detallado en Archivo

El endpoint genera un archivo JSON de log con toda la información:

```typescript
const logData = {
  timestamp: new Date().toISOString(),
  source: lawName,
  articleNumber: articleNumber,
  articuloPagina: articuloPagina,
  pagesRange: pageRange,
  inputJson: inputJson,
  aiResponse: aiResponse,
  extractedArticle: extractedArticle,
  resumen: resumen,
  chunkLength: chunk.length,
  chunkPreview: chunk.substring(0, 500),
  fullTextLength: extractedArticle.fullText.length,
  fullTextPreview: extractedArticle.fullText.substring(0, 500),
  resumenLength: resumen.length,
  resumenPreview: resumen.substring(0, 300)
}
```

- Archivo: `logs/extract-article-ai-{timestamp}.json`
- Contiene toda la información del proceso para debugging

---

## Archivos Clave

- **`app/generate/page.tsx`** (líneas 203-274): Componente `ArticleDetail` que inicia el proceso
- **`app/api/mental-outline/extract-article-ai/route.ts`**: Endpoint principal que extrae el artículo y genera el resumen
- **`lib/utils/articleSummary.ts`**: Función `generateArticleSummaryWithAI()` que genera el resumen con IA
- **`lib/qa/callModel.ts`**: Función `callModelJSON()` para llamar a la IA (OpenAI)

---

## Configuración

### Variables de Entorno

- **`OPENAI_API_KEY`**: Clave de API de OpenAI
- **`OPENAI_BASE_URL`**: URL base de la API (opcional, por defecto usa OpenAI)
- **`OPENAI_MODEL`**: Modelo a usar (por defecto `gpt-4o-mini`)

### Parámetros de la IA

- **Timeout para extracción**: 30 segundos
- **Max tokens para extracción**: 4000
- **Timeout para resumen**: 30 segundos
- **Max tokens para resumen**: 1500
- **Max caracteres del resumen**: 1200

### Parámetros de Extracción

- **Tamaño del chunk**: 12,000 caracteres
- **Longitud mínima para resumir**: 100 caracteres
- **Longitud mínima del resumen**: 20 caracteres

---

## Casos Especiales

### Artículo No Encontrado en el Chunk

- Si la IA no encuentra el artículo en el chunk de 12K caracteres:
  - La IA puede retornar `fullText` vacío o con contenido parcial
  - El sistema valida que `fullText` tenga contenido
  - Si está vacío, puede usar el chunk completo como fallback

### Artículo Muy Corto

- Si `textoCompleto.length < 20`: usa el texto completo como resumen
- Si `textoCompleto.length < 100`: la IA puede retornar resumen vacío, se usa texto completo

### Error en la Extracción con IA

- Si la IA falla al extraer el artículo: retorna error 500
- El frontend muestra el mensaje de error al usuario

### Error en la Generación del Resumen

- Si la IA falla al generar el resumen: usa el texto completo como resumen
- Si la IA retorna resumen vacío: usa el texto completo como resumen
- Si la IA indica "contenido insuficiente": usa el texto completo como resumen

### Artículo con Solo Rúbrica

- Si el artículo solo tiene rúbrica (sin cuerpo):
  - `fullText` contendrá solo la rúbrica
  - El resumen será la rúbrica (si es suficientemente larga) o el texto completo

---

## Mejoras Futuras

- [ ] Cachear resúmenes generados para evitar regenerar
- [ ] Permitir regenerar resumen con diferentes parámetros
- [ ] Mejorar detección de artículos en PDFs mal formateados
- [ ] Añadir opción de resumen extractivo como alternativa
- [ ] Mejorar manejo de artículos con tablas o listas complejas
- [ ] Aumentar el tamaño del chunk si el artículo es muy largo
- [ ] Implementar retry automático si la IA falla
- [ ] Añadir validación de calidad del resumen generado

---

## Notas Técnicas

### Por qué se usa IA para Extraer el Artículo

El método anterior (extracción manual con regex) tenía problemas:
- Difícil manejar artículos que cruzan páginas
- Problemas con cabeceras y pies de página
- Dificultad para detectar el final del artículo

La IA resuelve estos problemas:
- Puede entender el contexto y estructura del documento
- Identifica correctamente el inicio y fin del artículo
- Maneja mejor las referencias internas (no corta en "artículo 2.2")

### Por qué se Genera el Resumen con IA

- **Calidad**: Los resúmenes generados por IA son más coherentes y estructurados
- **Comprensión**: La IA entiende el contexto jurídico y puede resumir mejor
- **Estructura**: Preserva mejor la estructura del artículo (apartados, letras)
- **Flexibilidad**: Puede adaptarse a diferentes tipos de artículos

### Limitaciones Actuales

- **Dependencia de IA**: Si la IA falla, se usa el texto completo (menos útil)
- **Costo**: Cada artículo requiere 2 llamadas a la IA (extracción + resumen)
- **Tiempo**: Puede tardar hasta 60 segundos (30s extracción + 30s resumen)
- **Tamaño del chunk**: Si el artículo es muy largo (> 12K chars), puede no capturarse completo
