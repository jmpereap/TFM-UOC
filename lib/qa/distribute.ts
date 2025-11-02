export function distributeQuestions(n: number, m: number): number[] {
  if (n <= 0 || m <= 0) return Array(m).fill(0)

  if (m <= n) {
    const base = Math.floor(n / m)
    let remainder = n % m
    const arr = Array(m).fill(base)
    const idxs = Array.from({ length: m }, (_, i) => i).sort(() => Math.random() - 0.5)
    for (let k = 0; k < remainder; k++) arr[idxs[k]] += 1
    return arr
  } else {
    const arr = Array(m).fill(0)
    const idxs = Array.from({ length: m }, (_, i) => i).sort(() => Math.random() - 0.5)
    for (let k = 0; k < n; k++) arr[idxs[k]] = 1
    return arr
  }
}

// Alias conservando el nombre previo usado en la API mock
export function distribute(total: number, buckets: number): number[] {
  return distributeQuestions(total, buckets)
}

