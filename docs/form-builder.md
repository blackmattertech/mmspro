# Form Builder — Configuration & Customization

Super Admin can customize the create/edit layout for Work Request, Work Order processes, PM Plan, and Warranty **per organization**. Layouts are stored in the database; if no layout is saved for a form, the app uses the live default UI (no empty form). Work Order process forms (WR→WO, PM→WO, User Self) fall back to the registry template so assignment and technician fields appear without a saved layout.

---

## Who uses it

| Role | What they do |
|------|----------------|
| **Super Admin** | Opens an org → **Configure** → **Form Builder** tab. Designs sections, fields, widths, options, and rules. Saves per form. |
| **Org users** | See the saved layout on create screens (WR / WO / PM / Warranty). Values still save to native columns and/or catalog extras. |

Entry points:

- Admin → Organizations → org row → **Configure** → **Form Builder**
- Palette lists forms grouped by module (Work Request, Work Orders, PM Schedule, Warranty Manager)

---

## Supported forms

| Form ID | Label | Module permission key |
|---------|-------|------------------------|
| `work_request.create` | Work request | `work_request_create` |
| `work_orders.from_work_request` | Work Request to Work Order | `work_orders_received` |
| `work_orders.from_pm` | PM Schedule to Work Order | `work_orders_scheduled` |
| `work_orders.manual` | Manual work order | `work_orders_manual` |
| `work_orders.user_self` | User Self Request | `work_orders_received` |
| `pm.plan` | PM plan | `work_orders_scheduled` |
| `warranty.warranty` | Warranty | `warranty_manager` |

Registry source of truth (keep client/server in sync):

- `client/src/lib/formRegistry.js`
- `server/lib/formRegistry.js`

---

## Core idea: null layout = live default

- **No row** in `org_form_layouts` for `(org_id, form_id)` → company forms keep their current hardcoded / catalog behavior.
- **Saved layout** → runtime uses `OrderedFormLayout` (and related helpers) to render sections/fields in saved order and width.
- Clearing / resetting a layout removes the custom JSON so the default returns.

Database:

- Patch: `supabase-patches/80-org-form-layouts.sql`
- Tables: `org_form_layouts`, `org_form_field_values`

---

## Layout model

A layout is JSON roughly shaped like:

```json
{
  "v": 1,
  "sections": [
    { "id": "system:wr_request", "order": 0, "label": "Request information", "filledBy": "creator" },
    { "id": "custom:<uuid>", "order": 1, "label": "Extra section", "filledBy": "order_to_dept_head" }
  ],
  "fields": [
    {
      "id": "field:<uuid>",
      "sectionId": "system:wr_request",
      "order": 0,
      "colSpan": 33,
      "required": true,
      "label": "Request Type",
      "fieldType": "dropdown",
      "masterSource": "",
      "bindKey": "request_type",
      "options": [
        {
          "label": "Intra Department",
          "value": "Intra Department",
          "rules": [
            {
              "targetFieldId": "field:<order-to-uuid>",
              "action": "copyFrom",
              "sourceFieldId": "field:<order-from-uuid>"
            }
          ]
        }
      ]
    }
  ],
  "groups": [
    {
      "id": "group:<uuid>",
      "sectionId": "custom:<uuid>",
      "order": 0,
      "colSpan": 100,
      "label": "Permits",
      "minRows": 0,
      "maxRows": 20,
      "childFields": [
        {
          "id": "field:<type-uuid>",
          "order": 0,
          "colSpan": 33,
          "label": "Permit type",
          "fieldType": "dropdown",
          "required": true,
          "options": [
            { "label": "Hot Work", "value": "hot_work" },
            { "label": "LOTO", "value": "loto" }
          ]
        }
      ]
    }
  ]
}
```

Compatibility:

- Missing `filledBy` on a section means **Anyone** (`any`) — same editability as before.
- Missing `groups` means `[]` — existing flat layouts keep working.
- Layout version stays `v: 1` (additive only).

### Field widths

Allowed `colSpan` values (12-column grid percentage labels): **25%**, **33%**, **75%**, **100%**.

In the canvas: click the width control or drag the resize handle on a field card.

### Sections

