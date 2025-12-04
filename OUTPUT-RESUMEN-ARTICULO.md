### OUTPUT-RESUMEN-ARTICULO

## a) Tipo TS / Zod del output del endpoint

### Endpoint

```ts
// app/api/mental-outline/extract-article-ai/route.ts
export async function POST(req: NextRequest) { ... }
```

**Salida JSON (forma efectiva):**

```ts
type ExtractArticleAIResponse = {
  ok: boolean
  articleNumber: string              // Siempre presente (normalizado a string)
  title: string | null               // Título/rúbrica del artículo, sin "Artículo N.", puede ser null
  fullText: string                   // Texto completo extraído del artículo (puede ser cadena vacía)
  resumen: string                    // Resumen final (ver reglas de fallbacks)
  startsAtIndex: number | null       // Índice 0-based en rawText donde empieza el artículo, o null
  endsAtIndex: number | null         // Índice 0-based donde termina el artículo, o null
  nextHeaderPreview: string | null   // Fragmento breve de lo que sigue al artículo, o null
}
```

**Campos obligatorios:**

- `ok`: siempre presente (`true` en éxito, `false` en error).
- `articleNumber`: string (usa el número pedido si la IA no lo aporta).
- `fullText`: string (puede ser `''`).
- `resumen`: string (si no se genera resumen, se rellena con `fullText`).

**Campos opcionales (pueden ser `null`):**

- `title`
- `startsAtIndex`
- `endsAtIndex`
- `nextHeaderPreview`

**Errores:**

- Si falta `articleNumber` o `lawName`:

```ts
{ ok: false, error: 'articleNumber requerido' }  // 400
{ ok: false, error: 'lawName requerido' }        // 400
```

- Si faltan páginas (`pagesFullRaw`/`pagesFull`):

```ts
{ ok: false, error: 'pagesFullRaw o pagesFull requerido' }  // 400
```

- Si hay error interno/IA:

```ts
{ ok: false, error: string }  // 500
```

No hay Zod schema explícito para este output; la forma anterior se infiere del código.

---

## b) Reglas de limpieza y umbrales

### b.1. Limpieza de texto del artículo

Antes de resumir:

- Se obtiene `textoCompleto = extractedArticle.fullText.trim()`.
- Se llama a `generateArticleSummaryWithAI(textoCompleto, rubricaArticulo, numeroArticulo)`.

En `generateArticleSummaryWithAI`:

```ts
// Mínimo absoluto para siquiera intentar resumir
if (!textoCompleto || textoCompleto.trim().length < 20) {
  return ''
}

// Limpieza de cabecera/pie "Página X"
const textoOriginal = textoCompleto
let textoLimpio = textoCompleto.replace(/P[áa]gina\s+\d+/gi, '').trim()
textoCompleto = textoLimpio
```

**Efectos:**

- Se eliminan sólo los literales tipo `"Página 15"`, `"Pagina 3"`, etc., no el resto del contenido.
- Se registran logs con el texto original, el limpio y previas.

### b.2. Umbrales de longitud

En `generateArticleSummaryWithAI`:

- **Para iniciar resumen IA**:
  - `textoCompleto.trim().length >= 20` (si no, retorna `''` directamente).
  - Después de limpiar, si `textoCompleto.length < 100`:

  ```ts
  logEvent('articleSummary.ai.skip_short_text', { ... })
  return ''
  ```

  → Se considera “demasiado corto para resumir”.

- **Validación de resumen mínimo**:

```ts
resumen = resumen.trim()
if (resumen.length < 20) {
  logEvent('articleSummary.ai.short_response', { ... })
  return ''
}
```

- **Truncado máximo (soft cap 1200 caracteres)**:

```ts
if (resumen.length > 1200) {
  const ultimoPunto = resumen.lastIndexOf('.', 1200)
  if (ultimoPunto > 600) {
    resumen = resumen.substring(0, ultimoPunto + 1)
  } else {
    const ultimoPuntoComa = resumen.lastIndexOf(';', 1200)
    if (ultimoPuntoComa > 600) {
      resumen = resumen.substring(0, ultimoPuntoComa + 1)
    } else {
      resumen = resumen.substring(0, 1200) + '...'
    }
  }
}
```

