# MMS Pro — Work Log (4 July 2026)

This document summarizes everything built and fixed in today’s session, in plain language.

---

## Work Orders — Page layout & filters

### What changed
- The work orders header is now **one clean row**: tabs, location filter, search, advanced filters, and **+ Add Work Order**.
- The quick filter is labeled **Location** (not “Plant”), with **All Locations** as the default.
- **Active tabs** use a **red pill** style (same red as primary buttons), with white text and count badge.
- **Advanced filters** let you build rules like:
  - **Where** → field → operator → value  
  - **And / Or** for multiple rules  
  - Fields: Location, Status, Summary, Assignee, Created by, WO #  
  - A red badge shows how many filters are active.
- Each list tab shows a count like **“3 work orders”** under the toolbar.
- Switching tabs is **smooth** — the tab bar stays mounted and only the list content changes (no flash where all tabs highlight at once).
- Toolbar controls (location, search, filters) are **aligned on one horizontal line**.

### Manual work orders — list vs create
- **`/work-orders/manual`** — list only (no form on this page).
- **`/work-orders/manual/create`** — create form only.
- **+ Add Work Order** on the Manual tab opens the create page.
- On the create page, the bar shows **Cancel**, **Save as Draft**, **Reset**, and **Create Work Order** (location/search/filters are hidden there).

### Key files
- `client/src/components/workorders/WorkOrdersLayout.jsx`
- `client/src/components/workorders/WorkOrdersRouteLayout.jsx`
- `client/src/components/workorders/WorkOrderAdvancedFilter.jsx`
- `client/src/lib/workOrderFilters.js`
- `client/src/components/workorders/WorkOrdersPage.css`

---

## Work Orders — Assignment (create form)

### What changed
- **Assignment** sits at the **bottom** of the create form.
- Flow: **Location → Department → Employees** (step-by-step).
- Employee cards show photo, name, designation, department, location, and **Dept. Head** tag when applicable.
- Cards are laid out in a grid: **3 per row** (sidebar expanded) or **4** (sidebar collapsed).

### Key files
- `client/src/components/workorders/WorkOrderAssignmentCard.jsx`
- `client/src/components/workorders/ManualWorkOrder.css`

---

## Work Orders — Conditional fields (dependencies)

### Problem
Fields like **Breakdown Image** were always visible, even when **Issue Type** was not set to **Breakdown**.

### Fix
- The work order form API now sends **`depends_on_parent_id`** and **`depends_on_option`** for each field.
- On the form:
  - Dependent fields **hide** until the parent dropdown matches the rule.
  - Changing the parent value **clears** hidden dependent field values.
- Example: **Breakdown Image** only appears when **Issue Type = Breakdown**.

### Setup in Assets
When creating/editing a **parent field** in **Masters → Assets**:
1. Turn on **Dependent field**.
2. Pick **Section** → **Parent** (dropdown) → **Child value** (e.g. Breakdown).

### Database patch (if not applied yet)
- `supabase-patches/24-asset-field-dependencies.sql`

### Key files
- `server/routes/api/workOrders.js` — form schema includes dependency fields
- `client/src/lib/assetFieldDependencies.js`
- `client/src/components/assets/FieldModal.jsx`

---

## Work Orders — Image upload UI

### What changed
- Image fields (e.g. **Breakdown Image**) use a **compact** layout instead of a full-width drop zone.
- Each uploaded image is a **96×96 square thumbnail** in the same row.
- **+ Upload / Add** is a matching square tile for adding more images.
- **Click a thumbnail** to view the image **full size** in a lightbox (Esc or click outside to close).
- **Remove (×)** appears on hover on each thumbnail.

### Key files
- `client/src/components/workorders/WorkOrderFieldInput.jsx`
- `client/src/components/workorders/ManualWorkOrder.css`

---

## Assets — Section icons

### What changed
When you create or edit an **asset section**, you can upload a **PNG or SVG** icon (max 2 MB).
- The icon appears beside the section title on **manual work order forms** and in the **form layout preview**.
- If no icon is uploaded, the default colored grid icon is used.

### How to use
1. Go to **Masters → Assets**.
2. Create or edit a **section**.
3. Use **Upload icon** and pick PNG or SVG.
4. Save.

### Database patch (if not applied yet)
- `supabase-patches/25-asset-section-icons.sql`  
  - Adds `icon_path` on `asset_fields`  
  - Allows SVG in the `org-assets` storage bucket  

### Key files
- `client/src/components/assets/SectionIconUpload.jsx`
- `client/src/components/assets/FieldModal.jsx`
- `client/src/components/workorders/SectionIcon.jsx`
- `client/src/lib/orgAssets.js`
- `server/routes/api/assets.js`

---

## Profile (My Profile)

### What changed
- Users can edit **name**, **phone**, and **photo** from My Profile.
- **Company details** (org fields) are **read-only** in a separate section.
- Profile loads/saves via a dedicated API so it works reliably (including for platform admins).
- Sidebar name and avatar prefer employee/profile data when available.

### Key files
- `server/routes/api/profile.js`
- `client/src/components/profile/ProfileModal.jsx`
- `client/src/hooks/useProfile.js`

---

## Admin — Organizations page

### What changed
- UI aligned with reference design: KPI cards, search, filters, pagination.
- Organization **logos** load from storage (signed URLs).
- **Enabled** uses **GooToggle**; redundant **Status** column removed.

### Key files
- `client/src/pages/admin/Organizations.jsx`
- `server/routes/admin/organizations.js`

---

## Server — Port fix (macOS)

### Problem
Server kept crashing with **`EADDRINUSE: port 5000`** because macOS **AirPlay Receiver** uses port 5000.

### Fix
- If `PORT=5000` in `server/.env`, the server **automatically starts on 5050** instead.
- The Vite dev proxy already targets **5050**.

### Recommended
Set in `server/.env`:
```env
PORT=5050
```

### Key file
- `server/index.js`

---

## Bug fixes today

| Issue | Fix |
|--------|-----|
| All work order tabs flash on click | Persistent route layout; single source of truth for active tab from URL |
| Toolbar misalignment | Location label inline with dropdown; consistent 40px control height |
| Assets page crash (`readFormDraft is not defined`) | Restored import in `AssetsFieldsPanel.jsx` |
| Dependent fields always visible | API form schema now includes dependency metadata |
| Server restart loop on port 5000 | Auto-fallback to 5050 on macOS |

---

## Routes reference

| URL | Purpose |
|-----|---------|
| `/:org/work-orders/received` | Received work orders |
| `/:org/work-orders/assigned` | Assigned work orders |
| `/:org/work-orders/scheduled` | Scheduled work orders |
| `/:org/work-orders/manual` | Manual work orders list |
| `/:org/work-orders/manual/create` | Create manual work order |

---

## Supabase patches to apply (in order)

If your database is not up to date, run these in the Supabase SQL Editor:

1. `24-asset-field-dependencies.sql` — conditional parent fields  
2. `25-asset-section-icons.sql` — section PNG/SVG icons  

See `supabase-patches/_patch-index.sql` for the full patch list and order.

---

## Quick test checklist

- [ ] Switch work order tabs — only one red pill active, no flash  
- [ ] Filter by location and advanced rules — counts update  
- [ ] Create manual WO — assignment at bottom, location → dept → employees  
- [ ] Set Issue Type to Breakdown — Breakdown Image appears; other values hide it  
- [ ] Upload image on WO form — square previews, click for full size  
- [ ] Edit asset section — upload PNG/SVG icon, see it on WO form  
- [ ] Server runs on **5050** without port conflicts  

---

*Generated from the 4 July 2026 development session.*
