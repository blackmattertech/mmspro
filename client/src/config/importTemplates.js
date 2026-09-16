import {
  getAreasTemplate,
  bulkUploadAreas,
  getLocationsTemplate,
  bulkUploadLocations,
  getDepartmentsTemplate,
  bulkUploadDepartments,
  getEmployeesTemplate,
  bulkUploadEmployees,
} from '../lib/api'
import { getEquipmentTemplate, bulkUploadEquipment } from '../lib/api-equipment'
import { getVendorsTemplate, bulkUploadVendors } from '../lib/api-vendors'
import { getWorkRequestsTemplate, bulkUploadWorkRequests } from '../lib/api-work-requests'
import { getWorkOrdersTemplate, bulkUploadWorkOrders } from '../lib/api-work-orders'
import { getPmPlansTemplate, bulkUploadPmPlans } from '../lib/api-pm'
import { getTasksTemplate, bulkUploadTasks } from '../lib/api-tasks'
import { getWarrantiesTemplate, bulkUploadWarranties } from '../lib/api-warranties'

/** @typedef {'locations' | 'departments' | 'employees' | 'areas' | 'equipment' | 'vendors' | 'work_requests' | 'work_orders' | 'pm_plans' | 'tasks' | 'warranties'} ImportTemplateId */

/**
 * @typedef {Object} ImportTemplateConfig
 * @property {ImportTemplateId} id
 * @property {string} label
 * @property {string} description
 * @property {string} [moduleKey]
 * @property {string[]} [moduleKeys]
 * @property {boolean} [showWithoutPermission]
 * @property {string[]} instructions
 * @property {() => Promise<{ filename: string, contentType: string, data: string }>} downloadTemplate
 * @property {(base64: string) => Promise<ImportResult>} upload
 * @property {string} failedFilename
 */

/**
 * @typedef {Object} ImportResult
 * @property {number} created
 * @property {number} failed
 * @property {{ row: number, message: string }[]} [errors]
 * @property {{ filename: string, contentType: string, data: string }} [failedFile]
 * @property {{ row: number, name?: string, code?: string, location?: string, department?: string, area?: string }[]} [preview]
 */

export const IMPORT_PREVIEW_COLUMNS = {
  locations: [
    { key: 'name', label: 'Name' },
    { key: 'code', label: 'Code' },
  ],
  departments: [
    { key: 'name', label: 'Name' },
    { key: 'code', label: 'Code' },
    { key: 'location', label: 'Location' },
  ],
  employees: [
    { key: 'code', label: 'Employee ID' },
    { key: 'name', label: 'Name' },
    { key: 'location', label: 'Location' },
    { key: 'department', label: 'Department' },
  ],
  areas: [
    { key: 'name', label: 'Name' },
    { key: 'code', label: 'Code' },
    { key: 'location', label: 'Location' },
    { key: 'department', label: 'Department' },
  ],
  equipment: [
    { key: 'name', label: 'Name' },
    { key: 'location', label: 'Location' },
    { key: 'department', label: 'Department' },
    { key: 'area', label: 'Area' },
  ],
  vendors: [
    { key: 'vendor_code', label: 'Vendor ID' },
    { key: 'name', label: 'Name' },
    { key: 'contact_person', label: 'Contact Person' },
    { key: 'mobile', label: 'Mobile' },
    { key: 'city', label: 'City' },
    { key: 'gstin', label: 'GSTIN' },
  ],
  work_requests: [
    { key: 'name', label: 'Request' },
    { key: 'from', label: 'From' },
    { key: 'to', label: 'To' },
    { key: 'type', label: 'Type' },
  ],
  work_orders: [
    { key: 'name', label: 'Work order' },
    { key: 'department', label: 'Department' },
    { key: 'location', label: 'Location' },
    { key: 'status', label: 'Status' },
  ],
  pm_plans: [
    { key: 'name', label: 'Plan' },
    { key: 'activity', label: 'Activity' },
    { key: 'equipment', label: 'Equipment' },
    { key: 'status', label: 'Status' },
  ],
  tasks: [
    { key: 'name', label: 'Task' },
    { key: 'category', label: 'Category' },
    { key: 'priority', label: 'Priority' },
    { key: 'visibility', label: 'Visibility' },
  ],
  warranties: [
    { key: 'name', label: 'S.No' },
    { key: 'make', label: 'Make' },
    { key: 'vendor', label: 'Vendor' },
  ],
}