**Timeouts y tokens:**

- Llamada de resumen IA:
  - Timeout: `30s`.
  - `max tokens`: `1500`.
- Llamada de extracción de artículo:
  - Timeout: `30s`.
  - `max tokens`: `4000`.

### b.3. Reglas de fallback

En el endpoint:

```ts
let resumen = ''
const textoCompleto = extractedArticle.fullText.trim()

if (textoCompleto && textoCompleto.length > 0) {
  if (textoCompleto.length < 20) {
    // Artículo muy corto → el “resumen” es el propio texto
    resumen = textoCompleto
  } else {
    resumen = await generateArticleSummaryWithAI(...)
    // Limpieza final básica
    if (resumen) {
      resumen = resumen.replace(/\s+/g, ' ').trim()
      if (resumen.length < 20 || !/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(resumen)) {
        resumen = ''
      }
    }
  }
} else {
  // Sin textoCompleto → no hay resumen
  resumen = ''
}

// Fallback final
if (!resumen && textoCompleto && textoCompleto.length > 0) {
  resumen = textoCompleto
}

// En la respuesta JSON:
resumen: resumen || extractedArticle.fullText
```

**Resumen de comportamiento:**

- Si el artículo es **muy corto** (< 20 chars) → resumen = `fullText`.
- Si la IA **falla** o devuelve algo muy corto/ruidoso:
  - `generateArticleSummaryWithAI` puede devolver `''`.
  - El endpoint rellena `resumen` con el `fullText`.
- Si hay error en IA (catch) → se usa `textoCompleto` como resumen.

No hay reglas especiales para cabeceras/pies de página más allá de eliminar `"Página X"` antes del resumen.

---

## c) Ejemplos reales de salida

### c.1. Artículo muy corto (artículo 166 CE)

**Log:** `logs/extract-article-ai-2025-12-01T07-47-21-884Z.json`

```json
{
  "ok": true,
  "articleNumber": "166",
  "title": null,
  "fullText": "Artículo 166.\nLa iniciativa de reforma constitucional se ejercerá en los términos previstos en los\napartados 1 y 2 del artículo 87.\n",
  "resumen": "La iniciativa de reforma constitucional se llevará a cabo según lo establecido en los apartados 1 y 2 del artículo 87.",
  "startsAtIndex": 0,
  "endsAtIndex": 83,
  "nextHeaderPreview": "Artículo 167."
}
```

Características:

- `fullTextLength` ~ 130 caracteres → suficiente para resumen IA.
- `resumen` es una paráfrasis corta de la única frase del artículo.

### c.2. Artículo largo con varios apartados (artículo 11 LOPDGDD)

**Log:** `logs/extract-article-ai-2025-12-01T10-14-35-380Z.json`

