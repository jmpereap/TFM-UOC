# Versiones, Parámetros, Fallbacks y Gestión de Errores

## 1. Versiones del Entorno

### Node.js y npm

- **Node.js**: `>=18.17.0` (requerido, especificado en `package.json`)
- **npm**: `>=9` (recomendado)

### Python y PyMuPDF

- **Python**: `3.7+` (requerido para extracción de bookmarks)
- **PyMuPDF (fitz)**: Versión instalada vía `pip install pymupdf`
  - **Instalación**: `pip install pymupdf`
  - **Comandos intentados**: `python`, `python3`, `py` (en ese orden)
  - **Script**: `scripts/extract-bookmarks.py`

### Librerías PDF (Node.js)

- **pdf-parse**: `^1.1.1`
- **pdfjs-dist**: `^4.10.38`
- **pdf2json**: `^4.0.0` (disponible pero no usado actualmente)
- **pdf-lib**: `^1.17.1`

### Framework y Core

- **Next.js**: `14.2.5`
- **React**: `18.3.1`
- **TypeScript**: `5.5.4`
- **OpenAI SDK**: `^4.71.1`

---

## 2. Parámetros Ajustables por Configuración

### Búsqueda del Índice

#### Páginas Máximas a Escanear

**Ubicación:** `app/api/mental-outline/generate-direct/route.ts`

**Parámetros hardcodeados (no configurables actualmente):**

```typescript
// Búsqueda inicial: páginas 1-5 (prioridad alta)
const pagesLow = pages.filter(p => p.num >= 1 && p.num <= 5)

// Búsqueda extendida: páginas 6-30
const pagesExtended = pages.filter(p => p.num > 5 && p.num <= 30)

// Fallback: primeras 15 páginas si no hay páginas numeradas
const pagesFallback = pages.slice(0, 15)

// Continuación del índice: hasta página 30 o 15 páginas después del inicio
const maxIndicePage = 30
const maxIndicePagesAfterStart = 15
```

**Valores actuales:**
- **Páginas prioritarias**: 1-5
- **Páginas extendidas**: 6-30
- **Páginas máximas del índice**: 30
- **Páginas después del inicio**: 15

**Nota:** Estos valores están hardcodeados y no son configurables vía variables de entorno actualmente.

#### Búsqueda en Chunks

**Ubicación:** `app/api/mental-outline/chunk/route.ts`

```typescript
// Búsqueda del índice en primeras páginas
const maxIndicePage = 10  // Hasta página 10
```

### Detección de Front Matter

**Ubicación:** `lib/legal/frontmatter.ts`

**Configuración por defecto:**

```typescript
{
  max_first_pages: 4,              // Analizar primeras 4 páginas
  min_chars_body: 700,              // Mínimo 700 caracteres para contenido
  drop_if_idx_ratio_ge: 0.45,       // Descartar si ≥45% líneas son índice
  force_drop_patterns: [            // Patrones que fuerzan descarte
    '^ÍNDICE$',
    '^SUMARIO$',
    '^LEGISLACIÓN CONSOLIDADA$',
    '^BOLETÍN OFICIAL DEL ESTADO$',
    '^PREÁMBULO$',
    '^DON\\s+JUAN\\s+CARLOS\\b',
    '^SABED:\\b',
    '^TEXTO\\s+CONSOLIDADO\\b',
  ],
  allow_if_headers_present: [       // Patrones que permiten mantener
    'Art[íi]culo\\s+1\\b',
    '^TÍTULO\\s+PRELIMINAR\\b',
  ]
}
```

**Nota:** Esta configuración es ajustable pasando un objeto `FrontCfg` a `detectFrontMatter()`, pero por defecto usa `defaultFrontmatterConfig()`.

### Normalización de Texto

**Ubicación:** `app/api/upload/route.ts`

**Función `normalizePageText()`:**

```typescript
function normalizePageText(s: string) {
  return (s || '')
    .replace(/\f/g, '\n')              // Form feed → salto de línea
    .replace(/^\s*\d+\s*$/gm, '')      // Eliminar líneas solo números
    .replace(/[·•◦]\s*/g, '• ')        // Normalizar viñetas
    .replace(/[ \t]+/g, ' ')           // Múltiples espacios/tabs → un espacio
    .trim()
}
```

