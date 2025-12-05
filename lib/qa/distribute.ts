export function distributeQuestions(n: number, m: number): number[] {
  if (n <= 0 || m <= 0) return Array(m).fill(0)

  if (m <= n) {
    // Caso: bloques <= preguntas
    const base = Math.floor(n / m)
    let remainder = n % m
    const arr = Array(m).fill(base)
    const idxs = Array.from({ length: m }, (_, i) => i).sort(() => Math.random() - 0.5)
    for (let k = 0; k < remainder; k++) arr[idxs[k]] += 1
    // Log para debugging (solo en desarrollo, no en producción)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[distributeQuestions] m(${m}) <= n(${n}): base=${base}, remainder=${remainder}, result=${JSON.stringify(arr)}`)
    }
    return arr
  } else {
    // Caso: bloques > preguntas
    const arr = Array(m).fill(0)
    const idxs = Array.from({ length: m }, (_, i) => i).sort(() => Math.random() - 0.5)
    for (let k = 0; k < n; k++) arr[idxs[k]] = 1
    // Log para debugging (solo en desarrollo, no en producción)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[distributeQuestions] m(${m}) > n(${n}): ${n} bloques reciben 1 pregunta, ${m - n} bloques reciben 0, result=${JSON.stringify(arr)}`)
    }
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

/**
 * Distribuye preguntas priorizando un nivel específico
 * Al menos el 95% de las preguntas serán del nivel preferido para básico, 90% para medio y avanzado (idealmente 100%)
 * @param n - Número total de preguntas
 * @param preferredLevel - Nivel preferido ('basico' | 'medio' | 'avanzado' | null)
 * @param m - Número de bloques
 * @returns Array de objetos con distribución por bloque
 */
export function distributeByPreferredLevel(
  n: number,
  preferredLevel: 'basico' | 'medio' | 'avanzado' | null,
  m: number
): Array<DifficultyDistribution> {
  if (n <= 0 || m <= 0) {
    return Array(m).fill({ basico: 0, medio: 0, avanzado: 0 })
  }

  // Si no hay nivel preferido, retornar distribución vacía (se usará la lógica existente)
  if (preferredLevel === null) {
    return Array(m).fill({ basico: 0, medio: 0, avanzado: 0 })
  }

  // Calcular el porcentaje según el nivel: básico 95%, medio y avanzado 90%
  const percentage = preferredLevel === 'basico' ? 0.95 : 0.90
  const preferredCount = Math.ceil(n * percentage)
  const remaining = n - preferredCount

  // Distribuir las preguntas del nivel preferido entre los bloques
  const preferredDist = distributeQuestions(preferredCount, m)

  // Distribuir el resto entre los otros niveles
  let remainingBasico = 0
  let remainingMedio = 0
  let remainingAvanzado = 0

  if (remaining > 0) {
    if (preferredLevel === 'basico') {
      // El resto puede ser medio o avanzado, preferir medio para contraste
      remainingMedio = remaining
    } else if (preferredLevel === 'medio') {
      // El resto puede ser básico o avanzado, preferir avanzado para contraste
      remainingAvanzado = remaining
    } else if (preferredLevel === 'avanzado') {
      // El resto puede ser básico o medio, preferir medio para contraste
      remainingMedio = remaining
    }
  }

  // Distribuir el resto entre los bloques
  const remainingBasicoDist = distributeQuestions(remainingBasico, m)
  const remainingMedioDist = distributeQuestions(remainingMedio, m)
  const remainingAvanzadoDist = distributeQuestions(remainingAvanzado, m)

  // Combinar en un array de objetos
  return preferredDist.map((preferred, i) => {
    if (preferredLevel === 'basico') {
      return {
        basico: preferred,
        medio: remainingMedioDist[i],
        avanzado: remainingAvanzadoDist[i],
      }
    } else if (preferredLevel === 'medio') {
      return {
        basico: remainingBasicoDist[i],
        medio: preferred,
        avanzado: remainingAvanzadoDist[i],
      }
    } else {
      // preferredLevel === 'avanzado'
      return {
        basico: remainingBasicoDist[i],
        medio: remainingMedioDist[i],
        avanzado: preferred,
      }
    }
  })
}

