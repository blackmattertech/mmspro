# Asset Fields and Equipment

This note explains the two tabs in **Super Admin → Organizations → Configure**: **Asset Fields** and **Equipment**. They look the same because both are lists of form questions, but they store different answers and they show up on different screens.

The empty Asset Fields screen in the screenshot is expected when no asset questions have been created yet. It does not mean Equipment is missing. Equipment questions live on the next tab.

## Short answer

**Equipment** describes the machine. Those answers are saved once, on the equipment record, and reused everywhere that machine is picked.

**Asset Fields** describe the job. Those answers are saved on that work request, work order, PM plan, or warranty, and they change every time someone raises a new one.

You need Equipment to register machines and to scan a QR code. You need Asset Fields only when a form should ask something that is not a property of the machine (job nature, breakdown reason, downtime, remarks that are specific to this job).

If every question you care about is about the machine itself, Equipment is enough. Leave Asset Fields empty.

## What each tab actually is

Both tabs use the same three levels:

| Level | What it is | Example |
| --- | --- | --- |
| Section | A group heading. Created on the **Sections** tab. Shared by both lists. | Identity, Technical, Breakdown |
| Parent field | The question. | Equipment Type, Capacity, Job Nature |
| Child / option | One choice in a dropdown. | Pump, Motor, 5 HP |

**Sections** are stored once and used by both tabs. That is why the Equipment tab says sections are managed on the Sections tab. Creating a section does not create a question. The “No parent fields yet” message means this company has sections, and no Asset Field questions inside them.

**Asset Fields** questions are stored in `asset_fields`.

**Equipment** questions are stored in `equipment_fields`. Each equipment question points at a shared section.

The answers are stored in different places too:

| Question | Where the answer is saved |
| --- | --- |
| Equipment question | On the equipment record (`equipment_values`), together with Name, Code, Location, Department, and Area |
| Asset Field question | On the form that was filled (work order values, or the extra values of a work request, PM plan, or warranty) |

## Where Equipment questions are used

These are the screens that read `equipment_fields` and the values saved on the machine.

1. **Equipment create and edit** (`equipment.create` in Form Builder).
   Name, Code, Location, Department, Area, and Image are built in. Every active Equipment parent field is added under its section. This is the form that builds the machine record.

2. **Equipment detail and QR code.**
   The detail page shows those saved values. The QR code is a link to that equipment. The caption under the QR is one field you pick in Form Builder (Code by default).

3. **Scan result.**
   After a scan, the app shows the machine’s name, code, location, department, area, and image, then offers Create Work Request, Work Order, PM Schedule, or Task.

4. **Create Work Request — the equipment picker.**
   Order To is the equipment’s department. Area, Equipment Type, Name, Tag, Capacity, and the other cascade dropdowns are the Equipment parent fields. The choices in those dropdowns are the machines that belong to the Order To department. Picking a machine stores `equipment_id` on the request. It does not copy the answers into Asset Fields.

5. **Create Work Request, Work Order, and PM plan — read-only copies.**
   If Form Builder places an Equipment question on one of those forms, and the form also has an Equipment picker, that question is shown as read-only text taken from the selected machine. The user does not type it again.

6. **Create Work Order — matching fields.**
   When a work order is opened from a scan, empty work-order questions that have the same field id or the same name as an Equipment question are filled from the machine.

7. **PM plan from a scan.**
   Location, Department, Area, and Equipment are selected. Equipment catalog questions on the PM form are filled from the machine.

8. **Task from a scan.**
   The task title defaults to the equipment name when the title is empty. Location, Department, and an equipment reference are set. Tasks do not have the equipment catalog.

9. **Company app → Equipment → Field options.**
   A company admin can edit the dropdown choices of Equipment questions. They cannot add or delete the questions. Super Admin does that on the Equipment tab.

10. **Reports and lists** that show equipment columns read the same equipment values.

## Where Asset Field questions are used

These are the screens that read `asset_fields`. The answer belongs to that one form, not to the machine.

1. **Manual work order form.**
   The work order form is built from Asset Field questions and Equipment questions together, grouped by the shared sections. Whatever the user types is saved on that work order (`manual_work_order_values`). An Equipment question here is still the machine’s question; an Asset Field question is extra information for this order.

2. **Work request details and breakdown.**
   Job Nature is looked up by name, first in Asset Fields, then in Equipment. If Job Nature is “Breakdown”, the breakdown block uses the work order field list. Extra Asset Field questions that Form Builder placed on the work request are saved on that request.

