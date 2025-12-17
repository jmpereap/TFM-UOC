# Resumen: Generación del Resumen de Disposiciones

## Introducción

El sistema genera resúmenes automáticos de disposiciones legales extraídas de PDFs usando **Inteligencia Artificial (IA)**. El proceso consta de **dos etapas principales**:

1. **Extracción de la disposición completa** del PDF usando IA
2. **Generación del resumen** usando IA basado en el texto completo extraído

---

## Flujo General

```
Usuario hace clic en disposición
    ↓
Frontend: DispositionDetail useEffect
    ↓
POST /api/mental-outline/extract-disposition-ai
    ↓
Backend: Normaliza páginas y extrae chunk (12K chars)
    ↓
IA: Extrae texto completo de la disposición (callModelJSON)
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

**Ubicación**: `app/generate/page.tsx` - Componente `DispositionDetail` (líneas 863-950)

### Cuándo se Activa

- Al hacer clic en una disposición del esquema mental
- Se ejecuta un `useEffect` que se dispara cuando cambia:
  - `disposicion.anchor` (identificador único de la disposición)
  - `tipo` (tipo de disposición: adicionales, transitorias, derogatorias, finales)
  - `lawName` (nombre de la ley)
  - `mentalOutline` (esquema mental completo)
  - `pagesFull`, `pagesFullRaw`, `sourceFromBookmarks`

### Proceso en el Frontend

1. **Extracción del número de la disposición**:
   ```typescript
   const numeroDisposicion = disposicion.numero?.replace(/\?/g, '').trim() || ''
   ```
   - Normaliza el número de la disposición (ej: "primera", "1", etc.)
   - Elimina caracteres de interrogación si existen

2. **Determinación del tipo de disposición**:
   ```typescript
   const tipoDisposicion =
     tipo === 'adicionales' ? 'Adicional'
     : tipo === 'transitorias' ? 'Transitoria'
     : tipo === 'derogatorias' ? 'Derogatoria'
     : 'Final'
   ```
   - Convierte el tipo del esquema mental a formato legible

3. **Obtención del nombre de la ley**:
   ```typescript
   const lawNameToUse = lawName || mentalOutline?.metadata?.document_title || mentalOutline?.metadata?.source || 'Ley'
   ```
   - Prioridad: prop `lawName` → metadata del esquema → fallback "Ley"

4. **Llamada al endpoint**:
   ```typescript
   POST /api/mental-outline/extract-disposition-ai
   Body: {
     lawName: string,
     dispositionType: string,        // "Adicional", "Transitoria", "Derogatoria", "Final"
     dispositionNumber: string,      // número/ordinal de la disposición
     pagesFull: PageEntry[],
     pagesFullRaw?: PageEntry[],
     disposicionPagina: number,
     sourceFromBookmarks: boolean
   }
   ```

5. **Procesamiento de la respuesta**:
   - Si `data.ok && data.fullText`:
     - Guarda `data.resumen` en estado `resumen` (para mostrar)
     - Guarda `data.fullText` en estado `fullText` (para generar ficha)
   - Si hay error: muestra mensaje de error

---

## Etapa 2: Backend API - Extracción y Generación

**Ubicación**: `app/api/mental-outline/extract-disposition-ai/route.ts`

### Endpoint: `/api/mental-outline/extract-disposition-ai`

Este endpoint realiza **dos operaciones principales**:
1. Extrae el texto completo de la disposición usando IA
2. Genera el resumen de la disposición usando IA

---

### Paso 2.1: Preparación del Texto (líneas 181-275)

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

#### 2.1.4. Extracción del Chunk de la Disposición

**Función**: `extractChunkFromDisposition()` (líneas 67-139)

**Proceso**:

1. **Eliminación de líneas del índice**:
   - Función `removeIndexLines()` (líneas 22-65):
     - Detecta líneas con muchos puntos seguidos de números (patrón de índice)
     - Detecta líneas que terminan con números de página
     - Detecta líneas con formato "Disposición [Tipo] [Número]... ... ... 9"
     - Elimina estas líneas del texto

2. **Búsqueda del inicio de la disposición**:
   ```typescript
   // Si tiene número
   dispositionStartPattern = new RegExp(
     `Disposici[óo]n\\s+${normalizedType}\\s+${normalizedNum}(?:\\s*\\.)?`,
     'gi'
   )
   
   // Si no tiene número
   dispositionStartPattern = new RegExp(
     `Disposici[óo]n\\s+${normalizedType}(?:\\s*\\.)?`,
     'gi'
   )
   ```
   - Busca todas las ocurrencias del patrón
   - Valida que NO sea una línea del índice
   - Usa la primera ocurrencia válida
   - Maneja disposiciones con y sin número

3. **Extracción del chunk**:
   - Extrae 12,000 caracteres desde el inicio de la disposición encontrada
   - Si no encuentra la disposición, extrae los primeros 12,000 caracteres del texto sin índice

4. **Limpieza final**:
   - Aplica `removeIndexLines()` nuevamente al chunk extraído
   - Asegura que no haya líneas del índice que se colaron

#### 2.1.5. Determinación del Rango de Páginas (aproximado)

```typescript
if (disposicionPagina > 0) {
  const disposicionPageIndex = normalizedPages.findIndex(p => p.num === disposicionPagina)
  if (disposicionPageIndex >= 0) {
    const startPage = Math.max(0, disposicionPageIndex - 2)
    const endPage = Math.min(normalizedPages.length, disposicionPageIndex + 3)
    const startPageNum = normalizedPages[startPage]?.num || disposicionPagina
    const endPageNum = normalizedPages[endPage - 1]?.num || disposicionPagina
    pageRange = `páginas ${startPageNum}-${endPageNum}`
  }
}
```

- Calcula un rango aproximado de páginas donde está la disposición
- Usa ±2 páginas alrededor de `disposicionPagina`

---

### Paso 2.2: Extracción del Texto Completo con IA (líneas 277-324)

#### 2.2.1. Construcción del JSON de Entrada

```typescript
const inputJson = {
  lawName: lawName,
  dispositionType: dispositionType,      // "Adicional", "Transitoria", etc.
  dispositionNumber: dispositionNumber || '',  // número/ordinal o vacío
  rawText: chunk,  // Chunk de 12K caracteres
  pageHint: pageRange  // Rango aproximado de páginas
}
```

#### 2.2.2. Construcción del Prompt para la IA

**Función**: `buildExtractionPrompt()` (líneas 141-179)

**Prompt enviado a la IA**:
```
Eres un asistente jurídico especializado en legislación española. 