- Built-in sections come from the form registry (`system:…`).
- Super Admin can add custom sections (`custom:<uuid>`), rename labels, reorder, and remove empty custom sections.
- Fields belong to a `sectionId`.
- Optional **Filled by** (`filledBy`): `any` | `creator` | `order_to_dept_head` | `technician` | `supervisor`. Only that actor (or org admin) can edit the section; others see it read-only with a badge.
- Optional **Stage** (`stage`): `create` | `assignment` | `execution` | `closeout`. Work Order hosts only show matching stages (Approve & Assign uses `assignment`; technician lifecycle uses `execution` / `closeout`). Missing stage means the section is visible whenever that host is shown.

Work Order forms are **process forms** (assignment → technician complete), not a second Work Request create screen. The Work Request layout stays the requester document and is shown read-only on converted work orders. Reuse a Work Request section onto a Work Order form if those fields must also be editable after conversion.

### Company Skip (Masters → Forms)

Companies do **not** edit Super Admin layouts. On **Company → Masters → Forms** they can skip optional fields:

- Super Admin **Required** (and registry **locked**, e.g. Work start / end) stay on the form and cannot be skipped.
- Skipping a parent field also skips dependents that only appear when that parent is filled. A field cannot be skipped if a required field depends on it.
- **Supervisor verification** (`wo_closeout`) stays on the work order. Only its non-required fields can be skipped.
- Work Order process forms also have **Skip technician acceptance**. When on, assigning a technician sets status to `accepted` (no Accept click). Old `assigned` rows can move to Started.

Overlay table: `org_form_skips`. Runtime applies it after company dropdown overlays in `loadRuntimeFormLayout`.

### Blocks (compound fields)

Compound **Blocks** (Permit details, Daily logs, Work start / end, Breakdown times, Material consumed, and the rest for that form) live in the left **Blocks** list, not as their own sections.

To put Permit details under Work execution:

1. Click **Work execution** on the canvas so it is selected.
2. In **Blocks**, click **Permit details**. It is added to that section.
3. Or drag the Permit details card from another section onto Work execution (the target section highlights).
4. **Remove** the leftover empty Permit details section if it is unused.

If no section is selected, the palette asks you to select one first. **This form** still adds whole sections (Assignment, Daily logs, …). Nested fields under those sections go to the selected canvas section when one is selected.

Runtime binds by field key (`permit_details`, `daily_logs`, …), so the host section’s **Filled by** and **Stage** apply.

Company users manage dropdown lists for those forms under **Company → Masters → Forms Master**. Work Order → **Work Request to Work Order** lists the same kind of configurable dropdowns as Work Request (Priority, Work Center, Permit types, and any Super Admin dropdowns on that layout).

### Repeatable groups

- Super Admin adds a **repeatable group** under a section (e.g. label `Permits`).
- `childFields` define the **template** for each row (dropdown, text, date, etc.).
- Runtime shows N instances and an **Add {label}** button (e.g. Add Permits).
- Values store as one `org_form_field_values` row per group id whose `value_json` is an **array of objects** keyed by child field ids.
- Child fields cannot use `bindKey` (extras only). Option rules / depends-on are **within-row** only.

---

## Field identity prefixes

| Prefix | Meaning |
|--------|---------|
| `system:` | Built-in field from the form registry (e.g. `system:request_type`). Rendered by the page’s `renderField` when present. |
| `catalog:` | Org catalog / asset-style field (UUID from catalog tables). |
| `master:` | Palette master drop (e.g. `master:departments`) — usually converted to a custom mapped field when edited. |
| `custom:` | Custom **section** id. |
| `field:` | Custom **field** id (named picker / hardcoded dropdown / mapped master). |
| `group:` | Repeatable **group** id (template + runtime instances). |

Helpers: `client/src/lib/formLayoutIds.js` (mirrored on server).

---

## Field types you can add

### 1. System fields (Blocks + THIS FORM palette)

**Blocks** lists compound registry fields. Select a section, then click a Block to place it there, or drag an existing Block onto another section.

**This form** adds whole built-in sections. Expand a section to add leftover non-block fields. These keep their `system:` id and are rendered by the host page.

