# Resumen: Generación del Esquema Mental

## Introducción

El sistema genera el esquema mental (estructura jerárquica de Títulos, Capítulos, Secciones y Artículos) de documentos legales PDF mediante **dos métodos principales**:

1. **Desde Bookmarks/Marcadores del PDF** (método preferido)
2. **Desde el Índice del PDF** (método alternativo)

---

## Método 1: Generación desde Bookmarks/Marcadores

### ¿Qué son los Bookmarks/Marcadores?

Los bookmarks (también llamados marcadores) son la estructura de navegación jerárquica que algunos PDFs incluyen. Contienen:
- Títulos de secciones con su jerarquía
- Números de página exactos donde se encuentra cada elemento
- Estructura anidada (padres e hijos)

### Flujo de Generación

#### 1. Extracción de Bookmarks (`lib/pdf/extractBookmarks.ts`)

**Método Principal: PyMuPDF (Python)**
- Usa un script Python (`scripts/extract-bookmarks.py`) con la librería PyMuPDF
- Crea un archivo temporal del PDF
- Ejecuta el script Python que extrae los bookmarks
- Convierte la respuesta JSON a formato `BookmarkItem[]`

**Método Fallback: pdfjs-dist**
- Si PyMuPDF no está disponible, usa la librería `pdfjs-dist`
- Carga el PDF y obtiene el outline
- Convierte recursivamente los bookmarks a formato `BookmarkItem[]`

**Estructura de BookmarkItem:**
```typescript
{
  title: string           // Título del bookmark (ej: "TÍTULO I")
  pageNumber: number | null  // Número de página
  children?: BookmarkItem[]  // Bookmarks anidados
}
```

#### 2. Validación de Bookmarks (`lib/outline/bookmarksToOutline.ts`)

La función `validateBookmarksStructure()` verifica que los bookmarks tengan estructura válida:
- Busca patrones de **Títulos** (ej: "TÍTULO I", "TÍTULO PRELIMINAR")
- Busca patrones de **Artículos** (ej: "Artículo 1", "Art. 2")
- Cuenta elementos encontrados
- Retorna validación con estadísticas

**Patrones de detección:**
- Títulos: `/T[ÍI]TULO\s+(PRELIMINAR|[IVXLCDM]+|\d+)/i`
- Artículos: `/Art[íi]culo\s+(\d+|[IVXLCDM]+)\.?/i`
- También acepta versiones sin acentos (para manejar problemas de encoding)

#### 3. Conversión a MentalOutline (`lib/outline/bookmarksToOutline.ts`)

La función `convertBookmarksToMentalOutline()` procesa recursivamente los bookmarks:

**Patrones de Detección:**
- **Preámbulo**: `/[?Pre[áa]mbulo]?/i`
- **Exposición de Motivos**: `/Exposici[óo]n\s+de\s+motivos/i`
- **Títulos**: `/T[ÍI]TULO\s+(PRELIMINAR|[IVXLCDM]+|\d+)/i`
- **Capítulos**: `/CAP[ÍI]TULO\s+(PRELIMINAR|PRIMERO|SEGUNDO|...|[IVXLCDM]+|\d+)/i`
- **Secciones**: `/SECCI[ÓO]N\s+(\d+\.?\s*[ªº]|\d+|[IVXLCDM]+)/i`
- **Artículos**: `/Art[íi]culo\s+(\d+|[IVXLCDM]+)(?:\s+(?:bis|ter|quater|...))?\.?/i`
- **Disposiciones**: `/Disposici[óo]n\s+(Adicional|Transitoria|Derogatoria|Final)/i`

**Procesamiento:**
1. **Normalización de texto**: Arregla problemas de encoding (caracteres mal codificados)
2. **Extracción de ordinal**: Extrae el número/código del elemento (ej: "I", "1", "PRELIMINAR")
3. **Extracción de subtítulo**: Extrae el texto descriptivo después del código
4. **Asignación jerárquica**: Asigna artículos a secciones > capítulos > títulos según contexto
5. **Cálculo de páginas de fin**: Calcula automáticamente las páginas de fin para títulos, capítulos y secciones

