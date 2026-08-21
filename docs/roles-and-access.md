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
| Location Head (and anyone with `roles_access` read) | All roles in the org |

Location heads can **assign** any of those roles when creating or editing an employee. They can still only **edit / delete** roles they created. Seeded or admin-created roles are view-only for them, except they **can assign people** to roles that include work request or work order **approval**.

Department Heads (seeded role, and any role named “Department Head”) have approval access by default. On Roles & Access they can assign **their team** (same department or direct reports) to approval roles. Location Heads can do the same for employees at their location.

Apply patch `33-access-roles-created-by.sql` so new roles store the creator. Apply `67-department-head-approval.sql` to seed the Department Head role.

### Modules (grouped)

- **Dashboard** — Overview
- **Work Orders** — Received, Assigned, Scheduled, Manual
- **Calendar**
- **Reports** — Daily Logs, Plant Wise, Open Logs, Completed Logs, Overdue
- **Company** — Company profile, Locations, Departments, Work Center, Employees
- **Masters** — Assets, Areas, Equipment
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
- [ ] Non-admin with Roles & Access: list shows all org roles (including admin-created)
- [ ] Admin: sees all roles including seeded Location Head
- [ ] Location Head: Create Role button visible; can create roles; can view admin-created roles; cannot edit/delete them
- [ ] Location Head: can assign any org role when creating an employee
- [ ] Seed patch `31-seed-location-head-role.sql` creates Location Head template when applied
- [ ] Patch `33-access-roles-created-by.sql` applied before relying on creator filtering
- [ ] Patch `34-location-head-roles-access.sql` grants Location Head roles_access CRUD
- [ ] Patch `67-department-head-approval.sql` seeds Department Head with approve + Roles & Access
- [ ] Department Head: can approve incoming work requests / work orders
- [ ] Department Head: Roles & Access shows Assign on approval roles; only their team is listed
- [ ] Location Head: can Assign people at their location to approval roles they did not create
- [ ] Assigning at one location/department does not remove assignees elsewhere
