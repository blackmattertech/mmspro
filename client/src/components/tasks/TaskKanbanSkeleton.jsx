export default function TaskKanbanSkeleton({ columns = 5 }) {
  return (
    <div
      className="tasks-kanban tasks-kanban--skeleton"
      style={{ '--kanban-columns': columns }}
      aria-hidden="true"
    >
      {Array.from({ length: columns }, (_, index) => (
        <section key={index} className="tasks-kanban__column tasks-kanban__column--skeleton">
          <header className="tasks-kanban__column-header">
            <div className="tasks-kanban-skeleton__title" />
            <div className="tasks-kanban-skeleton__count" />
          </header>
          <div className="tasks-kanban__column-body">
            {index === 3 ? (
              <div className="tasks-kanban-skeleton__card" />
            ) : (
              <div className="tasks-kanban-skeleton__empty" />
            )}
          </div>
        </section>
      ))}
    </div>
  )
}