### 2. Catalog fields

When the form allows catalog (`catalogMode: 'all'` or `'equipment'`), parent catalog fields appear in the palette and can be placed on the layout. Values persist in `org_form_field_values` (and related APIs).

### 3. Masters (Department, Location, Equipment, …)

Palette **Masters** list:

- Location, Department, Employee, Employees (multi), Work Center, Area, Equipment, Vendor, Checklist, Activity type, Status

Dropping a master creates a picker field. Prefer **named custom fields** mapped to a master (see below) so you can have two Department fields (Order From / Order To).

### 4. Custom fields (Add field)

In a section → **+ Field**:

| Setting | Purpose |
|---------|---------|
| **Field name** | Label shown to users |
| **Type** | text, textarea, number, date, dropdown, radio, checkbox, … |
| **Map to master** | `None (hardcoded options)` **or** a master (Department, …) |
| **Filter options by field** | When mapped: limit picker rows to the selected parent master (e.g. Area by Order To Department) |
| **Options & rules** | Only when not mapped to a master and type supports options |
| **Depends on parent** | Simple show-when (legacy); prefer option rules for show/hide/copy/exclude |
| **Also save as** | `bindKey` — maps the value onto a native form column / key the page understands |

#### Hardcoded dropdown

- **Label** = what users see  
- **Value** = what is stored / matched for rules and “Also save as”  
- Per option: **Rules** (see Option rules below)

#### Mapped to master

- Renders `MasterPicker` for that source (live org data).
- No hardcoded options list; use rules on a *different* hardcoded parent (e.g. Request Type) to control this field.
- Use **Filter options by field** for cascades (Area → Department, Equipment → Area). This is not the same as **Depends on parent** (show/hide).

#### Master cascades (Filter options by field)

Supported links (child filtered by parent):

| Child master | Can filter by |
|--------------|---------------|
| Department | Location |
| Area | Department, Location |
| Equipment | Area, Department, Location |
| Employee / Employees | Department, Location |

**Example — Area only for Order To department, then Equipment for that Area:**

1. Ensure **Order To** exists (Map to master: **Department**).
2. **Add field** → name `Area` → Map to master: **Area** → **Filter options by field**: Order To → Also save as: `area_id` (if needed) → Add field.
3. **Add field** → name `Equipment` → Map to master: **Equipment** → **Filter options by field**: Area → Also save as: `equipment_id` → Add field.
4. Save the form.

At runtime, Area lists only areas for the selected Order To department; Equipment lists only equipment in the selected area. Changing the parent clears the child selection.

When **Equipment** is mapped to the equipment master, active **Equipment Fields** (from Configure → Equipment) are auto-added to the same section (Type, Name, Tag, Capacity, etc.). Area / duplicate Equipment labels are skipped. Selecting equipment fills those fields from the equipment record (read-only) and can reverse-fill Area from the equipment’s area.

#### Also save as (`bindKey`)

Examples for Work Request:

- `request_type`
- `order_from_department_id`
- `order_to_department_id`
- `equipment_id`

The create page reads bind keys so API payloads stay correct even when labels/ids are custom.

---

## Option rules

Option rules live on **hardcoded dropdown / radio options**. When the user selects that option, the rule runs against another field on the same form.

Rules work on **any** Form Builder form (Work Request, Manual WO, PM, Warranty) — not WR-only.

Implementation: `client/src/lib/formOptionRules.js` and `server/lib/formOptionRules.js` (keep in sync). Runtime: `OrderedFormLayout`.

### Where to configure

1. Open Form Builder for the org and form.
2. Edit the **parent** field (e.g. Request Type) — Type = Dropdown, Map to master = **None**.
3. Under each option → **Rules for this option** → **+ Add rule**.
4. Choose **Target field**, **Action**, and (if needed) **Source field**.
5. Save the field, then **Save** the layout.

Rules on an option apply only while that option is selected (match by stored **value** or label, case-insensitive).

### Actions

