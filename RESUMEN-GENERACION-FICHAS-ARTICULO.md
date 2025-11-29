# Resumen: Generación de Fichas de Artículos

## Introducción

El sistema genera fichas formateadas de artículos legales que incluyen el contexto jerárquico completo (Título, Capítulo, Sección), la rúbrica y el texto completo del artículo. Las fichas se generan en formato de texto plano y pueden descargarse.

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
    texto_completo?: string
    resumen?: string
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

2. **Rúbrica del artículo:**
   - `articleData.rubrica_articulo` o `articleData.articulo_texto`
   - Puede estar vacía

3. **Texto del artículo** (con prioridad):
   - **Primero**: `articleData.texto_completo` (texto completo extraído)
   - **Segundo**: `articleData.texto_articulo` (texto del artículo)
   - **Tercero**: `articleData.resumen` (resumen generado por IA)
   - Si ninguno existe: string vacío

### Paso 3: Obtener Nombre del Documento

El sistema determina el nombre del documento con esta prioridad:

1. **lawName** (si está disponible y no está vacío):
   - Limpia comillas dobles si están presentes
   - Valida que no sea solo comillas o espacios

2. **metadata.document_title** (del esquema mental):
   - Si `lawName` no es válido, usa `mentalOutline.metadata.document_title`

3. **metadata.source** (del esquema mental):
   - Si no hay `document_title`, usa `mentalOutline.metadata.source`

4. **Fallback**: "Documento sin título"
   - Si ninguno de los anteriores está disponible

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

[Rúbrica:]  (solo si existe y no es igual al texto completo)
  [rúbrica]

───────────────────────────────────────────────────────────

Texto del artículo:

[Texto formateado del artículo]

───────────────────────────────────────────────────────────
```

#### Formateo del Texto del Artículo

**Función:** `formatArticleText()` en `lib/outline/formatFiche.ts`

El texto del artículo se formatea para mejorar su legibilidad:

1. **Normalización inicial:**
   - Elimina líneas vacías
   - Elimina líneas que son solo números (números de página)
   - Une líneas continuas en un solo texto
   - Normaliza espacios múltiples

2. **Detección de estructura:**
   - **Apartados numerados**: Detecta patrones `\d+\.\s+` (ej: "1. ", "2. ")
   - **Letras**: Detecta patrones `[a-z]\)\s+` (ej: "a) ", "b) ")

3. **División en partes:**
   - Divide el texto en partes basándose en apartados y letras
   - Cada apartado/letra se trata como una sección separada

4. **Formateo final:**
   - Añade saltos de línea antes de apartados numerados (para separarlos)
   - NO añade saltos antes de letras (pertenecen al apartado anterior)
   - Mantiene el texto continuo sin estructura como párrafos

**Ejemplo de formateo:**
```
Texto original:
"El artículo establece lo siguiente. 1. Primera disposición. a) Subpunto. b) Otro subpunto. 2. Segunda disposición."

Texto formateado:
"El artículo establece lo siguiente.

1. Primera disposición. a) Subpunto. b) Otro subpunto.

