# Designation and Department Head (archived)

**Removed:** 2026-07-16  
**Reason:** Replaced by Access Roles (`org_access_roles` / Configuration → Roles & Access).  
**Status:** Application code and live DB objects removed. Historical SQL patches and this doc remain so the features can be rebuilt.

> **Do not confuse with Location Head** (`org_locations.head_employee_id`, seed role “Location Head”). That feature stays.

---

## 1. What each feature did

### Designation
Org-level job-title master with optional hierarchy ranking and optional mapping to departments. Assigned to employees via `org_employees.designation_id`. Display-only for work-order assignee cards. Did **not** control permissions or who could be a department head.

### Department Head
Leadership assignment on a **department**, not a boolean column on the employee.

| Mode | Storage |
|------|---------|
| Single head | `departments.head_employee_id` |
| Per-location heads (all-locations depts) | `departments.per_location_heads = true` + rows in `department_location_heads` |

Effects when active:

- Employee API returned derived `headed_departments`.
- Employee form exposed toggle `is_department_head` (API-only flag; server wrote the tables above).
- Work orders: heads saw headed-dept WOs in the received pool and got `can_reassign_as_department_head` (could assign people within locked location/department; could **not** change location/department — Location Heads could).

---

## 2. Database schema (restore from these patches)

Apply (or re-apply) in order if rebuilding from an empty DB that never had them:

| Patch | What it adds |
|-------|----------------|
| `supabase-patches/08-designations.sql` | Table `designations` + RLS |
| `supabase-patches/09-designation-departments.sql` | `designations.all_departments`, table `designation_departments` |
| `supabase-patches/10-org-employees.sql` | Includes `org_employees.designation_id` FK (if creating employees table fresh) |
| `supabase-patches/13-managers-department-heads-codes.sql` | `departments.head_employee_id` (+ also manager/code — keep those if already present) |
| `supabase-patches/14-department-location-heads.sql` | `departments.per_location_heads`, table `department_location_heads` |
| `supabase-patches/27-performance-indexes.sql` | `idx_org_employees_org_designation_name`, dept-location-heads indexes |
| `supabase-patches/29-account-roles.sql` | Rewrote RLS to `current_user_is_org_manager()` |
| `supabase-patches/31-seed-location-head-role.sql` | Seeded Location Head role with `designations` read |
| `supabase-patches/32-expand-access-module-keys.sql` | Copied `company` perms → `designations` |

### Tables

#### `designations`
```text
id, org_id, name, description, hierarchy (unique per org), all_departments (bool, default true),
is_active, created_at, updated_at
unique (org_id, name), unique (org_id, hierarchy)
```

#### `designation_departments`
```text
designation_id → designations CASCADE
department_id → departments CASCADE
PK (designation_id, department_id)
```

#### `org_employees.designation_id`
```text
uuid FK → designations(id) ON DELETE SET NULL
```

#### `departments` head columns
```text
head_employee_id uuid FK → org_employees ON DELETE SET NULL
per_location_heads boolean NOT NULL DEFAULT false
```

#### `department_location_heads`
```text
id, org_id, department_id, location_id, head_employee_id, created_at, updated_at
unique (department_id, location_id)
```

### Drop patch (already applied / to apply on existing DBs)

`supabase-patches/39-drop-designations-department-heads.sql` removes the objects above and cleans `org_access_role_permissions` rows with `module_key = 'designations'`. It does **not** touch Location Head or `manager_id`.

---

## 3. API surface (to reimplement)

Base: `/api/company` (see historical `server/routes/api/company.js` in git before removal).

### Designations
| Method | Path | Notes |
|--------|------|-------|
| GET | `/designations` | Optional `?department_id=` filter |
| POST | `/designations` | Create; sync department links |
| PUT | `/designations/reorder` | Body: ordered id list (all designations) |
| PATCH | `/designations/:id` | Update fields / hierarchy / depts |
| DELETE | `/designations/:id` | Soft-delete (`is_active=false`) + hierarchy compact |

Module permissions: `designations` create/read/update/delete.

Payload concepts: `name`, `description`, `hierarchy`, `all_departments`, `department_ids[]`, `is_active`.

### Departments (head fields)
On create/update accepted: `head_employee_id`, `per_location_heads`, `location_heads: [{ location_id, head_employee_id }]`.  
Validation: head employee must belong to org; location-scoped dept → head’s `location_id` must match; all-locations → head must have some location.

### Employees
- Field: `designation_id`
- Flag: `is_department_head` (not a DB column) → `syncEmployeeDepartmentHead()` cleared other headships for that employee then set primary or per-location row
- Response joins: `designations (id, name)`, `headed_departments` (from `departments!head_employee_id` + `department_location_heads`)