| Action | UI label | Needs source? | Runtime effect |
|--------|----------|---------------|----------------|
| `show` | Show | No | Target field is visible. |
| `hide` | Hide | No | Target field is hidden (skipped where hidden fields are ignored). |
| `copyFrom` | Copy from… | Yes | Target is **visible**, **locked**, and its value is set to the source field’s current value. Updates when the source changes. |
| `excludeFrom` | Exclude source from list… | Yes | Target is **visible**. The source field’s current value is removed from the target’s option list (master pickers and hardcoded lists). If the target currently equals the excluded value, it is cleared. |

### One rule per target

Active rules are collected into a map keyed by `targetFieldId`. If multiple rules target the same field, the **last** winning rule for that target in layout field order applies.

Prefer one clear rule per target per option (e.g. Intra → one `copyFrom` on Order To; Inter → one `excludeFrom` on Order To).

### Interaction with “Depends on parent”

If an option rule is active for a field, that rule decides visibility (`hide` vs everything else). Simple **Depends on parent field** is used only when no option rule targets that field.

### Rule JSON shape

```json
{
  "targetFieldId": "field:…",
  "action": "copyFrom",
  "sourceFieldId": "field:…"
}
```

- `show` / `hide` — only `targetFieldId` + `action`
- `copyFrom` / `excludeFrom` — also require `sourceFieldId`

Sanitization drops incomplete rules (empty target, or missing source when required). Fill all selects before saving.

Tip: store stable option **values** (e.g. `intra_department`) even if the **label** is “Intra Department”, so bind keys / API codes stay stable if labels change.

### Visibility & lock helpers

| Helper | Behavior |
|--------|----------|
| `isFieldHiddenByRules` | `true` only for `hide` |
| `isFieldLockedByRules` | `true` for `copyFrom` |
| `excludedValuesForField` | IDs/values to omit for `excludeFrom` |
| `copyFromPatches` | Writes target ← source |
| `excludeFromClearPatches` | Clears target when it equals excluded source |

`MasterPicker` accepts `excludeIds`; `OrderedFormLayout` passes them for `excludeFrom` rules.

### Form Builder UI notes

- Edit-field dialog is wide so Label / Value / rules fit on one screen.
- **+ Add option** / **+ Add rule** keep empty drafts while editing; empty labels and incomplete rules are stripped only when normalizing on **save**.

---

## Runtime behavior

1. Client loads layout: `GET` org form-layout API (admin) or company form-layout API.
2. If layout exists → `OrderedFormLayout` renders sections/fields.
3. Option rules are evaluated from current values (`collectActiveRules`).
4. Effects applied (`hide` / `show` / `copyFrom` / `excludeFrom` as above).
5. Catalog extras and bindKey values are merged into create/update payloads.

Key files:

| Area | Path |
|------|------|
| Canvas / editor | `client/src/components/admin/FormBuilderCanvas.jsx` |
| Styles | `client/src/components/admin/FormBuilderPanel.css` |
| Runtime layout | `client/src/components/forms/OrderedFormLayout.jsx` |
| Master pickers | `client/src/components/forms/MasterPicker.jsx` |
| Option rules | `client/src/lib/formOptionRules.js` |
| Masters / bind helpers | `client/src/lib/formFieldSources.js` |
| Sanitize / persist | `server/lib/orgFormLayouts.js` |
| Admin routes | `server/routes/admin/orgFormLayouts.js` |
| Company routes | `server/routes/api/formLayouts.js` |
| Company Skip overlay | `server/lib/formSkips.js`, `client/src/pages/app/FormMasters.jsx` |

---

## Saving & validation

On save, the server:

- Validates form id, section/field ids, widths (`25|33|75|100`)
- Normalizes options to `{ label, value, rules[] }`
- Ensures rule `targetFieldId` / `sourceFieldId` exist on the layout
- Rejects self-targeting rules
- For `copyFrom` / `excludeFrom`, source field must exist on the layout

Incomplete rules (missing target/source) are dropped on normalize — fill every rule dropdown before saving the field.

---

## Permissions & modules

- Form Builder is Super Admin only (admin org configure).
- Org module disable (`org_disabled_modules` / patch 79) can hide whole modules from the company app; Form Builder still lists registry forms for configuration.
- Role permissions still gate who can open WR/WO/PM/Warranty screens.

---

