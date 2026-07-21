import { getAreasTemplate, bulkUploadAreas } from '../lib/api'
import { getEquipmentTemplate, bulkUploadEquipment } from '../lib/api-equipment'

/** @typedef {'areas' | 'equipment'} ImportTemplateId */

/**
 * @typedef {Object} ImportTemplateConfig
 * @property {ImportTemplateId} id
 * @property {string} label
 * @property {string} description
 * @property {string} moduleKey
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
}

/** @type {ImportTemplateConfig[]} */
export const IMPORT_TEMPLATES = [
  {
    id: 'areas',
    label: 'Areas',
    description: 'Bulk create areas under your locations and departments.',
    moduleKey: 'areas',
    instructions: [
      'Download the Excel template for your organization.',
      'On the Template sheet, enter one area per row. Name is required; Code is optional.',
      'Location and Department must match names listed on the Valid values sheet (spelling and casing must match).',
      'Save the file as .xlsx and upload it here. Successful rows are imported immediately.',
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
]

export function getImportTemplate(id) {
  return IMPORT_TEMPLATES.find((t) => t.id === id) || null
}
