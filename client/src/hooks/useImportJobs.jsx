import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'

/** @typedef {'running' | 'success' | 'partial' | 'failed' | 'error'} ImportJobStatus */

/**
 * @typedef {Object} ImportJob
 * @property {string} id
 * @property {string} templateId
 * @property {string} templateLabel
 * @property {string} fileName
 * @property {ImportJobStatus} status
 * @property {number} startedAt
 * @property {number} [finishedAt]
 * @property {import('../config/importTemplates').ImportResult} [result]
 * @property {string} [error]
 * @property {{ filename: string, contentType: string, data: string }} [failedFile]
 * @property {boolean} [bannerDismissed]
 */

const ImportJobsContext = createContext(null)

export function importResultStatus(result) {
  if (!result) return 'failed'
  if (result.failed > 0 && result.created > 0) return 'partial'
  if (result.failed > 0) return 'failed'
  if (result.created > 0) return 'success'
  return 'failed'
}

export function ImportJobsProvider({ children }) {
  const [jobs, setJobs] = useState(/** @type {ImportJob[]} */ ([]))

  const runImport = useCallback(async ({ templateId, templateLabel, fileName, upload }) => {
    const id = crypto.randomUUID()
    const startedAt = Date.now()
    setJobs((prev) => [
      {
        id,
        templateId,
        templateLabel,
        fileName,
        status: 'running',
        startedAt,
        bannerDismissed: false,
      },
      ...prev,
    ])

    try {
      const result = await upload()
      const status = importResultStatus(result)
      setJobs((prev) => prev.map((job) => (
        job.id === id
          ? {
            ...job,
            status,
            result,
            failedFile: result.failedFile,
            finishedAt: Date.now(),
            bannerDismissed: false,
          }
          : job
      )))
      return id
    } catch (err) {
      setJobs((prev) => prev.map((job) => (
        job.id === id
          ? {
            ...job,
            status: 'error',
            error: err.message,
            finishedAt: Date.now(),
            bannerDismissed: false,
          }
          : job
      )))
      throw err
    }
  }, [])

  const dismissJobBanner = useCallback((id) => {
    setJobs((prev) => prev.map((job) => (
      job.id === id ? { ...job, bannerDismissed: true } : job
    )))
  }, [])

  const clearJob = useCallback((id) => {
    setJobs((prev) => prev.filter((job) => job.id !== id))
  }, [])

  const runningCount = useMemo(
    () => jobs.filter((job) => job.status === 'running').length,
    [jobs],
  )

  const bannerJobs = useMemo(
    () => jobs.filter((job) => !job.bannerDismissed && (
      job.status === 'running'
      || (job.finishedAt && Date.now() - job.finishedAt < 1000 * 60 * 30)
    )),
    [jobs],
  )

  const value = useMemo(
    () => ({
      jobs,
      runImport,
      dismissJobBanner,
      clearJob,
      runningCount,
      bannerJobs,
    }),
    [jobs, runImport, dismissJobBanner, clearJob, runningCount, bannerJobs],
  )

  return (
    <ImportJobsContext.Provider value={value}>
      {children}
    </ImportJobsContext.Provider>
  )
}

export function useImportJobs() {
  const ctx = useContext(ImportJobsContext)
  if (!ctx) {
    throw new Error('useImportJobs must be used inside ImportJobsProvider')
  }
  return ctx
}
