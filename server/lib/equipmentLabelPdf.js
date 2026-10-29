import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { mmToPt } from './equipmentLabelPaper.js'

const FONT_SIZES = [8, 7, 6.5, 6, 5.5, 5, 4.5, 4]

function measure(doc, text, fontSize, width) {
  doc.font('Helvetica').fontSize(fontSize)
  return doc.heightOfString(text, { width, lineGap: 0.4 }) + 1
}

function packLines(doc, lines, fontSize, width, maxHeight) {
  const packed = []
  let used = 0
  for (let index = 0; index < lines.length; index += 1) {
    const height = measure(doc, lines[index], fontSize, width)
    if (used + height > maxHeight + 0.5) {
      return { packed, rest: lines.slice(index) }
    }
    packed.push({ text: lines[index], height })
    used += height
  }
  return { packed, rest: [] }
}

function chooseFit(doc, lines, width, maxHeight) {
  for (const size of FONT_SIZES) {
    const attempt = packLines(doc, lines, size, width, maxHeight)
    if (!attempt.rest.length) return { size, ...attempt }
  }
  const size = FONT_SIZES[FONT_SIZES.length - 1]
  return { size, ...packLines(doc, lines, size, width, maxHeight) }
}

function drawQr(doc, png, x, y, size) {
  if (png) {
    doc.image(png, x, y, { width: size, height: size })
    return
  }
  doc.font('Helvetica').fontSize(8).fillColor('#6b7280')
  doc.text('No QR code', x, y + size / 2 - 6, { width: size, height: 12, align: 'center', ellipsis: true })
  doc.fillColor('#111827')
}

function drawLines(doc, packed, fontSize, x, y, width) {
  let cursor = y
  doc.fillColor('#111827').font('Helvetica').fontSize(fontSize)
  for (const line of packed) {
    const lineHeight = Math.max(line.height, fontSize + 1)
    doc.text(line.text, x, cursor, {
      width,
      height: lineHeight,
      lineGap: 0.4,
      ellipsis: true,
    })
    cursor += line.height
  }
}

function labelSlot(labelW, labelH) {
  const margin = Math.min(labelW, labelH) < mmToPt(16) ? mmToPt(0.45) : mmToPt(1)
  const innerH = Math.max(0, labelH - margin * 2)
  const innerW = Math.max(0, labelW - margin * 2)
  const gap = Math.max(mmToPt(1), innerW * 0.035)
  const qrSize = Math.min(innerH, innerW * 0.46)
  const textX = margin + qrSize + gap
  return {
    margin,
    qrSize,
    qrX: margin,
    qrY: margin + Math.max(0, (innerH - qrSize) / 2),
    textX,
    textW: Math.max(0, labelW - margin - textX),
    textH: innerH,
  }
}

function drawLabel(doc, { png, lines }, x, y, width, height, slot) {
  doc.save()
  doc.rect(x, y, width, height).clip()
  doc.lineWidth(0.6).strokeColor('#111827').rect(x, y, width, height).stroke()
  drawQr(doc, png, x + slot.qrX, y + slot.qrY, slot.qrSize)
  const packed = slot.textH < mmToPt(4)
    ? { size: 4, packed: [] }
    : chooseFit(doc, lines, slot.textW, slot.textH)
  const blockH = packed.packed.reduce((sum, line) => sum + line.height, 0)
  const textY = y + slot.margin + Math.max(0, (slot.textH - blockH) / 2)
  drawLines(doc, packed.packed, packed.size, x + slot.textX, textY, slot.textW)
  doc.restore()
}

const HEADING_MM = [7, 6]

function drawHeading(doc, text, y, pageWidth, height, level) {
  const pad = mmToPt(3 + level * 3)
  doc.save()
  doc.rect(0, y, pageWidth, height).fill(level === 0 ? '#e8edf3' : '#f4f6f8')
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(level === 0 ? 11 : 9)
  doc.text(text, pad, y + mmToPt(1.4), {
    width: Math.max(0, pageWidth - pad * 2),
    height: Math.max(height - mmToPt(1.6), mmToPt(3)),
    lineBreak: false,
    ellipsis: true,
  })
  doc.restore()
}

async function qrPng(value) {
  const text = String(value || '').trim()
  if (!text) return null
  return QRCode.toBuffer(text, {
    type: 'png',
    width: 480,
    margin: 1,
    errorCorrectionLevel: 'M',
  })
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      out[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return out
}

export async function buildEquipmentLabelPdf(items, paper, label) {
  const pageWidth = mmToPt(paper.width_mm)
  const pageHeight = mmToPt(paper.height_mm)
  const labelW = mmToPt(label.width_mm)
  const labelH = mmToPt(label.height_mm)
  const cols = Math.max(1, Math.floor((paper.width_mm + 0.05) / label.width_mm))
  const rows = Math.max(1, Math.floor((paper.height_mm + 0.05) / label.height_mm))
  const gapX = mmToPt(Math.max(0, paper.width_mm - cols * label.width_mm) / (cols + 1))
  const gapY = mmToPt(Math.max(0, paper.height_mm - rows * label.height_mm) / (rows + 1))
  const slot = labelSlot(labelW, labelH)
  const labels = items.filter((item) => item.kind === 'label')
  const qrCache = new Map()
  const pngs = await mapPool(labels, 8, (record) => {
    const key = String(record.qrValue || '')
    if (!qrCache.has(key)) qrCache.set(key, qrPng(record.qrValue))
    return qrCache.get(key)
  })
  const doc = new PDFDocument({ autoFirstPage: false, margin: 0 })
  const chunks = []
  const done = new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  let pageOpen = false
  let cursorY = 0
  let col = 0
  let pngIndex = 0

  const newPage = () => {
    doc.addPage({ size: [pageWidth, pageHeight], margin: 0 })
    pageOpen = true
    cursorY = gapY
    col = 0
  }
  const roomFor = (height) => pageOpen && cursorY + height <= pageHeight - gapY + 0.4
  const labelX = (column) => gapX + column * (labelW + gapX)

  items.forEach((item) => {
    if (item.kind === 'heading') {
      const headingH = mmToPt(HEADING_MM[Math.min(item.level || 0, HEADING_MM.length - 1)])
      if (headingH + labelH + gapY > pageHeight + 0.4) return
      if (col > 0) {
        cursorY += labelH + gapY
        col = 0
      }
      if (!roomFor(headingH + gapY + labelH)) newPage()
      drawHeading(doc, item.text, cursorY, pageWidth, headingH, item.level || 0)
      cursorY += headingH + gapY
      return
    }
    if (col >= cols) {
      cursorY += labelH + gapY
      col = 0
    }
    if (col === 0 && !roomFor(labelH)) newPage()
    const png = pngs[pngIndex]
    pngIndex += 1
    drawLabel(doc, { png, lines: item.lines }, labelX(col), cursorY, labelW, labelH, slot)
    col += 1
  })
  if (!pageOpen) doc.addPage({ size: [pageWidth, pageHeight], margin: 0 })
  doc.end()
  return done
}