```json
{
  "ok": true,
  "articleNumber": "11",
  "title": "Transparencia e información al afectado.",
  "fullText": "Artículo 11. Transparencia e información al afectado.\n1. Cuando los datos personales sean obtenidos del afectado el responsable del\ntratamiento podrá dar cumplimiento al deber de información establecido en el artículo 13 del\nReglamento (UE) 2016/679 facilitando al afectado la información básica a la que se refiere el\napartado siguiente e indicándole una dirección electrónica u otro medio que permita acceder\nde forma sencilla e inmediata a la restante información.\n2. La información básica a la que se refiere el apartado anterior deberá contener, al\nmenos:\na) La identidad del responsable del tratamiento y de su representante, en su caso.\nb) La finalidad del tratamiento.\nc) La posibilidad de ejercer los derechos establecidos en los artículos 15 a 22 del\nReglamento (UE) 2016/679.\nSi los datos obtenidos del afectado fueran a ser tratados para la elaboración de perfiles,\nla información básica comprenderá asimismo esta circunstancia. En este caso, el afectado\ndeberá ser informado de su derecho a oponerse a la adopción de decisiones individuales\nautomatizadas que produzcan efectos jurídicos sobre él o le afecten significativamente de\nmodo similar, cuando concurra este derecho de acuerdo con lo previsto en el artículo 22 del\nReglamento (UE) 2016/679.\n3. Cuando los datos personales no hubieran sido obtenidos del afectado, el responsable\npodrá dar cumplimiento al deber de información establecido en el artículo 14 del Reglamento\n(UE) 2016/679 facilitando a aquel la información básica señalada en el apartado anterior,\nindicándole una dirección electrónica u otro medio que permita acceder de forma sencilla e\ninmediata a la restante información.\nEn estos supuestos, la información básica incluirá también:\na) Las categorías de datos objeto de tratamiento.\nb) Las fuentes de las que procedieran los datos.",
  "resumen": "Artículo 11. Transparencia e información al afectado. 1. Si los datos personales son obtenidos del afectado, el responsable del tratamiento debe cumplir con el deber de información del artículo 13 del Reglamento (UE) 2016/679, proporcionando información básica y un medio para acceder a información adicional. 2. La información básica debe incluir: a) la identidad del responsable y su representante; b) la finalidad del tratamiento; c) la posibilidad de ejercer los derechos de los artículos 15 a 22 del Reglamento. Si se van a elaborar perfiles, se debe informar al afectado sobre su derecho a oponerse a decisiones automatizadas que le afecten, según el artículo 22 del Reglamento. 3. Si los datos no son obtenidos del afectado, el responsable puede cumplir con el deber de información del artículo 14 del Reglamento, proporcionando la información básica mencionada y un medio para acceder a información adicional. En este caso, la información básica también incluirá: a) las categorías de datos tratados; b) las fuentes de los datos.",
  "startsAtIndex": 0,
  "endsAtIndex": 1000,
  "nextHeaderPreview": "CAPÍTULO II\nEjercicio de los derechos"
}
```

Características:

- `fullTextLength` ≈ 1800 caracteres.
- `resumenLength` ≈ 1000 caracteres (cerca del límite blando de 1200).
- El resumen:
  - Reproduce la rúbrica al inicio.
  - Resume los apartados 1–3 indicando condiciones y referencias al RGPD.

### c.3. Artículo largo con varios apartados y múltiples exclusiones (artículo 2 LOPDGDD)

**Log:** `logs/extract-article-ai-2025-12-01T14-02-48-192Z.json`

