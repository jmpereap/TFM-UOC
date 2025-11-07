export const mentalOutlineSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://tfm-uoc-ia/schemas/mental-outline.json',
  type: 'object',
  required: ['metadata', 'front_matter', 'titulos', 'disposiciones'],
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
    front_matter: {
      type: 'object',
      required: ['preambulo', 'exposicion_motivos'],
      additionalProperties: false,
      properties: {
        preambulo: { $ref: '#/$defs/frontMatterEntry' },
        exposicion_motivos: { $ref: '#/$defs/frontMatterEntry' },
      },
    },
    titulos: {
      type: 'array',
      items: { $ref: '#/$defs/titulo' },
    },
    disposiciones: {
      type: 'object',
      required: ['adicionales', 'transitorias', 'derogatorias', 'finales'],
      additionalProperties: false,
      properties: {
        adicionales: { type: 'array', items: { $ref: '#/$defs/disposicionItem' } },
        transitorias: { type: 'array', items: { $ref: '#/$defs/disposicionItem' } },
        derogatorias: { type: 'array', items: { $ref: '#/$defs/disposicionItem' } },
        finales: { type: 'array', items: { $ref: '#/$defs/disposicionItem' } },
      },
    },
  },
  $defs: {
    frontMatterEntry: {
      type: 'object',
      required: ['present', 'anchor', 'pages'],
      additionalProperties: false,
      properties: {
        present: { type: 'boolean' },
        anchor: { type: ['string', 'null'] },
        pages: {
          anyOf: [
            { type: 'null' },
            { type: 'array', items: { type: 'integer', minimum: 1 }, minItems: 1, maxItems: 2 },
          ],
        },
      },
    },
    titulo: {
      type: 'object',
      required: ['ordinal', 'titulo_texto', 'anchor', 'pages', 'capitulos', 'articulos'],
      additionalProperties: false,
      properties: {
        ordinal: { type: 'string', minLength: 1 },
        titulo_texto: { type: 'string', minLength: 1 },
        anchor: { type: 'string', minLength: 1 },
        pages: { $ref: '#/$defs/pageRange' },
        capitulos: { type: 'array', items: { $ref: '#/$defs/capitulo' } },
        articulos: { type: 'array', items: { $ref: '#/$defs/articulo' } },
      },
    },
    capitulo: {
      type: 'object',
      required: ['ordinal', 'capitulo_texto', 'anchor', 'pages', 'secciones', 'articulos'],
      additionalProperties: false,
      properties: {
        ordinal: { type: 'string', minLength: 1 },
        capitulo_texto: { type: 'string', minLength: 1 },
        anchor: { type: 'string', minLength: 1 },
        pages: { $ref: '#/$defs/pageRange' },
        secciones: { type: 'array', items: { $ref: '#/$defs/seccion' } },
        articulos: { type: 'array', items: { $ref: '#/$defs/articulo' } },
      },
    },
    seccion: {
      type: 'object',
      required: ['ordinal', 'seccion_texto', 'anchor', 'pages', 'articulos'],
      additionalProperties: false,
      properties: {
        ordinal: { type: 'string', minLength: 1 },
        seccion_texto: { type: 'string', minLength: 1 },
        anchor: { type: 'string', minLength: 1 },
        pages: { $ref: '#/$defs/pageRange' },
        articulos: { type: 'array', items: { $ref: '#/$defs/articulo' } },
      },
    },
    articulo: {
      type: 'object',
      required: ['numero', 'articulo_texto', 'anchor', 'pages'],
      additionalProperties: false,
      properties: {
        numero: { type: 'string', minLength: 1 },
        articulo_texto: { type: 'string', minLength: 1 },
        anchor: { type: 'string', minLength: 1 },
        pages: { $ref: '#/$defs/pageRange' },
      },
    },
    disposicionItem: {
      type: 'object',
      required: ['numero', 'texto_encabezado', 'anchor', 'pages'],
      additionalProperties: false,
      properties: {
        numero: { type: 'string', minLength: 1 },
        texto_encabezado: { type: 'string', minLength: 1 },
        anchor: { type: 'string', minLength: 1 },
        pages: { $ref: '#/$defs/pageRange' },
      },
    },
    pageRange: {
      type: 'array',
      items: { type: 'integer', minimum: 1 },
      minItems: 0,
    },
  },
} as const

