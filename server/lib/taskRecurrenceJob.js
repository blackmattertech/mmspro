import { supabaseAdmin } from '../services/supabase.js'
import { computeNextOccurrence } from './taskRecurrence.js'
import { nextTaskNumber } from './taskNumberService.js'
import { notifyTaskAssigned } from './taskNotifyRecipients.js'

async function loadTemplateTagIds(orgId, templateId) {
  const { data, error } = await supabaseAdmin
    .from('task_tag_assignments')
    .select('tag_id')
    .eq('task_id', templateId)

  if (error) throw error
  return (data || []).map((row) => row.tag_id)
}

async function cloneTemplateInstance(template, recurrence) {
  const orgId = template.org_id
  const taskNumber = await nextTaskNumber(orgId)

  const { data: instance, error: insertError } = await supabaseAdmin
    .from('tasks')
    .insert({
      org_id: orgId,
      task_number: taskNumber,
      title: template.title,
      short_description: template.short_description,
      detailed_description: template.detailed_description,
      visibility_type: template.visibility_type,
      task_type: 'one_time',
      status_id: template.status_id,
      priority_id: template.priority_id,
      category_id: template.category_id,
      vendor_id: template.vendor_id,
      start_date: recurrence.next_occurrence_at
        ? new Date(recurrence.next_occurrence_at).toISOString().slice(0, 10)
        : template.start_date,
      start_time: template.start_time,
      due_date: template.due_date,
      due_time: template.due_time,
      department_id: template.department_id,
      location_id: template.location_id,
      recurrence_series_id: template.recurrence_series_id || template.id,
      parent_recurring_id: template.id,
      is_recurrence_template: false,
      follow_up_remarks: template.follow_up_remarks,
      next_action: template.next_action,
      tags: template.tags || [],
      created_by_profile_id: template.created_by_profile_id,
      updated_by_profile_id: template.created_by_profile_id,
    })
    .select('id')
    .single()

  if (insertError) throw insertError

  const { data: assignees } = await supabaseAdmin
    .from('task_assignees')
    .select('employee_id, assigned_by_profile_id')
    .eq('task_id', template.id)

  if (assignees?.length) {
    await supabaseAdmin.from('task_assignees').insert(
      assignees.map((a) => ({
        org_id: orgId,
        task_id: instance.id,
        employee_id: a.employee_id,
        assigned_by_profile_id: a.assigned_by_profile_id,
      })),
    )
  }

  try {
    await notifyTaskAssigned(orgId, {
      title: template.title,
      taskId: instance.id,
      visibilityType: template.visibility_type,
      assignment: {
        assigneeEmployeeIds: (assignees || []).map((row) => row.employee_id),
        departmentId: template.department_id,
        locationId: template.location_id,
      },
      excludeProfileId: template.created_by_profile_id,
    })
  } catch {
    // non-blocking
  }

  const tagIds = await loadTemplateTagIds(orgId, template.id)
  if (tagIds.length) {
    await supabaseAdmin.from('task_tag_assignments').insert(
      tagIds.map((tagId) => ({
        org_id: orgId,
        task_id: instance.id,
        tag_id: tagId,
      })),
    )
  }

  const { data: refs } = await supabaseAdmin
    .from('task_references')
    .select('*')
    .eq('task_id', template.id)

  if (refs?.length) {
    await supabaseAdmin.from('task_references').insert(
      refs.map((ref, index) => ({
        org_id: orgId,
        task_id: instance.id,
        reference_type: ref.reference_type,
        reference_entity_type: ref.reference_entity_type,
        reference_entity_id: ref.reference_entity_id,
        reference_label: ref.reference_label,
        reference_number: ref.reference_number,
        sort_order: index,
      })),
    )
  }

  return instance.id
}

export async function runTaskRecurrenceJob() {
  const now = new Date().toISOString()

  const { data: dueRecurrences, error } = await supabaseAdmin
    .from('task_recurrence')
    .select(`
      *,
      task:task_id (*)
    `)
    .lte('next_occurrence_at', now)
    .not('next_occurrence_at', 'is', null)
    .limit(100)

  if (error) throw error
  if (!dueRecurrences?.length) return { generated: 0 }

  let generated = 0

  for (const rec of dueRecurrences) {
    const template = rec.task
    if (!template?.is_recurrence_template) continue

    try {
      await cloneTemplateInstance(template, rec)
      generated += 1

      const nextAt = computeNextOccurrence({
        ...rec,
        next_occurrence_at: rec.next_occurrence_at,
      })

      await supabaseAdmin
        .from('task_recurrence')
        .update({
          last_generated_at: now,
          next_occurrence_at: nextAt,
          updated_at: now,
        })
        .eq('id', rec.id)
    } catch (err) {
      console.error('[taskRecurrenceJob] failed for template', template?.id, err)
    }
  }

  return { generated }
}
