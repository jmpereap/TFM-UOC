### OUTLINE-ESQUEMA-MENTAL

## a) TypeScript / Zod schema actual del outline (con `metadata` y `source`)

**Tipo TypeScript principal (`MentalOutline`)**:

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
  pages?: number[]        // Páginas (normalmente la de inicio según índice)
  anchor?: string         // Anchor para navegación (ej: "art-1")
  texto_completo?: string // Texto completo del artículo (extraído del PDF)
  resumen?: string        // Resumen breve de 1-3 frases del artículo
}

export type Seccion = {
  codigo_seccion?: string      // Ej: "SECCIÓN 1" o "SECCIÓN PRIMERA"
  subtitulo_seccion?: string   // Ej: "De los derechos de los ciudadanos"
  pagina_inicio_seccion: number
  pagina_fin_seccion: number
  articulos: Articulo[]
  // Propiedades transformadas
  ordinal?: string             // Ej: "1", "I", "PRIMERA"
  seccion_texto?: string       // Texto “limpio” de la sección
  pages?: number[]             // Páginas asociadas (inicio, a veces rango)
  anchor?: string              // Ej: "sec-1"
}

export type Capitulo = {
  codigo_capitulo?: string     // Ej: "CAPÍTULO I"
  subtitulo_capitulo?: string  // Ej: "De los derechos fundamentales"
  pagina_inicio_capitulo: number
  pagina_fin_capitulo: number
  articulos_sin_seccion?: Articulo[] // Artículos que cuelgan directamente del capítulo
  secciones: Seccion[]                // Secciones dentro del capítulo
  // Propiedades transformadas
  ordinal?: string
  capitulo_texto?: string
  pages?: number[]
  anchor?: string              // Ej: "cap-i"
  articulos?: Articulo[]       // Alias para articulos_sin_seccion
}

export type Titulo = {
  codigo_titulo?: string       // Ej: "TÍTULO I"
  subtitulo_titulo?: string    // Ej: "Disposiciones generales"
  pagina_inicio_titulo: number
  pagina_fin_titulo: number
  articulos_sin_capitulo?: Articulo[] // Artículos que cuelgan directamente del título
  capitulos: Capitulo[]               // Capítulos dentro del título
  // Propiedades transformadas
  ordinal?: string
  titulo_texto?: string
  pages?: number[]
  anchor?: string              // Ej: "tit-i"
  articulos?: Articulo[]       // Alias para articulos_sin_capitulo
}

export type DisposicionItem = {
  numero: string
  texto_encabezado: string
  pagina_disposicion: number
  pages?: number[]   // Páginas (normalmente la de inicio)
  anchor?: string    // Ej: "disp-adicional-1"
}

