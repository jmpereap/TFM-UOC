# Resumen: Carga y Procesamiento del PDF

## Introducción

El sistema procesa documentos PDF legales mediante un flujo completo que incluye: extracción de texto, normalización, detección de front matter, división en bloques, extracción de bookmarks y cálculo de estadísticas. Todo el proceso se realiza en el endpoint `/api/upload`.

---

## Endpoint: `/api/upload`

### Método: POST

**Archivo:** `app/api/upload/route.ts`

### Parámetros de Entrada

El endpoint recibe un `FormData` con:

- **`file`**: Archivo PDF (requerido)
- **`blockSize`**: Tamaño de bloque en páginas (opcional, default: 5)
- **`overlap`**: Páginas de solapamiento entre bloques (opcional, default: 1)

---

## Flujo Completo de Procesamiento

### Paso 1: Recepción y Validación del Archivo

1. **Recibe el FormData** del frontend
2. **Valida que haya un archivo**:
   - Verifica que `file` exista
   - Verifica que sea una instancia de `File`
   - Si no, retorna error 400

3. **Convierte a Buffer**:
   ```typescript
   const buffer = Buffer.from(await file.arrayBuffer())
   ```

4. **Calcula hash del archivo** (SHA1):
   ```typescript
   const fileHash = crypto.createHash('sha1').update(buffer).digest('hex')
   ```
   - Usado para identificar archivos únicos
   - Útil para cacheo y deduplicación

5. **Obtiene parámetros de configuración**:
   - `blockSize`: Tamaño de bloque (default: 5 páginas)
   - `overlap`: Solapamiento entre bloques (default: 1 página)

---

### Paso 2: Parseo del PDF

**Función:** `parsePdf()` en `lib/pdf/parsePdf.ts`

**Librería:** `pdf-parse`

#### Proceso de Extracción de Texto:

1. **Configuración del parser**:
   - Usa `pagerender` para procesar cada página individualmente
   - `normalizeWhitespace: false` - Preserva espacios originales
   - `disableCombineTextItems: false` - Combina items de texto relacionados

2. **Extracción página por página**:
   - Para cada página, obtiene el contenido de texto (`getTextContent()`)
   - Procesa cada item de texto con:
     - **Texto** (`item.str`)
     - **Posición Y** (`item.transform[5]`) - Para detectar líneas
     - **Fin de línea** (`item.hasEOL`) - Indica fin explícito de línea

3. **Construcción del texto de la página**:
   - **Detección de líneas**: Compara posición Y entre items
     - Si la diferencia es > 2 píxeles: nueva línea
   - **Manejo de fin de línea explícito**: Si `hasEOL` es true, fuerza salto de línea
   - **Agregación de texto**: Une items con espacios apropiados

4. **Limpieza del texto**:
   - Elimina espacios múltiples (3+ espacios → 1 espacio)
   - Normaliza saltos de línea múltiples (3+ saltos → 2 saltos)
   - Elimina espacios al inicio y final

5. **Resultado**:
   ```typescript
   {
     text: string,        // Texto completo del PDF
     info: object,        // Metadatos del PDF
     numPages: number,    // Número total de páginas
     pages: string[]      // Array con texto de cada página
   }
   ```

#### Manejo de Errores:

- Si falla una página: añade string vacío y continúa
- Si falla todo el parseo: lanza error

#### Validación de Páginas:

- Verifica que `pages.length === numPages`
- Si faltan páginas: rellena con strings vacíos
- Log de advertencia si hay discrepancias

---

### Paso 3: Normalización del Texto de Páginas

**Función:** `normalizePageText()` en `app/api/upload/route.ts`

Normaliza el texto de cada página:

1. **Reemplaza caracteres de form feed** (`\f`) por saltos de línea (`\n`)
2. **Elimina líneas que son solo números** (números de página en pies)
3. **Normaliza viñetas**: `[·•◦]` → `• `
4. **Normaliza espacios**: Múltiples espacios/tabs → un solo espacio
5. **Elimina espacios al inicio y final**

