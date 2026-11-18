import { apiFetch } from './api'

export function getImportJob(jobId) {
  return apiFetch(`/api/import-jobs/${encodeURIComponent(jobId)}`)
}

export function listImportJobs(limit = 30) {
  return apiFetch(`/api/import-jobs?limit=${encodeURIComponent(limit)}`)
}

export function getImportJobFailedFile(jobId) {
  return apiFetch(`/api/import-jobs/${encodeURIComponent(jobId)}/failed-file`)
}