Tu tarea es EXTRAER de forma precisa el texto completo de una disposición concreta de una ley 
a partir de un fragmento de texto extraído de un PDF (puede contener varias disposiciones seguidas).

Instrucciones IMPORTANTES:
- SOLO debes devolver la información de la disposición cuyo tipo y número se indica en el campo "dispositionType" y "dispositionNumber" del JSON de entrada.
- La disposición comienza en la primera línea que contenga literalmente "Disposición [Tipo] [Número]" y termina JUSTO ANTES de la cabecera de la siguiente disposición
  (por ejemplo "Disposición Adicional segunda", "Disposición Transitoria 2", "Disposición Final", etc.) o de un nuevo TÍTULO/CAPÍTULO/SECCIÓN/ARTÍCULO.
- Si la disposición no tiene número (dispositionNumber está vacío), busca solo "Disposición [Tipo]" (ej: "Disposición Derogatoria", "Disposición Final").
- NO debes cortar el texto de la disposición cuando aparezca una referencia interna como "artículo 2.2", "artículo 3", etc.
  dentro de los párrafos de la disposición. Esas referencias forman parte del contenido y deben conservarse.
- Devuelve SIEMPRE el texto de la disposición completo, incluyendo:
  - numeración de apartados (1., 2., 3., a), b), c)…)
  - referencias a otros artículos o disposiciones
  - frases que continúan en la siguiente línea
- No corrijas ni reescribas el texto; respeta el contenido original lo máximo posible (solo puedes ajustar espacios o saltos de línea menores).
- La salida debe ser EXCLUSIVAMENTE un JSON válido con el esquema indicado por el usuario, sin texto adicional.

JSON de entrada:
{inputJson}