**Resultado:**
```typescript
const pagesFullRaw = pages.map((text, idx) => ({ 
  num: idx + 1, 
  text: normalizePageText(text) 
}))
```

---

### Paso 4: Extracción de Bookmarks/Marcadores

**Función:** `extractBookmarks()` en `lib/pdf/extractBookmarks.ts`

Extrae la estructura de navegación del PDF (bookmarks/marcadores):

#### Método Principal: PyMuPDF (Python)

1. **Crea archivo temporal** del PDF
2. **Ejecuta script Python** (`scripts/extract-bookmarks.py`)
3. **Parsea respuesta JSON** con estructura jerárquica
4. **Convierte a formato BookmarkItem**:
   ```typescript
   {
     title: string,
     pageNumber: number | null,
     children?: BookmarkItem[]
   }
   ```

#### Método Fallback: pdfjs-dist

Si PyMuPDF no está disponible:
1. Carga el PDF con `pdfjs-dist`
2. Obtiene el outline del documento
3. Convierte recursivamente los bookmarks
4. Obtiene números de página de los destinos

**Nota:** Los bookmarks pueden no estar disponibles en todos los PDFs.

---

### Paso 5: Detección de Front Matter

**Función:** `detectFrontMatter()` en `lib/legal/frontmatter.ts`

Identifica y marca páginas que deben excluirse (front matter: portada, índice, etc.)

#### Configuración por Defecto:

```typescript
{
  max_first_pages: 4,              // Analizar primeras 4 páginas
  min_chars_body: 700,            // Mínimo de caracteres para ser contenido
  drop_if_idx_ratio_ge: 0.45,     // Si >45% líneas son índice, descartar
  force_drop_patterns: [          // Patrones que fuerzan descarte
    '^ÍNDICE$',
    '^SUMARIO$',
    '^LEGISLACIÓN CONSOLIDADA$',
    '^BOLETÍN OFICIAL DEL ESTADO$',
    '^PREÁMBULO$',
    '^DON JUAN CARLOS',
    '^SABED:',
    '^TEXTO CONSOLIDADO',
  ],
  allow_if_headers_present: [     // Patrones que permiten mantener
    'Artículo 1',
    '^TÍTULO PRELIMINAR',
  ]
}
```

#### Proceso de Detección:

1. **Calcula estadísticas de cada página** (ver Paso 6)

2. **Analiza primeras páginas** (hasta `max_first_pages`):
   - **Fuerza descarte** si:
     - Coincide con `force_drop_patterns`
     - Tiene muchos hits de mayúsculas (`upperHits > 0`)
   - **Descarta si**:
     - Ratio de líneas de índice ≥ `drop_if_idx_ratio_ge`
     - Densidad baja (`chars < min_chars_body`)
     - Muchas coincidencias de índice (`idxMatches >= 6`)
   - **Mantiene si**:
     - Tiene artículo (`hasArticulo`)
     - Tiene estructura (título/capítulo/sección) con pocos índices
     - Coincide con `allow_if_headers_present`

3. **Analiza páginas restantes**:
   - Descarta si tiene muchas líneas de índice Y no tiene artículos
   - Descarta si tiene muchas líneas de índice Y densidad baja

4. **Detección adicional**:
   - Busca primera página con "Artículo 1" o "TÍTULO PRELIMINAR"
   - Marca todas las páginas anteriores como front matter

**Resultado:** `Set<number>` con números de páginas a descartar

---

### Paso 6: Cálculo de Estadísticas de Páginas

**Función:** `computeAllStats()` en `lib/utils/pageStats.ts`

Calcula estadísticas para cada página del PDF:

#### Estadísticas Calculadas:

```typescript
{
  num: number,              // Número de página
  chars: number,            // Caracteres en la página
  lines: number,            // Líneas no vacías
  idxLines: number,          // Líneas con formato de índice (.. 15)
  idxMatches: number,        // Coincidencias de patrón de índice
  upperHits: number,         // Líneas con encabezados en mayúsculas
  hasArticulo: boolean,      // Tiene "Artículo X"
  hasTitulo: boolean,        // Tiene "TÍTULO X"
  hasCapitulo: boolean,      // Tiene "CAPÍTULO X"
  hasSeccion: boolean       // Tiene "Sección X"
}
```

