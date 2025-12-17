# Resumen: Generación de Fichas de Artículos

## Introducción

El sistema genera fichas formateadas de artículos legales que incluyen el contexto jerárquico completo (Título, Capítulo, Sección), el número del artículo y el texto completo del artículo. Las fichas se generan en formato de texto plano y pueden descargarse como archivos TXT o PDF.

**Característica importante**: El texto del artículo respeta los saltos de línea (`\n`) que vienen de la IA, manteniendo el formato original del texto extraído.

---

## Endpoint: `/api/mental-outline/generate-fiche`

### Parámetros de Entrada

El endpoint recibe un payload JSON con:

```typescript
{
  articleAnchor: string      // Anchor del artículo (ej: "art-1", "art-5")
  lawName: string            // Nombre de la ley (opcional, puede venir del metadata)
  mentalOutline: MentalOutline  // Esquema mental completo
  articleData: {             // Datos del artículo extraído
    numero_articulo?: string
    numero?: string
    rubrica_articulo?: string
    articulo_texto?: string
    texto_completo?: string  // Prioridad 1: Texto completo extraído por IA
    texto_articulo?: string  // Prioridad 2: Texto del artículo
    resumen?: string         // Prioridad 3: Resumen generado por IA (fallback)
  }
}
```

### Validaciones

1. **articleAnchor**: Requerido - Identificador único del artículo
2. **mentalOutline**: Requerido - Esquema mental completo del documento
3. **articleData**: Requerido - Datos del artículo (debe tener al menos texto o rúbrica)

---

## Flujo de Generación

### Paso 1: Obtener Contexto Jerárquico

**Función:** `getArticleContext()` en `lib/outline/getArticleContext.ts`

Busca el artículo en el esquema mental y obtiene su contexto jerárquico completo:

1. **Recorre todos los títulos** del esquema mental
2. **Busca el artículo** en tres niveles:
   - **Artículos directos del título** (`titulo.articulos_sin_capitulo`)
   - **Artículos directos del capítulo** (`capitulo.articulos_sin_seccion`)
   - **Artículos dentro de secciones** (`seccion.articulos`)

3. **Retorna el contexto** con:
   - **Título**: código, subtítulo, ordinal
   - **Capítulo**: código, subtítulo, ordinal (si existe)
   - **Sección**: código, subtítulo, ordinal (si existe)

**Ejemplo de contexto:**
```typescript
{
  titulo: {
    codigo: "TÍTULO I",
    subtitulo: "Disposiciones generales",
    ordinal: "I"
  },
  capitulo: {
    codigo: "CAPÍTULO I",
    subtitulo: "De los derechos fundamentales",
    ordinal: "I"
  },
  seccion: {
    codigo: "SECCIÓN 1",
    subtitulo: "De la libertad",
    ordinal: "1"
  }
}
```

### Paso 2: Extraer Datos del Artículo

El sistema extrae los datos del artículo con prioridades:

1. **Número del artículo:**
   - `articleData.numero_articulo` o `articleData.numero`
   - Si no existe: "—"
   - **Normalización**: Si ya incluye "Artículo" (ej: "Artículo 2"), se usa tal cual. Si no, se añade el prefijo.

2. **Rúbrica del artículo:**
   - `articleData.rubrica_articulo` o `articleData.articulo_texto`
   - Puede estar vacía
   - **Nota**: La rúbrica ya NO se muestra por separado en la ficha (se eliminó esa sección)

3. **Texto del artículo** (con prioridad):
   - **Primero**: `articleData.texto_completo` (texto completo extraído por IA)
   - **Segundo**: `articleData.texto_articulo` (texto del artículo)
   - **Tercero**: `articleData.resumen` (resumen generado por IA, como fallback)
   - Si ninguno existe: string vacío

### Paso 3: Obtener Nombre del Documento

El sistema determina el nombre del documento con esta prioridad:

1. **lawName** (si está disponible y no está vacío):
   - Limpia comillas dobles si están presentes
   - Valida que no sea solo comillas o espacios
   - Si está envuelto en comillas dobles, las elimina

2. **metadata.document_title** (del esquema mental):
   - Si `lawName` no es válido, usa `mentalOutline.metadata.document_title`

3. **metadata.source** (del esquema mental):
   - Si no hay `document_title`, usa `mentalOutline.metadata.source`

4. **Fallback**: "Documento sin título"
   - Si ninguno de los anteriores está disponible

