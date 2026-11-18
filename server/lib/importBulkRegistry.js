/**
 * @typedef {Object} ImportTemplateDef
 * @property {string} key
 * @property {string} failedFilename
 * @property {(orgId: string, buffer: Buffer, ctx: object) => Promise<object>} run
 * @property {boolean} [attachFailedFile]
 */

/** Lazy loaders — keep list/session cold starts free of ExcelJS + every bulk module. */
const IMPORT_LOADERS = {
  locations: async () => {
    const { bulkImportLocations } = await import('./companyMasterBulkService.js')
    return {
      key: 'locations',
      failedFilename: 'locations-import-failed-rows.xlsx',
      run: (orgId, buffer) => bulkImportLocations(orgId, buffer),
    }
  },
  departments: async () => {
    const { bulkImportDepartments } = await import('./companyMasterBulkService.js')
    return {
      key: 'departments',
      failedFilename: 'departments-import-failed-rows.xlsx',
      run: (orgId, buffer) => bulkImportDepartments(orgId, buffer),
    }
  },
  employees: async () => {
    const { bulkImportEmployees } = await import('./companyMasterBulkService.js')
    return {
      key: 'employees',
      failedFilename: 'employees-import-failed-rows.xlsx',
      run: (orgId, buffer) => bulkImportEmployees(orgId, buffer),
    }
  },
  areas: async () => {
    const { bulkImportAreas } = await import('./areaBulkService.js')
    return {
      key: 'areas',
      failedFilename: 'areas-import-failed-rows.xlsx',
      run: (orgId, buffer, ctx = {}) => bulkImportAreas(orgId, buffer, { locationId: ctx.locationId }),
    }
  },
  work_centers: async () => {
    const { bulkImportWorkCenters } = await import('./workCenterBulkService.js')
    return {
      key: 'work_centers',
      failedFilename: 'work-centers-import-failed-rows.xlsx',
      run: (orgId, buffer, ctx = {}) => bulkImportWorkCenters(orgId, buffer, { locationId: ctx.locationId }),
    }
  },
  equipment: async () => {
    const { bulkImportEquipment } = await import('./equipmentBulkService.js')
    return {
      key: 'equipment',
      failedFilename: 'assets-import-failed-rows.xlsx',
      run: (orgId, buffer, ctx = {}) => bulkImportEquipment(orgId, buffer, { locationId: ctx.locationId }),
    }
  },
  vendors: async () => {
    const { bulkImportVendors } = await import('./vendorBulkService.js')
    return {
      key: 'vendors',
      failedFilename: 'vendor-master-import-failed-rows.xlsx',
      run: (orgId, buffer) => bulkImportVendors(orgId, buffer),
    }
  },
  work_requests: async () => {
    const { bulkImportWorkRequests } = await import('./workRequestBulkService.js')
    return {
      key: 'work_requests',
      failedFilename: 'work-requests-import-failed-rows.xlsx',
      run: (orgId, buffer, ctx = {}) => bulkImportWorkRequests(
        orgId,
        ctx.profileId,
        ctx.email,
        buffer,
        { isOrgAdmin: Boolean(ctx.isOrgAdmin) },
      ),
    }
  },
  work_orders: async () => {
    const { bulkImportWorkOrders } = await import('./workOrderBulkService.js')
    return {
      key: 'work_orders',
      failedFilename: 'work-orders-import-failed-rows.xlsx',
      run: (orgId, buffer, ctx = {}) => bulkImportWorkOrders(orgId, ctx.profileId, buffer),
    }
  },
  pm_plans: async () => {
    const { bulkImportPmPlans } = await import('./pmPlanBulkService.js')
    return {
      key: 'pm_plans',
      failedFilename: 'pm-plans-import-failed-rows.xlsx',
      run: (orgId, buffer, ctx = {}) => bulkImportPmPlans(orgId, ctx.profileId, buffer),
    }
  },
  tasks: async () => {
    const { bulkImportTasks } = await import('./taskBulkService.js')
    return {
      key: 'tasks',
      failedFilename: 'tasks-import-failed-rows.xlsx',
      run: (orgId, buffer, ctx = {}) => bulkImportTasks(orgId, ctx.profileId, buffer),
    }
  },
  warranties: async () => {
    const { bulkImportWarranties } = await import('./warrantyBulkService.js')
    return {
      key: 'warranties',
      failedFilename: 'warranties-import-failed-rows.xlsx',
      run: (orgId, buffer, ctx = {}) => bulkImportWarranties(orgId, buffer, {
        dryRun: Boolean(ctx.dryRun),
      }),
    }
  },
  meter_readings: async () => {
    const { bulkImportMeterReadings } = await import('./logbookBulkService.js')
    return {
      key: 'meter_readings',
      failedFilename: 'meter-readings-import-failed-rows.xlsx',
      run: (orgId, buffer, ctx = {}) => bulkImportMeterReadings(orgId, ctx.userId || ctx.profileId, buffer, {
        locationId: ctx.locationId || null,
      }),
    }
  },
  uoms: async () => {
    const { importUoms } = await import('./uomBulkService.js')
    return {
      key: 'uoms',
      failedFilename: 'uoms-import-failed-rows.xlsx',
      run: (orgId, buffer) => importUoms(orgId, buffer),
    }
  },
  asset_field_sections: async () => {
    const { bulkImportSections } = await import('./assetFieldBulkService.js')
    return {
      key: 'asset_field_sections',
      failedFilename: 'sections-import-failed-rows.xlsx',
      run: (orgId, buffer) => bulkImportSections(orgId, buffer),
    }
  },
  asset_field_parents: async () => {
    const { bulkImportParents } = await import('./assetFieldBulkService.js')
    return {
      key: 'asset_field_parents',
      failedFilename: 'parent-fields-import-failed-rows.xlsx',
      run: (orgId, buffer) => bulkImportParents(orgId, buffer),
    }
  },
  asset_field_children: async () => {
    const { bulkImportChildren } = await import('./assetFieldBulkService.js')
    return {
      key: 'asset_field_children',
      failedFilename: 'child-values-import-failed-rows.xlsx',
      run: (orgId, buffer) => bulkImportChildren(orgId, buffer),
    }
  },
}

