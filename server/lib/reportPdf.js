import PDFDocument from 'pdfkit'
import { UNIFIED_COLUMNS, columnsForReport, formatReportValue } from './reportConstants.js'
import { formatDisplayDate } from './displayDate.js'

const MARGIN = 32
const INK = '#000000'
const HEADER_FILL = '#D9D9D9'

function cellText(columnId, value) {
  return formatReportValue(columnId, value)
}

function wrapText(doc, text, width, maxLines = 8) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines = []
  let current = words[0]
  for (let i = 1; i < words.length; i += 1) {
    const next = `${current} ${words[i]}`
    if (doc.widthOfString(next) <= width) {
      current = next
    } else {
      lines.push(current)
      current = words[i]
    }
  }
  lines.push(current)
  return lines.slice(0, maxLines)
}

function strokeRect(doc, x, y, w, h, fill) {
  doc.save()
  doc.lineWidth(0.7).strokeColor(INK)
  if (fill) {
    doc.fillColor(fill).rect(x, y, w, h).fillAndStroke()
  } else {
    doc.rect(x, y, w, h).stroke()
  }
  doc.restore()
}

function textInCell(doc, text, x, y, w, h, { bold = false, size = 8, align = 'left', valign = 'top' } = {}) {
  const padX = 4
  const padY = 3
  const maxHeight = Math.max(1, h - padY * 2)
  doc.save()
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(INK)
  const lines = wrapText(doc, text, w - padX * 2, Math.max(1, Math.floor(maxHeight / (size + 2))))
  const lineHeight = size + 2
  const blockHeight = lines.length * lineHeight
  let textY = y + padY
  if (valign === 'center') {
    textY = y + Math.max(padY, (h - blockHeight) / 2)
  }
  // height + ellipsis keeps PDFKit from calling continueOnNewPage (blank pages).
  doc.text(lines.join('\n'), x + padX, textY, {
    width: w - padX * 2,
    height: maxHeight,
    align,
    lineGap: 1,
    ellipsis: true,
  })
  doc.restore()
}

function departmentBanner(name) {
  const text = String(name || 'MAINTENANCE').trim().toUpperCase() || 'MAINTENANCE'
  return text.includes('DEPARTMENT') ? text : `${text} DEPARTMENT`
}

function reportTitleBanner(title) {
  const text = String(title || 'REPORT').trim().toUpperCase() || 'REPORT'
  return text
}

function drawLetterhead(doc, {
  orgName,
  address,
  department,
  logo,
  title,
}, pageWidth, margin) {
  const top = margin
  const contentWidth = pageWidth - margin * 2
  const headerH = 70
  const logoW = 110
  const infoX = margin + logoW
  const infoW = contentWidth - logoW
  const bandH = headerH / 3

  strokeRect(doc, margin, top, logoW, headerH)
  // `logo` must be a PDFKit Image from doc.openImage(...) so multi-page
  // reports reuse one XObject instead of re-embedding the file on every page.
  if (logo) {
    try {
      doc.image(logo, margin + 8, top + 10, {
        fit: [logoW - 16, headerH - 20],
        align: 'center',
        valign: 'center',
      })
    } catch {
      // unsupported image type
    }
  }

  strokeRect(doc, infoX, top, infoW, bandH)
  textInCell(doc, orgName || 'Organization', infoX, top, infoW, bandH, {
    bold: true,
    size: 12,
    align: 'center',
    valign: 'center',
  })

  strokeRect(doc, infoX, top + bandH, infoW, bandH)
  textInCell(doc, address || '', infoX, top + bandH, infoW, bandH, {
    size: 8,
    align: 'center',
    valign: 'center',
  })

  strokeRect(doc, infoX, top + bandH * 2, infoW, bandH)
  textInCell(doc, departmentBanner(department), infoX, top + bandH * 2, infoW, bandH, {
    bold: true,
    size: 10,
    align: 'center',
    valign: 'center',
  })

  const titleY = top + headerH
  const titleH = 20
  strokeRect(doc, margin, titleY, contentWidth, titleH, HEADER_FILL)
  textInCell(doc, reportTitleBanner(title), margin, titleY, contentWidth, titleH, {
    bold: true,
    size: 10,
    align: 'center',
    valign: 'center',
  })

  return titleY + titleH
}

function drawFilterGrid(doc, filters, x, y, width) {
  const pairs = [
    ['From Date', filters.fromDate],
    ['Order From', filters.orderFrom],
    ['Order To', filters.orderTo],
    ['To Date', filters.toDate],
    ['Area', filters.area],
    ['Asset Type', filters.equipmentType],
    ['Order Type', filters.orderType],
    ['Facility', filters.facility],
    ['Asset Capacity', filters.equipmentCapacity],
    ['Job Nature', filters.jobNature],
    ['Asset', filters.equipment],
    ['Job Priority', filters.priority],
  ]
  const cols = 6
  const rows = 4
  const colW = width / cols
  const rowH = 18
  pairs.forEach((pair, index) => {
    const row = Math.floor(index / 3)
    const group = index % 3
    const labelX = x + group * colW * 2
    const valueX = labelX + colW
    const cellY = y + row * rowH
    strokeRect(doc, labelX, cellY, colW, rowH)
    strokeRect(doc, valueX, cellY, colW, rowH)
    textInCell(doc, pair[0], labelX, cellY, colW, rowH, { size: 8, valign: 'center' })
    textInCell(doc, pair[1] || 'All', valueX, cellY, colW, rowH, {
      bold: true,
      size: 8,
      valign: 'center',
    })
  })
  return y + rows * rowH
}