**Lógica de limpieza de lawName:**
```typescript
let cleanedLawName = lawName
if (cleanedLawName && typeof cleanedLawName === 'string') {
  cleanedLawName = cleanedLawName.trim()
  // Si está envuelto en comillas dobles, eliminarlas
  if ((cleanedLawName.startsWith('"') && cleanedLawName.endsWith('"')) || 
      (cleanedLawName.startsWith('"') && cleanedLawName.endsWith('"'))) {
    cleanedLawName = cleanedLawName.slice(1, -1).trim()
  }
}
```

### Paso 4: Formatear la Ficha

**Función:** `formatFiche()` en `lib/outline/formatFiche.ts`

Genera el texto formateado de la ficha con la siguiente estructura:

#### Estructura de la Ficha

```
═══════════════════════════════════════════════════════════
                    FICHA DE ARTÍCULO
═══════════════════════════════════════════════════════════

📄 Documento: [Nombre del documento]

Estructura:
  📑 TÍTULO [ordinal] - [subtítulo]
  📖 CAPÍTULO [ordinal] - [subtítulo]  (si existe)
  📋 SECCIÓN [ordinal] - [subtítulo]   (si existe)

───────────────────────────────────────────────────────────

📌 Artículo [número]

───────────────────────────────────────────────────────────

Texto del artículo:

[Texto formateado del artículo respetando \n de la IA]

───────────────────────────────────────────────────────────
```

**Cambios importantes**:
- **Ya NO se muestra la sección "Rúbrica:"** por separado (se eliminó)
- El texto del artículo respeta los saltos de línea (`\n`) que vienen de la IA
- Se elimina la rúbrica del inicio del texto si coincide con el texto completo

#### Formateo del Texto del Artículo

**Proceso actual** (líneas 235-311 de `formatFiche.ts`):

1. **Eliminación de la rúbrica del inicio**:
   - Si el texto empieza con "Artículo X. Rúbrica", se elimina esa parte
   - Si el texto empieza solo con la rúbrica (sin "Artículo X."), también se elimina
   - Esto evita duplicar información que ya no se muestra por separado

2. **Respeto de saltos de línea de la IA**:
   ```typescript
   // Dividir por \n y añadir cada línea respetando los saltos de línea
   const lineasTexto = textoFormateado.split('\n')
   
   for (const linea of lineasTexto) {
     const lineaTrimmed = linea.trim()
     if (lineaTrimmed.length > 0) {
       lines.push(lineaTrimmed)
     } else {
       // Si la línea está vacía, mantener un salto de línea solo si no es el inicio
       if (lines.length > 0 && lines[lines.length - 1] !== '') {
         lines.push('')
       }
     }
   }
   ```
   - El texto se divide por `\n` (saltos de línea que vienen de la IA)
   - Cada línea se añade respetando el formato original
   - Las líneas vacías se mantienen para preservar la estructura

3. **Limpieza básica**:
   - Se eliminan líneas que son solo números (números de página)
   - Se normalizan espacios múltiples
   - Se eliminan líneas completamente vacías al inicio

**Nota importante**: Ya NO se usa la función `formatArticleText()` que añadía saltos de línea automáticamente antes de apartados numerados. El texto ahora se respeta tal cual viene de la IA, manteniendo los `\n` originales.

#### Manejo de Rúbrica

- **Ya NO se muestra la rúbrica por separado** en la ficha
- Si la rúbrica aparece al inicio del texto completo, se elimina para evitar duplicación
- Si solo hay rúbrica (sin texto completo), se muestra la rúbrica como texto del artículo

---

## Integración en el Frontend

### Llamada desde el Frontend

**Archivo:** `app/generate/page.tsx` (líneas 300-365)

Cuando el usuario hace clic en "Crear ficha":

1. **Prepara los datos:**
   ```typescript
   const payload = {
     articleAnchor: art.anchor,        // Anchor del artículo seleccionado
     lawName: lawName || '',           // Nombre de la ley (asegurar que sea string)
     mentalOutline,                    // Esquema mental completo
     articleData: {                    // Datos del artículo (ya extraídos por IA)
       numero_articulo: art.numero,
       rubrica_articulo: art.articulo_texto,
       texto_completo: articleData?.texto_completo,  // Texto completo de la IA
       resumen: articleData?.resumen                 // Resumen como fallback
     }
   }
   ```