2. Segunda disposición."
```

#### Manejo de Rúbrica

- Si hay rúbrica y **NO es igual** al texto completo: se muestra por separado
- Si la rúbrica y el texto completo son **iguales o muy similares**: no se duplica, solo se muestra el texto
- Si solo hay rúbrica (sin texto completo): se muestra la rúbrica como texto del artículo

---

## Integración en el Frontend

### Llamada desde el Frontend

**Archivo:** `app/generate/page.tsx`

Cuando el usuario hace clic en "Crear ficha":

1. **Prepara los datos:**
   ```typescript
   const payload = {
     articleAnchor: art.anchor,        // Anchor del artículo seleccionado
     lawName: lawName,                 // Nombre de la ley
     mentalOutline: schema,            // Esquema mental completo
     articleData: {                    // Datos del artículo (ya extraídos)
       numero_articulo: art.numero,
       rubrica_articulo: art.articulo_texto,
       texto_completo: articleData?.texto_completo,
       resumen: articleData?.resumen
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
   - Permite descargar la ficha como archivo `.txt`

### Descarga de la Ficha

El frontend permite descargar la ficha como archivo de texto:

```typescript
const blob = new Blob([fiche], { type: 'text/plain;charset=utf-8' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = `Ficha_Articulo_${art.numero.replace(/\s+/g, '_')}.txt`
a.click()
```

---

## Características Especiales

### Manejo de Contexto Incompleto

- Si el artículo no tiene capítulo: solo muestra Título
- Si el artículo no tiene sección: muestra Título y Capítulo
- Si el artículo está directamente en el título: solo muestra Título

### Formateo Inteligente

- **Preserva la estructura**: Mantiene apartados numerados y letras
- **Mejora legibilidad**: Añade saltos de línea apropiados
- **Elimina ruido**: Elimina números de página y líneas vacías
- **Normaliza espacios**: Unifica espacios múltiples

### Validación de Datos

- Verifica que haya texto o rúbrica antes de generar
- Maneja casos donde el texto está vacío
- Usa fallbacks apropiados si faltan datos

---

## Logging y Debugging

El sistema incluye logging extensivo:

- `mentalOutline.fiche.request`: Request recibido
- `mentalOutline.fiche.documentName.before`: Antes de determinar nombre del documento
- `mentalOutline.fiche.documentName.from_lawName`: Nombre desde lawName
- `mentalOutline.fiche.documentName.from_document_title`: Nombre desde document_title
- `mentalOutline.fiche.documentName.from_source`: Nombre desde source
- `mentalOutline.fiche.documentName.fallback`: Nombre por defecto
- `mentalOutline.fiche.data`: Datos extraídos del artículo
- `mentalOutline.fiche.generated`: Ficha generada exitosamente
- `mentalOutline.fiche.error`: Errores en la generación

---

## Archivos Clave

- `app/api/mental-outline/generate-fiche/route.ts` - Endpoint principal
- `lib/outline/formatFiche.ts` - Formateo de la ficha
- `lib/outline/getArticleContext.ts` - Obtención del contexto jerárquico
- `app/generate/page.tsx` - Integración en el frontend

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

Rúbrica:
  Objeto de la Ley

───────────────────────────────────────────────────────────

Texto del artículo:

La presente Ley Orgánica tiene por objeto garantizar y proteger el tratamiento de los datos personales y los derechos fundamentales de las personas físicas en relación con dicho tratamiento.

1. Esta Ley Orgánica se aplica al tratamiento de datos personales realizado por:
   a) Los responsables y encargados del tratamiento establecidos en territorio español.
   b) Los responsables y encargados del tratamiento no establecidos en territorio español cuando el tratamiento se relacione con la oferta de bienes o servicios a personas físicas en territorio español.

2. La presente Ley Orgánica se aplicará sin perjuicio de lo establecido en la normativa específica sectorial.

───────────────────────────────────────────────────────────
```

---

## Casos Especiales

### Artículo sin Contexto

Si el artículo no se encuentra en el esquema mental:
- El contexto será `null`
- La ficha se genera sin la sección "Estructura"
- El resto de la ficha se genera normalmente

### Artículo sin Rúbrica

Si el artículo no tiene rúbrica:
- Se omite la sección "Rúbrica:"
- Solo se muestra el texto del artículo

### Artículo sin Texto Completo

Si solo hay resumen (no texto completo):
- Se usa el resumen como texto del artículo
- Se indica en el logging

### Artículo Solo con Rúbrica

Si solo hay rúbrica (sin texto):
- La rúbrica se muestra como texto del artículo
- No se duplica en la sección "Rúbrica:"

---

## Mejoras Futuras

- [ ] Soporte para formato Markdown además de texto plano
- [ ] Opción de incluir o excluir el resumen en la ficha
- [ ] Formato PDF además de TXT
- [ ] Personalización del formato de la ficha
- [ ] Inclusión de referencias cruzadas a otros artículos
- [ ] Soporte para múltiples idiomas en el formato


