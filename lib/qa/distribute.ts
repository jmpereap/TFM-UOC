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

export type DifficultyDistribution = {
  basico: number
  medio: number
  avanzado: number
}

/**
 * Distribuye preguntas por dificultad entre bloques
 * @param distribution - Distribución deseada {basico, medio, avanzado}
 * @param m - Número de bloques
 * @returns Array de objetos con distribución por bloque
 */
export function distributeByDifficulty(
  distribution: DifficultyDistribution,
  m: number
): Array<DifficultyDistribution> {
  const total = distribution.basico + distribution.medio + distribution.avanzado
  if (total <= 0 || m <= 0) {
    return Array(m).fill({ basico: 0, medio: 0, avanzado: 0 })
  }

  // Distribuir cada nivel de dificultad entre los bloques
  const basicoDist = distributeQuestions(distribution.basico, m)
  const medioDist = distributeQuestions(distribution.medio, m)
  const avanzadoDist = distributeQuestions(distribution.avanzado, m)

  // Combinar en un array de objetos
  return basicoDist.map((basico, i) => ({
    basico,
    medio: medioDist[i],
    avanzado: avanzadoDist[i],
  }))
}

// Alias conservando el nombre previo usado en la API mock
export function distribute(total: number, buckets: number): number[] {
  return distributeQuestions(total, buckets)
}

