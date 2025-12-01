import type { PageTxt } from '@/lib/utils/pageStats'
import { computeAllStats } from '@/lib/utils/pageStats'

export type FrontCfg = {
  max_first_pages?: number
  min_chars_body?: number
  drop_if_idx_ratio_ge?: number
  force_drop_patterns?: string[]
  allow_if_headers_present?: string[]
}

export function defaultFrontmatterConfig(): FrontCfg {
  return {
    max_first_pages: 4,
    min_chars_body: 700,
    drop_if_idx_ratio_ge: 0.45,
    force_drop_patterns: [
      '^ÍNDICE$',
      '^SUMARIO$',
      '^LEGISLACIÓN CONSOLIDADA$',
      '^BOLET[ÍI]N OFICIAL DEL ESTADO$',
      '^PRE[ÁA]MBULO$',
      '^DON\s+JUAN\s+CARLOS\b',
      '^SABED:\b',
      '^TEXTO\s+CONSOLIDADO\b',
    ],
    allow_if_headers_present: [
      'Art[íi]culo\s+1\b',
      '^T[ÍI]TULO\s+PRELIMINAR\b',
    ],
  }
}

export function detectFrontMatter(pages: PageTxt[], cfg: FrontCfg = {}) {
  const stats = computeAllStats(pages)
  const drop = new Set<number>()
  if (!pages?.length) return drop

  const firstMax = Math.min(cfg.max_first_pages ?? 3, stats.length)
  const forceRE = (cfg.force_drop_patterns || []).map((pattern) => new RegExp(pattern, 'i'))
  const allowRE = (cfg.allow_if_headers_present || []).map((pattern) => new RegExp(pattern, 'i'))
  const minChars = cfg.min_chars_body ?? 600
  const idxThreshold = cfg.drop_if_idx_ratio_ge ?? 0.3

  const shouldAllow = (page: PageTxt, stat: ReturnType<typeof computeAllStats>[number]) => {
    if (stat.hasArticulo) return true
    if (stat.hasTitulo || stat.hasCapitulo || stat.hasSeccion) {
      return stat.idxMatches < 4
    }
    return allowRE.some((rx) => rx.test(page.text || ''))
  }

  const hasStructuralHeaders = (stat: ReturnType<typeof computeAllStats>[number]) =>
    stat.hasArticulo || stat.hasTitulo || stat.hasCapitulo || stat.hasSeccion

  for (let i = 0; i < firstMax; i += 1) {
    const stat = stats[i]
    const page = pages[i]
    const ratio = stat.lines ? stat.idxLines / stat.lines : 0
    const force =
      forceRE.some((rx) => rx.test(page.text || '')) || stat.upperHits > 0
    const lowDensity = stat.chars < minChars
    const indexHeavy = stat.idxMatches >= 6 || ratio >= idxThreshold
    const allow = shouldAllow(page, stat)
    if ((force || indexHeavy || ratio >= idxThreshold || lowDensity) && !allow) {
      drop.add(stat.num)
      continue
    }
  }

  for (const stat of stats.slice(firstMax)) {
    const ratio = stat.lines ? stat.idxLines / stat.lines : 0
    const indexHeavy = stat.idxMatches >= 6 || ratio >= idxThreshold
    if ((indexHeavy && !stat.hasArticulo) || (indexHeavy && stat.chars < minChars)) {
      drop.add(stat.num)
    }
  }

  return drop
}
