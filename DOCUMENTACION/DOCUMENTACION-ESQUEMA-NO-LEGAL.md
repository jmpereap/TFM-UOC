# Documentación: Esquema No Legal (Outline didáctico)

## a) Tipo / Esquema de datos

### Respuesta esperada (TypeScript sugerido)

```ts
// Respuesta de /api/non-legal-outline
export type NonLegalOutline = {
  ok: true
  title: string            // Ej: "🧠 Esquema mental: Redes neuronales"
  outline: string          // Texto plano con viñetas ya formateadas
} | {
  ok: false
  error: string
}
```

### Payload de entrada (Zod en el endpoint)

```ts
// app/api/non-legal-outline/route.ts
const InputSchema = z.object({
  title: z.string().optional(),
  blocks: z.array(z.object({
    text: z.string().min(1),
    startPage: z.number().int().optional(),
    endPage: z.number().int().optional(),
  })).min(1),
})
```

- El texto se obtiene concatenando `blocks[i].text` con doble salto de línea.
- El prompt recorta a `MAX_TEXT_LEN = 12000` caracteres.

## b) Función de exportación

⚠️ No existe una función de exportación a CSV/JSON específica para el esquema no legal.  
Estado actual:
- La respuesta JSON del endpoint es la única representación estructurada.
- El frontend guarda en `localStorage`:
  - `tfm.nonLegalOutline`: cadena con las viñetas (texto plano).
  - `tfm.nonLegalTitle`: título usado en la cabecera de la vista.
- Visualización en `app/generate/page.tsx` (vista principal o modo sólo esquema).

## c) Ejemplo real de respuesta

```json
{
  "ok": true,
  "title": "🧠 Esquema mental: Redes neuronales",
  "outline": "• Redes neuronales\n  • Arquitectura\n    • Capas de entrada\n    • Capas ocultas\n    • Capa de salida\n  • Tipos\n    • Perceptrón multicapa\n    • Convolucional (CNN)\n    • Recurrente (RNN)\n  • Entrenamiento\n    • Propagación hacia adelante\n    • Retropropagación\n    • Función de pérdida\n  • Hiperparámetros\n    • Learning rate\n    • Épocas\n    • Batch size\n  • Métricas\n    • Accuracy\n    • Precision / Recall\n    • F1-Score"
}
```

## d) Reglas de generación y formato

Ubicación: `app/api/non-legal-outline/route.ts` (`buildPrompt`).

- Objetivo: esquema jerárquico en español, no jurídico, para estudio.
- Frases muy cortas (2–8 palabras). Máx. 6–8 ramas principales.
- No inventar contenido; solo usar el texto de entrada.
- Tono neutro y didáctico.
- Primera línea: título con emoji 🧠 → `"🧠 Esquema mental: {title}"`.
- Viñetas en texto plano con el patrón:
  ```
  • Tema principal
    • Subtema
      • Detalle
  ```
- Categorías sugeridas (solo si aparecen): conceptos básicos/definiciones; estructuras/elementos/componentes; arquitectura/modelo; funciones/usos/aplicaciones; ventajas/inconvenientes; ejemplos o casos típicos.
- Entrada: se concatenan los bloques (`blocks[].text`) y se truncan a 12 000 chars.
- Salida solicitada al modelo: objeto JSON con `title` y `outline` (outline ya formateado en texto plano).

## e) Convención de nombres de archivo

No hay descarga automática ni convención establecida. Sugerencias si se implementa exportación:
- JSON: `esquema-no-legal-{timestamp}.json` o `{title}-non-legal-outline.json`
- TXT: `esquema-no-legal-{timestamp}.txt`

## f) Schema Version

No existe `schema_version` para el esquema no legal. Metadatos en la respuesta:
- `title`: cadena generada para cabecera.
- `outline`: texto plano.

## g) Archivos relacionados

- Endpoint: `app/api/non-legal-outline/route.ts`
- Página principal / UI: `app/generate/page.tsx` (gestiona generación, guardado en localStorage y vista “solo esquema”).
- Logging: `lib/logging/logger` (vía `logEvent` dentro del endpoint).

## h) Flujo resumido

1. PDF → `/api/upload` (detecta legal/no legal, produce `blocks` de texto).
2. Para documentos no legales (o forzado por el usuario): `/api/non-legal-outline` con `{ title?, blocks }`.
3. El endpoint construye el prompt, trunca a 12 000 chars, llama a `callModelJSON`, y devuelve `{ ok, title, outline }`.
4. El frontend guarda `outline` y `title` en `localStorage` y permite visualizarlos en texto plano o en una vista dedicada. 


