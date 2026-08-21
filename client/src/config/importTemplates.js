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

/** @typedef {'locations' | 'departments' | 'employees' | 'areas' | 'equipment' | 'vendors'} ImportTemplateId */

/**
 * @typedef {Object} ImportTemplateConfig
 * @property {ImportTemplateId} id
 * @property {string} label
 * @property {string} description
 * @property {string} moduleKey
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
]

export function getImportTemplate(id) {
  return IMPORT_TEMPLATES.find((t) => t.id === id) || null
}
