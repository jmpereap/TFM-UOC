import type { RulePack } from '@/lib/legal/rulePack'

export function compileHeaderUnion(pack: RulePack): RegExp {
  const parts: string[] = []
  parts.push(...(pack.title_patterns || []))
  parts.push(...(pack.chapter_patterns || []))
  parts.push(...(pack.section_patterns || []))
  parts.push(...(pack.article_patterns || []))
  if (pack.dispositions_groups) {
    for (const g of pack.dispositions_groups) {
      if (g.group_pattern) parts.push(g.group_pattern)
      if (g.item_pattern) parts.push(g.item_pattern)
    }
  }
  const uniq = Array.from(new Set(parts.filter(Boolean)))
  if (!uniq.length) {
    return /^$/
  }
  const escaped = uniq.map((s) => `(?:${s})`).join('|')
  return new RegExp(`^(?:${escaped})`, 'gimu')
}
