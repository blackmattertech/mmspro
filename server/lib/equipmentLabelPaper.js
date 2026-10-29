export const LABEL_CAP = 500
export const COPY_MAX = 10
export const OUTPUT_CAP = 2000

export const PAPER_PRESETS = [
  { id: 'label-1.25x0.5', label: '1.25" x 0.5"', width_mm: 31.75, height_mm: 12.7, group: 'label' },
  { id: 'label-1.25x0.75', label: '1.25" x 0.75"', width_mm: 31.75, height_mm: 19.05, group: 'label' },
  { id: 'label-1.25x1', label: '1.25" x 1.0"', width_mm: 31.75, height_mm: 25.4, group: 'label' },
  { id: 'label-1.5x1', label: '1.5" x 1.0"', width_mm: 38.1, height_mm: 25.4, group: 'label' },
  { id: 'label-1.625x1.25', label: '1.625" x 1.25"', width_mm: 41.275, height_mm: 31.75, group: 'label' },
  { id: 'label-1.75x0.75', label: '1.75" x 0.75"', width_mm: 44.45, height_mm: 19.05, group: 'label' },
  { id: 'label-2x1', label: '2.0" x 1.0"', width_mm: 50.8, height_mm: 25.4, group: 'label' },
  { id: 'label-2.25x1.25', label: '2.25" x 1.25"', width_mm: 57.15, height_mm: 31.75, group: 'label' },
  { id: 'label-2.625x1', label: '2.625" x 1.0"', width_mm: 66.675, height_mm: 25.4, group: 'label' },
  { id: 'standard', label: 'Standard (100 × 150 mm)', width_mm: 100, height_mm: 150, group: 'sheet' },
  { id: 'a5', label: 'A5', width_mm: 148, height_mm: 210, group: 'sheet' },
  { id: 'a4', label: 'A4', width_mm: 210, height_mm: 297, group: 'sheet' },
  { id: 'letter', label: 'Letter (8.5" × 11")', width_mm: 215.9, height_mm: 279.4, group: 'sheet' },
  { id: 'a3', label: 'A3', width_mm: 297, height_mm: 420, group: 'sheet' },
]

const MM_PER_INCH = 25.4

export function mmToPt(mm) {
  return (Number(mm) * 72) / MM_PER_INCH
}

export function toMillimetres(value, unit) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  const mm = String(unit || 'mm').toLowerCase() === 'in' ? n * MM_PER_INCH : n
  return Math.round(mm * 10) / 10
}

export function assertMillimetreSize(widthMm, heightMm) {
  if (
    !Number.isFinite(widthMm)
    || !Number.isFinite(heightMm)
    || widthMm < 20
    || widthMm > 500
    || heightMm < 20
    || heightMm > 500
  ) {
    const err = new Error('Width and height must be between 20 and 500 mm')
    err.status = 400
    throw err
  }
}

export function paperFromPreset(presetId) {
  return PAPER_PRESETS.find((preset) => preset.id === presetId) || null
}

export function isSmallPaper(widthMm, heightMm) {
  return Math.min(Number(widthMm) || 0, Number(heightMm) || 0) < 70
}

export function fitCount(outerMm, innerMm) {
  const outer = Number(outerMm)
  const inner = Number(innerMm)
  if (!Number.isFinite(outer) || !Number.isFinite(inner) || inner <= 0) return 0
  return Math.floor((outer + 0.05) / inner)
}

export function assertLabelFitsPaper(label, paper) {
  const across = fitCount(paper?.width_mm, label?.width_mm)
  const down = fitCount(paper?.height_mm, label?.height_mm)
  if (across < 1 || down < 1) {
    const err = new Error('The label is larger than the paper. Choose a smaller label or a larger paper.')
    err.status = 400
    throw err
  }
  return { across, down }
}
