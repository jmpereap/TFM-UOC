export function distribute(total: number, buckets: number): number[] {
  if (buckets <= 0) return []
  const base = Math.floor(total / buckets)
  const remainder = total % buckets
  const out = new Array(buckets).fill(base)
  for (let i = 0; i < remainder; i++) out[i] += 1
  return out
}

