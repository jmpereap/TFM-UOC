# Documentación: Fichas de Artículo

## a) Firma del endpoint y tipo de payload

### Endpoint

```ts
// app/api/mental-outline/generate-fiche/route.ts

POST /api/mental-outline/generate-fiche
```

### Tipo de Payload (Request)

```ts
type GenerateFicheRequest = {
  articleAnchor: string        // Requerido - Anchor del artículo (ej: "art-1", "art-5")
  lawName?: string              // Opcional - Nombre de la ley
  mentalOutline: MentalOutline  // Requerido - Esquema mental completo
  articleData: {                // Requerido - Datos del artículo extraído
    numero_articulo?: string
    numero?: string
    rubrica_articulo?: string
    articulo_texto?: string
    texto_completo?: string
    texto_articulo?: string
    resumen?: string
  }
}
```

**Validaciones:**
- `articleAnchor`: Requerido, debe ser string no vacío
- `mentalOutline`: Requerido, debe ser objeto válido
- `articleData`: Requerido, debe ser objeto válido

**Prioridad de campos en `articleData`:**
1. **Número:** `articleData.numero_articulo` → `articleData.numero` → `'—'` (fallback)
2. **Rúbrica:** `articleData.rubrica_articulo` → `articleData.articulo_texto` → `''` (fallback)
3. **Texto:** `articleData.texto_completo` → `articleData.texto_articulo` → `articleData.resumen` → `''` (fallback)

**Resolución del nombre del documento:**
1. `lawName` (si está disponible y no está vacío, limpiando comillas)
2. `mentalOutline.metadata.document_title` (si existe)
3. `mentalOutline.metadata.source` (si existe)
4. `'Documento sin título'` (fallback)

---

## b) Estructura exacta de salida

### Tipo de Response

```ts
type GenerateFicheResponse = {
  ok: boolean
  fiche: string      // Texto formateado de la ficha
  format: 'text'    // Siempre 'text'
}
```

### Tipo de Error Response

```ts
type GenerateFicheErrorResponse = {
  ok: false
  error: string
}
```

**Códigos de estado HTTP:**
- `200`: Éxito
- `400`: Error de validación (campos requeridos faltantes)
- `500`: Error interno del servidor

### Estructura del texto formateado (`fiche`)

La ficha es un **string de texto plano** con la siguiente estructura:

```
═══════════════════════════════════════════════════════════
                    FICHA DE ARTÍCULO
═══════════════════════════════════════════════════════════

📄 Documento: {lawName}

Estructura:
  📑 {TÍTULO} - {subtitulo}
  📖 {CAPÍTULO} - {subtitulo}  (si existe)
  📋 {SECCIÓN} - {subtitulo}   (si existe)

───────────────────────────────────────────────────────────

📌 Artículo {numero}

Rúbrica:                    (solo si rúbrica ≠ texto completo)
  {rubrica}

───────────────────────────────────────────────────────────

Texto del artículo:

{texto formateado con apartados y letras}

───────────────────────────────────────────────────────────
```

**Nota:** No hay metadatos JSON separados. Todo está incluido en el texto formateado.

---

## c) Reglas de formateo

### Formateo de apartados numerados y letras

**Función `formatArticleText()`** (`lib/outline/formatFiche.ts` líneas 15-111):

```ts
function formatArticleText(text: string): string[] {
  // 1. Normalizar: eliminar líneas vacías y números solos
  // 2. Unir líneas continuas en un solo texto
  // 3. Normalizar espacios múltiples
  // 4. Detectar apartados numerados (1., 2., 3., etc.)
  // 5. Detectar letras (a), b), c), etc.)
  // 6. Dividir el texto en partes basándose en apartados/letras
  // 7. Retornar array de partes formateadas
}
```

**Reglas específicas:**

1. **Eliminación de líneas:**
   - Líneas vacías
   - Líneas que son solo números (`/^\d+$/`)

2. **Normalización:**
   - Unir líneas continuas en un solo texto (reemplazar saltos por espacios)
   - Normalizar espacios múltiples a un solo espacio

3. **Detección de apartados:**
   - Patrón: `/\b(\d+)\.\s+/g` (ej: "1. ", "2. ", "3. ")

4. **Detección de letras:**
   - Patrón: `/\b([a-z])\)\s+/gi` (ej: "a) ", "b) ", "c) ")

5. **División del texto:**
   - Si no hay apartados ni letras → devolver texto como un solo párrafo
   - Si hay apartados/letras → dividir en partes, cada una con su apartado/letra

### Reglas de espaciado en la ficha

**En `formatFiche()`** (`lib/outline/formatFiche.ts` líneas 200-228):