### Work orders (`server/routes/api/workOrders.js`)
- `listHeadedDepartmentIds(orgId, employeeId)`
- `isDepartmentHeadFor(orgId, employee, departmentId, locationId)`
- Assignment actions: `can_reassign_as_department_head`
- Received pool included WOs for headed departments even when employee’s own `department_id` differed
- DH reassign: assignees only; location/department locked

### Profile
`GET` profile employee select included `designations` and `headed_departments`.

### OpenAPI
Historical schemas: `Designation`, `DesignationCreate`, `DesignationReorder`; employee `designation_id` / `is_department_head`; department `per_location_heads` / location heads. Lived in `server/openapi/paths/company.yaml` and `components/schemas.yaml`.

---

## 4. Client files (restore from git)

Deleted or heavily stripped on 2026-07-16. Recover with:

```bash
git log --all --full-history -- '**/DesignationsTab.jsx' '**/DesignationModal.jsx' '**/useDesignations.js' '**/DepartmentHeadCell.jsx'
# then checkout the commit before removal, e.g.:
git show <commit>:client/src/components/company/DesignationsTab.jsx
```

### Designation-specific (deleted)
| Path | Role |
|------|------|
| `client/src/components/company/DesignationsTab.jsx` | Company tab: list, drag reorder, hierarchy, activate/delete |
| `client/src/components/company/DesignationModal.jsx` | Create/edit; all-depts vs selected depts |
| `client/src/hooks/useDesignations.js` | CRUD/reorder hook |
| `client/src/lib/api.js` | `getDesignations`, `create/update/reorder/deleteDesignation` |

### Department Head–specific (deleted / stripped)
| Path | Role |
|------|------|
| `client/src/components/company/DepartmentHeadCell.jsx` | Departments table cell |
| `DepartmentsTab.jsx` | “Department Head” column |
| `DepartmentModal.jsx` | Single vs per-location head pickers |
| `EmployeeModal.jsx` | Designation field + DH toggle |
| `EmployeesTab.jsx` | Designation column, DH badge, nested create designation |
| `client/src/lib/departmentLocation.js` | `employeesForDepartmentHead`, `buildLocationHeadsPayload`, `locationHeadsMapFromDepartment`, `HEAD_MODE_*` |
| `client/src/lib/employeeRoles.js` | `isDeptHeadEmployee` |
| WO assignment card/actions | Designation row; `can_reassign_as_department_head` UI |
| `ProfileModal.jsx` | Designation + “Department Head of …” |

### Wiring
- `Company.jsx` tab `{ id: 'designations', moduleKey: 'designations' }`
- `App.jsx` `companyPageModules` included `'designations'`
- `navigation.js` Company `altModuleKeys` included designations
- `client/src/lib/accessModules.js` + `server/lib/accessModules.js` module `{ key: 'designations', ... }` and company alias expansion

CSS: `.designation-hierarchy*`, `.company-badge--dept-head`, `.company-table__cell--dept-head` in `CompanyShared.css`.

---

## 5. Business rules (checklist for rebuild)

### Designation
1. Unique `name` and unique `hierarchy` per org.
2. Reorder API must include **all** designation IDs for the org.
3. Soft delete → set `is_active=false`, then renumber hierarchy.
4. `all_departments=true` means no required junction rows; otherwise sync `designation_departments`.
5. Employee UI filtered designations by selected department when not all-departments.

### Department Head
1. No `is_department_head` column — API flag only.
2. Setting head via employee toggle cleared that employee’s other dept headships first.
3. Department modal could set head(s) independently.
4. Per-location mode only meaningful when `all_locations=true`.
5. Work-order DH powers are separate from Access Role matrix (were derived from head tables).

### Independence
Designation did not gate Department Head eligibility. Both are independent of Access Roles; going forward, prefer modeling authority **only** via roles.

---

## 6. Suggested restore procedure

1. Revert or cherry-pick application commits that removed the features (or copy files listed above from git history).
2. Re-add `designations` to server/client `accessModules.js` and Company nav/tabs.
3. On the database:
   - If drop patch `39` was applied: re-run patches `08`, `09`, add `designation_id` to `org_employees` if missing, re-add `head_employee_id` / `per_location_heads` / `department_location_heads` from `13`/`14` (adapt to current schema — do not blindly re-run whole of `13` if `manager_id`/code already exist).
   - If building a brand-new DB from patches: keep `08`–`14` in the apply order and **skip** `39`.
4. Restore OpenAPI designation/dept-head schemas and regenerate `spec.bundle.json` if your pipeline requires it.
5. Re-test: designation CRUD + employee assignment; department single/per-location heads; WO received pool + DH reassign; profile badges.

---

## 7. Replacement (current product direction)

Use **Configuration → Roles & Access**:

- Create roles that grant the module permissions previously implied by “being a designation” or “being a department head.”
- Assign via `org_employees.access_role_id` on the employee form.
- Location Head remains a separate seeded access role + `org_locations.head_employee_id` for location-scoped WO powers.
