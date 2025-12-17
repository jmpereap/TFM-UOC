# Resumen: Generación de Fichas de Disposiciones

## Introducción

El sistema genera fichas formateadas de disposiciones legales (adicionales, transitorias, derogatorias y finales) que incluyen el tipo de disposición, el número (si existe) y el texto completo de la disposición. Las fichas se generan en formato de texto plano y pueden descargarse como archivos TXT o PDF.

**Característica importante**: El texto de la disposición respeta los saltos de línea (`\n`) que vienen de la IA, manteniendo el formato original del texto extraído.

---

## Endpoint: `/api/mental-outline/generate-fiche-disposition`

### Parámetros de Entrada

El endpoint recibe un payload JSON con:

```typescript
{
  dispositionAnchor: string      // Anchor de la disposición (ej: "disp-adicional-1", "disp-transitoria-2")
  lawName: string                // Nombre de la ley (opcional, puede venir del metadata)
  mentalOutline: MentalOutline   // Esquema mental completo
  dispositionData: {             // Datos de la disposición extraída
    tipo: string                 // Tipo de disposición: "Adicional", "Transitoria", "Derogatoria", "Final"
    numero?: string              // Número de la disposición (ej: "primera", "1", "I")
    numero_disposicion?: string  // Alternativa para el número
    texto_encabezado?: string    // Texto del encabezado/rúbrica
    rubrica_disposicion?: string // Rúbrica de la disposición
    fullText?: string            // Prioridad 1: Texto completo extraído por IA
    texto_completo?: string      // Prioridad 2: Texto completo de la disposición
    resumen?: string             // Prioridad 3: Resumen generado por IA (fallback)
  }
  dispositionType?: string       // Tipo de disposición: "adicionales", "transitorias", "derogatorias", "finales"
}
```

### Validaciones

1. **dispositionAnchor**: Requerido - Identificador único de la disposición
2. **mentalOutline**: Requerido - Esquema mental completo del documento
3. **dispositionData**: Requerido - Datos de la disposición (debe tener al menos texto o rúbrica)

---

## Flujo de Generación

### Paso 1: Extraer Datos de la Disposición

El sistema extrae los datos de la disposición con prioridades:

1. **Número de la disposición:**
   - `dispositionData.numero_disposicion` o `dispositionData.numero`
   - Si no existe: "—" o "(sin número)"
   - **Normalización**: Si ya incluye "Disposición" (ej: "Disposición Adicional primera"), se usa tal cual. Si no, se añade el prefijo con el tipo.

2. **Rúbrica de la disposición:**
   - `dispositionData.rubrica_disposicion` o `dispositionData.texto_encabezado`
   - Puede estar vacía
   - **Nota**: La rúbrica ya NO se muestra por separado en la ficha (se eliminó esa sección)

3. **Texto de la disposición** (con prioridad):
   - **Primero**: `dispositionData.fullText` (texto completo extraído por IA)
   - **Segundo**: `dispositionData.texto_completo` (texto completo de la disposición)
   - **Tercero**: `dispositionData.resumen` (resumen generado por IA, como fallback)
   - Si ninguno existe: string vacío

4. **Tipo de disposición:**
   - Se obtiene de `dispositionType` o se infiere de `dispositionData.tipo`
   - Valores posibles: `'adicionales'`, `'transitorias'`, `'derogatorias'`, `'finales'`
   - Se convierte a etiqueta legible: "Adicional", "Transitoria", "Derogatoria", "Final"

### Paso 2: Obtener Nombre del Documento

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

### Paso 3: Formatear la Ficha

**Función:** `formatFicheDisposition()` en `lib/outline/formatFicheDisposition.ts`

Genera el texto formateado de la ficha con la siguiente estructura:

#### Estructura de la Ficha

```
═══════════════════════════════════════════════════════════
                  FICHA DE DISPOSICIÓN
═══════════════════════════════════════════════════════════

📄 Documento: [Nombre del documento]

───────────────────────────────────────────────────────────

📌 Disposición [Tipo] [número]

───────────────────────────────────────────────────────────

Texto de la disposición:

[Texto formateado de la disposición respetando \n de la IA]

───────────────────────────────────────────────────────────
```