```ts
// Solo añadir línea vacía antes de apartados (no antes de letras ni párrafos continuos)
if (isApartado && i > 0) {
  // Verificar que la línea anterior no esté vacía
  const prevLine = formattedLines[i - 1]?.trim() || ''
  if (prevLine.length > 0) {
    lines.push('')  // Línea vacía antes del apartado
  }
}

lines.push(trimmed)  // Añadir la línea

// Solo añadir línea vacía después de apartados si el siguiente no es letra
if (isApartado && i < formattedLines.length - 1) {
  const nextLine = formattedLines[i + 1]?.trim() || ''
  if (!/^[a-z]\)\s/i.test(nextLine) && nextLine.length > 0) {
    lines.push('')  // Línea vacía después del apartado
  }
}
```

**Reglas:**
- ✅ Línea vacía **antes** de apartados numerados (si hay contenido previo)
- ❌ NO línea vacía antes de letras
- ✅ Línea vacía **después** de apartados (si el siguiente NO es letra)
- ❌ NO línea vacía después de apartados si el siguiente es letra

### Limpieza y normalización

**Limpieza del texto del artículo:**

1. **Eliminación de líneas:**
   ```ts
   // Eliminar líneas que sean solo números
   .filter(l => !/^\d+$/.test(l.trim()))
   ```

2. **Unión de líneas:**
   ```ts
   // Unir líneas continuas en un solo texto
   texto = lineasFiltradas.map(l => l.trim()).join(' ').trim()
   ```

3. **Normalización de espacios:**
   ```ts
   // Normalizar espacios múltiples
   texto = texto.replace(/\s+/g, ' ')
   ```

**Limpieza del nombre del documento:**

```ts
// app/api/mental-outline/generate-fiche/route.ts (líneas 66-74)
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

**Detección de rúbrica duplicada:**

```ts
// lib/outline/formatFiche.ts (líneas 175-179)
const rubricaSinEspacios = rubricaNormalizada.replace(/\s+/g, ' ')
const textoSinEspacios = textoNormalizado.replace(/\s+/g, ' ')
const sonIguales = rubricaSinEspacios === textoSinEspacios || 
                   (rubricaSinEspacios.length > 0 && textoSinEspacios.startsWith(rubricaSinEspacios))

// Si son iguales, NO mostrar rúbrica por separado
if (rubricaNormalizada && !sonIguales) {
  // Mostrar rúbrica
}
```

---

## d) Ejemplos reales de fichas generadas

### Ejemplo 1: Ficha con Título/Capítulo/Sección completo

```
═══════════════════════════════════════════════════════════
                    FICHA DE ARTÍCULO
═══════════════════════════════════════════════════════════

📄 Documento: Ley Orgánica 3/2023, de 28 de febrero, de medidas para la igualdad real y efectiva de las personas trans y para la garantía de los derechos de las personas LGTBI

Estructura:
  📑 TÍTULO I - De los derechos y deberes
  📖 CAPÍTULO I - Derechos fundamentales
  📋 SECCIÓN 1 - De la protección de datos

───────────────────────────────────────────────────────────

📌 Artículo 3

Rúbrica:
  Protección de datos personales

───────────────────────────────────────────────────────────

Texto del artículo:

1. Los datos personales de las personas trans y LGTBI serán tratados con especial protección, garantizando su confidencialidad y seguridad.

2. El tratamiento de estos datos se realizará conforme a la normativa vigente en materia de protección de datos personales, aplicándose las siguientes reglas:

a) Los datos relativos a la identidad de género o la orientación sexual solo podrán ser objeto de tratamiento cuando sea estrictamente necesario para el cumplimiento de los fines legítimos previstos en esta Ley.

b) Se prohíbe expresamente la comunicación o cesión de estos datos a terceros sin el consentimiento explícito del interesado, salvo en los casos previstos por la ley.

c) Los responsables del tratamiento deberán adoptar las medidas técnicas y organizativas necesarias para garantizar la seguridad de los datos.

3. Las infracciones de lo dispuesto en este artículo serán sancionadas conforme a la normativa de protección de datos de carácter personal.

───────────────────────────────────────────────────────────
```

### Ejemplo 2: Ficha sin sección (Título/Capítulo)

```
═══════════════════════════════════════════════════════════
                    FICHA DE ARTÍCULO
═══════════════════════════════════════════════════════════

📄 Documento: Ley Orgánica 3/2023

Estructura:
  📑 TÍTULO I - De los derechos y deberes
  📖 CAPÍTULO I - Derechos fundamentales

───────────────────────────────────────────────────────────

📌 Artículo 2

Rúbrica:
  Derecho a la información

───────────────────────────────────────────────────────────

Texto del artículo:

1. Los ciudadanos tienen derecho a acceder a la información pública en los términos establecidos en esta Ley.

2. Este derecho comprende:

a) El acceso a la información contenida en documentos públicos.

b) La obtención de copias o certificados de los documentos solicitados.

c) El derecho a conocer el estado de las solicitudes presentadas.

