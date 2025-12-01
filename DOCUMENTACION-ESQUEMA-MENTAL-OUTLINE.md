# Documentación: Esquema Mental (Outline)

## a) TypeScript Type / Zod Schema del Outline

### Tipo TypeScript completo

```ts
// types/mentalOutline.ts

export type FrontMatterEntry = {
  present: boolean
  anchor: string | null
  pages: number[] | null
}

export type Articulo = {
  numero: string
  articulo_texto: string
  pagina_articulo: number // Nº de página del PDF donde está el artículo
  pages?: number[] // Páginas (solo inicio del índice)
  anchor?: string // Anchor para navegación
  texto_completo?: string // Texto completo del artículo (extraído del PDF)
  resumen?: string // Resumen breve de 1-3 frases del artículo
}

export type Seccion = {
  codigo_seccion?: string // Ej: "SECCIÓN 1" o "SECCIÓN PRIMERA"
  subtitulo_seccion?: string // Ej: "De los derechos de los ciudadanos" (puede estar vacío)
  pagina_inicio_seccion: number
  pagina_fin_seccion: number
  articulos: Articulo[]
  // Propiedades transformadas del backend
  ordinal?: string
  seccion_texto?: string
  pages?: number[]
  anchor?: string
}

export type Capitulo = {
  codigo_capitulo?: string // Ej: "CAPÍTULO I" o "CAPÍTULO PRIMERO"
  subtitulo_capitulo?: string // Ej: "De los derechos fundamentales" (puede estar vacío)
  pagina_inicio_capitulo: number
  pagina_fin_capitulo: number
  articulos_sin_seccion?: Articulo[] // Artículos que cuelgan directamente del Capítulo
  secciones: Seccion[] // Secciones dentro del Capítulo (opcional)
  // Propiedades transformadas del backend
  ordinal?: string
  capitulo_texto?: string
  pages?: number[]
  anchor?: string
  articulos?: Articulo[] // Alias para articulos_sin_seccion
}

export type Titulo = {
  codigo_titulo?: string // Ej: "TÍTULO I" o "TÍTULO PRELIMINAR"
  subtitulo_titulo?: string // Ej: "Disposiciones generales" (puede estar vacío)
  pagina_inicio_titulo: number // Nº de página del PDF donde empieza el Título
  pagina_fin_titulo: number // Nº de página del PDF donde termina el Título
  articulos_sin_capitulo?: Articulo[] // Artículos que cuelgan directamente del Título
  capitulos: Capitulo[] // Capítulos dentro del Título (opcional)
  // Propiedades transformadas del backend
  ordinal?: string
  titulo_texto?: string
  pages?: number[]
  anchor?: string
  articulos?: Articulo[] // Alias para articulos_sin_capitulo
}

export type DisposicionItem = {
  numero: string
  texto_encabezado: string
  pagina_disposicion: number
  pages?: number[] // Páginas (solo inicio del índice)
  anchor?: string // Anchor para navegación
}

export type MentalOutline = {
  metadata: {
    document_title: string
    source: string
    language: string
    generated_at: string
  }
  front_matter: {
    preambulo: FrontMatterEntry
    exposicion_motivos: FrontMatterEntry
  }
  titulos: Titulo[]
  disposiciones: {
    adicionales: DisposicionItem[]
    transitorias: DisposicionItem[]
    derogatorias: DisposicionItem[]
    finales: DisposicionItem[]
  }
}
```

### Schema JSON (para validación)

**⚠️ Nota:** No existe un schema Zod o JSON Schema formal para `MentalOutline` en el código. El tipo se valida implícitamente a través de TypeScript y transformaciones en los endpoints.