/** @type {ImportTemplateConfig[]} */
export const IMPORT_TEMPLATES = [
  {
    id: 'locations',
    label: 'Locations',
    description: 'Bulk create sites and branches.',
    moduleKey: 'locations',
    instructions: [
      'Download the Locations Excel template.',
      'On the Template sheet, enter one location per row. Name and Code are required.',
      'Use Yes/No for Primary from the Valid values sheet.',
      'Save as .xlsx and upload. Failed rows can be downloaded, fixed, and re-uploaded.',
    ],
    downloadTemplate: getLocationsTemplate,
    upload: bulkUploadLocations,
    failedFilename: 'locations-import-failed-rows.xlsx',
  },
  {
    id: 'departments',
    label: 'Departments',
    description: 'Bulk create departments with location and parent mapping.',
    moduleKey: 'departments',
    instructions: [
      'Download the Departments Excel template for your organization.',
      'Name and Code are required. Description is optional.',
      'Location must match Valid values (No location, All locations, or an existing location name).',
      'Parent Department must match a value from the Valid values sheet when used.',
      'Save as .xlsx and upload. Fix failed rows using the Import errors column and re-upload.',
    ],
    downloadTemplate: getDepartmentsTemplate,
    upload: bulkUploadDepartments,
    failedFilename: 'departments-import-failed-rows.xlsx',
  },
  {
    id: 'employees',
    label: 'Employees',
    description: 'Bulk create employees with location, department, and role.',
    moduleKey: 'employees',
    instructions: [
      'Download the Employees Excel template for your organization.',
      'Employee ID and Name are required. Mobile and Email are optional unless Login Required is Yes.',
      'Location, Department, Login Required, and Access Role must match the Valid values sheet.',
      'Login Required Yes does not send invite email during bulk upload — enable login later from the employee record if needed.',
      'Save as .xlsx and upload. Failed rows can be corrected and re-uploaded.',
    ],
    downloadTemplate: getEmployeesTemplate,
    upload: bulkUploadEmployees,
    failedFilename: 'employees-import-failed-rows.xlsx',
  },
  {
    id: 'areas',
    label: 'Areas',
    description: 'Bulk create or update areas under your locations and departments.',
    moduleKey: 'areas',
    instructions: [
      'Download the Excel template for your organization.',
      'On the Template sheet, enter one area per row. Name is required; Code is optional.',
      'Location and Department must match names listed on the Valid values sheet (spelling and casing must match).',
      'Save the file as .xlsx and upload it here. New rows are created; existing area codes are updated.',
      'If any rows fail, download the failed-rows file, fix the issues in the Import errors column, remove that column, and upload the corrected file again.',
    ],
    downloadTemplate: getAreasTemplate,
    upload: bulkUploadAreas,
    failedFilename: 'areas-import-failed-rows.xlsx',
  },
  {
    id: 'equipment',
    label: 'Equipment',
    description: 'Bulk create equipment records with placement and custom fields.',
    moduleKey: 'equipment',
    instructions: [
      'Download the Excel template — columns match your organization’s equipment fields.',
      'Fill Location, Department, and Area using exact values from the Valid values sheet.',
      'Complete any other required columns for each equipment row.',
      'Upload the .xlsx file. Each valid row creates one equipment record.',
      'For failed rows, download the failed-rows file, correct data using the Import errors column, delete that column, and re-upload.',
    ],
    downloadTemplate: getEquipmentTemplate,
    upload: bulkUploadEquipment,
    failedFilename: 'equipment-import-failed-rows.xlsx',
  },
  {
    id: 'vendors',
    label: 'Vendor Master',
    description: 'Bulk create vendor records with contact, address, taxation, and bank details.',
    moduleKey: 'settings',
    showWithoutPermission: true,
    instructions: [
      'Download the Vendor Master Excel template.',
      'On the Template sheet, enter one vendor per row. Vendor Name is required; Vendor ID is optional (auto-generated as Ven-0001, Ven-0002, … when left blank).',
      'Use City and State values from the Valid values sheet. Enter the city name only in the City column (e.g. Mumbai); State is filled separately.',
      'PAN, mobile, email, pincode, and IFSC are validated on upload. GSTIN is stored as entered.',
      'Save as .xlsx and upload here. If any rows fail, download the failed-rows file, fix the Import errors column, remove that column, and re-upload.',
    ],
    downloadTemplate: getVendorsTemplate,
    upload: bulkUploadVendors,
    failedFilename: 'vendor-master-import-failed-rows.xlsx',
  },
  {
    id: 'work_requests',
    label: 'Work Requests',
    description: 'Bulk create work requests from a sample Excel file.',
    moduleKey: 'work_request_create',
    instructions: [
      'Download the Work Requests sample Excel file. It includes every form field, plus child and grandchild fields named Parent → Child.',
      'Fill Request Type, departments, equipment, descriptions, and priority from Valid values. Child fields appear as extra columns.',
      'Save As can be Submit or Draft. Upload the .xlsx file from this page or the Work Requests toolbar.',
    ],
    downloadTemplate: getWorkRequestsTemplate,
    upload: bulkUploadWorkRequests,
    failedFilename: 'work-requests-import-failed-rows.xlsx',
  },
  {
    id: 'work_orders',
    label: 'Work Orders',
    description: 'Bulk create manual work orders from a sample Excel file.',
    moduleKey: 'work_orders',
    moduleKeys: ['work_orders', 'work_orders_manual'],
    instructions: [
      'Download the Work Orders sample Excel file. It includes assignment fields plus every parent, child, and grandchild form field.',
      'Enter short description, priority, location, department, equipment, and assigned technicians from Valid values.',
      'Dependent fields are named Parent → Child. Status can be Draft or Assigned.',
    ],
    downloadTemplate: getWorkOrdersTemplate,
    upload: bulkUploadWorkOrders,
    failedFilename: 'work-orders-import-failed-rows.xlsx',
  },
  {
    id: 'pm_plans',
    label: 'PM Plans',
    description: 'Bulk create preventive maintenance plans from a sample Excel file.',
    moduleKey: 'work_orders_scheduled',
    instructions: [
      'Download the PM Plans sample Excel file.',
      'Name, department, activity type, and equipment are required. Use Valid values for schedule type, interval, technicians, and checklist.',
      'Upload the .xlsx file from this page or the PM Plans toolbar.',
    ],
    downloadTemplate: getPmPlansTemplate,
    upload: bulkUploadPmPlans,
    failedFilename: 'pm-plans-import-failed-rows.xlsx',
  },
  {
    id: 'tasks',
    label: 'Tasks & Follow-ups',
    description: 'Bulk create one-time tasks from a sample Excel file.',
    moduleKey: 'tasks_followups',
    instructions: [
      'Download the Tasks sample Excel file. It includes recurrence, reminders, links, and references as child columns.',
      'Title, description, category, priority, start date, and due date are required.',
      'Use Reminder 1/2, Link 1/2, and Reference 1/2 columns for child rows. Recurring tasks also use the recurrence columns.',
    ],
    downloadTemplate: getTasksTemplate,
    upload: bulkUploadTasks,
    failedFilename: 'tasks-import-failed-rows.xlsx',
  },
  {
    id: 'warranties',
    label: 'Warranty Manager',
    description: 'Bulk create warranty records from a sample Excel file.',
    moduleKey: 'warranty_manager',
    instructions: [
      'Download the Warranties sample Excel file. Product lines are child columns (Item 1, Item 2, Item 3).',
      'Fill purchase and warranty dates, vendor, and at least one item product name.',
      'Upload the completed .xlsx file from this page or Warranty Manager.',
    ],
    downloadTemplate: getWarrantiesTemplate,
    upload: bulkUploadWarranties,
    failedFilename: 'warranties-import-failed-rows.xlsx',
  },
]

export function getImportTemplate(id) {
  return IMPORT_TEMPLATES.find((t) => t.id === id) || null
}