3. El ejercicio de este derecho se realizará conforme a lo dispuesto en el presente Título.

───────────────────────────────────────────────────────────
```

### Ejemplo 3: Ficha con artículo directo del Título (sin Capítulo ni Sección)

```
═══════════════════════════════════════════════════════════
                    FICHA DE ARTÍCULO
═══════════════════════════════════════════════════════════

📄 Documento: Ley Orgánica 3/2023

Estructura:
  📑 TÍTULO PRELIMINAR - Disposiciones generales

───────────────────────────────────────────────────────────

📌 Artículo 1

───────────────────────────────────────────────────────────

Texto del artículo:

La presente Ley tiene por objeto establecer el marco normativo para la igualdad real y efectiva de las personas trans y para la garantía de los derechos de las personas LGTBI, así como prevenir y erradicar cualquier forma de discriminación por razón de orientación sexual, identidad de género o expresión de género.

───────────────────────────────────────────────────────────
```

**Nota:** En este caso, la rúbrica no se muestra por separado porque es igual al texto completo.

### Ejemplo 4: Ficha con texto muy corto (solo rúbrica)

```
═══════════════════════════════════════════════════════════
                    FICHA DE ARTÍCULO
═══════════════════════════════════════════════════════════

📄 Documento: Ley Orgánica 3/2023

Estructura:
  📑 TÍTULO I - De los derechos y deberes
  📖 CAPÍTULO I - Derechos fundamentales

───────────────────────────────────────────────────────────

📌 Artículo 10

───────────────────────────────────────────────────────────

Texto del artículo:

Plazos de resolución

───────────────────────────────────────────────────────────
```

**Nota:** Cuando el texto es muy corto y coincide con la rúbrica, se muestra como texto del artículo.

---

## e) Exportación a TXT/PDF y convención de nombre

### Exportación a TXT

**✅ Implementada en el frontend** (`app/generate/page.tsx` líneas 393-411):

```ts
// Descargar el archivo
const blob = new Blob([fiche], { type: 'text/plain;charset=utf-8' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = `Ficha_Articulo_${art.numero.replace(/\s+/g, '_')}.txt`
document.body.appendChild(a)
a.click()
document.body.removeChild(a)
URL.revokeObjectURL(url)
```

**Convención de nombre:**
- Formato: `Ficha_Articulo_{numero}.txt`
- Ejemplos:
  - `Ficha_Articulo_1.txt`
  - `Ficha_Articulo_5.txt`
  - `Ficha_Articulo_10.txt`
- Los espacios en el número se reemplazan por guiones bajos (`_`)

**Tipo MIME:**
- `text/plain;charset=utf-8`

### Exportación a PDF

**❌ NO implementada**

No existe funcionalidad de exportación a PDF para fichas de artículo. Solo se exporta como TXT.

**Si se implementara, sugerencias:**
- Formato: `Ficha_Articulo_{numero}.pdf`
- Usar biblioteca como `pdf-lib` o `jsPDF`
- Mantener el formato de texto plano con fuentes monoespaciadas

---

## Archivos relacionados

- **Endpoint:** `app/api/mental-outline/generate-fiche/route.ts`
- **Formateo:** `lib/outline/formatFiche.ts`
- **Contexto:** `lib/outline/getArticleContext.ts`
- **Tipos:** `types/mentalOutline.ts`
- **Frontend:** `app/generate/page.tsx` (líneas 315-415)

---

## Resumen de flujo

1. **Request:** Cliente → `/api/mental-outline/generate-fiche` (POST)
   - Payload: `{ articleAnchor, lawName, mentalOutline, articleData }`

2. **Validación:**
   - Verificar `articleAnchor`, `mentalOutline`, `articleData`

3. **Obtención de contexto:**
   - `getArticleContext(mentalOutline, articleAnchor)` → Obtiene Título/Capítulo/Sección

4. **Resolución de nombre:**
   - `lawName` → `metadata.document_title` → `metadata.source` → `'Documento sin título'`

5. **Formateo:**
   - `formatFiche({ lawName, context, articleNumber, articleRubrica, articleText })`
   - Aplica reglas de formateo de apartados y letras
   - Genera texto formateado

6. **Response:**
   - `{ ok: true, fiche: string, format: 'text' }`

7. **Exportación (frontend):**
   - Descarga como `Ficha_Articulo_{numero}.txt`

---

## Detalles técnicos

**Caracteres especiales en la ficha:**
- `═` (U+2550): Línea doble horizontal (encabezado)
- `─` (U+2500): Línea simple horizontal (separadores)
- `📄`, `📑`, `📖`, `📋`, `📌`: Emojis para iconos

**Codificación:**
- UTF-8 (soporta caracteres especiales y emojis)

**Longitud:**
- Sin límite explícito
- Depende de la longitud del texto del artículo