**Schema relacionado (solo para `TitlesOnlyOutline`):**
```ts
// lib/schema/titlesOnly.ts
export const titlesOnlySchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://tfm-uoc-ia/schemas/titles-only.json',
  type: 'object',
  required: ['metadata', 'titulos'],
  additionalProperties: false,
  properties: {
    metadata: {
      type: 'object',
      required: ['document_title', 'source', 'language', 'generated_at'],
      additionalProperties: false,
      properties: {
        document_title: { type: 'string', minLength: 1 },
        source: { type: 'string', minLength: 1 },
        language: { type: 'string', const: 'es' },
        generated_at: { type: 'string', format: 'date' },
      },
    },
    titulos: {
      type: 'array',
      items: { $ref: '#/$defs/titulo' },
    },
  },
  $defs: {
    titulo: {
      type: 'object',
      required: ['ordinal', 'titulo_texto', 'definicion', 'anchor', 'page_start', 'page_end'],
      additionalProperties: false,
      properties: {
        ordinal: { type: 'string', minLength: 1 },
        titulo_texto: { type: 'string', minLength: 1 },
        definicion: { type: 'string' },
        anchor: { type: 'string', minLength: 1 },
        page_start: { type: 'integer', minimum: 1 },
        page_end: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
      },
    },
  },
} as const
```

**Archivos relacionados:**
- **Tipos:** `types/mentalOutline.ts`
- **Endpoints de generación:** 
  - `app/api/mental-outline/generate-direct/route.ts`
  - `app/api/mental-outline/chunk/route.ts`
- **Conversión desde bookmarks:** `lib/outline/bookmarksToOutline.ts`

---

## b) Función de exportación a CSV/JSON

**⚠️ IMPORTANTE:** No existe una función específica de exportación a CSV/JSON del outline en el código actual.

**Funcionalidad actual:**
- El outline se guarda en `localStorage` como JSON (`localStorage.setItem('tfm.mentalOutline', JSON.stringify(mentalOutline))`)
- El frontend permite visualizar el outline en modo JSON (`outlineViewMode: 'tree' | 'json'`)
- No hay endpoint `/api/export` para outlines (solo existe para ítems de test)

**Estructura JSON del outline:**

El outline se serializa directamente como JSON con esta estructura:

```json
{
  "metadata": {
    "document_title": "...",
    "source": "...",
    "language": "es",
    "generated_at": "2024-01-15"
  },
  "front_matter": {
    "preambulo": {
      "present": true,
      "anchor": null,
      "pages": [1]
    },
    "exposicion_motivos": {
      "present": false,
      "anchor": null,
      "pages": null
    }
  },
  "titulos": [
    {
      "codigo_titulo": "TÍTULO I",
      "subtitulo_titulo": "Disposiciones generales",
      "pagina_inicio_titulo": 5,
      "pagina_fin_titulo": 45,
      "ordinal": "I",
      "titulo_texto": "Disposiciones generales",
      "pages": [5],
      "anchor": "tit-i",
      "articulos_sin_capitulo": [],
      "capitulos": [...]
    }
  ],
  "disposiciones": {
    "adicionales": [],
    "transitorias": [],
    "derogatorias": [],
    "finales": []
  }
}
```

**Si se implementara exportación CSV, la estructura sería:**

**Columnas CSV sugeridas (estructura plana):**

| Columna | Descripción | Ejemplo |
|---------|-------------|---------|
| `nivel` | Tipo de elemento | `titulo`, `capitulo`, `seccion`, `articulo`, `disposicion` |
| `codigo` | Código del elemento | `TÍTULO I`, `CAPÍTULO I`, `SECCIÓN 1`, `Artículo 1` |
| `subtitulo` | Subtítulo/texto descriptivo | `Disposiciones generales` |
| `numero` | Número (solo artículos/disposiciones) | `1`, `2`, `3` |
| `pagina_inicio` | Página de inicio | `5` |
| `pagina_fin` | Página de fin | `45` |
| `anchor` | Anchor para navegación | `tit-i`, `cap-1`, `art-5` |
| `titulo_padre` | Título al que pertenece | `TÍTULO I` |
| `capitulo_padre` | Capítulo al que pertenece (si aplica) | `CAPÍTULO I` |
| `seccion_padre` | Sección a la que pertenece (si aplica) | `SECCIÓN 1` |
| `articulo_texto` | Rúbrica del artículo (solo artículos) | `Objeto y ámbito de aplicación` |
| `texto_completo` | Texto completo (solo artículos, opcional) | `...` |
| `resumen` | Resumen (solo artículos, opcional) | `...` |

