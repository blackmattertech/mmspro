# Roles & Access

MMSPro has two role systems. Do not confuse them.

## Account roles (`profiles.role`)

| Value | Meaning |
|-------|---------|
| `super_admin` | Platform `/admin` panel |
| `admin` | Company admin — full org access (bypasses the access-role matrix) |
| `user` | Standard user — permissions come only from an assigned **access role** |

## Access roles (`org_access_roles`)

Custom roles with a module permission matrix (`create` / `read` / `update` / `delete`). Assigned to employees via `org_employees.access_role_id`.

Roles are **org-wide**. Employees are still limited to their own `location_id` for list/create where applicable.

### Who can see which roles

| Actor | Roles visible on Roles & Access |
|-------|----------------------------------|
| Company admin / super_admin | All roles in the org |
| Everyone else | Only roles they **created** (`created_by`) |

Roles with no `created_by` (e.g. seeded Location Head, or roles created before this tracking) are treated as admin-owned and are hidden from non-admins.

Apply patch `33-access-roles-created-by.sql` so new roles store the creator.

### Modules (grouped)

- **Dashboard** — Overview
- **Work Orders** — Received, Assigned, Scheduled, Manual
- **Calendar**
- **Reports** — Daily Logs, Plant Wise, Open Logs, Completed Logs, Overdue
- **Company** — Company profile, Locations, Departments, Designations, Employees
- **Masters** — Assets
- **Configuration** — Roles & Access, Settings

Legacy keys `work_orders` and `reports` still work and expand to their children.

### Default deny

A `user` with no access role (or all permissions unchecked) cannot see modules in the nav, open those routes, or call the related APIs (403).

Company admins always have full access.

## Session API

`GET /api/roles/me` returns:

```json
{
  "is_org_admin": false,
  "location_id": "...",
  "employee_id": "...",
  "access_role": { "id": "...", "name": "Location Head" },
  "permissions": [ { "module_key": "work_orders", "can_create": true, "can_read": true, ... } ]
}
```

The client loads this via `usePermissions()` and uses it for nav, route guards, and action buttons. The **server** still enforces every mutating and read API.

## Manual QA checklist

- [ ] Admin: sees all nav; can manage company/employees/assets/roles
- [ ] User, no access role: empty/minimal nav; APIs return 403 for modules
- [ ] User, `work_orders.read` only: can open WO lists; no Create button; POST `/manual` → 403
- [ ] User, `employees.create`: can add employees at own location only; cannot edit company profile without `company.update`
- [ ] User at Location A: employee list only shows Location A
- [ ] Roles & Access: update-only user can open Update Role editor
- [ ] Non-admin: Roles & Access list shows only roles they created; admin-created roles hidden
- [ ] Admin: sees all roles including seeded Location Head
- [ ] Location Head: Create Role button visible; can create roles; cannot see admin-created roles
- [ ] Seed patch `31-seed-location-head-role.sql` creates Location Head template when applied
- [ ] Patch `33-access-roles-created-by.sql` applied before relying on creator filtering
- [ ] Patch `34-location-head-roles-access.sql` grants Location Head roles_access CRUD