function columnWeight(col) {
  const wide = new Set([
    'short_description',
    'problem_description',
    'remarks',
    'job_description',
    'root_cause',
    'action_taken',
    'material_consumed',
    'special_tools_used',
    'safety_precautions',
    'dos_and_donts',
    'lessons_learned',
    'execution_remarks',
    'work_done',
    'assignees',
    'equipment',
    'order_from',
    'order_to',
  ])
  return wide.has(col.id) ? 1.7 : 1
}

function activityColWidths(columns, contentWidth) {
  const weights = columns.map(columnWeight)
  const total = weights.reduce((sum, w) => sum + w, 0) || 1
  return weights.map((w) => (w / total) * contentWidth)
}

function chunkReportColumns(columns) {
  const maxWeight = 12
  const chunks = []
  let current = []
  let weight = 0
  for (const col of columns) {
    const w = columnWeight(col)
    if (current.length && weight + w > maxWeight) {
      chunks.push(current)
      current = []
      weight = 0
    }
    current.push(col)
    weight += w
  }
  if (current.length) chunks.push(current)
  const wo = columns.find((col) => col.id === 'wo_number')
  return chunks.map((chunk, index) => {
    if (index === 0 || !wo || chunk.some((col) => col.id === 'wo_number')) return chunk
    return [wo, ...chunk.filter((col) => col.id !== 'wo_number')]
  })
}

function resolveExportColumns(kind, selected = []) {
  const allowed = kind === 'unified' ? UNIFIED_COLUMNS : columnsForReport(kind)
  const byId = new Map(allowed.map((col) => [col.id, col]))
  const list = (Array.isArray(selected) ? selected : [])
    .map((item) => (typeof item === 'string' ? byId.get(item) : item))
    .filter((col) => col?.id && byId.has(col.id))
  return list.length ? list : allowed
}

function drawActivityTableHeader(doc, columns, x, y, widths) {
  const h = 22
  let cursor = x
  columns.forEach((col, index) => {
    strokeRect(doc, cursor, y, widths[index], h, HEADER_FILL)
    textInCell(doc, col.label, cursor, y, widths[index], h, {
      bold: true,
      size: 6.5,
      align: 'center',
      valign: 'center',
    })
    cursor += widths[index]
  })
  return y + h
}

function wrapIdsForColumn(col) {
  return [
    'short_description',
    'problem_description',
    'remarks',
    'job_description',
    'root_cause',
    'action_taken',
    'material_consumed',
    'special_tools_used',
    'safety_precautions',
    'dos_and_donts',
    'lessons_learned',
    'execution_remarks',
    'work_done',
  ].includes(col.id)
}

function activityLineSets(doc, columns, row, widths) {
  return columns.map((col, index) => (
    wrapText(
      doc.font('Helvetica').fontSize(6.5),
      cellText(col.id, row[col.id]),
      widths[index] - 8,
      wrapIdsForColumn(col) ? 8 : 3,
    )
  ))
}

function activityRowHeight(lineSets) {
  const lineCount = Math.max(1, ...lineSets.map((lines) => lines.length))
  return Math.max(16, lineCount * 9 + 5)
}

function drawActivityRow(doc, columns, row, x, y, widths, precomputedLineSets = null) {
  const lineSets = precomputedLineSets || activityLineSets(doc, columns, row, widths)
  const h = activityRowHeight(lineSets)
  let cursor = x
  columns.forEach((col, index) => {
    strokeRect(doc, cursor, y, widths[index], h)
    textInCell(doc, lineSets[index].join('\n'), cursor, y, widths[index], h, {
      size: 6.5,
      align: ['wo_number', 'status', 'progress_percent'].includes(col.id) ? 'center' : 'left',
    })
    cursor += widths[index]
  })
  return h
}

function drawFooter(doc, orgName, pageWidth, pageHeight, margin, page, pages) {
  // Keep footer inside the printable band. Drawing below page.margins.bottom makes
  // PDFKit continueOnNewPage() and leaves trailing blank pages in the file.
  const y = pageHeight - 18
  const previousBottom = doc.page.margins.bottom
  doc.page.margins.bottom = 0
  try {
    doc.save()
    doc.lineWidth(0.7).strokeColor(INK)
      .moveTo(margin, y - 6)
      .lineTo(pageWidth - margin, y - 6)
      .stroke()
    doc.font('Helvetica').fontSize(8).fillColor(INK)
    doc.text(orgName || '', margin, y, { width: 300, lineBreak: false })
    doc.text(`Page ${page} of ${pages}`, pageWidth - margin - 120, y, {
      width: 120,
      align: 'right',
      lineBreak: false,
    })
    doc.restore()
  } finally {
    doc.page.margins.bottom = previousBottom
  }
}