**Nota:** Esta estructura CSV no está implementada actualmente. Sería necesario crear una función recursiva que aplane la estructura jerárquica.

---

## c) Ejemplo real de outline generado (pequeño)

```json
{
  "metadata": {
    "document_title": "Ley Orgánica 3/2023",
    "source": "BOE-A-2023-12345",
    "language": "es",
    "generated_at": "2024-01-15"
  },
  "front_matter": {
    "preambulo": {
      "present": true,
      "anchor": null,
      "pages": [1]
    },
    "exposicion_motivos": {
      "present": true,
      "anchor": null,
      "pages": [2]
    }
  },
  "titulos": [
    {
      "codigo_titulo": "TÍTULO PRELIMINAR",
      "subtitulo_titulo": "Disposiciones generales",
      "pagina_inicio_titulo": 5,
      "pagina_fin_titulo": 12,
      "ordinal": "PRELIMINAR",
      "titulo_texto": "Disposiciones generales",
      "pages": [5],
      "anchor": "tit-preliminar",
      "articulos_sin_capitulo": [
        {
          "numero": "1",
          "articulo_texto": "Objeto y ámbito de aplicación",
          "pagina_articulo": 5,
          "pages": [5],
          "anchor": "art-1",
          "texto_completo": "La presente Ley tiene por objeto...",
          "resumen": "Establece el objeto y ámbito de aplicación de la Ley."
        }
      ],
      "capitulos": []
    },
    {
      "codigo_titulo": "TÍTULO I",
      "subtitulo_titulo": "De los derechos y deberes",
      "pagina_inicio_titulo": 13,
      "pagina_fin_titulo": 45,
      "ordinal": "I",
      "titulo_texto": "De los derechos y deberes",
      "pages": [13],
      "anchor": "tit-i",
      "articulos_sin_capitulo": [],
      "capitulos": [
        {
          "codigo_capitulo": "CAPÍTULO I",
          "subtitulo_capitulo": "Derechos fundamentales",
          "pagina_inicio_capitulo": 13,
          "pagina_fin_capitulo": 25,
          "ordinal": "I",
          "capitulo_texto": "Derechos fundamentales",
          "pages": [13],
          "anchor": "cap-i",
          "articulos_sin_seccion": [
            {
              "numero": "2",
              "articulo_texto": "Derecho a la información",
              "pagina_articulo": 13,
              "pages": [13],
              "anchor": "art-2"
            }
          ],
          "secciones": [
            {
              "codigo_seccion": "SECCIÓN 1",
              "subtitulo_seccion": "De la protección de datos",
              "pagina_inicio_seccion": 15,
              "pagina_fin_seccion": 20,
              "ordinal": "1",
              "seccion_texto": "De la protección de datos",
              "pages": [15],
              "anchor": "sec-1",
              "articulos": [
                {
                  "numero": "3",
                  "articulo_texto": "Protección de datos personales",
                  "pagina_articulo": 15,
                  "pages": [15],
                  "anchor": "art-3"
                },
                {
                  "numero": "4",
                  "articulo_texto": "Derechos del interesado",
                  "pagina_articulo": 17,
                  "pages": [17],
                  "anchor": "art-4"
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  "disposiciones": {
    "adicionales": [
      {
        "numero": "Disposición Adicional 1",
        "texto_encabezado": "Adaptación normativa",
        "pagina_disposicion": 46,
        "pages": [46],
        "anchor": "dis-adicional-1"
      }
    ],
    "transitorias": [],
    "derogatorias": [],
    "finales": [
      {
        "numero": "Disposición Final 1",
        "texto_encabezado": "Entrada en vigor",
        "pagina_disposicion": 48,
        "pages": [48],
        "anchor": "dis-final-1"
      }
    ]
  }
}
```

---

## d) Reglas para page_end, anchors y niveles opcionales

### Reglas para `page_end` (página de fin)

**Ubicación:** `lib/outline/bookmarksToOutline.ts` (líneas 176-542)

**Reglas de cálculo:**