2. **Llama al endpoint:**
   ```typescript
   const response = await fetch('/api/mental-outline/generate-fiche', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(payload)
   })
   ```

3. **Muestra la ficha:**
   - Guarda la ficha en el estado `fiche`
   - Muestra la ficha en un área de previsualización
   - Permite descargar la ficha como archivo `.txt` o `.pdf`

### Condición para Mostrar el Botón "Crear ficha"

El botón "Crear ficha" solo se muestra cuando:
- `mentalOutline` existe
- `articleData` existe (artículo extraído)
- `resumen` existe (resumen generado)

```typescript
{mentalOutline && articleData && resumen && (
  <button onClick={...}>
    Crear ficha
  </button>
)}
```

### Descarga de la Ficha

El frontend permite descargar la ficha en dos formatos:

**1. Descarga como TXT:**
```typescript
const blob = new Blob([fiche], { type: 'text/plain;charset=utf-8' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = `Ficha_Articulo_${art.numero.replace(/\s+/g, '_')}.txt`
a.click()
```

**2. Descarga como PDF:**
- Usa `pdf-lib` para generar el PDF
- Convierte el texto de la ficha a formato PDF
- Descarga como `Ficha_Articulo_{numero}.pdf`

---

## Características Especiales

### Manejo de Contexto Incompleto

- Si el artículo no tiene capítulo: solo muestra Título
- Si el artículo no tiene sección: muestra Título y Capítulo
- Si el artículo está directamente en el título: solo muestra Título

### Formateo del Texto

- **Respeta los saltos de línea de la IA**: El texto mantiene los `\n` originales del texto extraído por la IA
- **Elimina duplicación**: Si la rúbrica aparece al inicio del texto, se elimina
- **Elimina ruido**: Elimina números de página y líneas vacías al inicio
- **Normaliza espacios**: Unifica espacios múltiples dentro de cada línea

### Validación de Datos

- Verifica que haya texto o rúbrica antes de generar
- Maneja casos donde el texto está vacío (muestra "(Texto no disponible)")
- Usa fallbacks apropiados si faltan datos (texto_completo → texto_articulo → resumen)

### Prioridad del Texto

El sistema usa esta prioridad para obtener el texto del artículo:

1. **`texto_completo`**: Texto completo extraído por IA (prioridad máxima)
2. **`texto_articulo`**: Texto del artículo (si no hay texto_completo)
3. **`resumen`**: Resumen generado por IA (fallback si no hay texto completo)

Esto asegura que siempre se use el texto más completo disponible.

---

## Logging y Debugging

El sistema incluye logging extensivo:

- `mentalOutline.fiche.request`: Request recibido con todos los parámetros
- `mentalOutline.fiche.documentName.before`: Antes de determinar nombre del documento
- `mentalOutline.fiche.documentName.from_lawName`: Nombre obtenido desde lawName
- `mentalOutline.fiche.documentName.from_document_title`: Nombre obtenido desde document_title
- `mentalOutline.fiche.documentName.from_source`: Nombre obtenido desde source
- `mentalOutline.fiche.documentName.fallback`: Nombre por defecto usado
- `mentalOutline.fiche.data`: Datos extraídos del artículo (número, rúbrica, texto)
- `mentalOutline.fiche.generated`: Ficha generada exitosamente
- `mentalOutline.fiche.error`: Errores en la generación

**Logging detallado incluye**:
- Tipo y valor de `lawName`
- Estado de `mentalOutline.metadata`
- Longitud del texto del artículo
- Preview de la ficha generada (primeros 200 caracteres)

---

## Archivos Clave

- **`app/api/mental-outline/generate-fiche/route.ts`**: Endpoint principal que genera la ficha
- **`lib/outline/formatFiche.ts`**: Función `formatFiche()` que formatea la ficha
- **`lib/outline/getArticleContext.ts`**: Función `getArticleContext()` que obtiene el contexto jerárquico
- **`app/generate/page.tsx`**: Integración en el frontend (componente `ArticleDetail`)

---

## Ejemplo de Ficha Generada

