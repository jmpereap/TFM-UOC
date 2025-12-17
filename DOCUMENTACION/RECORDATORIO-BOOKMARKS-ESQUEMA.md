# Recordatorio: Usar Bookmarks del PDF para generar esquema mental

**Fecha:** 21 de noviembre de 2025

## Objetivo
Implementar la generación automática del esquema mental usando los bookmarks/marcadores del PDF cuando estén disponibles.

## Contexto
- Ya tenemos implementada la función `extractBookmarks()` en `lib/pdf/extractBookmarks.ts`
- Los bookmarks se extraen automáticamente en el endpoint `/api/upload` y se incluyen en la respuesta
- Los bookmarks contienen la estructura jerárquica del PDF (Títulos, Capítulos, Secciones, Artículos) con sus números de página

## Tareas a realizar

### 1. Crear función de conversión de bookmarks a MentalOutline
- **Archivo:** `lib/outline/bookmarksToOutline.ts` (o similar)
- **Función:** `convertBookmarksToMentalOutline(bookmarks: BookmarkItem[]): MentalOutline`
- **Lógica:**
  - Analizar la estructura jerárquica de los bookmarks
  - Identificar Títulos, Capítulos, Secciones y Artículos por patrones de texto
  - Mapear los números de página de los bookmarks
  - Crear la estructura `MentalOutline` compatible con el tipo existente

### 2. Modificar el endpoint de generación de esquema
- **Archivo:** `app/api/mental-outline/generate-direct/route.ts` (o crear nuevo endpoint)
- **Lógica:**
  - Verificar si hay bookmarks disponibles en la respuesta del upload
  - Si hay bookmarks y tienen estructura válida:
    - Usar `convertBookmarksToMentalOutline()` para generar el esquema
    - Retornar el esquema generado desde bookmarks
  - Si no hay bookmarks o no son válidos:
    - Usar el método actual (extracción desde índice del PDF)

### 3. Patrones a detectar en bookmarks
- **Títulos:** Texto que empieza con "TÍTULO", "Título", "Titulo" seguido de número romano o arábigo
- **Capítulos:** Texto que empieza con "CAPÍTULO", "Capítulo", "Capitulo" seguido de número
- **Secciones:** Texto que empieza con "SECCIÓN", "Sección", "Seccion" seguido de número
- **Artículos:** Texto que empieza con "Artículo", "Art." seguido de número

### 4. Validación
- Verificar que los bookmarks tengan al menos algunos elementos que parezcan Títulos o Artículos
- Validar que los números de página sean coherentes
- Comparar con el método actual para verificar calidad

### 5. Integración en el frontend
- **Archivo:** `app/generate/page.tsx`
- Mostrar indicador cuando el esquema se genera desde bookmarks
- Permitir al usuario elegir entre:
  - Esquema desde bookmarks (si está disponible)
  - Esquema desde índice del PDF (método actual)
  - Esquema desde IA (método por lotes)

## Archivos relevantes
- `lib/pdf/extractBookmarks.ts` - Función de extracción de bookmarks
- `app/api/upload/route.ts` - Endpoint que ya incluye bookmarks en la respuesta
- `app/api/mental-outline/generate-direct/route.ts` - Endpoint actual de generación directa
- `types/mentalOutline.ts` - Tipo de datos del esquema mental
- `components/LegalOutlineTree.tsx` - Componente que renderiza el esquema

## Notas adicionales
- Los bookmarks pueden no estar disponibles en todos los PDFs
- Algunos PDFs pueden tener bookmarks mal estructurados
- Es importante mantener el método actual como fallback
- Los bookmarks pueden tener diferentes formatos según el software que generó el PDF

## Ventajas de usar bookmarks
- ✅ Más rápido (no requiere parsear todo el texto)
- ✅ Más preciso (estructura exacta del PDF)
- ✅ No requiere IA
- ✅ Incluye números de página exactos

## Consideraciones
- Los bookmarks pueden no coincidir exactamente con el texto del PDF
- Puede haber discrepancias en la numeración
- Algunos PDFs tienen bookmarks incompletos o desactualizados


