# Resumen: Generación de Preguntas Tipo Test

## Introducción

El sistema genera **preguntas tipo test (MCQ)** sobre legislación española a partir de bloques de texto extraídos de un PDF.  
Cada pregunta incluye:

- Enunciado (`pregunta`)
- 4 opciones (`A–D`) con **una sola correcta**
- Justificación de la respuesta
- Nivel de dificultad (`basico`, `medio`, `avanzado`)
- Referencia a la ley y a las páginas de origen

La generación se realiza con **IA (OpenAI)**, controlando tanto el **número de preguntas** como la **distribución de dificultad** o un **nivel preferido** (Básico/Medio/Avanzado).

---

## Endpoint: `/api/generate`

### Parámetros de Entrada

El endpoint recibe un payload JSON con:

```typescript
{
  lawName: string,   // Nombre de la ley (obligatorio, min 1 char)
  n: number,         // Nº de preguntas, entero [1..20]
  blocks: Array<{
    index: number,     // Índice del bloque (0..)
    startPage: number, // Página inicial (>=1)
    endPage: number,   // Página final   (>=1)
    text: string       // Texto del bloque (>=1 char)
  }>,
  difficultyDistribution?: {   // Opcional, modo "manual"
    basico: number,
    medio: number,
    avanzado: number
  },
  preferredLevel?: 'basico' | 'medio' | 'avanzado' | null  // Opcional, modo "nivel preferido"
}
```

### Validaciones

1. **`lawName`**: Requerido, string no vacío.
2. **`n`**: Entero entre 1 y 20.
3. **`blocks`**: Lista con al menos 1 bloque válido (páginas >=1 y texto no vacío).
4. **`difficultyDistribution`** (si se envía):
   - `basico + medio + avanzado` debe ser igual a `n`. Si no, el endpoint devuelve **400** con error.
5. **`preferredLevel`**:
   - Puede ser `'basico' | 'medio' | 'avanzado' | null`.

---

## Flujo de Generación

### Vista General

```text
Usuario sube PDF
    ↓
Frontend: detección de bloques (blocks)
    ↓
Usuario configura nº de preguntas, dificultad o nivel preferido
    ↓
POST /api/generate  (lawName, n, blocks, difficultyDistribution?/preferredLevel?)
    ↓
Backend: decide plan de distribución (por bloques y por dificultad)
    ↓
Backend: construye prompts por bloque (buildPrompt)
    ↓
Backend: llama a la IA (callModel) por bloque (ejecutado en paralelo con límite)
    ↓
Backend: limpia, unifica y deduplica preguntas
    ↓
Respuesta: { ok: true, items: MCQItem[] }
    ↓
Frontend: muestra preguntas, permite corregirlas y exportarlas
```

---

## Paso 1: Planificación de la Distribución

**Archivo:** `app/api/generate/route.ts`

Tras parsear el JSON con Zod (`InputSchema`), el endpoint calcula:

- `m = blocks.length` → número de bloques
- `plan: number[]` → número de preguntas por bloque
- `difficultyPlan: DifficultyDistribution[] | null` → distribución de dificultad por bloque

La priorización de estrategias es:

1. **Nivel preferido (`preferredLevel`)**
2. **Distribución manual (`difficultyDistribution`)**
3. **Distribución uniforme (por defecto)**

### 1.1. Nivel Preferido (`preferredLevel`)

Si `preferredLevel` está definido:

1. Llama a `distributeByPreferredLevel(n, preferredLevel, m)` (`lib/qa/distribute.ts`).
2. Obtiene un array `difficultyPlan` con **un objeto por bloque**:
   ```typescript
   type DifficultyDistribution = { basico: number; medio: number; avanzado: number }
   ```
3. Calcula `plan[i]` como la **suma de dificultades** de cada bloque:
   ```typescript
   plan[i] = d.basico + d.medio + d.avanzado
   ```

### 1.2. Distribución Manual (`difficultyDistribution`)

Si no hay `preferredLevel` pero sí `difficultyDistribution`:

1. Comprueba que `basico + medio + avanzado === n`.
2. Si no coincide:
   - Devuelve error **400** con mensaje:
     > La suma de dificultades debe ser igual a n