const defCache = new Map()

/** Sync key check for callers that only need existence / metadata keys. */
export const IMPORT_BULK_REGISTRY = Object.fromEntries(
  Object.keys(IMPORT_LOADERS).map((key) => [key, { key }]),
)

export async function resolveImportTemplate(templateKey) {
  const loader = IMPORT_LOADERS[templateKey]
  if (!loader) {
    const err = new Error(`Unknown import template: ${templateKey}`)
    err.status = 400
    throw err
  }
  if (!defCache.has(templateKey)) {
    defCache.set(templateKey, loader())
  }
  return defCache.get(templateKey)
}

export function getImportTemplate(templateKey) {
  if (!IMPORT_LOADERS[templateKey]) {
    const err = new Error(`Unknown import template: ${templateKey}`)
    err.status = 400
    throw err
  }
  // Sync API kept for callers that only validate the key; run paths use resolveImportTemplate.
  return {
    key: templateKey,
    failedFilename: `${templateKey}-import-failed-rows.xlsx`,
    run: async (orgId, buffer, ctx = {}) => {
      const def = await resolveImportTemplate(templateKey)
      return def.run(orgId, buffer, ctx)
    },
  }
}

/** Run template import and optionally attach failed-rows workbook (sync path). */
export async function runImportTemplate(templateKey, orgId, buffer, ctx = {}) {
  const def = await resolveImportTemplate(templateKey)
  const result = await def.run(orgId, buffer, ctx)
  if (ctx.dryRun) return result
  const { attachFailedFileToResult } = await import('./importErrorWorkbook.js')
  return attachFailedFileToResult(result, buffer, def.failedFilename)
}

/** Worker path: run import and return result + optional failed buffer (no base64). */
export async function runImportTemplateForWorker(templateKey, orgId, buffer, ctx = {}) {
  const def = await resolveImportTemplate(templateKey)
  const result = await def.run(orgId, buffer, ctx)
  if (ctx.dryRun) {
    return { result, failedBuffer: null, failedFilename: null }
  }
  let failedBuffer = null
  if (result?.errors?.length) {
    const { buildFailedRowsWorkbook } = await import('./importErrorWorkbook.js')
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