**Parámetros de normalización (hardcodeados):**
- **Form feed**: Convertido a salto de línea
- **Líneas solo números**: Eliminadas (números de página)
- **Viñetas**: Normalizadas a `• `
- **Espacios múltiples**: Reducidos a un espacio

### Extracción de Artículos

**Ubicación:** `app/api/mental-outline/extract-article/route.ts`

**Parámetros hardcodeados:**

```typescript
// Rango de búsqueda alrededor del artículo
const startPageIndex = Math.max(0, articuloPageIndex - 3)  // 3 páginas antes
const endPageIndex = Math.min(normalizedPages.length, articuloPageIndex + 8)  // 8 páginas después

// Validaciones
const minTextLength = 50        // Mínimo para considerar válido
const minTextLengthForSummary = 100  // Mínimo para generar resumen
const maxIndexDots = 5          // Máximo de puntos seguidos para considerar índice
const minSubstantialContent = 200  // Mínimo de caracteres para contenido sustancial
```

### División en Bloques

**Ubicación:** `app/api/upload/route.ts`

**Parámetros configurables:**

```typescript
const blockSize = Number.isFinite(Number(blockSizeRaw)) 
  ? Math.max(1, parseInt(String(blockSizeRaw), 10)) 
  : 5  // Por defecto: 5 páginas

const overlap = Number.isFinite(Number(overlapRaw)) 
  ? Math.max(0, parseInt(String(overlapRaw), 10)) 
  : 1  // Por defecto: 1 página
```

**Valores por defecto:**
- **blockSize**: 5 páginas
- **overlap**: 1 página

**Configuración:** Vía FormData en el endpoint `/api/upload`

---

## 3. Política de Fallbacks

### Generación del Esquema Mental

#### Orden de Intentos

**1. Método desde Bookmarks (Preferido)**

**Endpoint:** `/api/mental-outline/generate-from-bookmarks`

**Criterios de éxito:**
- Bookmarks disponibles y no vacíos
- Validación de estructura pasa (tiene títulos o artículos)
- O si tiene >10 items aunque no pase validación (intenta de todas formas)

**Criterios de fallo:**
- No hay bookmarks o están vacíos → Error 400
- Validación falla y tiene ≤10 items → Error 400
- Error en conversión → Error 500

**2. Método desde Índice (Directo)**

**Endpoint:** `/api/mental-outline/generate-direct`

**Criterios de éxito:**
- Índice encontrado y parseado correctamente
- Se extraen al menos algunos elementos estructurales

**Criterios de fallo:**
- No se encuentra el índice → Continúa con parsing básico
- Error en parsing → Error 500

**3. Método por Chunks con IA**

**Endpoint:** `/api/mental-outline/chunk`

**Criterios de éxito:**
- Procesamiento por chunks exitoso
- IA genera esquema válido

**Criterios de fallo:**
- Error en procesamiento → Error 500
- Timeout de IA → Error 500

#### Flujo de Fallback en el Frontend

**Ubicación:** `app/generate/page.tsx`

```typescript
// 1. Intentar desde bookmarks
if (bookmarks && bookmarks.length > 0) {
  try {
    const res = await fetch('/api/mental-outline/generate-from-bookmarks', ...)
    if (res.ok) {
      // Éxito: usar esquema desde bookmarks
      return
    }
  } catch (error) {
    // Continuar con siguiente método
  }
}

// 2. Intentar desde índice (método directo)
try {
  const res = await fetch('/api/mental-outline/generate-direct', ...)
  if (res.ok) {
    // Éxito: usar esquema desde índice
    return
  }
} catch (error) {
  // Continuar con siguiente método
}

// 3. Intentar método por chunks con IA
try {
  const res = await fetch('/api/mental-outline/chunk', ...)
  if (res.ok) {
    // Éxito: usar esquema desde IA
    return
  }
} catch (error) {
  // Todos los métodos fallaron
}
```