3. Si coincide:
   - Llama a `distributeByDifficulty(difficultyDistribution, m)` para repartir cada nivel entre bloques.
   - Calcula `plan[i]` sumando las dificultades de cada bloque.

### 1.3. Distribución Uniforme (por defecto)

Si no hay ni `preferredLevel` ni `difficultyDistribution`:

- Se llama a `distributeQuestions(n, m)` para repartir las `n` preguntas de forma uniforme entre los bloques:
  - Si `m <= n`: se reparte una base por bloque y el resto se asigna aleatoriamente.
  - Si `m > n`: sólo `n` bloques reciben 1 pregunta y el resto 0 (seleccionados aleatoriamente).

### 1.4. Logging de la Distribución

El sistema registra:

- `generate.distribution.start`: parámetros de entrada, nº de bloques, nº de preguntas, presencia de `preferredLevel` y `difficultyDistribution`.
- `generate.distribution.result`: plan resultante por bloque, suma total, y detalle de distribución de dificultades por bloque.

---

## Paso 2: Funciones de Distribución de Preguntas

**Archivo:** `lib/qa/distribute.ts`

### 2.1. `distributeQuestions(n, m)`

Distribuye un total de `n` preguntas entre `m` bloques:

- **Caso `m <= n`**:
  - Calcula una base: `base = Math.floor(n / m)`.
  - Calcula el resto: `remainder = n % m`.
  - Asigna `base` a todos los bloques y reparte el resto sumando 1 a bloques aleatorios.

- **Caso `m > n`**:
  - Solo `n` bloques reciben 1 pregunta (seleccionados aleatoriamente).
  - El resto de los bloques reciben 0.

### 2.2. `distributeByDifficulty(distribution, m)`

Entrada:

```typescript
{ basico, medio, avanzado }, m
```

Proceso:

1. Llama a `distributeQuestions` para cada nivel:
   - `basicoDist[] = distributeQuestions(basico, m)`
   - `medioDist[] = distributeQuestions(medio, m)`
   - `avanzadoDist[] = distributeQuestions(avanzado, m)`
2. Combina los resultados en un array de objetos:
   ```typescript
   return basicoDist.map((basico, i) => ({
     basico,
     medio: medioDist[i],
     avanzado: avanzadoDist[i],
   }))
   ```

### 2.3. `distributeByPreferredLevel(n, preferredLevel, m)`

Objetivo: **garantizar que la mayoría de las preguntas (90–95%) sean del nivel preferido**, idealmente el 100%.

1. Si `n <= 0` o `m <= 0`:
   - Devuelve un array de longitud `m` con `{ basico: 0, medio: 0, avanzado: 0 }`.
2. Si `preferredLevel === null`:
   - Devuelve distribución vacía (el backend usará la lógica anterior).
3. Calcula el porcentaje según nivel:
   - `basico`: 95% de las preguntas.
   - `medio` y `avanzado`: 90% de las preguntas.
4. Cálculo:
   ```typescript
   const percentage = preferredLevel === 'basico' ? 0.95 : 0.90
   const preferredCount = Math.ceil(n * percentage)
   const remaining = n - preferredCount
   ```
5. Reparto:
   - Distribuye `preferredCount` entre bloques con `distributeQuestions`.
   - El resto (`remaining`) se asigna a otros niveles para dar contraste:
     - Si `preferredLevel === 'basico'`: el resto se asigna como `medio`.
     - Si `preferredLevel === 'medio'`: el resto se asigna como `avanzado`.
     - Si `preferredLevel === 'avanzado'`: el resto se asigna como `medio`.
   - Se construye para cada bloque un objeto `{ basico, medio, avanzado }` combinando ambas distribuciones.

---

## Paso 3: Generación de Preguntas por Bloques

**Archivo:** `app/api/generate/route.ts`

### 3.1. Tareas por bloque

Se crea una lista de tareas asíncronas, una por bloque:

1. Para cada bloque `b` con índice `i`:
   - `qi = plan[i]` → número de preguntas asignadas a ese bloque.
   - Si `qi === 0`: se omite el bloque (log `generate.block.skipped`).
2. Se calcula:
   - `pagesRange = "p. startPage–endPage"`.
   - `safeText = truncateByChars(b.text, 10000)` para limitar el tamaño del texto.
   - `blockDifficultyDist = difficultyPlan[i]` (si existe).