```json
{
  "ok": true,
  "articleNumber": "2",
  "title": "Ámbito de aplicación de los Títulos I a IX y de los artículos 89 a 94.",
  "fullText": "Artículo 2. Ámbito de aplicación de los Títulos I a IX y de los artículos 89 a 94.\n1. Lo dispuesto en los Títulos I a IX y en los artículos 89 a 94 de la presente ley orgánica\nse aplica a cualquier tratamiento total o parcialmente automatizado de datos personales, así\ncomo al tratamiento no automatizado de datos personales contenidos o destinados a ser\nincluidos en un fichero.\n2. Esta ley orgánica no será de aplicación:\na) A los tratamientos excluidos del ámbito de aplicación del Reglamento general de\nprotección de datos por su artículo 2.2, sin perjuicio de lo dispuesto en los apartados 3 y 4 de\neste artículo.\nb) A los tratamientos de datos de personas fallecidas, sin perjuicio de lo establecido en el\nartículo 3.\nc) A los tratamientos sometidos a la normativa sobre protección de materias clasificadas.\n3. Los tratamientos a los que no sea directamente aplicable el Reglamento (UE)\n2016/679 por afectar a actividades no comprendidas en el ámbito de aplicación del Derecho\nde la Unión Europea, se regirán por lo dispuesto en su legislación específica si la hubiere y\nsupletoriamente por lo establecido en el citado reglamento y en la presente ley orgánica. Se\nencuentran en esta situación, entre otros, los tratamientos realizados al amparo de la\nlegislación orgánica del régimen electoral general, los tratamientos realizados en el ámbito\nde instituciones penitenciarias y los tratamientos derivados del Registro Civil, los Registros\nde la Propiedad y Mercantiles.\n4. El tratamiento de datos llevado a cabo con ocasión de la tramitación por los órganos\njudiciales de los procesos de los que sean competentes, así como el realizado dentro de la\ngestión de la Oficina Judicial, se regirán por lo dispuesto en el Reglamento (UE) 2016/679 y\njulio, del Poder Judicial, que le sean aplicables.\n5. El tratamiento de datos llevado a cabo con ocasión de la tramitación por el Ministerio\nFiscal de los procesos de los que sea competente, así como el realizado con esos fines\ndentro de la gestión de la Oficina Fiscal, se regirán por lo dispuesto en el Reglamento (UE)\n2016/679 y la presente Ley Orgánica, sin perjuicio de las disposiciones de la Ley 50/1981, de\n30 de diciembre, reguladora del Estatuto Orgánico del Ministerio Fiscal, la Ley Orgánica\n6/1985, de 1 de julio, del Poder Judicial y de las normas procesales que le sean aplicables.",
  "resumen": "Artículo 2. Ámbito de aplicación de los Títulos I a IX y de los artículos 89 a 94. 1. Se aplica a cualquier tratamiento automatizado o no automatizado de datos personales en ficheros. 2. No se aplica a: a) tratamientos excluidos por el artículo 2.2 del Reglamento general de protección de datos; b) datos de personas fallecidas; c) tratamientos bajo normativa de protección de materias clasificadas. 3. Tratamientos no regulados por el Reglamento (UE) 2016/679 se regirán por su legislación específica y, supletoriamente, por el reglamento y esta ley. Ejemplos incluyen legislación electoral, instituciones penitenciarias y registros civiles, de propiedad y mercantiles. 4. Tratamientos en procesos judiciales se regirán por el Reglamento (UE) 2016/679 y la normativa del Poder Judicial aplicable. 5. Tratamientos por el Ministerio Fiscal en procesos competentes se regirán por el Reglamento (UE) 2016/679 y esta ley, respetando la Ley 50/1981 y la Ley Orgánica 6/1985.",
  "startsAtIndex": 0,
  "endsAtIndex": 1035,
  "nextHeaderPreview": "Artículo 3. Datos de las personas fallecidas."
}
```

Características:

- Artículo largo con múltiples letras y apartados.
- El resumen:
  - Recorre los cinco apartados.
  - Enumera exclusiones y legislación supletoria.
  - Se mantiene muy cerca del límite de 1200 caracteres.

*(En los logs no hay un caso claro de “solo rúbrica” como output de `fullText`; pero el código documenta que, si solo hubiese rúbrica, `fullText` contendría solo esa rúbrica y el “resumen” sería exactamente ese texto o quedaría vacío si fuese demasiado corto.)*

---

## d) Exportación (CSV/JSON) y convención de nombre

- **JSON**:
  - No hay endpoint de exportación específico, pero el propio `/api/mental-outline/extract-article-ai` devuelve JSON listo para usarse como salida “oficial”:

  ```ts
  {
    ok: true,
    articleNumber: string,
    title: string | null,
    fullText: string,
    resumen: string,
    startsAtIndex: number | null,
    endsAtIndex: number | null,
    nextHeaderPreview: string | null
  }
  ```

  - El frontend guarda:
    - `fullText` en `articleData.texto_completo` (para fichas).
    - `resumen` en estado `resumen` (para mostrar al usuario).

- **CSV**:
  - No existe función que exporte los resúmenes de artículos a CSV.
  - Tampoco hay convención de columnas CSV para este output.

- **Convención de nombres de archivo**:
  - El endpoint no añade cabeceras `Content-Disposition`; el JSON se devuelve “en crudo”.
  - Los únicos ficheros generados en disco son **logs internos**:
    - `logs/extract-article-ai-YYYY-MM-DDTHH-MM-SS-SSSZ.json`
  - No hay nombre de archivo “oficial” para descargar resúmenes (a diferencia de `preguntas.csv` o `Ficha_Articulo_1.txt` para otros módulos).