**Características importantes**:
- **Ya NO se muestra la sección "Rúbrica:"** por separado (se eliminó)
- El texto de la disposición respeta los saltos de línea (`\n`) que vienen de la IA
- Se elimina la rúbrica del inicio del texto si coincide con el texto completo
- **No hay contexto jerárquico** (a diferencia de los artículos, las disposiciones no tienen Título/Capítulo/Sección)

#### Formateo del Texto de la Disposición

**Proceso actual** (líneas 56-125 de `formatFicheDisposition.ts`):

1. **Eliminación de la rúbrica del inicio**:
   - Si el texto empieza con "Disposición [Tipo] [Número]. Rúbrica", se elimina esa parte
   - Si el texto empieza solo con la rúbrica (sin "Disposición [Tipo] [Número]."), también se elimina
   - Esto evita duplicar información que ya no se muestra por separado

2. **Respeto de saltos de línea de la IA**:
   ```typescript
   // Dividir por \n y añadir cada línea respetando los saltos de línea
   const lineasTexto = textoFormateado.split('\n')
   
   for (const linea of lineasTexto) {
     // Respetar la línea tal como viene de la IA, manteniendo espacios si los hay
     // Solo eliminar espacios al final de la línea, pero mantener los del inicio (indentación)
     const lineaSinEspaciosFinal = linea.replace(/\s+$/, '')
     if (lineaSinEspaciosFinal.length > 0) {
       lines.push(lineaSinEspaciosFinal)
     } else {
       // Mantener líneas vacías para respetar los saltos de línea de la IA
       lines.push('')
     }
   }
   ```
   - El texto se divide por `\n` (saltos de línea que vienen de la IA)
   - Cada línea se añade respetando el formato original, incluyendo indentación
   - Las líneas vacías se mantienen para preservar la estructura

3. **Limpieza básica**:
   - Se eliminan espacios al final de cada línea
   - Se mantienen espacios al inicio (indentación)
   - Se mantienen líneas vacías para preservar saltos de línea

**Nota importante**: El texto se respeta tal cual viene de la IA, manteniendo los `\n` originales y la indentación.

#### Manejo de Rúbrica

- **Ya NO se muestra la rúbrica por separado** en la ficha
- Si la rúbrica aparece al inicio del texto completo, se elimina para evitar duplicación
- Si solo hay rúbrica (sin texto completo), se muestra la rúbrica como texto de la disposición

#### Normalización del Número de Disposición

- Si el número ya incluye "Disposición", se usa tal cual
- Si no, se construye como: `Disposición [Tipo] [número]`
- Si no hay número, se muestra solo: `Disposición [Tipo]`

---

## Integración en el Frontend

### Llamada desde el Frontend

**Archivo:** `app/generate/page.tsx` (líneas 863-1200+)

Cuando el usuario hace clic en "Crear ficha" en una disposición:

1. **Prepara los datos:**
   ```typescript
   const payload = {
     dispositionAnchor: disposicion.anchor,        // Anchor de la disposición seleccionada
     lawName: lawNameToUse || '',                   // Nombre de la ley (asegurar que sea string)
     mentalOutline,                                  // Esquema mental completo
     dispositionData: {                             // Datos de la disposición (ya extraídos por IA)
       tipo: tipoDisposicion,                        // "Adicional", "Transitoria", etc.
       numero: numeroDisposicion,                    // Número de la disposición
       texto_encabezado: disposicion.texto_encabezado,
       fullText: fullText,                           // Texto completo de la IA
     },
     dispositionType: tipo,                         // "adicionales", "transitorias", etc.
   }
   ```