#### Patrones de Detección:

- **Índice**: `/\.{2,}\s*\d+$/` - Líneas con puntos seguidos de número
- **Encabezados**: `/^(ÍNDICE|SUMARIO|...|BOLETÍN OFICIAL DEL ESTADO)\b/i`
- **Artículo**: `/\bArtículo\s+\d+[A-Za-z]?\.?\b/`
- **Título**: `/^TÍTULO\s+(PRELIMINAR|[IVXLC]+)\b/i`
- **Capítulo**: `/^CAPÍTULO\s+([IVXLC]+|PRIMERO|...|DÉCIMO)\b/i`
- **Sección**: `/^Sección\s+\d+\.ª\b/i`

---

### Paso 7: División en Bloques

**Función:** `splitIntoBlocks()` en `lib/pdf/splitIntoBlocks.ts`

Divide las páginas en bloques para procesamiento:

#### Algoritmo:

1. **Inicia en página 0**
2. **Crea bloques de `blockSize` páginas**:
   - `start = 0`
   - `end = min(start + blockSize, pages.length)`
   - Une el texto de las páginas con `\n\n`
3. **Aplica solapamiento**:
   - `start = end - overlap` (retrocede `overlap` páginas)
   - Esto asegura que los bloques se solapen
4. **Repite** hasta cubrir todas las páginas

#### Ejemplo:

Con `blockSize = 5` y `overlap = 1`:
- Bloque 1: páginas 1-5
- Bloque 2: páginas 5-9 (solapa página 5)
- Bloque 3: páginas 9-13 (solapa página 9)
- ...

#### Estructura del Bloque:

```typescript
{
  index: number,        // Índice del bloque (0, 1, 2, ...)
  startPage: number,    // Primera página del bloque (1-indexed)
  endPage: number,      // Última página del bloque (1-indexed)
  text: string          // Texto completo del bloque
}
```

---

### Paso 8: Preparación de Respuesta

El endpoint prepara y retorna:

```typescript
{
  blocks: Block[],                    // Bloques de texto para procesamiento
  pagesFull: PageEntry[],             // Páginas sin front matter
  pagesFullRaw: PageEntry[],          // Todas las páginas (con front matter)
  pdfSchema: string,                  // PDF codificado en base64
  meta: {
    numPages: number,                 // Número total de páginas
    info: object,                     // Metadatos del PDF
    blockSize: number,                // Tamaño de bloque usado
    overlap: number,                  // Solapamiento usado
    fileHash: string                  // Hash SHA1 del archivo
  },
  frontMatterDropped: number[],       // Números de páginas descartadas
  pageStats: PageStats[],            // Estadísticas de cada página
  bookmarks: BookmarkItem[]          // Bookmarks/marcadores del PDF
}
```

#### Diferencias entre `pagesFull` y `pagesFullRaw`:

- **`pagesFullRaw`**: Todas las páginas del PDF (incluye front matter)
  - Usado por `generate-direct` para buscar el índice
  - Incluye portada, índice, etc.

- **`pagesFull`**: Solo páginas de contenido (sin front matter)
  - Usado para procesamiento principal
  - Excluye portada, índice, etc.

---

## Integración en el Frontend

### Página de Upload

**Archivo:** `app/upload/page.tsx`

1. **Formulario de subida**:
   - Input de tipo `file` con aceptación de PDFs
   - Botón de subida

2. **Proceso de subida**:
   ```typescript
   const form = new FormData()
   form.append('file', file)
   form.append('blockSize', '5')
   form.append('overlap', '1')
   
   const res = await fetch('/api/upload', { 
     method: 'POST', 
     body: form 
   })
   ```

3. **Almacenamiento en localStorage**:
   - Guarda los datos recibidos en `localStorage` bajo la clave `'tfm_pdf'`
   - Permite persistencia entre sesiones