**Características especiales:**
- Maneja problemas de encoding (caracteres mal codificados desde el PDF)
- Crea elementos temporales si encuentra capítulos/secciones sin título padre
- Procesa recursivamente la estructura anidada de bookmarks
- Genera anchors para navegación (`tit-1`, `cap-2`, `art-5`, etc.)

#### 4. Endpoint API (`app/api/mental-outline/generate-from-bookmarks/route.ts`)

**Flujo:**
1. Recibe `bookmarks`, `source` y `lawName` en el payload
2. Valida que haya bookmarks
3. Valida la estructura de los bookmarks
4. Convierte bookmarks a `MentalOutline`
5. Calcula estadísticas (títulos, capítulos, secciones, artículos)
6. Retorna el esquema con metadatos

**Respuesta:**
```json
{
  "ok": true,
  "schema": MentalOutline,
  "source": "bookmarks",
  "validation": {...},
  "stats": {
    "titulos": number,
    "capitulos": number,
    "secciones": number,
    "articulos": number
  }
}
```

### Ventajas del Método desde Bookmarks

✅ **Más rápido**: No requiere parsear todo el texto del PDF  
✅ **Más preciso**: Usa la estructura exacta del PDF  
✅ **No requiere IA**: Procesamiento puro basado en patrones  
✅ **Números de página exactos**: Los bookmarks incluyen páginas precisas  
✅ **Estructura jerárquica completa**: Respeta la jerarquía del PDF original  

### Limitaciones

⚠️ **No todos los PDFs tienen bookmarks**: Algunos PDFs no incluyen marcadores  
⚠️ **Bookmarks pueden estar desactualizados**: Pueden no coincidir con el contenido actual  
⚠️ **Problemas de encoding**: Algunos PDFs tienen caracteres mal codificados  
⚠️ **Estructura variable**: Diferentes formatos según el software que generó el PDF  

---

## Método 2: Generación desde el Índice del PDF

### ¿Qué es el Índice?

El índice es una sección al inicio del documento que lista la estructura del documento con números de página. Típicamente está en las primeras páginas (1-30).

### Flujo de Generación

#### 1. Detección del Índice (`app/api/mental-outline/generate-direct/route.ts`)

La función `extractIndiceFromPages()` busca el índice en las primeras páginas:

**Criterios de Detección:**
1. **Palabras clave**: "índice", "indice", "sumario", "tabla de contenido"
2. **Formato de índice**:
   - Múltiples elementos estructurales (títulos, artículos, capítulos) seguidos de números de página
   - Muchos puntos separadores (`...`) o números al final de líneas
   - Entradas cortas (no párrafos largos)
3. **Rechazo de contenido**: Si encuentra artículos con texto largo (>200 caracteres), NO es índice

**Búsqueda:**
- Busca en páginas 1-30
- Prioriza páginas 1-5 (más probables)
- Continúa hasta encontrar contenido del documento (artículos completos)

#### 2. Extracción del Texto del Índice

Una vez detectado, extrae el texto completo del índice:
- Incluye todas las páginas que forman parte del índice
- Se detiene cuando encuentra contenido del documento (Preámbulo, Título, Artículo completo)

#### 3. Procesamiento del Índice

**Método por Chunks (`app/api/mental-outline/chunk/route.ts`):**

El sistema procesa el PDF en chunks (fragmentos) de páginas:

1. **Detecta el índice** en el primer chunk (si no viene en el payload)
2. **Construye un prompt** para la IA con:
   - Instrucciones para analizar el fragmento
   - Esquema acumulado de chunks anteriores (si existe)
   - Texto del índice (si está disponible)
   - Texto del chunk actual
3. **Llama a la IA** (usando `callModelJSON`) para extraer la estructura
4. **Acumula resultados**: Combina el esquema del chunk actual con el acumulado
5. **Procesa en múltiples pasadas**: Reduce el esquema en 2 niveles para documentos medianos

**Método Directo (`app/api/mental-outline/generate-direct/route.ts`):**

