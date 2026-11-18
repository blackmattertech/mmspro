/** Map parent rows onto departments by parent_id (avoids broken PostgREST self-join embeds). */
export function mapDepartmentsWithParents(departments, parents = []) {
  const list = (Array.isArray(departments) ? departments : [departments]).filter(Boolean)
  if (!list.length) return departments

  const byId = new Map((parents || []).filter(Boolean).map((row) => [row.id, row]))
  const enriched = list.map((dept) => ({
    ...dept,
    parent: dept.parent_id ? (byId.get(dept.parent_id) || null) : null,
  }))
  return Array.isArray(departments) ? enriched : enriched[0]
}
