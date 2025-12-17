# Tarea para mañana: Modificar mental-outline-article-summary

## Objetivo
Modificar `mental-outline-article-summary` para que:
1. Lo que encuentra en el PDF se envíe a la IA para resumir
2. El resumen sea lo que se muestra en pantalla

## Estado actual

### Backend: `app/api/mental-outline/extract-article/route.ts`
- ✅ Ya extrae el artículo del PDF (función `extractArticleFromText`, líneas 19-105)
- ✅ Ya envía el texto a la IA para resumir (líneas 187-273)
- ✅ Devuelve: `rubrica_articulo`, `texto_completo`, `resumen`, `paginas`

### Frontend: `app/generate/page.tsx` (líneas 254-333)
- ✅ Componente `ArticuloCard` que maneja el clic en artículos
- ✅ Llama a `/api/mental-outline/extract-article` al hacer clic
- ✅ Muestra el resumen cuando está disponible (línea 328)
- ⚠️ Solo muestra el resumen cuando se hace clic y se expande

## Cambios necesarios

### Opción 1: Mejorar el resumen generado
- Revisar el prompt de resumen (líneas 188-213)
- Asegurar que el resumen sea más útil y preciso
- Validar mejor la respuesta de la IA

### Opción 2: Mostrar siempre el resumen
- Generar el resumen automáticamente al cargar el esquema
- Mostrar el resumen directamente sin necesidad de hacer clic
- Pre-cargar resúmenes para todos los artículos visibles

### Opción 3: Mejorar la extracción del artículo
- Asegurar que se extrae correctamente el texto completo del PDF
- Mejorar la detección de límites del artículo
- Limpiar mejor headers/footers del texto extraído

## Archivos a modificar

1. **`app/api/mental-outline/extract-article/route.ts`**
   - Función `extractArticleFromText` (líneas 19-105)
   - Prompt de resumen (líneas 188-213)
   - Procesamiento de respuesta de IA (líneas 224-263)

2. **`app/generate/page.tsx`**
   - Componente `ArticuloCard` (líneas 254-333)
   - Lógica de carga y visualización del resumen

## Notas técnicas

- El endpoint usa `callModelJSON` para generar el resumen
- El resumen se valida para asegurar longitud mínima (20 caracteres)
- Si falla el resumen, se devuelve `resumen: null`
- El frontend muestra "Resumen no disponible." si no hay resumen

## Preguntas a resolver

1. ¿El resumen se está generando pero no se muestra correctamente?
2. ¿El resumen no se está generando en absoluto?
3. ¿Queremos mostrar el resumen siempre o solo al hacer clic?
4. ¿Necesitamos mejorar la calidad del resumen?



