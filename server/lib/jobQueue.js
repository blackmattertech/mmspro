const queue = []
let processing = false

async function drainQueue() {
  if (processing) return
  processing = true
  try {
    while (queue.length) {
      const job = queue.shift()
      try {
        await job()
      } catch (err) {
        console.error('[jobQueue] job failed:', err)
      }
    }
  } finally {
    processing = false
  }
}

export function enqueueJob(job) {
  queue.push(job)
  setImmediate(drainQueue)
}

export function runInBackground(task) {
  enqueueJob(task)
}