export type MentalOutline = {
  metadata: {
    document_title: string   // Título del documento
    source: string           // Fuente (ej: nombre de archivo, BOE, etc.)
    language: string         // Idioma, normalmente "es"
    generated_at: string     // Fecha de generación, ISO (YYYY-MM-DD)
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

**Notas:**

- No hay `schema_version` ni campo similar en `metadata`.
- `metadata.source` es el campo que identifica el origen (nombre de fichero, BOE, etc.).

**Zod schema:**

- Actualmente **no hay un Zod schema explícito** para `MentalOutline` en el código; el tipo se usa sólo como `type` de TypeScript y en contratos de endpoints (`schema: MentalOutline`, `outline: MentalOutline`, etc.).

---

## b) Export a CSV/JSON del outline

- **JSON**:
  - Los endpoints de esquema mental devuelven directamente el objeto **`MentalOutline`**:
    - `/api/mental-outline` → `{ ok: boolean, outline: MentalOutline }`
    - `/api/mental-outline/generate-direct` → `{ ok: boolean, schema: MentalOutline }`
    - `/api/mental-outline/generate-from-bookmarks` → `{ ok: boolean, schema: MentalOutline, stats?: {...} }`
    - `/api/mental-outline/chunk` → `{ ok: boolean, schema: MentalOutline }`
  - No hay una función específica de “export JSON”; el **formato de exportación JSON ES el propio `MentalOutline`**.

- **CSV**:
  - Actualmente **no existe** una función que exporte el esquema mental a CSV (solo hay CSV para preguntas tipo test en `itemsToCSV`).
  - Por tanto, **no hay lista de columnas CSV definida para el outline**.

---

## c) Ejemplo real (pequeño) de `MentalOutline` generado

Ejemplo reducido basado en un log real (`logs/mental-outline-chunk-2025-11-17T16-12-54-078Z.json`), recortado a tres títulos y algunos artículos:

```json
{
  "metadata": {
    "document_title": "BOE-A-2018-16673-consolidado-páginas-TituloI-III-copia",
    "source": "BOE-A-2018-16673-consolidado-páginas-TituloI-III-copia",
    "language": "es",
    "generated_at": "2025-11-17"
  },
  "front_matter": {
    "preambulo": {
      "present": true,
      "anchor": null,
      "pages": [8]
    },
    "exposicion_motivos": {
      "present": false,
      "anchor": null,
      "pages": null
    }
  },
  "titulos": [
    {
      "ordinal": "I",
      "titulo_texto": "Disposiciones generales",
      "pagina_inicio_titulo": 15,
      "pagina_fin_titulo": 16,
      "pages": [15],
      "anchor": "tit-i",
      "articulos": [
        {
          "numero": "Artículo 1",
          "articulo_texto": "Objeto de la ley",
          "pagina_articulo": 15,
          "pages": [15],
          "anchor": "art-1"
        },
        {
          "numero": "Artículo 2",
          "articulo_texto": "Ámbito de aplicación de los Títulos I a IX y de los artículos 89 a 94",
          "pagina_articulo": 15,
          "pages": [15],
          "anchor": "art-2"
        }
      ],
      "capitulos": []
    },
    {
      "ordinal": "II",
      "titulo_texto": "Principios de protección de datos",
      "pagina_inicio_titulo": 16,
      "pagina_fin_titulo": 18,
      "pages": [16],
      "anchor": "tit-ii",
      "articulos": [
        {
          "numero": "Artículo 4",
          "articulo_texto": "Exactitud de los datos",
          "pagina_articulo": 16,
          "pages": [16],
          "anchor": "art-4"
        }
      ],
      "capitulos": []
    },
    {
      "ordinal": "III",
      "titulo_texto": "Derechos de las personas",
      "pagina_inicio_titulo": 18,
      "pagina_fin_titulo": 20,
      "pages": [18],
      "anchor": "tit-iii",
      "articulos": [],
      "capitulos": [
        {
          "ordinal": "I",
          "capitulo_texto": "Transparencia e información",
          "pagina_inicio_capitulo": 18,
          "pagina_fin_capitulo": 18,
          "pages": [18],
          "anchor": "cap-i",
          "articulos": [
            {
              "numero": "Artículo 11",
              "articulo_texto": "Transparencia e información al afectado",
              "pagina_articulo": 18,
              "pages": [18],
              "anchor": "art-11"
            }
          ],
          "secciones": []
        }
      ]
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

---

## d) Reglas para `page_end`, anchors y niveles opcionales

### d.1. Reglas para `page_end` (`pagina_fin_*` y `pages[]`)

- **Campos “page_end” explícitos**:
  - `pagina_fin_titulo`, `pagina_fin_capitulo`, `pagina_fin_seccion`, `pagina_fin_articulo`, `pagina_disposicion`.
  - Se calculan a partir de:
    - Páginas del índice (cuando viene de bookmarks/índice).
    - Agrupación de artículos/secciones dentro de un mismo bloque lógico.
- **Campos `pages: number[]`**:
  - Array de páginas asociado a cada nodo:
    - En títulos/capítulos/secciones: normalmente contiene **la página de inicio**.
    - En artículos/disposiciones: suele contener la página del artículo/disposición (inicio).
  - `pages` no siempre codifica el rango completo; el rango “oficial” es `pagina_inicio_*` / `pagina_fin_*`.

**Regla práctica**:

- Para rangos, usar `pagina_inicio_*` / `pagina_fin_*`.
- Para navegación (scroll/visor), usar `pages[0]` o `pagina_inicio_*`.

### d.2. Reglas de anchors

Los anchors se generan de forma determinista para navegación y URLs:

- **Títulos**:
  - `tit-${ordinalEnRomanoMinúsculas}`
  - Ej.: `TÍTULO I` → `"I"` → `"tit-i"`.
- **Capítulos**:
  - `cap-${ordinalEnRomanoMinúsculas}`
  - Ej.: `CAPÍTULO II` → `"II"` → `"cap-ii"`.
- **Secciones**:
  - Generalmente `sec-${ordinalNormalizado}`:
  - Ej.: “SECCIÓN 1” → `"1"` → `"sec-1"`.
- **Artículos**:
  - `art-${númeroNormalizado}` (sin “Artículo” y sin puntos):
  - Ej.: “Artículo 12” → `"12"` → `"art-12"`.
- **Disposiciones**:
  - Patrón tipo `disp-{tipo}-{n}`:
  - Ej.: “Disposición adicional primera” → `"disp-adicional-1"`.

En algunos borradores o estructuras intermedias los anchors pueden ser `null` o `undefined`, pero en el outline “sanitized” que llega al frontend deberían existir para todos los nodos navegables.

### d.3. Niveles opcionales y relaciones

El esquema mental soporta varios **niveles opcionales**:

- **Artículos colgando directamente de un título**:
  - `Titulo.articulos_sin_capitulo` (alias `Titulo.articulos`).
- **Artículos colgando directamente de un capítulo**:
  - `Capitulo.articulos_sin_seccion` (alias `Capitulo.articulos`).
- **Secciones opcionales**:
  - `Capitulo.secciones` puede estar vacío.
- **Disposiciones opcionales**:
  - Cada lista (`adicionales`, `transitorias`, `derogatorias`, `finales`) puede estar vacía.

**Reglas funcionales (resumen)**:

- `getArticleContext` busca un artículo:
  1. En `titulo.articulos_sin_capitulo`.
  2. En `capitulo.articulos_sin_seccion`.
  3. En `seccion.articulos`.
- El frontend muestra sólo los niveles que existan:
  - Si un título no tiene capítulos: se muestran directamente sus artículos.
  - Si un capítulo no tiene secciones: se muestran sus artículos directos.

---

## Convención de nombre de archivo y `schema_version`

- **Nombre de archivo para outline JSON**:
  - Los endpoints responden con JSON normal (`Content-Type: application/json`), **sin** cabecera de `Content-Disposition` con nombre fijo.
  - El nombre de descarga depende del cliente/navegador; no hay convención de `outline.json` en el backend.

- **Nombres en logs de outline**:
  - Logs internos usan nombres tipo:
    - `mental-outline-chunk-YYYY-MM-DDTHH-MM-SS-SSSZ.json`
  - Son sólo para debugging interno.

- **`schema_version`**:
  - **No existe** en el tipo `MentalOutline` ni en `metadata`.
  - No hay campo `schema_version` definido para el esquema mental a día de hoy.


