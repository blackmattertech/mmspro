/**
 * Pure helpers for resolving who receives a notification.
 * Kept free of Supabase / Firebase imports so they can be unit tested.
 */

function unique(values) {
  return [...new Set((values || []).filter(Boolean))]
}

/**
 * Profile ids for every employee row that can sign in, minus the skipped employees.
 * Rows come from `org_employees` (`id`, `profile_id`).
 */
export function departmentProfileIds(rows, { excludeEmployeeIds = [] } = {}) {
  const skip = new Set(unique(excludeEmployeeIds))
  return unique(
    (rows || [])
      .filter((row) => row?.profile_id && !skip.has(row.id))
      .map((row) => row.profile_id),
  )
}

/**
 * Union of several recipient lists. Each user appears once, so someone who is
 * both in the department and an inbox approver receives a single notification.
 */
export function mergeRecipientIds(lists, { excludeUserIds = [] } = {}) {
  const merged = new Set()
  for (const list of lists || []) {
    for (const id of list || []) {
      if (id) merged.add(id)
    }
  }
  for (const id of excludeUserIds || []) merged.delete(id)
  return [...merged]
}