### Extracción de Bookmarks

**Ubicación:** `lib/pdf/extractBookmarks.ts`

**Orden de intentos:**

1. **PyMuPDF (Python)** - Método preferido
   - Intenta: `python`, `python3`, `py` (en ese orden)
   - Criterio de éxito: Script ejecuta y retorna JSON válido
   - Criterio de fallo: Python no disponible, PyMuPDF no instalado, error en script

2. **pdfjs-dist** - Fallback
   - Se usa si PyMuPDF falla
   - Criterio de éxito: Outline extraído correctamente
   - Criterio de fallo: Error al cargar PDF, outline vacío

**Resultado si ambos fallan:**
- Retorna array vacío `[]`
- No lanza error (fallo silencioso)
- El sistema continúa sin bookmarks

### Extracción de Artículos

**Ubicación:** `app/api/mental-outline/extract-article/route.ts`

**Orden de intentos:**

1. **Búsqueda en rango local** (3 páginas antes + 8 después)
   - Criterio de éxito: Artículo encontrado y texto válido (>50 caracteres)
   - Criterio de fallo: No encontrado, texto de índice, muy corto

2. **Búsqueda en todo el PDF** (fallback)
   - Se activa si búsqueda local falla
   - Busca todas las ocurrencias de "Artículo X"
   - Valida cada match (rechaza índice, verifica contenido sustancial)
   - Criterio de éxito: Match válido encontrado
   - Criterio de fallo: No hay matches válidos

**Resultado si ambos fallan:**
- Error 404: "No se encontró el artículo X en la página Y"

### Extracción de Números de Página

**Ubicación:** `app/api/mental-outline/extract-article/route.ts`

**Orden de intentos:**

1. **Desde bookmarks** (`sourceFromBookmarks = true`)
   - Usa números directamente de `pagesFull`
   - No necesita extraer del pie de página

2. **Extracción del pie de página** (método directo)
   - Busca en últimas 10 líneas
   - Patrones: líneas solo números, "página X", "pág. X", "p. X", "X / Y"
   - Filtra números >1000 (probablemente años)

3. **Fallback secuencial**
   - Si números parecen secuenciales desde 1, intenta extraer del pie
   - Si no, usa números directamente

---

## 4. Gestión de Errores

### Generación del Esquema Mental

#### Si Ningún Método Produce Esquema Válido

**Escenario:** Todos los métodos (bookmarks, índice directo, chunks) fallan

**Respuesta del sistema:**

1. **Desde Bookmarks:**
   ```json
   {
     "ok": false,
     "error": "Los bookmarks no tienen una estructura válida. No se encontraron Títulos ni Artículos.",
     "validation": {
       "isValid": false,
       "hasTitulos": false,
       "hasArticulos": false,
       "tituloCount": 0,
       "articuloCount": 0,
       "totalItems": 0
     }
   }
   ```
   **Status:** 400

2. **Desde Índice (Directo):**
   ```json
   {
     "ok": false,
     "error": "Error generando esquema mental",
     "details": "Mensaje de error específico"
   }
   ```
   **Status:** 500

3. **Desde Chunks:**
   ```json
   {
     "ok": false,
     "error": "Error procesando chunk",
     "details": "Mensaje de error específico"
   }
   ```
   **Status:** 500

**Comportamiento del Frontend:**

- Muestra mensaje de error al usuario
- Permite reintentar
- No genera esquema parcial (todo o nada)

### Extracción de Artículos

#### Si el Artículo No se Encuentra

**Respuesta:**

```json
{
  "ok": false,
  "error": "No se encontró el artículo 1 en la página 15 del PDF. Total de páginas: 100, rango: 1-100"
}
```

**Status:** 404

**Información incluida:**
- Número de artículo buscado
- Página esperada
- Total de páginas disponibles
- Rango de páginas disponibles

### Extracción de Bookmarks

#### Si Falla la Extracción

**Comportamiento:**
- Retorna array vacío `[]`
- No lanza error
- Sistema continúa sin bookmarks
- Logging de advertencia en consola (solo en desarrollo)