1. **Para Títulos:**
   - Si existe un siguiente título: `pagina_fin_titulo = siguiente_titulo.pagina_inicio_titulo - 1`
   - Si no hay siguiente título: `pagina_fin_titulo = 0` (o se mantiene el valor calculado anteriormente)

2. **Para Capítulos:**
   - Si existe un siguiente capítulo en el mismo título: `pagina_fin_capitulo = siguiente_capitulo.pagina_inicio_capitulo - 1`
   - Si no hay siguiente capítulo: `pagina_fin_capitulo = titulo.pagina_fin_titulo`

3. **Para Secciones:**
   - Si existe una siguiente sección en el mismo capítulo: `pagina_fin_seccion = siguiente_seccion.pagina_inicio_seccion - 1`
   - Si no hay siguiente sección: `pagina_fin_seccion = capitulo.pagina_fin_capitulo`

4. **Para Artículos:**
   - ❌ **No tienen `pagina_fin_articulo`** en el tipo actual
   - Solo tienen `pagina_articulo` (página donde aparece el artículo)

**Código de ejemplo:**
```ts
// Cerrar el título anterior si existe
if (currentTitulo) {
  // Calcular página de fin del título anterior
  if (pageNumber && currentTitulo.pagina_inicio_titulo) {
    currentTitulo.pagina_fin_titulo = pageNumber - 1
  }
}

// Calcular páginas de fin para elementos que no se cerraron
for (let i = 0; i < outline.titulos.length; i++) {
  const titulo = outline.titulos[i]
  const nextTitulo = outline.titulos[i + 1]
  
  if (!titulo.pagina_fin_titulo || titulo.pagina_fin_titulo === 0) {
    titulo.pagina_fin_titulo = nextTitulo ? (nextTitulo.pagina_inicio_titulo - 1) : 0
  }
}
```

### Reglas para `anchor` (anclas de navegación)

**Ubicación:** `lib/outline/bookmarksToOutline.ts` (líneas 83-87)

**Función de generación:**
```ts
function generateAnchor(prefix: string, ordinal: string): string {
  if (!ordinal || ordinal === '?') return `${prefix}-unknown`
  return `${prefix}-${ordinal.toLowerCase()}`
}
```

**Prefijos por tipo:**
- **Títulos:** `tit-{ordinal}` → Ej: `tit-i`, `tit-preliminar`
- **Capítulos:** `cap-{ordinal}` → Ej: `cap-1`, `cap-i`
- **Secciones:** `sec-{ordinal}` → Ej: `sec-1`, `sec-2`
- **Artículos:** `art-{numero}` → Ej: `art-1`, `art-5`
- **Disposiciones:** `dis-{tipo}` → Ej: `dis-adicional-1`, `dis-final-1`

**Reglas:**
1. El `ordinal` se convierte a minúsculas
2. Si el `ordinal` es `'?'` o está vacío, se usa `{prefix}-unknown`
3. Los anchors son únicos dentro del documento y se usan para navegación en el frontend

**Ejemplos:**
- `TÍTULO I` → `anchor: "tit-i"`
- `CAPÍTULO PRIMERO` → `anchor: "cap-primero"`
- `Artículo 5` → `anchor: "art-5"`
- `SECCIÓN 1` → `anchor: "sec-1"`

### Reglas para niveles opcionales

**Niveles jerárquicos:**

```
MentalOutline
├── front_matter (opcional)
│   ├── preambulo (opcional)
│   └── exposicion_motivos (opcional)
├── titulos (requerido, array)
│   └── Titulo
│       ├── articulos_sin_capitulo (opcional, array)
│       └── capitulos (opcional, array)
│           └── Capitulo
│               ├── articulos_sin_seccion (opcional, array)
│               └── secciones (opcional, array)
│                   └── Seccion
│                       └── articulos (requerido, array)
└── disposiciones (requerido, objeto)
    ├── adicionales (opcional, array)
    ├── transitorias (opcional, array)
    ├── derogatorias (opcional, array)
    └── finales (opcional, array)
```

**Reglas de opcionalidad:**

1. **Front Matter:**
   - `preambulo.present`: `false` si no existe
   - `exposicion_motivos.present`: `false` si no existe
   - Si `present: false`, `anchor: null` y `pages: null`

