# Planned Maintenance & Scheduled Work Orders

Aligned to CMMS **Chapter 7 – Planned Maintenance (PM) & Scheduled Work Order Module**.

## Apply database patch

```text
supabase-patches/65-planned-maintenance.sql
```

Apply after `64-user-notifications.sql`, then restart the API server so the PM scheduler starts.

## What it does

| Spec item | Implementation |
|-----------|----------------|
| PM Plan as reusable template | `pm_plans` + Scheduled tab **PM Plans** |
| Activity types (configurable) | `pm_activity_types` seeded; Activity types modal |
| Asset from equipment hierarchy | Location / area / equipment on the plan |
| Calendar schedules | Daily, weekly, monthly, quarterly, half yearly, yearly, calendar |
| Runtime / meter / shutdown | Stored; first due = start date; generate manually or after close |
| Checklist builder (master) | Scheduled tab **Checklists**; version bumps on field edits |
| Checklist copied onto WO | `checklist_snapshot` at generation; later template edits do not change in-flight WOs |
| Default technicians / resources | Copied onto the scheduled work order |
| Scheduler | Every 60s; only **Active** plans; generate N days before due |
| One open WO per plan | Default; optional “allow multiple open” |
| Execution | Existing Work Order lifecycle (`source_type = preventive_maintenance`) |
| Next due date | Recalculated when the scheduled WO is **closed** |
| Notifications | Plan activated, WO generated/assigned, overdue (daily) |
| Audit | `pm_plan_audit` plus existing WO timeline/audit |

## How to use

1. Open **Work Orders → Scheduled**.
2. Create a **Checklist** (optional) and add fields.
3. Create a **PM Plan**, set it **Active**, assign technicians and a checklist.
4. Click **Generate** to create a work order immediately, or wait for the scheduler.
5. Technicians execute the WO from **Received** (or open it from Scheduled work orders). Complete the checklist, then close the WO to roll the next due date.

## Key files

- Patch: `supabase-patches/65-planned-maintenance.sql`
- Server: `server/lib/pmService.js`, `server/lib/checklistService.js`, `server/lib/pmScheduler.js`, `server/routes/api/pm.js`
- Client: `client/src/pages/app/ScheduledWorkOrders.jsx`, `client/src/components/pm/`
