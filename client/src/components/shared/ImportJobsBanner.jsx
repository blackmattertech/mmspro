import { Link, useParams } from 'react-router-dom'
import { orgPath } from '../../config/navigation'
import { useImportJobs } from '../../hooks/useImportJobs'
import './ImportJobsBanner.css'

function jobMessage(job) {
  if (job.status === 'running') {
    return `Importing ${job.fileName} (${job.templateLabel})…`
  }
  if (job.status === 'error') {
    return `Import failed: ${job.error || 'Unknown error'}`
  }
  if (job.status === 'success') {
    return `Import complete — ${job.result?.created ?? 0} row(s) added.`
  }
  if (job.status === 'partial') {
    return `Import finished — ${job.result?.created ?? 0} added, ${job.result?.failed ?? 0} failed.`
  }
  return `Import finished — ${job.result?.failed ?? 0} row(s) had errors.`
}

export default function ImportJobsBanner() {
  const { orgSlug } = useParams()
  const { bannerJobs, dismissJobBanner, runningCount } = useImportJobs()

  if (!bannerJobs.length) return null

  const importPath = orgSlug ? orgPath(orgSlug, 'configuration/import') : null

  return (
    <div className="import-jobs-banner" role="region" aria-label="Background imports">
      {bannerJobs.map((job) => (
        <div
          key={job.id}
          className={`import-jobs-banner__item import-jobs-banner__item--${job.status}`}
        >
          <div className="import-jobs-banner__body">
            {job.status === 'running' && (
              <span className="import-jobs-banner__spinner" aria-hidden="true" />
            )}
            <div>
              <p className="import-jobs-banner__text">{jobMessage(job)}</p>
              {job.status === 'running' && (
                <p className="import-jobs-banner__hint">
                  Running in the background — you can keep working in the app.
                </p>
              )}
            </div>
          </div>
          <div className="import-jobs-banner__actions">
            {importPath && job.status !== 'running' && (
              <Link to={importPath} className="import-jobs-banner__link">
                View details
              </Link>
            )}
            {job.status !== 'running' && (
              <button
                type="button"
                className="import-jobs-banner__dismiss"
                onClick={() => dismissJobBanner(job.id)}
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      ))}
      {runningCount > 1 && (
        <p className="import-jobs-banner__footer">{runningCount} imports in progress</p>
      )}
    </div>
  )
}