3. Se construye el prompt usando `buildPrompt`:
   ```typescript
   const prompt = buildPrompt({
     lawName,
     pagesRange,
     blockText: safeText,
     n: qi,
     difficultyDistribution: blockDifficultyDist,
     preferredLevel: preferredLevel || undefined,
   })
   ```

### 3.2. Timeout Dinámico

El endpoint ajusta el timeout según el tamaño del prompt:

- Base: 30 segundos.
- Suma: 1 segundo por cada ~1000 caracteres de prompt.
- Rango final: entre 30s y 90s.

Esto se registra con el evento `generate.block.model.call`.

### 3.3. Ejecución en Paralelo (con límite)

Las tareas por bloque se ejecutan con `withLimit(4, tasks)`:

- Se procesan como máximo **4 bloques en paralelo**.
- Cada tarea llama a `callModel(prompt, timeout)` para obtener preguntas.

### 3.4. Normalización de Resultados

Para cada bloque, la respuesta de la IA se transforma:

- Se obtienen `itemsRaw` desde `callModel`.
- Se ajusta el campo `referencia` de cada pregunta para fijar:
  - `ley: lawName`
  - `paginas: pagesRange`
  - `articulo` y `parrafo` se mantienen si vienen de la IA.

Se registran:

- `generate.block.start`: inicio del procesamiento del bloque.
- `generate.block.success`: nº de preguntas generadas, duración, distribución efectiva por dificultad.
- `generate.block.error`: errores por bloque, incluido si se trata de un timeout.

### 3.5. Deduplicación y Recorte Global

1. Se concatenan los resultados de todos los bloques.
2. Se deduplican preguntas por el texto de `pregunta` (case-insensitive, `trim`):
   - Se usa un `Set` con la clave `pregunta.trim().toLowerCase()`.
   - Sólo se añade una vez cada pregunta distinta.
3. Se corta la lista final a las `n` preguntas solicitadas.

Si tras este proceso no queda ninguna pregunta:

- Se registra el evento `generate.empty`.
- El endpoint devuelve **502** con mensaje:
  > No se pudieron generar preguntas. El modelo devolvió respuestas vacías...

---

## Paso 4: Construcción del Prompt para la IA

**Archivo:** `lib/qa/prompt.ts`

### 4.1. Parámetros

```typescript
export type BuildPromptParams = {
  lawName: string
  pagesRange: string
  blockText: string
  n: number
  difficultyDistribution?: {
    basico: number
    medio: number
    avanzado: number
  }
  preferredLevel?: 'basico' | 'medio' | 'avanzado'
}
```

### 4.2. Partes Dinámicas

- **Distribución manual** (`difficultyDistribution`):
  - Añade un bloque de texto con la distribución requerida:
    ```text
    Distribución de dificultad requerida:
    - X pregunta(s) de nivel "basico"
    - Y pregunta(s) de nivel "medio"
    - Z pregunta(s) de nivel "avanzado"
    ```

- **Nivel preferido** (`preferredLevel`):
  - Añade un bloque de énfasis:
    ```text
    IMPORTANTE - Nivel preferido: La mayoría (al menos 95%/90%) de las preguntas deben ser de nivel "basico/medio/avanzado".
    El resto puede ser de otros niveles si es necesario, pero prioriza el nivel preferido.
    ```

### 4.3. Definición de Niveles de Dificultad

El prompt describe con mucho detalle los tres niveles:

1. **Nivel "basico"**:
   - Preguntas de **recuerdo directo** del texto.
   - El enunciado pregunta casi literalmente por algo que aparece en uno o dos párrafos.
   - Opciones cortas con cambios mínimos (número, órgano, plazo, etc.).
   - No requiere interpretar casos prácticos ni combinar varios artículos.

2. **Nivel "medio"**:
   - Preguntas de **comprensión / aplicación sencilla**.
   - Puede combinar 2–3 condiciones del mismo artículo o artículos muy próximos.
   - Buen formato: “¿Cuál de las siguientes afirmaciones sobre X es correcta/incorrecta según la ley?”.
   - Las opciones mezclan condiciones verdaderas/falsas, plazos, requisitos, excepciones…

