export async function runInChunks(items, worker, { chunkSize = 5 } = {}) {
  const results = []
  for (let index = 0; index < items.length; index += chunkSize) {
    const chunk = items.slice(index, index + chunkSize)
    const chunkResults = await Promise.all(chunk.map(worker))
    results.push(...chunkResults)
  }
  return results
}