function drawPageFrame(doc, pageWidth, pageHeight, margin) {
  strokeRect(doc, margin - 2, margin - 2, pageWidth - (margin - 2) * 2, pageHeight - (margin - 2) * 2)
}

export function buildActivityFilterValues(query = {}, options = {}) {
  const pick = (list, value) => {
    const text = String(value || '').trim()
    if (!text || text === '0' || text === 'all') return 'All'
    const hit = (list || []).find((row) => String(row.value || row.id) === text)
    return hit?.label || hit?.name || text
  }
  return {
    fromDate: query.date_from ? (formatDisplayDate(query.date_from) || query.date_from) : 'All',
    toDate: query.date_to ? (formatDisplayDate(query.date_to) || query.date_to) : 'All',
    orderFrom: pick(options.departments, query.order_from),
    orderTo: pick(options.departments, query.order_to),
    orderType: pick(options.order_types, query.order_type),
    area: pick(options.areas, query.area_id),
    facility: pick(options.locations, query.facility_id || query.location_id),
    equipment: pick(options.equipment, query.equipment_id),
    equipmentType: pick(null, query.equipment_type),
    equipmentCapacity: pick(null, query.equipment_capacity),
    jobNature: pick(options.job_natures, query.job_nature),
    priority: pick(options.priorities, query.priority),
  }
}

function buildTabularReportPdfBuffer({
  orgName,
  address,
  department,
  logo,
  title,
  filters,
  rows = [],
  columns = [],
  kind = 'unified',
}) {
  return new Promise((resolve, reject) => {
    const reportTitle = reportTitleBanner(title)
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: MARGIN,
      bufferPages: true,
      info: { Title: reportTitle, Author: orgName || 'MMS PRO' },
    })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const pageWidth = doc.page.width
    const pageHeight = doc.page.height
    const contentWidth = pageWidth - MARGIN * 2
    let logoImage = null
    if (logo) {
      try {
        logoImage = doc.openImage(logo)
      } catch {
        logoImage = null
      }
    }
    const letterhead = { orgName, address, department, logo: logoImage, title: reportTitle }
    // Leave room for the footer band; stay above PDFKit's bottom margin to avoid auto page breaks.
    const bottom = pageHeight - Math.max(MARGIN + 8, 40)
    const resolvedColumns = resolveExportColumns(kind, columns)
    const colGroups = chunkReportColumns(resolvedColumns)
    const fallbackColumns = resolvedColumns.length
      ? resolvedColumns
      : (kind === 'unified' ? UNIFIED_COLUMNS : columnsForReport(kind))

    const startPage = (includeFilters, groupColumns, groupWidths) => {
      drawPageFrame(doc, pageWidth, pageHeight, MARGIN)
      let y = drawLetterhead(doc, letterhead, pageWidth, MARGIN)
      if (includeFilters) {
        y = drawFilterGrid(doc, filters, MARGIN, y, contentWidth)
      }
      y = drawActivityTableHeader(doc, groupColumns, MARGIN, y, groupWidths)
      return y
    }

    if (!rows.length) {
      const group = colGroups[0] || fallbackColumns
      const widths = activityColWidths(group, contentWidth)
      const y = startPage(true, group, widths)
      textInCell(doc, 'No rows for this period.', MARGIN, y, contentWidth, 24, {
        size: 10,
        valign: 'center',
      })
    } else {
      colGroups.forEach((group, groupIndex) => {
        const widths = activityColWidths(group, contentWidth)
        if (groupIndex > 0) doc.addPage()
        let y = startPage(groupIndex === 0, group, widths)
        rows.forEach((row) => {
          const lineSets = activityLineSets(doc, group, row, widths)
          const rowHeight = activityRowHeight(lineSets)
          if (y + rowHeight > bottom) {
            doc.addPage()
            y = startPage(false, group, widths)
          }
          y += drawActivityRow(doc, group, row, MARGIN, y, widths, lineSets)
        })
      })
    }

    const range = doc.bufferedPageRange()
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i)
      drawFooter(doc, orgName, pageWidth, pageHeight, MARGIN, i + 1, range.count)
    }

    doc.end()
  })
}

export function buildReportPdfBuffer({
  orgName,
  title,
  periodLabel,
  locationLabel,
  columns = [],
  rows = [],
  kind,
  address,
  department,
  logo,
  activityFilters,
}) {
  const filters = {
    ...(activityFilters || {}),
  }
  if (!filters.fromDate && periodLabel) filters.fromDate = periodLabel
  if (!filters.facility && locationLabel) filters.facility = locationLabel

  return buildTabularReportPdfBuffer({
    orgName,
    address,
    department,
    logo,
    title: title || (kind === 'unified' ? 'ACTIVITY REPORT' : 'REPORT'),
    filters,
    rows,
    columns,
    kind: kind || 'unified',
  })
}

export function reportPdfFilename(title, dateFrom, dateTo) {
  const slug = String(title || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const from = formatDisplayDate(dateFrom) || 'from'
  const to = formatDisplayDate(dateTo) || 'to'
  return `${slug}-${from}-to-${to}.pdf`
}