Devuelve un JSON con este esquema:
{
  "dispositionType": string,        // tipo de disposición solicitada (ej: "Adicional", "Transitoria", "Derogatoria", "Final")
  "dispositionNumber": string,      // número/ordinal de la disposición solicitada, o cadena vacía si no tiene número
  "title": string | null,           // título de la disposición sin el prefijo "Disposición [Tipo] [Número].", o null si no se puede determinar
  "fullText": string,               // texto completo de la disposición desde "Disposición [Tipo] [Número]." hasta justo antes de la siguiente disposición o gran bloque estructural
  "startsAtIndex": number | null,   // índice (0-based) dentro de rawText donde empieza la disposición, si lo has podido localizar
  "endsAtIndex": number | null,     // índice (0-based) dentro de rawText donde termina la disposición (posición del primer carácter que ya NO pertenece a la disposición)
  "nextHeaderPreview": string | null // un pequeño fragmento (máx. 120 caracteres) con el texto inmediatamente posterior a la disposición, si existe
}
```

#### 2.2.3. Llamada a la IA

```typescript
const aiResponse = await callModelJSON(
  prompt,
  30000, // timeout 30s
  4000, // max tokens
  {
    endpoint: 'extract-disposition-ai',
    dispositionType,
    dispositionNumber,
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

const extractedDisposition = {
  dispositionType: String(aiResponse.dispositionType || dispositionType),
  dispositionNumber: String(aiResponse.dispositionNumber || dispositionNumber),
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

### Paso 2.3: Generación del Resumen (líneas 326-380)

#### 2.3.1. Validación Inicial

```typescript
const textoCompleto = extractedDisposition.fullText.trim()
const rubricaDisposicion = extractedDisposition.title || ''
const numeroDisposicion = extractedDisposition.dispositionNumber || ''

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
    const tipoDisposicion = `${dispositionType} ${numeroDisposicion ? numeroDisposicion : ''}`.trim()
    resumen = await generateArticleSummaryWithAI(textoCompleto, rubricaDisposicion, tipoDisposicion)
    
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
- `textoCompleto`: Texto completo de la disposición extraído por IA
- `rubricaDisposicion`: Título/rúbrica de la disposición (puede ser null)
- `tipoDisposicion`: Tipo y número de la disposición (ej: "Adicional primera", "Transitoria 2", "Final")

**Nota**: Se usa la misma función `generateArticleSummaryWithAI()` que para artículos, pero con el tipo de disposición como identificador.

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
  dispositionType: extractedDisposition.dispositionType,
  dispositionNumber: extractedDisposition.dispositionNumber,
  title: extractedDisposition.title,
  fullText: extractedDisposition.fullText, // Texto completo para generar la ficha
  resumen: resumen || extractedDisposition.fullText, // Resumen para mostrar al usuario
  startsAtIndex: extractedDisposition.startsAtIndex,
  endsAtIndex: extractedDisposition.endsAtIndex,
  nextHeaderPreview: extractedDisposition.nextHeaderPreview
})
```

---

## Etapa 3: Generación del Resumen con IA

**Ubicación**: `lib/utils/articleSummary.ts` - Función `generateArticleSummaryWithAI()`

**Nota**: Las disposiciones usan la misma función de generación de resumen que los artículos. El proceso es idéntico, solo cambia el identificador pasado como tercer parámetro.

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

${rubricaDisposicion ? `Rúbrica: ${rubricaDisposicion}\n\n` : ''}${tipoDisposicion ? `Disposición ${tipoDisposicion}\n\n` : ''}Texto del artículo:

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
- Incluye el tipo y número de la disposición (ej: "Disposición Adicional primera")
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
    numeroArticulo: tipoDisposicion,  // Para disposiciones, se pasa el tipo
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
- Mantiene la estructura de la disposición en el resumen

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

- `mentalOutline.extractDispositionAI.request`: Inicio de extracción
- `mentalOutline.extractDispositionAI.summary.request`: Inicio de generación de resumen
- `mentalOutline.extractDispositionAI.summary.response`: Resumen generado
- `mentalOutline.extractDispositionAI.summary.error`: Error en generación
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
  dispositionType: dispositionType,
  dispositionNumber: dispositionNumber,
  disposicionPagina: disposicionPagina,
  pagesRange: pageRange,
  inputJson: inputJson,
  aiResponse: aiResponse,
  extractedDisposition: extractedDisposition,
  resumen: resumen,
  chunkLength: chunk.length,
  chunkPreview: chunk.substring(0, 500),
  fullTextLength: extractedDisposition.fullText.length,
  fullTextPreview: extractedDisposition.fullText.substring(0, 500),
  resumenLength: resumen.length,
  resumenPreview: resumen.substring(0, 300)
}
```

- Archivo: `logs/extract-disposition-ai-{timestamp}.json`
- Contiene toda la información del proceso para debugging

---

## Archivos Clave

- **`app/generate/page.tsx`** (líneas 863-950): Componente `DispositionDetail` que inicia el proceso
- **`app/api/mental-outline/extract-disposition-ai/route.ts`**: Endpoint principal que extrae la disposición y genera el resumen
- **`lib/utils/articleSummary.ts`**: Función `generateArticleSummaryWithAI()` que genera el resumen con IA (compartida con artículos)
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

### Disposición No Encontrada en el Chunk

- Si la IA no encuentra la disposición en el chunk de 12K caracteres:
  - La IA puede retornar `fullText` vacío o con contenido parcial
  - El sistema valida que `fullText` tenga contenido
  - Si está vacío, puede usar el chunk completo como fallback

### Disposición Muy Corta

- Si `textoCompleto.length < 20`: usa el texto completo como resumen
- Si `textoCompleto.length < 100`: la IA puede retornar resumen vacío, se usa texto completo

### Error en la Extracción con IA

- Si la IA falla al extraer la disposición: retorna error 500
- El frontend muestra el mensaje de error al usuario

### Error en la Generación del Resumen

- Si la IA falla al generar el resumen: usa el texto completo como resumen
- Si la IA retorna resumen vacío: usa el texto completo como resumen
- Si la IA indica "contenido insuficiente": usa el texto completo como resumen

### Disposición con Solo Rúbrica

- Si la disposición solo tiene rúbrica (sin cuerpo):
  - `fullText` contendrá solo la rúbrica
  - El resumen será la rúbrica (si es suficientemente larga) o el texto completo

### Disposiciones sin Número

- Algunas disposiciones no tienen número (ej: "Disposición Final", "Disposición Derogatoria"):
  - El sistema maneja `dispositionNumber` como cadena vacía
  - El patrón de búsqueda se adapta para buscar solo "Disposición [Tipo]"
  - El prompt de IA se ajusta para manejar este caso

---

## Diferencias con Artículos

### Tipos de Disposiciones

Las disposiciones tienen tipos específicos:
- **Adicional**: Disposiciones adicionales (ej: "Disposición Adicional primera")
- **Transitoria**: Disposiciones transitorias (ej: "Disposición Transitoria segunda")
- **Derogatoria**: Disposiciones derogatorias (ej: "Disposición Derogatoria única")
- **Final**: Disposiciones finales (ej: "Disposición Final")

### Numeración Variable

- Las disposiciones pueden tener números ordinales (primera, segunda, tercera) o números (1, 2, 3)
- Algunas disposiciones no tienen número (solo tipo)
- El sistema normaliza la numeración para la búsqueda

### Patrones de Búsqueda

- Los patrones de búsqueda son específicos para disposiciones:
  - Con número: `Disposición [Tipo] [Número]`
  - Sin número: `Disposición [Tipo]`

---

## Mejoras Futuras

- [ ] Cachear resúmenes generados para evitar regenerar
- [ ] Permitir regenerar resumen con diferentes parámetros
- [ ] Mejorar detección de disposiciones en PDFs mal formateados
- [ ] Añadir opción de resumen extractivo como alternativa
- [ ] Mejorar manejo de disposiciones con tablas o listas complejas
- [ ] Aumentar el tamaño del chunk si la disposición es muy larga
- [ ] Implementar retry automático si la IA falla
- [ ] Añadir validación de calidad del resumen generado
- [ ] Mejorar normalización de números ordinales (primera, segunda, etc.)

---

## Notas Técnicas

### Por qué se usa IA para Extraer la Disposición

El método anterior (extracción manual con regex) tenía problemas:
- Difícil manejar disposiciones que cruzan páginas
- Problemas con cabeceras y pies de página
- Dificultad para detectar el final de la disposición
- Variabilidad en la numeración (ordinales vs números)

La IA resuelve estos problemas:
- Puede entender el contexto y estructura del documento
- Identifica correctamente el inicio y fin de la disposición
- Maneja mejor las referencias internas (no corta en "artículo 2.2")
- Adapta la búsqueda según el tipo y número de la disposición

### Por qué se Genera el Resumen con IA

- **Calidad**: Los resúmenes generados por IA son más coherentes y estructurados
- **Comprensión**: La IA entiende el contexto jurídico y puede resumir mejor
- **Estructura**: Preserva mejor la estructura de la disposición (apartados, letras)
- **Flexibilidad**: Puede adaptarse a diferentes tipos de disposiciones

### Reutilización de Código

- Las disposiciones usan la misma función `generateArticleSummaryWithAI()` que los artículos
- Esto asegura consistencia en la calidad de los resúmenes
- El prompt se adapta automáticamente al tipo de contenido (artículo vs disposición)

### Limitaciones Actuales

- **Dependencia de IA**: Si la IA falla, se usa el texto completo (menos útil)
- **Costo**: Cada disposición requiere 2 llamadas a la IA (extracción + resumen)
- **Tiempo**: Puede tardar hasta 60 segundos (30s extracción + 30s resumen)
- **Tamaño del chunk**: Si la disposición es muy larga (> 12K chars), puede no capturarse completo
- **Numeración variable**: La normalización de números ordinales puede fallar en casos raros