## Recipe: Work Request Order From / Request Type / Order To

### Goal

| Request Type | Order To behavior |
|--------------|-------------------|
| **Intra Department** | Show Order To = same department as Order From (locked) |
| **Inter Department** | Show Order To; **exclude** Order From’s department from the list |
| **User Self Request** | Often same as Intra (copy), or hide Order To |

### Layout fields

In **Request information**, place three fields at **33%** width:

1. **Order From** — Map to master: **Department**; Also save as: `order_from_department_id`; Required: yes  
2. **Request Type** — Map to master: **None**; Type: Dropdown; Also save as: `request_type`  
3. **Order To** — Map to master: **Department**; Also save as: `order_to_department_id`; Required: yes  

Example Request Type options:

| Label | Value (example) |
|-------|-----------------|
| Inter Department | `Inter Department` or `inter_department` |
| Intra Department | `Intra Department` or `intra_department` |
| User Self Request | `User Self Request` or `user_self` |

Put Intra/Inter logic on **Request Type options**, not only on “Child of Request Type”.

### Rules on Request Type

**Intra Department** → **+ Add rule**

| Target | Action | Source |
|--------|--------|--------|
| Order To | **Copy from…** | Order From |

**Inter Department** → **+ Add rule**

| Target | Action | Source |
|--------|--------|--------|
| Order To | **Exclude source from list…** | Order From |

Optional for User Self: Copy from Order From, or Hide Order To.

### Save order

1. Save field (Request Type)  
2. Save layout on the Form Builder toolbar  
3. Hard-refresh the company Work Request create page  

### Expected runtime

- Intra + Order From = Automation/Robotics → Order To shows Automation/Robotics and cannot be changed.  
- Inter + Order From = Automation/Robotics → Order To lists other departments only.  
- Changing Order From while Intra stays selected updates Order To automatically.

### Area / Equipment cascade (same form)

After Order To exists:

1. **Area** — Map to master: **Area**; **Filter options by field**: Order To; Also save as: `area_id`  
2. **Equipment** — Map to master: **Equipment**; **Filter options by field**: Area; Also save as: `equipment_id`  

Equipment catalog fields from Configure → Equipment are auto-added to the Asset section and fill from the selected equipment. Save the form in Form Builder (or open WR create — runtime also injects them).

Users then only see areas for the Order To department, and equipment for the selected area.

---

## Other recipes

### Show a field only for one option

On parent option **A**: Target = Extra field, Action = **Show**.  
On other options: Action = **Hide**, or rely on Depends-on when no rule is active.

### Two Department pickers without WR bind keys

Same as the WR recipe but leave **Also save as** empty if the form only stores catalog extras. Values are keyed by layout field id. For WR routing and equipment catalog by Order To, bind keys are required.

### PM / Warranty / Manual WO

Same mechanics: hardcoded dropdown with options + rules; target any layout field (master, catalog, or custom). Native columns for bind suggestions differ by form (`FORM_NATIVE_COLUMNS` in `formFieldSources.js`).

---

## Practical tips

1. **Empty until save** — design freely; company UI only changes after a successful save.
2. **Two Department fields** — add two custom fields, both Map to master = Department, different names and bind keys (`order_from_department_id` / `order_to_department_id`).
3. **Request Type** — hardcoded dropdown with Label/Value; put Intra/Inter rules on those options (not on Order To).
4. **Child / Depends on** — still available for simple show-when; for Intra copy + Inter exclude, use **option rules**.
5. **Widths** — use 33% for three-up rows (Order From / Request Type / Order To).

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Order To missing on Intra | Rule must be **Copy from…** (not Hide). Re-save layout after upgrading. |
| Add rule / Add option does nothing | Draft options are kept in the editor; hard-refresh admin UI. Incomplete rules still disappear if you save without Target/Source. |
| Exclude does nothing | Confirm Inter rule action is **Exclude source from list…** and Source = Order From. Order From must have a value. |
| Inter still allows same department | Exclude rule missing or Order To not a master Department picker. Submit validation still blocks same from/to for classic `inter_department` when that request type string is used. |
| Values not in API payload | Set **Also save as** bind keys on Order From / Order To / Request Type. |
