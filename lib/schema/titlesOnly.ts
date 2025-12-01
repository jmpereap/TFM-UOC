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







