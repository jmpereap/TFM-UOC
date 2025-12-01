# Resumen: Generación del Resumen de Artículos

## Introducción

El sistema genera resúmenes automáticos de artículos legales extraídos de PDFs. El proceso consta de **dos etapas principales**:

1. **Extracción del artículo** del PDF (texto completo)
2. **Generación del resumen** usando IA o métodos extractivos

---

## Etapa 1: Extracción del Artículo del PDF

### Endpoint: `/api/mental-outline/extract-article`

Este endpoint extrae el texto completo de un artículo específico del PDF.

### Flujo de Extracción

#### 1. Determinación del Origen de las Páginas

El sistema determina qué páginas usar según el origen del esquema mental:

**Desde Bookmarks:**
- Usa `pagesFull` directamente (números de página exactos de los bookmarks)
- `extractFromFooter = false` (no necesita extraer números del pie de página)

**Desde Método Directo (índice):**
- Usa `pagesFullRaw` (páginas completas del PDF)
- `extractFromFooter = true` (extrae números de página del pie de página)

**Extracción de Números del Pie de Página:**
- Busca líneas que contengan solo un número (1-3 dígitos, < 1000)
- Patrones: "página X", "pág. X", "p. X", "X / Y"
- Filtra números que parecen años (4 dígitos > 2000) o muy grandes

#### 2. Localización del Artículo

1. **Busca la página** donde está el artículo según `articuloPagina`
2. **Crea un rango amplio**: 3 páginas antes + 8 páginas después (para capturar artículos largos)
3. **Construye el texto completo** de las páginas del rango

#### 3. Extracción del Texto del Artículo

La función `extractArticleFromText()` realiza la extracción:

**Paso 1: Buscar el Encabezado del Artículo**
- Patrón: `^Artículo\s+{numero}(?:bis|ter|quater|...)?\s*\.`
- Busca al inicio de línea o en cualquier parte (fallback)
- Maneja variantes: "Artículo 1.", "Art. 2", "Artículo 1 bis."

**Paso 2: Extraer la Rúbrica**
- Busca texto después de "Artículo X." hasta el primer punto o dos puntos
- **Validaciones importantes:**
  - NO acepta solo números (ej: "1.", "2)")
  - Debe tener al menos 2 caracteres
  - Debe contener letras (no solo números y símbolos)

**Paso 3: Extraer el Cuerpo del Artículo**
- El artículo incluye TODO el texto después de la rúbrica hasta:
  - El siguiente artículo (ej: "Artículo 2.")
  - Un encabezado de TÍTULO, CAPÍTULO, SECCIÓN o DISPOSICIÓN
  - El final del texto
- **Puede ocupar múltiples páginas** (no se corta por cambios de página)

**Paso 4: Manejo de Cabeceras y Pies de Página**
- **Detecta cabeceras**: "BOLETÍN OFICIAL DEL ESTADO", "LEGISLACIÓN CONSOLIDADA"
- **Detecta pies de página**: Patrón `RX_BOE_FOOTER`
- **Elimina siempre** cabeceras y pies del texto del artículo (no son contenido)
- **Maneja artículos que cruzan páginas**: Si el artículo termina en una cabecera/pie, busca el siguiente delimitador después de la cabecera/pie

**Paso 5: Limpieza del Texto**
- Elimina líneas que son solo números (números de página)
- Elimina líneas con formato de índice (puntos seguidos de números)
- Elimina múltiples puntos consecutivos del índice
- Normaliza saltos de línea (máximo 2 seguidos)
- Elimina espacios al inicio y final de líneas
- Elimina líneas vacías

#### 4. Búsqueda Fallback

Si el artículo no se encuentra en el rango inicial:

1. **Busca en todo el PDF** todas las ocurrencias de "Artículo X"
2. **Valida cada match**:
   - Rechaza contenido de índice (muchos puntos seguidos)
   - Verifica que tenga contenido sustancial (>200 caracteres, palabras reales)
3. **Extrae desde el match válido** más cercano a la página esperada

#### 5. Validación Final

- Verifica que el artículo se haya encontrado
- Valida que tenga contenido (texto o rúbrica)
- Si solo hay rúbrica, usa la rúbrica como texto completo
- Si no hay contenido, retorna error

---

