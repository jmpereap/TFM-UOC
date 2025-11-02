export function deduplicateStrings(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const it of items) {
    const key = it.trim().toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      out.push(it)
    }
  }
  return out
}