Procesa el índice directamente usando patrones regex y lógica de parsing:

1. **Extrae el índice** de las páginas
2. **Parsea el índice** usando patrones regex para detectar:
   - Títulos con sus páginas
   - Capítulos con sus páginas
   - Secciones con sus páginas
   - Artículos con sus páginas
3. **Construye la estructura jerárquica** basándose en:
   - Números de página (orden)
   - Niveles de indentación (si están presentes)
   - Patrones de texto
4. **Asigna páginas de inicio y fin** calculando rangos

### Ventajas del Método desde Índice

✅ **Funciona con PDFs sin bookmarks**: No requiere que el PDF tenga marcadores  
✅ **Usa el índice oficial**: Respeta la estructura del índice del documento  
✅ **Procesamiento inteligente**: Puede usar IA para mejorar la extracción  

### Limitaciones

⚠️ **Requiere parsear texto**: Más lento que bookmarks  
⚠️ **Depende de la calidad del índice**: Si el índice está mal formateado, puede fallar  
⚠️ **Puede requerir IA**: Algunos métodos usan modelos de lenguaje (más costoso)  
⚠️ **Números de página aproximados**: Puede haber discrepancias con el contenido real  

---

## Integración en el Sistema

### Endpoint de Upload (`app/api/upload/route.ts`)

Cuando se sube un PDF:
1. Parsea el PDF
2. **Extrae bookmarks automáticamente** usando `extractBookmarks()`
3. Incluye los bookmarks en la respuesta:
```json
{
  "blocks": [...],
  "pagesFull": [...],
  "bookmarks": [...]  // ← Bookmarks extraídos
}
```

### Frontend (`app/generate/page.tsx`)

El frontend puede elegir entre:
1. **Generar desde bookmarks** (si están disponibles)
2. **Generar desde índice** (método alternativo)
3. **Generar desde IA** (método por lotes)

---

## Comparación de Métodos

| Aspecto | Bookmarks | Índice |
|---------|-----------|--------|
| **Velocidad** | ⚡ Muy rápido | 🐢 Más lento |
| **Precisión** | ✅ Alta | ⚠️ Media-Alta |
| **Disponibilidad** | ⚠️ No siempre disponible | ✅ Casi siempre |
| **Requiere IA** | ❌ No | ⚠️ Opcional |
| **Números de página** | ✅ Exactos | ⚠️ Aproximados |
| **Estructura jerárquica** | ✅ Completa | ⚠️ Depende del índice |

---

## Recomendación de Uso

1. **Primero intentar con bookmarks** (más rápido y preciso)
2. **Si no hay bookmarks o fallan**, usar el método del índice
3. **Como último recurso**, usar generación por IA en lotes

---

## Archivos Clave

- `lib/pdf/extractBookmarks.ts` - Extracción de bookmarks
- `lib/outline/bookmarksToOutline.ts` - Conversión de bookmarks a esquema
- `app/api/mental-outline/generate-from-bookmarks/route.ts` - Endpoint de generación desde bookmarks
- `app/api/mental-outline/generate-direct/route.ts` - Generación desde índice (método directo)
- `app/api/mental-outline/chunk/route.ts` - Generación desde índice (método por chunks con IA)
- `app/api/upload/route.ts` - Endpoint de upload que extrae bookmarks
- `types/mentalOutline.ts` - Tipos TypeScript del esquema mental

---

## Notas Técnicas

### Manejo de Encoding

Ambos métodos incluyen normalización de texto para manejar problemas de encoding comunes:
- Reemplazo de caracteres mal codificados (Latin1 → UTF-8)
- Manejo de versiones con y sin acentos en los patrones

### Validación

El sistema valida la estructura antes de generar el esquema:
- Verifica que haya títulos o artículos
- Cuenta elementos encontrados
- Proporciona feedback sobre la calidad de los datos

### Logging

Todo el proceso está instrumentado con logging (`lib/logging/logger`):
- Eventos de inicio/fin
- Errores y advertencias
- Estadísticas de generación
- Muestras de datos para debugging