2. **Títulos:**
   - `titulos` es un array requerido (puede estar vacío `[]`)
   - Cada título puede tener:
     - `articulos_sin_capitulo`: Array opcional (puede estar vacío)
     - `capitulos`: Array opcional (puede estar vacío)

3. **Capítulos:**
   - `capitulos` es un array opcional dentro de cada título
   - Cada capítulo puede tener:
     - `articulos_sin_seccion`: Array opcional (artículos directos del capítulo)
     - `secciones`: Array opcional (secciones dentro del capítulo)

4. **Secciones:**
   - `secciones` es un array opcional dentro de cada capítulo
   - Cada sección **debe tener** `articulos` (array requerido, puede estar vacío)

5. **Disposiciones:**
   - `disposiciones` es un objeto requerido
   - Cada tipo de disposición (`adicionales`, `transitorias`, `derogatorias`, `finales`) es un array opcional (puede estar vacío)

**Alias para compatibilidad:**
- `titulo.articulos` es un alias de `titulo.articulos_sin_capitulo`
- `capitulo.articulos` es un alias de `capitulo.articulos_sin_seccion`

**Código de transformación:**
```ts
// lib/outline/bookmarksToOutline.ts (líneas 557-572)
function transformOutlineToFrontendFormat(
  outline: MentalOutline,
  source: string,
  lawName: string
): MentalOutline {
  for (const titulo of outline.titulos) {
    // Alias para articulos
    if (titulo.articulos_sin_capitulo && !titulo.articulos) {
      titulo.articulos = titulo.articulos_sin_capitulo
    }
    
    for (const cap of titulo.capitulos || []) {
      // Alias para articulos
      if (cap.articulos_sin_seccion && !cap.articulos) {
        cap.articulos = cap.articulos_sin_seccion
      }
    }
  }

  return outline
}
```

---

## Convención de nombres de archivo

**⚠️ IMPORTANTE:** No existe una convención de nombre de archivo para exportar outlines.

**Funcionalidad actual:**
- El outline se guarda en `localStorage` con la clave `'tfm.mentalOutline'`
- No hay descarga automática de archivos
- No hay endpoint de exportación

**Si se implementara exportación, sugerencias:**
- **JSON:** `esquema-mental-{timestamp}.json` o `{lawName}-outline.json`
- **CSV:** `esquema-mental-{timestamp}.csv` o `{lawName}-outline.csv`

---

## Schema Version

**⚠️ IMPORTANTE:** No existe un campo `schema_version` en el tipo `MentalOutline`.

**Campos de metadata disponibles:**
```ts
metadata: {
  document_title: string
  source: string
  language: string
  generated_at: string  // Formato: "YYYY-MM-DD"
}
```

**Nota:** El campo `generated_at` puede usarse para identificar la versión del esquema, pero no hay un campo explícito de versión del schema.

---

## Archivos relacionados

- **Tipos:** `types/mentalOutline.ts`
- **Conversión desde bookmarks:** `lib/outline/bookmarksToOutline.ts`
- **Generación directa:** `app/api/mental-outline/generate-direct/route.ts`
- **Generación por chunks:** `app/api/mental-outline/chunk/route.ts`
- **Contexto de artículos:** `lib/outline/getArticleContext.ts`
- **Formato de fichas:** `lib/outline/formatFiche.ts`
- **Componente de visualización:** `components/LegalOutlineTree.tsx`
- **Página principal:** `app/generate/page.tsx`

---

## Resumen de flujo

1. **Generación desde bookmarks:** PDF → `extractBookmarks()` → `convertBookmarksToMentalOutline()` → `MentalOutline`
2. **Generación directa:** Páginas del PDF → `/api/mental-outline/generate-direct` → `MentalOutline`
3. **Generación por chunks:** Páginas del PDF → `/api/mental-outline/chunk` → `MentalOutline` (para documentos grandes)
4. **Almacenamiento:** `MentalOutline` → `localStorage.setItem('tfm.mentalOutline', JSON.stringify(...))`
5. **Visualización:** `MentalOutline` → `LegalOutlineTree` (modo árbol) o JSON (modo JSON)






