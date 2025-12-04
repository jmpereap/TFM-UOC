### OUTPUT-FICHA-DISPOSICION

## a) Endpoint y payload que espera

### Endpoint

```ts
// app/api/mental-outline/generate-fiche-disposition/route.ts
export async function POST(req: Request): Promise<Response> { ... }
```

### Payload esperado

```ts
// Payload lógico (validación manual)
type GenerateFicheDispositionPayload = {
  dispositionAnchor: string      // ej: "disp-adicional-1", "disp-transitoria-2"
  lawName?: string               // opcional; si viene vacío se usa metadata del outline
  mentalOutline: MentalOutline   // esquema mental completo (types/mentalOutline.ts)
  dispositionData: {
    tipo: string                 // "Adicional", "Transitoria", "Derogatoria", "Final"
    numero?: string              // ej: "primera", "1", "I"
    numero_disposicion?: string  // alternativa para el número
    texto_encabezado?: string    // encabezado/rúbrica
    rubrica_disposicion?: string // rúbrica
    fullText?: string            // Prioridad 1: texto completo extraído por IA
    texto_completo?: string      // Prioridad 2: texto completo de la disposición
    resumen?: string             // Prioridad 3: resumen generado por IA (fallback)
  }
  dispositionType?: 'adicionales' | 'transitorias' | 'derogatorias' | 'finales'
}
```

Reglas:

- `dispositionAnchor`: requerido (anchor de la disposición en `mentalOutline.disposiciones.*`).
- `mentalOutline`: requerido (`MentalOutline` de `types/mentalOutline.ts`).
- `dispositionData`: requerido; debe incluir al menos texto (`fullText` / `texto_completo` / `resumen`) o rúbrica.
- `lawName`: opcional; si está vacío se obtiene de:
  1. `mentalOutline.metadata.document_title`
  2. `mentalOutline.metadata.source`
  3. `"Documento sin título"` como fallback.
- `dispositionType`: opcional; si falta, se infiere desde el propio anchor / posición en el esquema.

---

## b) Estructura exacta de salida

### Tipo de respuesta

```ts
type GenerateFicheDispositionResponse = {
  ok: boolean
  fiche: string       // Texto plano de la ficha de disposición
  format: 'text'      // Actualmente solo 'text'
}
```

- No se devuelve un objeto de metadatos separado; toda la información (tipo, número, nombre de documento) va embebida en el propio string `fiche`.

---

## c) Reglas de formateo

### c.1. Tipo de entrada de `formatFicheDisposition`

```ts
// lib/outline/formatFicheDisposition.ts

export type FicheDispositionData = {
  lawName: string
  dispositionNumber: string
  dispositionRubrica: string
  dispositionText: string
  dispositionType: 'adicionales' | 'transitorias' | 'derogatorias' | 'finales'
}
```

### c.2. Plantilla de la ficha

La función `formatFicheDisposition(data)` genera una ficha con esta estructura:

```text
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

Notas:

- `[Tipo]` se deriva de `dispositionType`:
  - `'adicionales'` → `"Adicional"`
  - `'transitorias'` → `"Transitoria"`
  - `'derogatorias'` → `"Derogatoria"`
  - `'finales'` → `"Final"`
- `[número]` se construye a partir de:
  - `dispositionData.numero_disposicion` o `dispositionData.numero`.
  - Si está vacío: se muestra sólo `Disposición [Tipo]` (sin número).

### c.3. Selección del texto de la disposición

Prioridad para `dispositionText`:

1. `dispositionData.fullText` (texto IA).
2. `dispositionData.texto_completo`.
3. `dispositionData.resumen`.
4. Si ninguna está presente → cadena vacía (la ficha mostrará algo como `(Texto no disponible)` según versión).

### c.4. Manejo de rúbrica

- `dispositionRubrica` proviene de:
  - `dispositionData.rubrica_disposicion` o, en su defecto, `dispositionData.texto_encabezado`.
- Ya **no** se imprime una sección “Rúbrica:” separada.
- Si la rúbrica aparece incluida al inicio del texto (por ejemplo, el texto empieza con:
  - `"Disposición Adicional primera. [Rúbrica] ..."`, o
  - directamente `"Disposición Adicional primera. ..."`,
  se elimina esa porción inicial para no duplicar encabezados.
- Si solo hay rúbrica y no hay cuerpo de texto:
  - La rúbrica se usa como texto de la disposición.

### c.5. Respeto de saltos de línea e indentación

El texto se procesa respetando al máximo el formato de la IA:

```ts
const lineasTexto = textoFormateado.split('\n')

