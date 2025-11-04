export function truncateByChars(s: string, max = 10000): string {
  if (!s) return ''
  if (s.length <= max) return s
  const cut = s.lastIndexOf('\n', Math.max(0, max - 500))
  return s.slice(0, cut > 0 ? cut : max)
}


