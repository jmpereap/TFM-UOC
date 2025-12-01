# Notas: Problema con Disposiciones en Pantalla

## Estado Actual (30/11/2025)

### ✅ Lo que funciona:
1. **Detección de disposiciones**: El sistema detecta correctamente todas las disposiciones desde bookmarks:
   - 4 Disposiciones adicionales (con número)
   - 9 Disposiciones transitorias (con número)
   - 1 Disposición derogatoria (sin número) ✅ **DETECTADA**
   - 1 Disposición final (sin número) ✅ **DETECTADA**

2. **Logs confirman creación**: Los logs muestran que las disposiciones se crean correctamente:
   - Línea 284: `"tipo":"derogatoria","numeroDisposicion":"(sin número)"` - ✅ CREADA
   - Línea 291: `"tipo":"final","numeroDisposicion":"(sin número)"` - ✅ CREADA
   - Línea 293: `"disposiciones":15,"disposicionesDetalle":{"adicionales":4,"transitorias":9,"derogatorias":1,"finales":1}` - ✅ TOTAL CORRECTO

### ❌ Problema pendiente:
**Las disposiciones derogatorias y finales NO se muestran en pantalla**, aunque se detectan y crean correctamente en el backend.

## Cambios realizados:

### 1. Corrección del patrón regex (bookmarksToOutline.ts)
- **Antes**: `/Disposici[óo]nes?\s+...` (no funcionaba)
- **Ahora**: `/Disposici[óo]n(?:es)?\s+...` (funciona correctamente)

### 2. Lógica para disposiciones sin número
- **Antes**: Solo se creaban disposiciones si tenían número
- **Ahora**: Se crean disposiciones si:
  - Tienen número (disposiciones numeradas), O
  - No tienen número pero tampoco tienen hijos (disposiciones individuales)

### 3. Formato del número
- Con número: `"Disposición Adicional primera"`
- Sin número: `"Disposición Derogatoria"` o `"Disposición Final"`

## Archivos modificados:
- `lib/outline/bookmarksToOutline.ts`: Lógica de detección y creación de disposiciones

## Próximos pasos (mañana):
1. **Verificar el frontend** (`app/generate/page.tsx`):
   - Revisar la función `renderDisposGroup` y cómo renderiza las disposiciones
   - Verificar que `outline.disposiciones.derogatorias` y `outline.disposiciones.finales` se pasan correctamente al componente
   - Comprobar que el componente `OutlineDisplay` recibe y procesa todas las disposiciones

2. **Verificar el estado del esquema mental**:
   - Confirmar que `mentalOutline.disposiciones.derogatorias` y `mentalOutline.disposiciones.finales` están presentes en el estado
   - Revisar si hay algún filtro que esté excluyendo estas disposiciones

3. **Logs del frontend**:
   - Ya hay logs en `OutlineDisplay` que muestran `outline.disposiciones`
   - Verificar en la consola del navegador si las disposiciones llegan al frontend

## Referencias:
- Logs: `logs/app.jsonl` líneas 198-294 (última ejecución exitosa)
- Backend detecta: ✅ 15 disposiciones totales
- Frontend muestra: ❌ Solo 13 disposiciones (faltan derogatoria y final)


