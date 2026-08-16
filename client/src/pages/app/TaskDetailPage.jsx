import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { useTaskDetail } from '../../hooks/useTaskDetail'
import { useTaskMeta } from '../../hooks/useTaskMeta'
import { orgPath } from '../../config/navigation'
import RecordDetailLayout from '../../components/shared/RecordDetailLayout'
import { TaskDetailContent } from '../../components/tasks/TaskDetailContent'
import '../../components/company/CompanyShared.css'
import '../../components/tasks/Tasks.css'

export default function TaskDetailPage() {
  const { taskId } = useParams()
  const navigate = useNavigate()
  const { org } = useOrg()
  const { canUpdate } = usePermissions()
  const { activeStatuses, statuses, priorities } = useTaskMeta()
  const {
    task,
    loading,
    saving,
    error,
    setStatus,
    addComment,
    reload,
  } = useTaskDetail(taskId)

  const goBack = useCallback(() => {
    if (org?.slug) navigate(orgPath(org.slug, 'tasks-and-followups'))
  }, [navigate, org?.slug])

  const openEdit = useCallback(() => {
    if (!org?.slug || !taskId) return
    navigate(orgPath(org.slug, `tasks-and-followups/${taskId}/edit`))
  }, [navigate, org?.slug, taskId])

  return (
    <RecordDetailLayout
      className="task-detail-page"
      backLabel="Back to tasks"
      onBack={goBack}
      title={task?.title || 'Task details'}
      subtitle={task?.short_description || undefined}
      loading={loading}
      error={error}
      actions={canUpdate('tasks_followups') && (
        <>
          <button type="button" className="company-btn company-btn--primary" onClick={openEdit}>
            Edit Task
          </button>
          <button
            type="button"
            className="company-btn company-btn--secondary company-btn--icon task-detail-more-btn"
            aria-label="More actions"
            title="More actions"
          >
            ⋮
          </button>
        </>
      )}
    >
      {task && (
        <TaskDetailContent
          task={task}
          statuses={activeStatuses}
          allStatuses={statuses}
          allPriorities={priorities}
          onStatusChange={async (statusId) => {
            await setStatus(statusId)
            await reload({ silent: true })
          }}
          onAddComment={addComment}
          saving={saving}
        />
      )}
    </RecordDetailLayout>
  )
}