```
═══════════════════════════════════════════════════════════
                    FICHA DE ARTÍCULO
═══════════════════════════════════════════════════════════

📄 Documento: Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales

Estructura:
  📑 TÍTULO I - Disposiciones generales
  📖 CAPÍTULO I - De los derechos fundamentales
  📋 SECCIÓN 1 - De la libertad

───────────────────────────────────────────────────────────

📌 Artículo 1

───────────────────────────────────────────────────────────

Texto del artículo:

La presente Ley Orgánica tiene por objeto garantizar y proteger el tratamiento de los datos personales y los derechos fundamentales de las personas físicas en relación con dicho tratamiento.

1. Esta Ley Orgánica se aplica al tratamiento de datos personales realizado por:
   a) Los responsables y encargados del tratamiento establecidos en territorio español.
   b) Los responsables y encargados del tratamiento no establecidos en territorio español cuando el tratamiento se relacione con la oferta de bienes o servicios a personas físicas en territorio español.

2. La presente Ley Orgánica se aplicará sin perjuicio de lo establecido en la normativa específica sectorial.

───────────────────────────────────────────────────────────
```

**Nota**: El texto respeta los saltos de línea (`\n`) que vienen de la IA, por lo que la estructura y formato del texto original se mantiene.

---

## Casos Especiales

### Artículo sin Contexto

Si el artículo no se encuentra en el esquema mental:
- El contexto será `null`
- La ficha se genera sin la sección "Estructura"
- El resto de la ficha se genera normalmente

### Artículo sin Rúbrica

Si el artículo no tiene rúbrica:
- No se muestra ninguna sección de rúbrica (ya no existe esa sección)
- Solo se muestra el texto del artículo

### Artículo sin Texto Completo

Si solo hay resumen (no texto completo):
- Se usa el resumen como texto del artículo
- Se indica en el logging
- La ficha se genera normalmente

### Artículo Solo con Rúbrica

Si solo hay rúbrica (sin texto):
- La rúbrica se muestra como texto del artículo
- No se duplica en ninguna sección (ya no existe la sección "Rúbrica:")

### Texto con Saltos de Línea de la IA

Si el texto completo viene con saltos de línea (`\n`) de la IA:
- Se respetan todos los saltos de línea
- Se mantiene la estructura original del texto
- No se añaden saltos de línea adicionales automáticamente

---

## Cambios Recientes

### Eliminación de la Sección "Rúbrica:"

**Antes**: La ficha mostraba la rúbrica por separado:
```
📌 Artículo 1

Rúbrica:
  Objeto de la Ley

───────────────────────────────────────────────────────────

Texto del artículo:
...
```

**Ahora**: La rúbrica ya no se muestra por separado. Si aparece al inicio del texto, se elimina para evitar duplicación:
```
📌 Artículo 1

───────────────────────────────────────────────────────────

Texto del artículo:
...
```

### Respeto de Saltos de Línea de la IA

**Antes**: El texto se formateaba automáticamente añadiendo saltos de línea antes de apartados numerados.

**Ahora**: El texto respeta los saltos de línea (`\n`) que vienen de la IA, manteniendo el formato original del texto extraído.

### Prioridad del Texto

**Antes**: Se usaba principalmente `texto_articulo` o `resumen`.

**Ahora**: Se prioriza `texto_completo` (texto extraído por IA), luego `texto_articulo`, y finalmente `resumen` como fallback.

---

## Mejoras Futuras

- [ ] Soporte para formato Markdown además de texto plano
- [ ] Opción de incluir o excluir el resumen en la ficha
- [ ] Personalización del formato de la ficha
- [ ] Inclusión de referencias cruzadas a otros artículos
- [ ] Soporte para múltiples idiomas en el formato
- [ ] Mejora en el manejo de tablas o listas complejas en el texto
- [ ] Cacheo de fichas generadas para evitar regenerar

---

## Notas Técnicas

### Por qué se Respeta el Formato de la IA

El texto completo viene de la extracción con IA (`extract-article-ai`), que ya incluye saltos de línea (`\n`) apropiados para mantener la estructura del artículo. Al respetar estos saltos de línea, se preserva el formato original del documento legal.

### Por qué se Eliminó la Sección "Rúbrica:"

La rúbrica ya está incluida en el texto completo extraído por la IA. Mostrarla por separado causaba duplicación. Al eliminarla, la ficha es más limpia y evita redundancia.

### Integración con el Proceso de Extracción

La ficha se genera después de que el artículo ha sido extraído y resumido por la IA:
1. El usuario hace clic en un artículo
2. Se extrae el texto completo con IA (`extract-article-ai`)
3. Se genera el resumen con IA
4. El usuario puede generar la ficha usando el texto completo extraído

Esto asegura que la ficha use el texto más completo y preciso disponible.