for (const linea of lineasTexto) {
  // Mantener espacios de inicio (indentación), limpiar sólo espacios finales
  const lineaSinEspaciosFinal = linea.replace(/\s+$/, '')
  if (lineaSinEspaciosFinal.length > 0) {
    lines.push(lineaSinEspaciosFinal)
  } else {
    // Mantener líneas vacías para respetar saltos de párrafo
    lines.push('')
  }
}
```

Reglas:

- Se conservan los `\n` proporcionados por la IA.
- Se mantienen los espacios iniciales de cada línea (indentación jurídica).
- Sólo se eliminan espacios en blanco al final de la línea.
- Las líneas vacías se mantienen para preservar saltos de párrafo.

### c.6. Limpieza y normalización

- No se aplica limpieza de índice aquí (ya viene limpio del flujo de extracción).
- No se generan saltos de línea adicionales antes de apartados numerados (`1.`, `a)`, etc.).
- El número de disposición se normaliza:
  - Si ya incluye el prefijo completo (ej. `"Disposición adicional primera"`), se respeta tal cual.
  - En caso contrario se construye combinando tipo y número: `"Disposición Adicional primera"`.

---

## d) Ejemplos reales de fichas generadas (JSON)

### d.1. Disposición Adicional con número

Basado en el ejemplo de `RESUMEN-GENERACION-FICHAS-DISPOSICION.md`:

```json
{
  "fiche": "═══════════════════════════════════════════════════════════\n                  FICHA DE DISPOSICIÓN\n═══════════════════════════════════════════════════════════\n\n📄 Documento: Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales\n\n───────────────────────────────────────────────────────────\n\n📌 Disposición Adicional primera\n\n───────────────────────────────────────────────────────────\n\nTexto de la disposición:\n\nLa presente Ley Orgánica entrará en vigor el día siguiente al de su publicación en el Boletín Oficial del Estado.\n\n1. Quedan derogadas todas las disposiciones de igual o inferior rango que se opongan a lo establecido en la presente Ley Orgánica.\n\n2. Se mantendrán en vigor, en tanto no se opongan a lo establecido en la presente Ley Orgánica, las disposiciones dictadas en desarrollo de la Ley Orgánica 15/1999, de 13 de diciembre, de Protección de Datos de Carácter Personal.\n\n───────────────────────────────────────────────────────────\n"
}
```

Características:

- Etiqueta principal: `📌 Disposición Adicional primera`.
- Cuerpo con párrafo introductorio y apartados numerados (1., 2.).
- Respeta los saltos de línea e indentación originales.

### d.2. Disposición Transitoria sin número explícito

Ejemplo sintético representativo de una disposición sin número (sólo tipo):

```json
{
  "fiche": "═══════════════════════════════════════════════════════════\n                  FICHA DE DISPOSICIÓN\n═══════════════════════════════════════════════════════════\n\n📄 Documento: Ley Orgánica X/20XX, de X de XXXX\n\n───────────────────────────────────────────────────────────\n\n📌 Disposición Transitoria\n\n───────────────────────────────────────────────────────────\n\nTexto de la disposición:\n\nLa aplicación de lo dispuesto en esta Ley se realizará de forma gradual, conforme al calendario que se establezca en la normativa de desarrollo.\n\n1. En el primer año se adaptarán los procedimientos existentes.\n2. En el segundo año se formará al personal afectado.\n3. En el tercer año se evaluará el funcionamiento y, en su caso, se introducirán las modificaciones necesarias.\n\n───────────────────────────────────────────────────────────\n"
}
```

Características:

- Como `dispositionNumber` está vacío, sólo se muestra `📌 Disposición Transitoria`.
- El texto conserva la numeración de los apartados.

---

## e) Exportación TXT / PDF y convención de nombres

La exportación se hace desde el frontend (`DispositionDetail` en `app/generate/page.tsx`) a partir del string `fiche`:

### e.1. Exportación como TXT

```ts
// app/generate/page.tsx (componente DispositionDetail)
const blob = new Blob([fiche], { type: 'text/plain;charset=utf-8' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = `Ficha_Disposicion_${tipoLabel}_${number || 'sin_numero'}.txt`
a.click()
```

Donde:

- `tipoLabel` es `"Adicional" | "Transitoria" | "Derogatoria" | "Final"`.
- `number` es el número normalizado de la disposición (ordinal o numérico), con espacios reemplazados por `_`; si falta se usa `"sin_numero"`.

**Convención de nombre TXT:**

- `Ficha_Disposicion_{Tipo}_{Numero}.txt`
  - Ej.: `Ficha_Disposicion_Adicional_primera.txt`
  - Ej.: `Ficha_Disposicion_Transitoria_1.txt`
  - Ej.: `Ficha_Disposicion_Final_sin_numero.txt`

### e.2. Exportación como PDF

- Se usa `pdf-lib` para generar un PDF a partir del texto `fiche`.
- El nombre de archivo sigue la misma convención:

```ts
// Esquema general
a.download = `Ficha_Disposicion_${tipoLabel}_${number || 'sin_numero'}.pdf`
```

**Convención de nombre PDF:**

- `Ficha_Disposicion_{Tipo}_{Numero}.pdf`
  - Ej.: `Ficha_Disposicion_Derogatoria_unica.pdf`

### e.3. No hay CSV

- No existe exportación de fichas de disposiciones a CSV.
- Los formatos disponibles son:
  - JSON (respuesta del endpoint).
  - TXT y PDF (generados en frontend desde `fiche`).