3. **Nivel "avanzado"**:
   - Preguntas de **aplicación con razonamiento**.
   - Deben incluir **siempre un mini-supuesto práctico** (1–3 frases).
   - Se combinan varios apartados del mismo artículo o de 2–3 artículos relacionados.
   - Las opciones contienen errores sutiles (plazos, órganos, condiciones, etc.).

### 4.4. Instrucciones Estrictas

El prompt establece reglas claras:

- Cada pregunta debe tener:
  - `pregunta`
  - `opciones` con `A`, `B`, `C`, `D`
  - `correcta` (una sola letra)
  - `justificacion`
  - `difficulty` (`"basico" | "medio" | "avanzado"`)
  - `referencia` `{ ley, paginas, articulo?, parrafo? }`
- No se permiten:
  - Opciones tipo “Todas las anteriores” o “Ninguna de las anteriores”.
  - Contenido inventado fuera del bloque.
- Formato de salida:
  - Debe ser **exclusivamente un JSON array válido** con el esquema indicado, sin texto adicional.

El texto del bloque se incluye entre delimitadores:

```text
<<<BLOQUE>>> [texto del bloque] <<<BLOQUE>>>
```

---

## Paso 5: Llamada al Modelo de IA

**Archivo:** `lib/qa/model.ts`

### 5.1. Proveedor y Modelo

- Proveedor por defecto: `openai` (variable `LLM_PROVIDER`).
- Modelo: `OPENAI_MODEL` (por defecto `gpt-4o-mini`).
- API key: `OPENAI_API_KEY`.

### 5.2. Mensajes Enviados

La llamada a la API de OpenAI se hace con:

- `system`:  
  > Responde SOLO con un JSON array válido, sin texto adicional.
- `user`: el `prompt` construido en `buildPrompt`.

Se usa `AbortController` para respetar el timeout calculado:

- Si se supera el timeout, se aborta la petición y se registra un error.

### 5.3. Parseo del JSON Devuelto

Función `extractJsonArray`:

1. Intenta `JSON.parse` directo.
2. Si falla:
   - Busca la primera `[` y la última `]` en el texto.
   - Reintenta parsear solo ese fragmento.
3. Si aún falla: lanza error.

Posteriormente:

- Se filtran los elementos que sean objetos.
- Se mapean a la forma interna `MCQItem`:
  - Forzando strings en `pregunta`, `opciones`, `justificacion`.
  - Forzando `correcta` a `A|B|C|D` (por defecto `A` si falta).
  - Normalizando `referencia` (`ley`, `paginas`, `articulo?`, `parrafo?`).
- Se descartan preguntas con campos básicos vacíos.

En caso de error:

- Se registra `model.error` con proveedor, modelo y mensaje.

---

## Integración en el Frontend

**Archivo principal:** `app/generate/page.tsx`  
**Componente de tarjeta:** `components/MCQCard.tsx`

### 6.1. Configuración de la Generación

El frontend permite:

- Introducir el nombre de la ley (`lawName`).
- Subir un PDF y detectar bloques de texto (`blocks`).
- Configurar:
  - Número de preguntas `n` (mínimo y máximo se controlan en la UI).
  - **Distribución manual de dificultad** (`difficultyDistribution`).
  - **Nivel preferido** (`preferredLevel`) cuando se active la mejora de UX.

En la llamada a `/api/generate`:

1. Se valida que haya `lawName` y `blocks`.
2. Se construye `requestBody`:
   - `lawName`, `n`, `blocks`.
3. Si `preferredLevel` está definido:
   - Se envía `preferredLevel`.
   - **No** se envía `difficultyDistribution`.
4. Si no hay `preferredLevel`:
   - Se ajusta la distribución manual para que sume `n` (re-escalado).
   - Se envía `difficultyDistribution` ajustada.

En caso de error 502 con mensaje del modelo vacío:

- El frontend muestra un mensaje específico:
  - El PDF es demasiado pequeño para el número de preguntas solicitado.

### 6.2. Presentación de Preguntas (MCQCard)

El componente `MCQCard`:

- Muestra:
  - `Q{index+1}.` + texto de la pregunta.
  - Un **chip de dificultad** (Básico/Medio/Avanzado) con color distintivo.
  - Las 4 opciones A–D como botones tipo radio.