2. **Llama al endpoint:**
   ```typescript
   const response = await fetch('/api/mental-outline/generate-fiche-disposition', {
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
- `resumen` existe (resumen generado)
- `fullText` existe (texto completo extraído)

```typescript
{mentalOutline && resumen && fullText && !fiche && (
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
a.download = `Ficha_Disposicion_${tipoLabel}_${number || 'sin_numero'}.txt`
a.click()
```

**2. Descarga como PDF:**
- Usa `pdf-lib` para generar el PDF
- Convierte el texto de la ficha a formato PDF
- Descarga como `Ficha_Disposicion_{tipo}_{numero}.pdf`

---

## Características Especiales

### Tipos de Disposiciones

El sistema soporta cuatro tipos de disposiciones:

1. **Adicionales**: Disposiciones adicionales de la ley
2. **Transitorias**: Disposiciones transitorias
3. **Derogatorias**: Disposiciones derogatorias
4. **Finales**: Disposiciones finales

Cada tipo se identifica y etiqueta correctamente en la ficha.

### Formateo del Texto

- **Respeta los saltos de línea de la IA**: El texto mantiene los `\n` originales del texto extraído por la IA
- **Mantiene la indentación**: Los espacios al inicio de las líneas se preservan
- **Elimina duplicación**: Si la rúbrica aparece al inicio del texto, se elimina
- **Preserva estructura**: Las líneas vacías se mantienen para preservar la estructura del texto

### Validación de Datos

- Verifica que haya texto o rúbrica antes de generar
- Maneja casos donde el texto está vacío (muestra "(Texto no disponible)")
- Usa fallbacks apropiados si faltan datos (fullText → texto_completo → resumen)
- Maneja disposiciones sin número (muestra solo el tipo)

### Prioridad del Texto

El sistema usa esta prioridad para obtener el texto de la disposición:

1. **`fullText`**: Texto completo extraído por IA (prioridad máxima)
2. **`texto_completo`**: Texto completo de la disposición (si no hay fullText)
3. **`resumen`**: Resumen generado por IA (fallback si no hay texto completo)

Esto asegura que siempre se use el texto más completo disponible.

---

## Logging y Debugging

El sistema incluye logging extensivo:

- `mentalOutline.ficheDisposition.request`: Request recibido con todos los parámetros
- `mentalOutline.ficheDisposition.data`: Datos extraídos de la disposición (número, rúbrica, texto)
- `mentalOutline.ficheDisposition.generated`: Ficha generada exitosamente
- `mentalOutline.ficheDisposition.error`: Errores en la generación

**Logging detallado incluye**:
- Tipo y valor de `lawName`
- Estado de `mentalOutline.metadata`
- Tipo de disposición
- Longitud del texto de la disposición
- Preview de la ficha generada (primeros 200 caracteres)

---

## Archivos Clave

- **`app/api/mental-outline/generate-fiche-disposition/route.ts`**: Endpoint principal que genera la ficha
- **`lib/outline/formatFicheDisposition.ts`**: Función `formatFicheDisposition()` que formatea la ficha
- **`app/generate/page.tsx`**: Integración en el frontend (componente `DispositionDetail`)

---

## Ejemplo de Ficha Generada

```
═══════════════════════════════════════════════════════════
                  FICHA DE DISPOSICIÓN
═══════════════════════════════════════════════════════════

📄 Documento: Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales

───────────────────────────────────────────────────────────

📌 Disposición Adicional primera

───────────────────────────────────────────────────────────

Texto de la disposición:

La presente Ley Orgánica entrará en vigor el día siguiente al de su publicación en el Boletín Oficial del Estado.

1. Quedan derogadas todas las disposiciones de igual o inferior rango que se opongan a lo establecido en la presente Ley Orgánica.

2. Se mantendrán en vigor, en tanto no se opongan a lo establecido en la presente Ley Orgánica, las disposiciones dictadas en desarrollo de la Ley Orgánica 15/1999, de 13 de diciembre, de Protección de Datos de Carácter Personal.

───────────────────────────────────────────────────────────
```

**Nota**: El texto respeta los saltos de línea (`\n`) que vienen de la IA, por lo que la estructura y formato del texto original se mantiene.

---

## Casos Especiales

### Disposición sin Número

Si la disposición no tiene número:
- Se muestra solo el tipo: `Disposición Adicional`
- El texto se genera normalmente

### Disposición sin Rúbrica

Si la disposición no tiene rúbrica:
- No se muestra ninguna sección de rúbrica (ya no existe esa sección)
- Solo se muestra el texto de la disposición

### Disposición sin Texto Completo

Si solo hay resumen (no texto completo):
- Se usa el resumen como texto de la disposición
- Se indica en el logging
- La ficha se genera normalmente

### Disposición Solo con Rúbrica

Si solo hay rúbrica (sin texto):
- La rúbrica se muestra como texto de la disposición
- No se duplica en ninguna sección (ya no existe la sección "Rúbrica:")

### Texto con Saltos de Línea de la IA

Si el texto completo viene con saltos de línea (`\n`) de la IA:
- Se respetan todos los saltos de línea
- Se mantiene la estructura original del texto
- Se preserva la indentación (espacios al inicio de las líneas)
- No se añaden saltos de línea adicionales automáticamente

### Diferencia con Artículos

A diferencia de las fichas de artículos, las fichas de disposiciones:
- **No incluyen contexto jerárquico** (no tienen Título/Capítulo/Sección)
- **Incluyen el tipo de disposición** (Adicional, Transitoria, Derogatoria, Final)
- **Pueden no tener número** (algunas disposiciones no están numeradas)

---

## Cambios Recientes

### Eliminación de la Sección "Rúbrica:"

**Antes**: La ficha mostraba la rúbrica por separado:
```
📌 Disposición Adicional primera

Rúbrica:
  Título de la disposición

───────────────────────────────────────────────────────────

Texto de la disposición:
...
```

**Ahora**: La rúbrica ya no se muestra por separado. Si aparece al inicio del texto, se elimina para evitar duplicación:
```
📌 Disposición Adicional primera

───────────────────────────────────────────────────────────

Texto de la disposición:
...
```

### Respeto de Saltos de Línea de la IA

**Antes**: El texto se formateaba automáticamente añadiendo saltos de línea antes de apartados numerados.

**Ahora**: El texto respeta los saltos de línea (`\n`) que vienen de la IA, manteniendo el formato original del texto extraído, incluyendo la indentación.

### Prioridad del Texto

**Antes**: Se usaba principalmente `texto_completo` o `resumen`.

**Ahora**: Se prioriza `fullText` (texto extraído por IA), luego `texto_completo`, y finalmente `resumen` como fallback.

---

## Mejoras Futuras

- [ ] Soporte para formato Markdown además de texto plano
- [ ] Opción de incluir o excluir el resumen en la ficha
- [ ] Personalización del formato de la ficha
- [ ] Inclusión de referencias cruzadas a otros artículos o disposiciones
- [ ] Soporte para múltiples idiomas en el formato
- [ ] Mejora en el manejo de tablas o listas complejas en el texto
- [ ] Cacheo de fichas generadas para evitar regenerar
- [ ] Soporte para disposiciones con subsecciones o apartados numerados

---

## Notas Técnicas

### Por qué se Respeta el Formato de la IA

El texto completo viene de la extracción con IA (`extract-disposition-ai`), que ya incluye saltos de línea (`\n`) apropiados para mantener la estructura de la disposición. Al respetar estos saltos de línea y la indentación, se preserva el formato original del documento legal.

### Por qué se Eliminó la Sección "Rúbrica:"

La rúbrica ya está incluida en el texto completo extraído por la IA. Mostrarla por separado causaba duplicación. Al eliminarla, la ficha es más limpia y evita redundancia.

### Integración con el Proceso de Extracción

La ficha se genera después de que la disposición ha sido extraída y resumida por la IA:
1. El usuario hace clic en una disposición
2. Se extrae el texto completo con IA (`extract-disposition-ai`)
3. Se genera el resumen con IA
4. El usuario puede generar la ficha usando el texto completo extraído

Esto asegura que la ficha use el texto más completo y preciso disponible.

### Manejo de Tipos de Disposiciones

El sistema identifica automáticamente el tipo de disposición desde el esquema mental:
- Las disposiciones están organizadas en `mentalOutline.disposiciones.adicionales`, `transitorias`, `derogatorias`, `finales`
- El tipo se pasa al endpoint y se usa para etiquetar correctamente la ficha
- Si no se especifica el tipo, se usa "adicionales" por defecto


