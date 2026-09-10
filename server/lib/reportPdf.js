import PDFDocument from 'pdfkit'
import { columnsForReport, formatStatusLabel } from './reportConstants.js'

const MARGIN = 36
const HEADER_COLOR = '#111827'
const MUTED = '#6B7280'
const RULE = '#E5E7EB'
const ACCENT = '#E63946'

function cellText(columnId, value) {
  if (value == null || value === '') return ''
  if (columnId === 'hours' || columnId === 'breakdown_hours') {
    const n = Number(value)
    return Number.isFinite(n) ? String(n) : String(value)
  }
  if (['started_at', 'ended_at', 'due_at', 'generated_at'].includes(columnId)) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return date.toISOString().replace('T', ' ').slice(0, 16)
  }
  if (['day_status', 'wo_status', 'status', 'priority', 'source'].includes(columnId)) {
    return formatStatusLabel(value)
  }
  return String(value)
}

function wrapText(doc, text, width) {
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
  return lines.slice(0, 4)
}

export function buildReportPdfBuffer({
  orgName,
  title,
  periodLabel,
  generatedAt,
  locationLabel,
  kpis = [],
  columns = [],
  rows = [],
  kind,
}) {
  const selected = columns.length
    ? columns
    : columnsForReport(kind).map((col) => col.id)
  const colDefs = columnsForReport(kind).filter((col) => selected.includes(col.id))
  const ordered = selected
    .map((id) => colDefs.find((col) => col.id === id))
    .filter(Boolean)

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: MARGIN,
      bufferPages: true,
      info: { Title: title, Author: orgName || 'MMS PRO' },
    })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const pageWidth = doc.page.width
    const pageHeight = doc.page.height
    const contentWidth = pageWidth - MARGIN * 2

    const drawChrome = () => {
      doc.save()
      doc.rect(0, 0, pageWidth, 8).fill(ACCENT)
      doc.restore()
    }

    drawChrome()
    doc.fillColor(HEADER_COLOR).font('Helvetica-Bold').fontSize(16).text(orgName || 'MMS PRO', MARGIN, MARGIN)
    doc.font('Helvetica-Bold').fontSize(13).fillColor(HEADER_COLOR).text(title, { align: 'left' })
    doc.moveDown(0.3)
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
    doc.text(`Period: ${periodLabel || '—'}`)
    doc.text(`Plant: ${locationLabel || 'All plants'}`)
    doc.text(`Generated: ${generatedAt || ''}`)
    doc.moveDown(0.6)

    if (kpis.length) {
      const colW = contentWidth / Math.min(kpis.length, 6)
      const startY = doc.y
      kpis.slice(0, 6).forEach((kpi, index) => {
        const x = MARGIN + (index * colW)
        doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(kpi.label, x, startY, { width: colW - 8 })
        doc.font('Helvetica-Bold').fontSize(12).fillColor(HEADER_COLOR)
          .text(String(kpi.value ?? '0'), x, startY + 12, { width: colW - 8 })
      })
      doc.y = startY + 36
    }

    const tableTop = Math.max(doc.y + 8, 130)
    const widths = ordered.map((col) => {
      const wide = ['short_description', 'work_done', 'materials', 'remarks', 'assignees', 'equipment'].includes(col.id)
      return wide ? 1.6 : 1
    })
    const totalWeight = widths.reduce((sum, w) => sum + w, 0) || 1
    const colWidths = widths.map((w) => (w / totalWeight) * contentWidth)

    const drawTableHeader = (y) => {
      doc.save()
      doc.rect(MARGIN, y, contentWidth, 20).fill('#F8FAFC')
      doc.restore()
      doc.font('Helvetica-Bold').fontSize(7).fillColor(HEADER_COLOR)
      let x = MARGIN
      ordered.forEach((col, index) => {
        doc.text(col.label, x + 4, y + 6, { width: colWidths[index] - 8, ellipsis: true })
        x += colWidths[index]
      })
      doc.moveTo(MARGIN, y + 20).lineTo(MARGIN + contentWidth, y + 20).strokeColor(RULE).stroke()
      return y + 22
    }

    let y = drawTableHeader(tableTop)
    const bottom = pageHeight - MARGIN

    rows.forEach((row) => {
      const lineSets = ordered.map((col, index) => (
        wrapText(doc.font('Helvetica').fontSize(7), cellText(col.id, row[col.id]), colWidths[index] - 8)
      ))
      const lineCount = Math.max(1, ...lineSets.map((lines) => lines.length))
      const rowHeight = Math.max(16, lineCount * 10 + 6)
      if (y + rowHeight > bottom) {
        doc.addPage()
        drawChrome()
        y = drawTableHeader(MARGIN)
      }
      let x = MARGIN
      doc.font('Helvetica').fontSize(7).fillColor('#1F2937')
      ordered.forEach((col, index) => {
        doc.text(lineSets[index].join('\n'), x + 4, y + 3, {
          width: colWidths[index] - 8,
          height: rowHeight - 4,
        })
        x += colWidths[index]
      })
      y += rowHeight
      doc.moveTo(MARGIN, y).lineTo(MARGIN + contentWidth, y).strokeColor('#F1F5F9').stroke()
    })

    if (!rows.length) {
      doc.font('Helvetica').fontSize(10).fillColor(MUTED)
        .text('No rows for this period.', MARGIN, y + 12)
    }

    doc.fontSize(8).fillColor(MUTED)
    const range = doc.bufferedPageRange()
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i)
      doc.text(
        `Page ${i + 1} of ${range.count}`,
        MARGIN,
        pageHeight - 24,
        { width: contentWidth, align: 'right' },
      )
    }

    doc.end()
  })
}

export function reportPdfFilename(title, dateFrom, dateTo) {
  const slug = String(title || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${slug}-${dateFrom || 'from'}-to-${dateTo || 'to'}.pdf`
}