**Mensajes de advertencia:**
- "Python no está disponible"
- "PyMuPDF no está instalado"
- "Error ejecutando script Python"

### Parseo del PDF

#### Si Falla el Parseo

**Respuesta:**

```json
{
  "error": "Error procesando PDF"
}
```

**Status:** 500

**Comportamiento:**
- Error capturado y logueado
- Mensaje genérico al cliente
- Detalles en logs del servidor

### Validación de Estructura

#### Bookmarks Inválidos

**Criterios de validación:**

```typescript
{
  isValid: boolean,        // true si tiene títulos O artículos
  hasTitulos: boolean,    // Tiene al menos un título
  hasArticulos: boolean,   // Tiene al menos un artículo
  tituloCount: number,     // Cantidad de títulos encontrados
  articuloCount: number,   // Cantidad de artículos encontrados
  totalItems: number       // Total de items en bookmarks
}
```

**Reglas:**
- Si `totalItems > 10` pero validación falla: Intenta de todas formas
- Si `totalItems <= 10` y validación falla: Rechaza con error 400

### Timeouts

#### Si Ocurre Timeout

**Comportamiento:**
- `AbortController` cancela la request
- Se lanza error con mensaje de timeout
- Se loguea el evento `model.timeout`
- No hay reintentos automáticos

**Timeouts configurados:**
- Generación de preguntas: 30s
- Respuestas JSON: 20s (configurable)
- Resumen de artículos: 30s
- Resumen rápido: 28s
- Operaciones MAP: 28s

### Errores de IA

#### Si la IA Falla o Retorna Inválido

**Resumen de artículos:**
- Si error indica "contenido insuficiente": Usa texto completo como resumen
- Si otro error: Retorna resumen vacío
- Si resumen vacío pero hay texto: Usa texto completo

**Generación de esquema:**
- Si error en chunk: Continúa con siguiente chunk
- Si todos los chunks fallan: Error 500

---

## Resumen de Criterios de Corte

### Bookmarks

- ✅ **Aceptar si**: Tiene títulos O artículos
- ✅ **Aceptar si**: Tiene >10 items (intenta aunque validación falle)
- ❌ **Rechazar si**: Tiene ≤10 items y validación falla

### Índice

- ✅ **Aceptar si**: Se encuentra palabra "índice" y tiene formato de índice
- ✅ **Aceptar si**: Tiene formato de índice (muchos elementos + puntos) aunque no tenga palabra "índice"
- ❌ **Rechazar si**: Tiene artículos largos (>200 caracteres sin punto)
- ❌ **Rechazar si**: Tiene múltiples párrafos largos (>2)

### Artículos

- ✅ **Aceptar si**: Texto >50 caracteres y no es índice
- ❌ **Rechazar si**: Texto <50 caracteres
- ❌ **Rechazar si**: Tiene >5 puntos seguidos (formato de índice)
- ❌ **Rechazar si**: No se encuentra en el PDF

### Front Matter

- ✅ **Descartar si**: Coincide con `force_drop_patterns`
- ✅ **Descartar si**: Ratio de líneas de índice ≥ 0.45
- ✅ **Descartar si**: Densidad baja (<700 caracteres)
- ✅ **Mantener si**: Tiene artículo, título, capítulo o sección
- ✅ **Mantener si**: Coincide con `allow_if_headers_present`

---

## Mejoras Futuras Sugeridas

### Parámetros Configurables

- [ ] Hacer páginas máximas de búsqueda del índice configurables vía variables de entorno
- [ ] Hacer rangos de búsqueda de artículos configurables
- [ ] Hacer umbrales de validación configurables

### Mejoras en Fallbacks

- [ ] Reintentos automáticos con backoff exponencial
- [ ] Fallback a esquema parcial si algunos métodos fallan
- [ ] Mejor logging de por qué falló cada método

### Mejoras en Errores

- [ ] Mensajes de error más descriptivos
- [ ] Códigos de error específicos por tipo de fallo
- [ ] Sugerencias de solución en mensajes de error


