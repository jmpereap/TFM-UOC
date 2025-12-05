export function estTokens(chars: number) {
  return Math.ceil(chars / 4)
}

export function smartTruncateLegal(text: string, maxChars = 2800) {
  if (!text || text.length <= maxChars) return text || ''
  let cut = text.lastIndexOf('\n\n', maxChars)
  if (cut < maxChars * 0.6) cut = text.lastIndexOf('\n', maxChars)
  if (cut < 0) cut = maxChars
  return text.slice(0, cut)
}












