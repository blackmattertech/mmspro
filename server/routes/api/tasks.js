import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess, assertOrgOwnership } from '../../middleware/orgAccess.js'
import { requireOrgRole } from '../../middleware/orgRole.js'
import {
  requireModulePermission,
  loadOrgPermissions,
} from '../../middleware/modulePermission.js'
import {
  listTasks,
  getTaskDetail,
  createTask,
  updateTask,
  deleteTask,
  changeTaskStatus,
  bulkUpdateTasks,
  bulkDeleteTasks,
  addTaskComment,
  updateTaskComment,
  deleteTaskComment,
  addTaskAttachment,
  deleteTaskAttachment,
  getKanbanBoard,
  getTasksBootstrap,
} from '../../lib/taskService.js'
import {
  listTaskStatuses,
  listTaskPriorities,
  createTaskStatus,
  updateTaskStatus,
  deleteTaskStatus,
  reorderTaskStatuses,
  createTaskPriority,
  updateTaskPriority,
  deleteTaskPriority,
  reorderTaskPriorities,
  resetTaskStatusesToDefault,
  resetTaskPrioritiesToDefault,
} from '../../lib/taskMetaService.js'
import {
  listTaskCategories,
  createTaskCategory,
  updateTaskCategory,
  deleteTaskCategory,
  reorderTaskCategories,
  resetTaskCategoriesToDefault,
} from '../../lib/taskCategoryService.js'
import {
  listTaskTags,
  createTaskTag,
  updateTaskTag,
  deleteTaskTag,
  reorderTaskTags,
  resetTaskTagsToDefault,
} from '../../lib/taskTagService.js'
import { searchTaskReferenceEntities } from '../../lib/taskReferenceService.js'

const router = Router()

const canRead = requireModulePermission('tasks_followups', 'read')
const canCreate = requireModulePermission('tasks_followups', 'create')
const canUpdate = requireModulePermission('tasks_followups', 'update')
const canDelete = requireModulePermission('tasks_followups', 'delete')
const requireAdmin = requireOrgRole('owner', 'admin')

router.use(verifyAuth, requireOrgAccess, loadOrgPermissions)

function parsePagination(query) {
  const rawLimit = Number(query.limit)
  const rawOffset = Number(query.offset)
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(500, rawLimit)) : 50
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0
  return { limit, offset }
}

function listFilters(query) {
  const { limit, offset } = parsePagination(query)
  return {
    limit,
    offset,
    tab: query.tab || 'assigned_to_me',
    search: query.search || null,
    status_id: query.status_id || null,
    priority_id: query.priority_id || null,
    category_id: query.category_id || null,
    tag_id: query.tag_id || null,
    vendor_id: query.vendor_id || null,
    visibility_type: query.visibility_type || null,
    department_id: query.department_id || null,
    location_id: query.location_id || null,
    task_type: query.task_type || null,
    created_by_profile_id: query.created_by_profile_id || null,
    due_from: query.due_from || null,
    due_to: query.due_to || null,
    overdue: query.overdue || null,
    due_today: query.due_today || null,
    recurring: query.recurring || null,
  }
}

