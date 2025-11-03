export async function withLimit<T>(limit: number, tasks: Array<() => Promise<T>>): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let nextIndex = 0
  let running = 0

  return await new Promise((resolve) => {
    const launch = () => {
      while (running < limit && nextIndex < tasks.length) {
        const i = nextIndex++
        running++
        tasks[i]()
          .then((r) => (results[i] = r))
          .catch(() => (results[i] = ([] as unknown) as T))
          .finally(() => {
            running--
            if (nextIndex === tasks.length && running === 0) return resolve(results)
            launch()
          })
      }
    }
    launch()
  })
}