3. **Form Builder for Work Request, Manual Work Order, PM plan, and Warranty.**
   These four forms can use both catalogs. An Asset Field dropped on the canvas is a normal input the user fills for that record. An Equipment field dropped on the canvas is filled from the selected machine and shown read-only when the form has an equipment picker.

4. **Company app → Masters → Fields.**
   The page subtitle says these are the dropdown options for work orders and other asset forms, and that equipment options are under Equipment. Company admins edit option values here. They do not create the questions.

5. **Warranty.**
   The warranty form can include Asset Field questions as extra columns on that warranty. The machine link, if you add one, still comes from Equipment.

## Why both exist

A machine has stable facts: type, tag, capacity, serial number. Those should be entered once. A job has facts that change every time: what failed, how urgent this visit is, how long it was down, what the technician found. Those should not be written back onto the machine, or the next work request would look like the last breakdown.

The two lists keep those answers apart:

- Change Capacity on the equipment record, and every future work request that picks that machine shows the new capacity.
- Change Job Nature on one work order, and only that work order changes.

They share section headings so the work order form can show “Technical” once, with the machine’s Capacity and this job’s Downtime hours in the same group.

## What to configure for a normal company

Use this split when you set up the organization in the screenshot.

**Sections.** Create the groups you want to see on forms. Example: Identity, Technical, Job.

**Equipment.** Put questions whose answer belongs to the machine.

- Equipment Type
- Equipment Name
- Equipment Tag
- Capacity
- Model
- Manufacturer

These drive the equipment form, the QR detail, and the work request cascade (Area → Type → Name → Tag → Capacity).

**Asset Fields.** Put questions whose answer belongs to one job. Leave this tab empty if you have none.

- Job Nature
- Breakdown reason
- Downtime hours
- Action taken

Do not put Equipment Type here. The work request picker will not use it to find the machine. Do not put Job Nature on the Equipment tab unless you truly want one job nature stored on the machine forever.

## What happens if you only use Equipment

This matches the setup where Asset Fields stays on “No parent fields yet.”

| Screen | Result |
| --- | --- |
| Create equipment | Works. Name, code, placement, image, and the Equipment questions. |
| Equipment QR and scan | Works. The scan fills department, area, and the equipment questions. |
| Create work request | The equipment cascade works. There is no separate Job Nature list unless a field with that name exists on Equipment. |
| Manual work order | The form shows the Equipment questions (and assignment). There are no extra per-job questions. |
| PM plan and task from a scan | Location, department, area, and the equipment link still fill. |
| Form Builder | The Equipment form only offers Equipment questions. Work request, work order, PM, and warranty only offer Equipment questions plus their built-in fields. |

That is a valid setup. Add Asset Fields later only when a form needs a question that should not be stored on the machine.

## How Form Builder fits

Form Builder does not create these questions. It chooses which existing questions appear, in what order, and which ones are required.

| Form in Form Builder | Which catalog it can place |
| --- | --- |
| Equipment | Equipment questions only, plus Name, Code, Location, Department, Area, Image |
| Work request | Built-in request fields, the equipment picker, and both catalogs |
| Manual work order | Assignment, plus both catalogs |
| PM plan | Plan fields, the equipment picker, and both catalogs |
| Warranty | Warranty fields, plus both catalogs |

On Work Request, Work Order, and PM, an Equipment catalog question next to an equipment picker is displayed from the machine and cannot be edited on that form. An Asset Field question on the same form is edited and saved with that request, order, or plan.

## Company app versus Super Admin

| Who | Equipment questions | Asset Field questions |
| --- | --- | --- |
| Super Admin, Configure | Creates sections, questions, and types | Creates questions and types |
| Company admin, Equipment → Field options | Edits dropdown choices only | — |
| Company admin, Masters → Fields | — | Edits dropdown choices only |
| Any user creating a record | Fills the equipment form, or sees the values after a scan | Fills them on the work order, request, PM plan, or warranty |

## One machine, one work request

1. Super Admin adds Equipment Type, Name, Tag, and Capacity on the Equipment tab.
2. Someone creates the machine. Those four answers are saved on the equipment. A QR is generated.
3. Someone scans the QR and chooses Create Work Request.
4. Order To, Area, Type, Name, Tag, and Capacity are already selected from that machine.
5. If Job Nature exists as an Asset Field, it is still empty, because it is about this job, not about the machine. The user picks it for this request only.