// Status management (admin only)
router.get('/statuses', canRead, async (req, res) => {
  try {
    const rows = await listTaskStatuses(req.userProfile.org_id, {
      includeInactive: req.query.include_inactive === 'true',
    })
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/statuses', canRead, requireAdmin, async (req, res) => {
  try {
    const row = await createTaskStatus(req.userProfile.org_id, req.body)
    res.status(201).json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.patch('/statuses/reorder', canRead, requireAdmin, async (req, res) => {
  try {
    const rows = await reorderTaskStatuses(req.userProfile.org_id, req.body.ordered_ids)
    res.json(rows)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.patch('/statuses/:id', canRead, requireAdmin, async (req, res) => {
  try {
    const row = await updateTaskStatus(req.userProfile.org_id, req.params.id, req.body)
    res.json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.delete('/statuses/:id', canRead, requireAdmin, async (req, res) => {
  try {
    const result = await deleteTaskStatus(req.userProfile.org_id, req.params.id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.post('/statuses/reset', canRead, requireAdmin, async (req, res) => {
  try {
    const rows = await resetTaskStatusesToDefault(req.userProfile.org_id)
    res.json(rows)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

// Priority management (admin only)
router.get('/priorities', canRead, async (req, res) => {
  try {
    const rows = await listTaskPriorities(req.userProfile.org_id, {
      includeInactive: req.query.include_inactive === 'true',
    })
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/priorities', canRead, requireAdmin, async (req, res) => {
  try {
    const row = await createTaskPriority(req.userProfile.org_id, req.body)
    res.status(201).json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.patch('/priorities/reorder', canRead, requireAdmin, async (req, res) => {
  try {
    const rows = await reorderTaskPriorities(req.userProfile.org_id, req.body.ordered_ids)
    res.json(rows)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.patch('/priorities/:id', canRead, requireAdmin, async (req, res) => {
  try {
    const row = await updateTaskPriority(req.userProfile.org_id, req.params.id, req.body)
    res.json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.delete('/priorities/:id', canRead, requireAdmin, async (req, res) => {
  try {
    const result = await deleteTaskPriority(req.userProfile.org_id, req.params.id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.post('/priorities/reset', canRead, requireAdmin, async (req, res) => {
  try {
    const rows = await resetTaskPrioritiesToDefault(req.userProfile.org_id)
    res.json(rows)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

// Category management (admin only)
router.get('/categories', canRead, async (req, res) => {
  try {
    const rows = await listTaskCategories(req.userProfile.org_id, {
      includeInactive: req.query.include_inactive === 'true',
    })
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/categories', canRead, requireAdmin, async (req, res) => {
  try {
    const row = await createTaskCategory(req.userProfile.org_id, req.body)
    res.status(201).json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.patch('/categories/reorder', canRead, requireAdmin, async (req, res) => {
  try {
    const rows = await reorderTaskCategories(req.userProfile.org_id, req.body.ordered_ids)
    res.json(rows)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.patch('/categories/:id', canRead, requireAdmin, async (req, res) => {
  try {
    const row = await updateTaskCategory(req.userProfile.org_id, req.params.id, req.body)
    res.json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.delete('/categories/:id', canRead, requireAdmin, async (req, res) => {
  try {
    const result = await deleteTaskCategory(req.userProfile.org_id, req.params.id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.post('/categories/reset', canRead, requireAdmin, async (req, res) => {
  try {
    const rows = await resetTaskCategoriesToDefault(req.userProfile.org_id)
    res.json(rows)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

// Tag management (admin only)
router.get('/tags', canRead, async (req, res) => {
  try {
    const rows = await listTaskTags(req.userProfile.org_id, {
      includeInactive: req.query.include_inactive === 'true',
    })
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/tags', canRead, requireAdmin, async (req, res) => {
  try {
    const row = await createTaskTag(req.userProfile.org_id, req.body)
    res.status(201).json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.patch('/tags/reorder', canRead, requireAdmin, async (req, res) => {
  try {
    const rows = await reorderTaskTags(req.userProfile.org_id, req.body.ordered_ids)
    res.json(rows)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.patch('/tags/:id', canRead, requireAdmin, async (req, res) => {
  try {
    const row = await updateTaskTag(req.userProfile.org_id, req.params.id, req.body)
    res.json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.delete('/tags/:id', canRead, requireAdmin, async (req, res) => {
  try {
    const result = await deleteTaskTag(req.userProfile.org_id, req.params.id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.post('/tags/reset', canRead, requireAdmin, async (req, res) => {
  try {
    const rows = await resetTaskTagsToDefault(req.userProfile.org_id)
    res.json(rows)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

// Reference entity search
router.get('/references/search', canRead, async (req, res) => {
  try {
    const rows = await searchTaskReferenceEntities(
      req.userProfile.org_id,
      req.query.q || '',
      { type: req.query.type || null },
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Combined page bootstrap (meta + board/list in one request)
router.get('/bootstrap', canRead, async (req, res) => {
  try {
    const view = req.query.view === 'list' ? 'list' : 'kanban'
    const data = await getTasksBootstrap(
      req.userProfile.org_id,
      req.userProfile.id,
      listFilters(req.query),
      { view },
    )
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Kanban board
router.get('/kanban', canRead, async (req, res) => {
  try {
    const board = await getKanbanBoard(
      req.userProfile.org_id,
      req.userProfile.id,
      listFilters(req.query),
    )
    res.json(board)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Task list
router.get('/', canRead, async (req, res) => {
  try {
    const rows = await listTasks(
      req.userProfile.org_id,
      req.userProfile.id,
      listFilters(req.query),
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', canRead, assertOrgOwnership('tasks'), async (req, res) => {
  try {
    const row = await getTaskDetail(
      req.userProfile.org_id,
      req.params.id,
      req.userProfile.id,
    )
    res.json(row)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/', canCreate, async (req, res) => {
  try {
    const row = await createTask(req.userProfile.org_id, req.userProfile.id, req.body)
    res.status(201).json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.patch('/bulk', canUpdate, async (req, res) => {
  try {
    const rows = await bulkUpdateTasks(
      req.userProfile.org_id,
      req.userProfile.id,
      req.body,
    )
    res.json(rows)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.delete('/bulk', canDelete, async (req, res) => {
  try {
    const result = await bulkDeleteTasks(
      req.userProfile.org_id,
      req.userProfile.id,
      req.body.task_ids,
    )
    res.json(result)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.patch('/:id/status', canUpdate, assertOrgOwnership('tasks'), async (req, res) => {
  try {
    const row = await changeTaskStatus(
      req.userProfile.org_id,
      req.params.id,
      req.userProfile.id,
      req.body.status_id,
    )
    res.json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.patch('/:id', canUpdate, assertOrgOwnership('tasks'), async (req, res) => {
  try {
    const row = await updateTask(
      req.userProfile.org_id,
      req.params.id,
      req.userProfile.id,
      req.body,
    )
    res.json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.delete('/:id', canDelete, assertOrgOwnership('tasks'), async (req, res) => {
  try {
    const result = await deleteTask(
      req.userProfile.org_id,
      req.params.id,
      req.userProfile.id,
    )
    res.json(result)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

// Comments
router.post('/:id/comments', canUpdate, assertOrgOwnership('tasks'), async (req, res) => {
  try {
    const row = await addTaskComment(
      req.userProfile.org_id,
      req.params.id,
      req.userProfile.id,
      req.body,
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.patch('/:id/comments/:commentId', canUpdate, assertOrgOwnership('tasks'), async (req, res) => {
  try {
    const row = await updateTaskComment(
      req.userProfile.org_id,
      req.params.id,
      req.params.commentId,
      req.userProfile.id,
      req.body,
    )
    res.json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.delete('/:id/comments/:commentId', canUpdate, assertOrgOwnership('tasks'), async (req, res) => {
  try {
    const result = await deleteTaskComment(
      req.userProfile.org_id,
      req.params.id,
      req.params.commentId,
      req.userProfile.id,
    )
    res.json(result)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

// Attachments
router.post('/:id/attachments', canUpdate, assertOrgOwnership('tasks'), async (req, res) => {
  try {
    const row = await addTaskAttachment(
      req.userProfile.org_id,
      req.params.id,
      req.userProfile.id,
      req.body,
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.delete('/:id/attachments/:attachmentId', canUpdate, assertOrgOwnership('tasks'), async (req, res) => {
  try {
    const result = await deleteTaskAttachment(
      req.userProfile.org_id,
      req.params.id,
      req.params.attachmentId,
      req.userProfile.id,
    )
    res.json(result)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

export default router
