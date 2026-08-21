import EmployeeAvatar from '../company/EmployeeAvatar'
import '../workrequests/WorkRequests.css'

function formatTimelineDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
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
          <p className="wr-timeline__message">{ev.message}</p>
          <time className="wr-timeline__time" dateTime={ev.created_at}>
            {formatTimelineDate(ev.created_at)}
          </time>
        </li>
      ))}
    </ul>
  )
}