## Etapa 2: Generación del Resumen

### Método Principal: IA (OpenAI)

**Función:** `generateArticleSummaryWithAI()` en `lib/utils/articleSummary.ts`

#### Proceso:

1. **Validación Inicial**
   - Verifica que el texto tenga al menos 20 caracteres
   - Si es muy corto (< 100 caracteres), retorna resumen vacío (no tiene sentido resumir)

2. **Limpieza del Texto**
   - Elimina patrones "Página X" del texto
   - Preserva el resto del contenido

3. **Construcción del Prompt para la IA**
   ```
   Eres un experto en derecho español. Resume de forma clara y coherente el siguiente artículo legal.
   
   Rúbrica: [rúbrica si existe]
   Artículo [número]
   
   Texto del artículo:
   [texto completo]
   
   IMPORTANTE:
   - NO INVENTES contenido. Solo resume lo que está escrito.
   - Si el texto es demasiado corto, responde con {"resumen": ""}
   - Si no tiene apartados numerados, simplemente parafrasea el contenido
   
   Genera un resumen completo y detallado (máximo 1200 caracteres) que:
   1. Sea coherente y bien estructurado
   2. Capture TODOS los puntos principales del artículo
   3. Incluya los apartados numerados (1., 2., 3., etc.) y sus contenidos principales
   4. Incluya las letras (a), b), c), etc.) si son relevantes
   5. Use lenguaje claro y preciso
   6. Puede perder el formato original si es necesario para mayor claridad
   7. NO añadas información que no esté explícitamente en el texto original
   
   Responde SOLO con un objeto JSON: {"resumen": "..."}
   ```

4. **Llamada a la IA**
   - Usa `callModelJSON()` con:
     - Timeout: 30 segundos
     - Max tokens: 1500
     - Endpoint: 'article-summary-ai'

5. **Extracción del Resumen**
   - Busca el campo `resumen` o `summary` en la respuesta JSON
   - Si es string, intenta parsearlo como JSON
   - Si falla, usa la respuesta directamente

6. **Validación y Limpieza**
   - Verifica que tenga al menos 20 caracteres
   - Si es muy corto, retorna vacío
   - Limita a 1200 caracteres máximo:
     - Busca el último punto antes de 1200 caracteres
     - Si no hay punto, busca punto y coma
     - Si no hay ninguno, trunca en 1200 con "..."
   - Normaliza espacios múltiples

7. **Manejo de Errores**
   - Si la IA indica "no tiene suficiente contenido", usa el texto completo como resumen
   - Si hay otro error, retorna resumen vacío

### Método Alternativo: Extractivo (No usado actualmente)

**Función:** `generateArticleSummary()` en `lib/utils/articleSummary.ts`

Este método NO se usa actualmente, pero está disponible como fallback. Usa técnicas de procesamiento de texto:

1. **Análisis de Estructura**
   - Divide por apartados numerados (1., 2., 3., etc.)
   - Si hay estructura, construye resumen desde apartados
   - Añade introducción + primeras 2-3 oraciones de cada apartado

2. **Análisis de Oraciones**
   - Divide el texto en oraciones
   - Calcula importancia usando:
     - Frecuencia de palabras (TF)
     - Palabras clave jurídicas (artículo, dispone, establece, etc.)
     - Posición de la oración (primeras son más importantes)
     - Longitud de la oración (prefiere 50-200 caracteres)
     - Presencia de números (pueden ser plazos, artículos, etc.)

3. **Selección de Mejores Oraciones**
   - Ordena por score de importancia
   - Selecciona hasta 5 oraciones o 50% del total
   - Mantiene el orden original

4. **Construcción del Resumen**
   - Une las mejores oraciones
   - Limita a 600 caracteres (trunca inteligentemente)
   - Valida que tenga sentido

---

## Flujo Completo en el Endpoint

### Secuencia de Operaciones:

1. **Recibe payload** con:
   - `articuloNumero`: "1", "2", etc.
   - `articuloPagina`: número de página donde está el artículo
   - `pagesFull` o `pagesFullRaw`: páginas del PDF
   - `sourceFromBookmarks`: boolean (indica si viene desde bookmarks)

2. **Determina origen** y normaliza páginas

3. **Localiza el artículo** en el PDF

4. **Extrae el texto completo** del artículo

