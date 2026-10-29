import { useEffect, useState } from 'react'
import EmployeeAvatar from '../company/EmployeeAvatar'
import ImageLightbox from './ImageLightbox'
import { downloadFromUrl } from '../../lib/fileDownload'
import { getWorkOrderFileSignedUrl } from '../../lib/workOrderAssets'
import { getWorkOrderFiles, isImageFileItem } from '../../lib/workOrderFileValues'
import '../workrequests/WorkRequests.css'

function formatTimelineDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function filesFromMetadata(meta) {
  if (!meta || typeof meta !== 'object') return []
  return getWorkOrderFiles(meta.attachments || meta.files)
}

export function hydrateTimelineAttachments(events, requestAttachments) {
  const list = Array.isArray(events) ? events.map((event) => ({ ...event })) : []
  const pool = getWorkOrderFiles(requestAttachments)
  let end = pool.length
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const event = list[i]
    const stored = filesFromMetadata(event.metadata)
    if (stored.length) {
      list[i] = {
        ...event,
        metadata: { ...event.metadata, attachments: stored },
      }
      end = Math.max(0, end - stored.length)
      continue
    }
    const added = Number(event.metadata?.attachments_added) || 0
    if (!added || event.event_type !== 'info_provided') continue
    const start = Math.max(0, end - added)
    list[i] = {
      ...event,
      metadata: {
        ...(event.metadata || {}),
        attachments: pool.slice(start, end),
      },
    }
    end = start
  }
  return list
}

function TimelineActor({ actor }) {
  if (!actor) return null
  return (
    <div className="wr-timeline__actor">
      <EmployeeAvatar
        employee={{ name: actor.name, photo_signed_url: actor.photo_signed_url }}
        size="sm"
      />
      <div className="wr-timeline__actor-copy">
        <span className="wr-timeline__actor-name">{actor.name}</span>
        {actor.department?.name && (
          <span className="wr-timeline__actor-dept">{actor.department.name}</span>
        )}
      </div>
    </div>
  )
}

function TimelineAttachments({ files }) {
  const list = getWorkOrderFiles(files)
  const [urls, setUrls] = useState({})
  const [fileError, setFileError] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const pathKey = list.map((file) => file.path).filter(Boolean).join('|')

  useEffect(() => {
    if (!pathKey) {
      setUrls({})
      return undefined
    }

    let cancelled = false
    const paths = pathKey.split('|')
    ;(async () => {
      const next = {}
      await Promise.all(paths.map(async (path) => {
        try {
          const url = await getWorkOrderFileSignedUrl(path)
          if (url) next[path] = url
        } catch (err) {
          if (!cancelled) setFileError(err.message || 'Could not open file')
        }
      }))
      if (!cancelled) setUrls(next)
    })()

    return () => { cancelled = true }
  }, [pathKey])

  if (!list.length) return null

  const resolveUrl = async (file) => {
    if (file.path && urls[file.path]) return urls[file.path]
    if (file.url || file.previewUrl) return file.url || file.previewUrl
    if (file.path) return getWorkOrderFileSignedUrl(file.path)
    return null
  }

  const downloadFile = async (file) => {
    const label = file.name || file.file_name || 'download'
    setFileError(null)
    try {
      const src = await resolveUrl(file)
      if (src) await downloadFromUrl(src, label)
    } catch (err) {
      setFileError(err.message || 'Could not download file')
    }
  }

  const openFile = async (file) => {
    const label = file.name || file.file_name || 'Download file'
    setFileError(null)
    try {
      const src = await resolveUrl(file)
      if (!src) return
      if (isImageFileItem(file)) {
        setLightbox({ src, alt: label, filename: label })
        return
      }
      await downloadFromUrl(src, label)
    } catch (err) {
      setFileError(err.message || 'Could not open file')
    }
  }

  return (
    <div className="wr-timeline__files">
      {fileError && (
        <p className="wr-timeline__file-error" role="alert">{fileError}</p>
      )}
      <ul>
        {list.map((file, index) => {
          const label = file.name || file.file_name || 'Download file'
          const previewSrc = (file.path && urls[file.path]) || file.url || file.previewUrl
          const isImage = isImageFileItem(file)
          return (
            <li key={file.path || `${label}-${index}`}>
              <button
                type="button"
                className="wr-timeline__file-preview"
                onClick={() => openFile(file)}
                aria-label={isImage ? `Preview ${label}` : `Download ${label}`}
              >
                {isImage && previewSrc ? (
                  <img src={previewSrc} alt="" />
                ) : (
                  <span aria-hidden="true">{(label.split('.').pop() || 'FILE').slice(0, 4).toUpperCase()}</span>
                )}
              </button>
              <div className="wr-timeline__file-copy">
                <button
                  type="button"
                  className="wr-timeline__file-name"
                  onClick={() => openFile(file)}
                >
                  {label}
                </button>
                <button
                  type="button"
                  className="wr-timeline__file-download"
                  onClick={() => downloadFile(file)}
                >
                  Download
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          filename={lightbox.filename}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}

export default function RecordTimeline({
  events,
  emptyLabel = 'No timeline events yet.',
}) {
  if (!events?.length) {
    return <p className="wo-received-detail__status">{emptyLabel}</p>
  }

  return (
    <ul className="wr-timeline wr-timeline--panel">
      {events.map((ev) => (
        <li key={ev.id}>
          <TimelineActor actor={ev.actor} />
          <span className="wr-timeline__event">
            {(ev.event_type || '').replace(/_/g, ' ')}
          </span>
          {ev.message ? <p className="wr-timeline__message">{ev.message}</p> : null}
          <TimelineAttachments files={filesFromMetadata(ev.metadata)} />
          <time className="wr-timeline__time" dateTime={ev.created_at}>
            {formatTimelineDate(ev.created_at)}
          </time>
        </li>
      ))}
    </ul>
  )
}
