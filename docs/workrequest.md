# Work Request & Work Order — Spec Compliance Notes

Aligned to CMMS sections **5 (Work Request)** and **6 (Work Order)**.

## Apply database patch

```text
supabase-patches/61-work-order-wr-spec-compliance.sql
```

Apply after `60-task-performance.sql`.

## Work Request (section 5)

| Spec item | Implementation |
|-----------|----------------|
| Types Inter / Intra / User Self / Manual | Create form + API |
| Order From locked; Intra/Self lock Order To | UI + server |
| Inter requires different Order To | Server + client validation |
| Dynamic assets by Order To | Existing catalog filter; clears on change |
| Priority High/Med/Low, breakdown, remarks, attachments | Create form uploads to `work-order-assets` |
| Number `WR-<DEPT>-<YYMMDD>-####` | Existing daily sequences |
| Incoming / Outgoing / Approve / Reject / Need info | Existing lists + detail actions |
| Approval fields: technicians, work center, priority, planned dates | Detail modal |
| Intra / User Self / Manual auto-convert to WO | On submit when status is `submitted` |
| Inter (approval required) → pending → approve creates WO | Copies WR data into WO; status `assigned` |
| Timeline + notifications | WR timeline; notify on create/approve/reject/need-info |
| Execution status mirror | `work_requests.execution_status` synced from WO |

## Work Order (section 6)

| Spec item | Implementation |
|-----------|----------------|
| Number `WO-<DEPT>-<YYMMDD>-####` | `work_order_daily_sequences` + `wo_number` |
| Sources | `source_type`: approved_work_request, manual, breakdown, user_self_request, preventive_maintenance |
| Lifecycle statuses | draft → assigned → accepted → started → in_progress → waiting_* → on_hold → completed → verified → closed (+ returned_rework) |
| Copy from WR on create | problem, priority, assets, attachments, form values, equipment |
| Permits + block start | `permit_*` fields; start/in_progress gated when permit required incomplete |
| Planning / execution / documentation | Columns + lifecycle panel on received detail |
| Completion validation | Mandatory docs + times before `completed` |
| Supervisor verify / rework / close | Status transitions + verification remarks |
| Timeline + audit | `work_order_timeline`, `work_order_audit_log`; sync events onto linked WR |
| API | `PATCH /api/work-orders/manual/:id/lifecycle` |

## Key files

- Patch: `supabase-patches/61-work-order-wr-spec-compliance.sql`
- Server: `server/lib/workOrderService.js`, `server/lib/workRequestService.js`, `server/routes/api/workOrders.js`
- Client: `WorkOrderLifecyclePanel.jsx`, `ReceivedWorkOrderDetailModal.jsx`, `WorkRequestCreate.jsx`, `WorkRequestDetailModal.jsx`

## Still future / partial

- Runtime / meter / shutdown PM schedules (stored; generate manually until meters exist)
- Mobile push notifications
- Named CMMS role templates (Requester / Supervisor / Technician / Planner) beyond module permissions
- Inventory integration for material consumed
- Draft edit / resubmit after need_info (status exists; full edit flow may still be limited)
- PM reports (compliance, overdue register, technician performance) beyond the Scheduled tab lists