5. **Genera el resumen**:
   - Si texto < 20 caracteres: usa texto completo como resumen
   - Si texto >= 20 caracteres: llama a `generateArticleSummaryWithAI()`
   - Si la IA falla o retorna vacío: usa texto completo como resumen

6. **Retorna respuesta**:
   ```json
   {
     "ok": true,
     "numero_articulo": "1",
     "rubrica_articulo": "Rúbrica del artículo",
     "texto_completo": "Texto completo extraído...",
     "resumen": "Resumen generado por IA...",
     "paginas": [15, 16, 17]
   }
   ```

---

## Características Especiales

### Manejo de Artículos Largos

- El sistema busca en un rango amplio (3 páginas antes + 8 después)
- Puede extraer artículos que ocupan múltiples páginas
- Maneja correctamente artículos que cruzan cabeceras/pies de página

### Manejo de Artículos Cortos

- Si el texto es muy corto (< 20 caracteres), usa el texto completo como resumen
- Si la IA indica que no hay suficiente contenido, usa el texto completo
- Si solo hay rúbrica, usa la rúbrica como texto completo

### Validación de Contenido

- Rechaza contenido de índice (muchos puntos seguidos)
- Verifica que el texto tenga palabras reales (no solo números)
- Valida que la rúbrica no sea solo un número

### Limpieza Inteligente

- Elimina cabeceras y pies de página (no son contenido)
- Preserva la estructura del artículo (apartados, letras, etc.)
- Normaliza espacios y saltos de línea
- Elimina elementos de formato del índice

---

## Logging y Debugging

El sistema incluye logging extensivo en cada etapa:

- `mentalOutline.article.extract.source`: Origen de las páginas
- `mentalOutline.article.extract.footer_extraction`: Extracción de números del pie
- `mentalOutline.article.extract.page_found`: Página encontrada
- `mentalOutline.article.extract.searching_article`: Búsqueda del artículo
- `mentalOutline.article.extract.initial_extraction`: Extracción inicial
- `mentalOutline.article.extract.fallback_*`: Búsqueda fallback
- `mentalOutline.article.extract.article_found`: Artículo encontrado
- `articleSummary.texto_limpio`: Texto limpio antes de IA
- `articleSummary.ai.input`: Input a la IA
- `articleSummary.ai.output`: Output de la IA
- `articleSummary.ai.error`: Errores de la IA

---

## Archivos Clave

- `app/api/mental-outline/extract-article/route.ts` - Endpoint principal de extracción
- `lib/utils/articleSummary.ts` - Funciones de generación de resumen
- `lib/legal/fragments.ts` - Patrones de cabeceras y pies de página (RX_BOE_HEADER, RX_BOE_FOOTER)
- `lib/qa/callModel.ts` - Función para llamar a la IA (`callModelJSON`)

---

## Configuración

### Parámetros de la IA:
- **Timeout**: 30 segundos
- **Max tokens**: 1500
- **Max caracteres del resumen**: 1200

### Parámetros de Extracción:
- **Rango de búsqueda**: 3 páginas antes + 8 después
- **Longitud mínima para resumir**: 100 caracteres
- **Longitud mínima del resumen**: 20 caracteres

---

## Casos Especiales

### Artículo No Encontrado
- Busca en todo el PDF como fallback
- Valida que no sea contenido de índice
- Si no se encuentra, retorna error 404

### Artículo Solo con Rúbrica
- Usa la rúbrica como texto completo
- Genera resumen desde la rúbrica (si es suficientemente larga)

### Artículo Muy Corto
- Si < 20 caracteres: usa texto completo como resumen
- Si < 100 caracteres: la IA puede retornar resumen vacío, se usa texto completo

### Error en la IA
- Si la IA falla: usa texto completo como resumen
- Si la IA retorna vacío: usa texto completo como resumen
- Si la IA indica "contenido insuficiente": usa texto completo como resumen

---

## Mejoras Futuras

- [ ] Cachear resúmenes generados para evitar regenerar
- [ ] Permitir regenerar resumen con diferentes parámetros
- [ ] Mejorar detección de artículos en PDFs mal formateados
- [ ] Añadir opción de resumen extractivo como alternativa
- [ ] Mejorar manejo de artículos con tablas o listas complejas