### Página de Generación

**Archivo:** `app/generate/page.tsx`

1. **Carga datos del localStorage** al iniciar
2. **Usa los datos** para:
   - Generar esquema mental
   - Mostrar bloques
   - Procesar artículos

---

## Características Especiales

### Manejo de PDFs Mal Formateados

- **Páginas faltantes**: Rellena con strings vacíos
- **Errores en páginas individuales**: Continúa con páginas restantes
- **Texto mal estructurado**: Normalización automática

### Optimización de Memoria

- **Procesamiento página por página**: No carga todo el PDF en memoria
- **Bloques con solapamiento**: Permite procesamiento eficiente sin perder contexto

### Detección Inteligente de Front Matter

- **Múltiples criterios**: No solo busca patrones, analiza estadísticas
- **Contexto**: Considera si hay contenido estructural después
- **Flexible**: Permite mantener páginas con contenido relevante

---

## Logging y Debugging

El sistema incluye logging en puntos clave:

- `[Upload] PDF parseado`: Información sobre páginas parseadas
- `[Upload] ERROR`: Errores en el parseo
- `[parsePdf] Error extrayendo texto de página`: Errores por página
- `[parsePdf] Error extrayendo texto con pdf-parse`: Errores generales

---

## Archivos Clave

- `app/api/upload/route.ts` - Endpoint principal de carga
- `lib/pdf/parsePdf.ts` - Parseo del PDF
- `lib/pdf/splitIntoBlocks.ts` - División en bloques
- `lib/legal/frontmatter.ts` - Detección de front matter
- `lib/utils/pageStats.ts` - Cálculo de estadísticas
- `lib/pdf/extractBookmarks.ts` - Extracción de bookmarks
- `app/upload/page.tsx` - Interfaz de subida
- `app/generate/page.tsx` - Uso de datos cargados

---

## Dependencias Externas

### Librerías Node.js:

- **`pdf-parse`**: Parseo principal del PDF
- **`crypto`**: Cálculo de hash SHA1

### Dependencias Opcionales:

- **Python + PyMuPDF**: Para extracción de bookmarks (método preferido)
- **`pdfjs-dist`**: Fallback para bookmarks si PyMuPDF no está disponible

---

## Configuración

### Parámetros por Defecto:

- **`blockSize`**: 5 páginas por bloque
- **`overlap`**: 1 página de solapamiento
- **`max_first_pages`**: 4 páginas a analizar para front matter
- **`min_chars_body`**: 700 caracteres mínimo para contenido
- **`drop_if_idx_ratio_ge`**: 0.45 (45% de líneas de índice)

### Ajustes Recomendados:

- **PDFs largos**: Aumentar `blockSize` a 7-10
- **PDFs con mucho front matter**: Aumentar `max_first_pages` a 6-8
- **PDFs con estructura compleja**: Reducir `overlap` a 0 si no se necesita contexto

---

## Casos Especiales

### PDF sin Bookmarks

- El sistema continúa normalmente
- `bookmarks` será un array vacío
- El esquema mental se generará desde el índice

### PDF con Páginas Vacías

- Se detectan y normalizan
- Se incluyen en `pagesFullRaw` pero pueden ser descartadas en `pagesFull`

### PDF con Front Matter Extenso

- Se detecta automáticamente
- Se marca para descarte
- El contenido real empieza después del front matter

### PDF Mal Escaneado o con OCR

- `pdf-parse` puede tener dificultades
- El texto puede tener errores de reconocimiento
- Se normaliza lo mejor posible

---

## Mejoras Futuras

- [ ] Soporte para múltiples formatos (DOCX, TXT)
- [ ] Cacheo de PDFs parseados usando `fileHash`
- [ ] Procesamiento asíncrono para PDFs muy grandes
- [ ] Mejora en detección de front matter con ML
- [ ] Extracción de imágenes y tablas
- [ ] Soporte para PDFs protegidos con contraseña
- [ ] Validación de integridad del PDF
- [ ] Procesamiento en streaming para PDFs muy grandes