- Permite:
  - Seleccionar respuesta (`onChange`).
  - Corregir una pregunta individual (`onCorrectOne`).
  - Ver:
    - Si la respuesta es correcta o incorrecta.
    - La justificación (`justificacion`).
    - La referencia (`ley`, `paginas`, `articulo?`, `parrafo?`).

La página principal también ofrece:

- Botón para **corregir todas** las preguntas y calcular una puntuación global.
- Filtros y paginación para navegar entre muchas preguntas.

### 6.3. Exportación de Preguntas

La función `exportItems(format)` llama al endpoint `/api/export`:

- Envía: `{ format, items, lawName, includeCorrect }`.
- Soporta exportar en:
  - `JSON` (`preguntas.json`)
  - `CSV` (`preguntas.csv`)
  - `PDF` (`preguntas.pdf`)

---

## Logging y Debugging

El sistema registra eventos clave:

- **Distribución**:
  - `generate.distribution.start`
  - `generate.distribution.result`
- **Procesamiento por bloque**:
  - `generate.block.start`
  - `generate.block.model.call`
  - `generate.block.success`
  - `generate.block.error`
- **Resultado global**:
  - `generate.empty` → cuando no se generan preguntas útiles.
  - `generate.done` → resumen de latencia y conteos (solicitadas vs devueltas).
- **Modelo de IA**:
  - `model.error` → errores de proveedor/modelo (timeouts, formato inválido, etc.).

Estos logs permiten:

- Analizar casos donde no se generan preguntas.
- Ver la distribución real de dificultades generadas por bloque.
- Diagnosticar problemas de rendimiento o de tiempo de respuesta.

---

## Archivos Clave

- **`app/api/generate/route.ts`**: Endpoint principal que planifica la distribución y coordina la generación de preguntas.
- **`lib/qa/distribute.ts`**: Funciones de distribución (`distributeQuestions`, `distributeByDifficulty`, `distributeByPreferredLevel`).
- **`lib/qa/prompt.ts`**: Construcción de prompts para la IA con definición de niveles de dificultad.
- **`lib/qa/model.ts`**: Llamada al modelo de IA y parseo de respuestas a formato interno.
- **`types/mcq.ts`**: Tipos TypeScript de las preguntas tipo test (`MCQItem`, `Difficulty`, `OptionKey`).
- **`components/MCQCard.tsx`**: Componente de UI que muestra cada pregunta y sus opciones.
- **`app/generate/page.tsx`**: Pantalla principal donde se sube el PDF, se configuran parámetros y se consumen las preguntas generadas.

---

## Casos Especiales y Comportamientos

- **PDF con poco contenido**:
  - La IA puede devolver pocas o ninguna pregunta.
  - El backend detecta cuando no se genera ninguna pregunta válida y devuelve 502 con mensaje explicativo.
  - El frontend recomienda reducir el número de preguntas solicitadas.

- **Distribución manual inconsistente**:
  - En backend: si la suma de dificultades no es igual a `n`, se devuelve 400.
  - En frontend: se implementa un ajuste automático (re-escalado) para mantener la suma igual a `n`.

- **Uso de nivel preferido**:
  - Garantiza que al menos el 90–95% de las preguntas sean del nivel seleccionado.
  - El 5–10% restante se usa para incluir preguntas de otros niveles y ofrecer contraste.

- **Timeouts del modelo**:
  - Se gestionan por bloque con timeout dinámico.
  - Si un bloque falla, el resto de bloques se siguen procesando.
  - El resultado final puede tener menos preguntas que las solicitadas pero intenta cumplir `n` tras deduplicar.

---

## Mejoras Futuras

- [ ] Ajustar dinámicamente el tamaño de bloque o número de preguntas cuando se detecta poco contenido.
- [ ] Añadir controles UX para mostrar mejor la distribución real generada por dificultad.
- [ ] Integrar métricas de calidad de las preguntas (detección de preguntas demasiado triviales o repetidas).
- [ ] Permitir regenerar solo algunas preguntas (p. ej., las más difíciles o las menos claras).
- [ ] Cachear juegos de preguntas generados para un mismo PDF y configuración.



