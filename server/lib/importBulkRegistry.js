import { bulkImportLocations, bulkImportDepartments, bulkImportEmployees } from './companyMasterBulkService.js'
import { bulkImportAreas } from './areaBulkService.js'
import { bulkImportWorkCenters } from './workCenterBulkService.js'
import { bulkImportEquipment } from './equipmentBulkService.js'
import { bulkImportVendors } from './vendorBulkService.js'
import { bulkImportWorkRequests } from './workRequestBulkService.js'
import { bulkImportWorkOrders } from './workOrderBulkService.js'
import { bulkImportPmPlans } from './pmPlanBulkService.js'
import { bulkImportTasks } from './taskBulkService.js'
import { bulkImportWarranties } from './warrantyBulkService.js'
import { bulkImportMeterReadings } from './logbookBulkService.js'
import { importUoms } from './uomBulkService.js'
import {
  bulkImportSections,
  bulkImportParents,
  bulkImportChildren,
} from './assetFieldBulkService.js'
import { attachFailedFileToResult, buildFailedRowsWorkbook } from './importErrorWorkbook.js'

/**
 * @typedef {Object} ImportTemplateDef
 * @property {string} key
 * @property {string} failedFilename
 * @property {(orgId: string, buffer: Buffer, ctx: object) => Promise<object>} run
 * @property {boolean} [attachFailedFile]
 */

/** @type {Record<string, ImportTemplateDef>} */
export const IMPORT_BULK_REGISTRY = {
  locations: {
    key: 'locations',
    failedFilename: 'locations-import-failed-rows.xlsx',
    run: (orgId, buffer) => bulkImportLocations(orgId, buffer),
  },
  departments: {
    key: 'departments',
    failedFilename: 'departments-import-failed-rows.xlsx',
    run: (orgId, buffer) => bulkImportDepartments(orgId, buffer),
  },
  employees: {
    key: 'employees',
    failedFilename: 'employees-import-failed-rows.xlsx',
    run: (orgId, buffer) => bulkImportEmployees(orgId, buffer),
  },
  areas: {
    key: 'areas',
    failedFilename: 'areas-import-failed-rows.xlsx',
    run: (orgId, buffer, ctx = {}) => bulkImportAreas(orgId, buffer, { locationId: ctx.locationId }),
  },
  work_centers: {
    key: 'work_centers',
    failedFilename: 'work-centers-import-failed-rows.xlsx',
    run: (orgId, buffer, ctx = {}) => bulkImportWorkCenters(orgId, buffer, { locationId: ctx.locationId }),
  },
  equipment: {
    key: 'equipment',
    failedFilename: 'assets-import-failed-rows.xlsx',
    run: (orgId, buffer, ctx = {}) => bulkImportEquipment(orgId, buffer, { locationId: ctx.locationId }),
  },
  vendors: {
    key: 'vendors',
    failedFilename: 'vendor-master-import-failed-rows.xlsx',
    run: (orgId, buffer) => bulkImportVendors(orgId, buffer),
  },
  work_requests: {
    key: 'work_requests',
    failedFilename: 'work-requests-import-failed-rows.xlsx',
    run: (orgId, buffer, ctx = {}) => bulkImportWorkRequests(
      orgId,
      ctx.profileId,
      ctx.email,
      buffer,
      { isOrgAdmin: Boolean(ctx.isOrgAdmin) },
    ),
  },
  work_orders: {
    key: 'work_orders',
    failedFilename: 'work-orders-import-failed-rows.xlsx',
    run: (orgId, buffer, ctx = {}) => bulkImportWorkOrders(orgId, ctx.profileId, buffer),
  },
  pm_plans: {
    key: 'pm_plans',
    failedFilename: 'pm-plans-import-failed-rows.xlsx',
    run: (orgId, buffer, ctx = {}) => bulkImportPmPlans(orgId, ctx.profileId, buffer),
  },
  tasks: {
    key: 'tasks',
    failedFilename: 'tasks-import-failed-rows.xlsx',
    run: (orgId, buffer, ctx = {}) => bulkImportTasks(orgId, ctx.profileId, buffer),
  },
  warranties: {
    key: 'warranties',
    failedFilename: 'warranties-import-failed-rows.xlsx',
    run: (orgId, buffer, ctx = {}) => bulkImportWarranties(orgId, buffer, {
      dryRun: Boolean(ctx.dryRun),
    }),
  },
  meter_readings: {
    key: 'meter_readings',
    failedFilename: 'meter-readings-import-failed-rows.xlsx',
    run: (orgId, buffer, ctx = {}) => bulkImportMeterReadings(orgId, ctx.userId || ctx.profileId, buffer, {
      locationId: ctx.locationId || null,
    }),
  },
  uoms: {
    key: 'uoms',
    failedFilename: 'uoms-import-failed-rows.xlsx',
    run: (orgId, buffer) => importUoms(orgId, buffer),
  },
  asset_field_sections: {
    key: 'asset_field_sections',
    failedFilename: 'sections-import-failed-rows.xlsx',
    run: (orgId, buffer) => bulkImportSections(orgId, buffer),
  },
  asset_field_parents: {
    key: 'asset_field_parents',
    failedFilename: 'parent-fields-import-failed-rows.xlsx',
    run: (orgId, buffer) => bulkImportParents(orgId, buffer),
  },
  asset_field_children: {
    key: 'asset_field_children',
    failedFilename: 'child-values-import-failed-rows.xlsx',
    run: (orgId, buffer) => bulkImportChildren(orgId, buffer),
  },
}

export function getImportTemplate(templateKey) {
  const def = IMPORT_BULK_REGISTRY[templateKey]
  if (!def) {
    const err = new Error(`Unknown import template: ${templateKey}`)
    err.status = 400
    throw err
  }
  return def
}

/** Run template import and optionally attach failed-rows workbook (sync path). */
export async function runImportTemplate(templateKey, orgId, buffer, ctx = {}) {
  const def = getImportTemplate(templateKey)
  const result = await def.run(orgId, buffer, ctx)
  if (ctx.dryRun) return result
  return attachFailedFileToResult(result, buffer, def.failedFilename)
}

/** Worker path: run import and return result + optional failed buffer (no base64). */
export async function runImportTemplateForWorker(templateKey, orgId, buffer, ctx = {}) {
  const def = getImportTemplate(templateKey)
  const result = await def.run(orgId, buffer, ctx)
  if (ctx.dryRun) {
    return { result, failedBuffer: null, failedFilename: null }
  }
  let failedBuffer = null
  if (result?.errors?.length) {
    failedBuffer = await buildFailedRowsWorkbook(buffer, result.errors)
  }
  const resultWithoutFile = { ...result }
  delete resultWithoutFile.failedFile
  return {
    result: resultWithoutFile,
    failedBuffer,
    failedFilename: def.failedFilename,
  }
}
