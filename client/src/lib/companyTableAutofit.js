const INTERACTIVE = 'a,button,input,select,textarea,label,[role="button"],.company-table__truncated'

/**
 * Global click-to-expand for plain text overflowing in .company-table cells.
 * Cells that already use TruncatedText handle their own toggle.
 */
export function installCompanyTableAutofit() {
  if (typeof document === 'undefined') return () => {}

  const onClick = (event) => {
    if (event.target.closest(INTERACTIVE)) return
    const td = event.target.closest('.company-table tbody td')
    if (!td || td.closest('.company-table--no-autofit')) return
    if (td.querySelector('.company-table__truncated, .wo-progress, .company-table__cell--check input')) {
      return
    }
    const overflows = td.scrollWidth > td.clientWidth + 1
      || [...td.querySelectorAll('*')].some((node) => node.scrollWidth > node.clientWidth + 1)
    if (!overflows && !td.classList.contains('is-expanded')) return
    td.classList.toggle('is-expanded')
  }

  document.addEventListener('click', onClick)
  return () => document.removeEventListener('click', onClick)
}
