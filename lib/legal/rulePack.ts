export type RulePackDispoGroup = {
  group_pattern: string
  item_pattern: string
}

export type RulePack = {
  title_patterns?: string[]
  chapter_patterns?: string[]
  section_patterns?: string[]
  article_patterns?: string[]
  dispositions_groups?: RulePackDispoGroup[]
}

const LAW_RULE_PACK: RulePack = {
  title_patterns: [
    '^T[ÍI]TULO\s+(PRELIMINAR|[IVXLC]+)\b',
  ],
  chapter_patterns: [
    '^CAP[ÍI]TULO\s+([IVXLC]+|PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO)\b',
  ],
  section_patterns: [
    '^Secci[oó]n\s+\d+\.ª\b',
    '^Secci[oó]n\s+[IVXLC]+\b',
  ],
  article_patterns: [
    '^Art[íi]culo\s+\d+[A-Za-z]?\.?',
  ],
  dispositions_groups: [
    {
      group_pattern: '^Disposiciones\s+adicionales\b',
      item_pattern: '^Disposici[oó]n\s+adicional\s+[A-Za-záéíóúñ]+\b',
    },
    {
      group_pattern: '^Disposiciones\s+transitorias\b',
      item_pattern: '^Disposici[oó]n\s+transitoria\s+[A-Za-záéíóúñ]+\b',
    },
    {
      group_pattern: '^Disposiciones\s+derogatorias\b',
      item_pattern: '^Disposici[oó]n\s+derogatoria\s+[A-Za-záéíóúñ]+\b',
    },
    {
      group_pattern: '^Disposiciones\s+finales\b',
      item_pattern: '^Disposici[oó]n\s+final\s+[A-Za-záéíóúñ]+\b',
    },
  ],
}

export function loadRulePack(kind = 'ley'): RulePack {
  switch (kind) {
    default:
      return LAW_RULE_PACK
  }
}










