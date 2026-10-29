export const WARRANTY_SOON_WINDOW_DAYS = 30

export const WARRANTY_TABS = [
  {
    id: 'in-warranty',
    status: 'in_warranty',
    label: 'In Warranty',
    segment: 'warranty-manager/in-warranty',
    icon: 'shieldLock',
  },
  {
    id: 'out-of-warranty',
    status: 'out_of_warranty',
    label: 'Out of warranty',
    segment: 'warranty-manager/out-of-warranty',
    icon: 'document',
  },
  {
    id: 'soon-to-expired',
    status: 'expiring_soon',
    label: 'Soon to Expired',
    segment: 'warranty-manager/soon-to-expired',
    icon: 'alarmCheck',
  },
  {
    id: 'expired',
    status: 'expired',
    label: 'Expired',
    segment: 'warranty-manager/expired',
    icon: 'calendar',
  },
]

export function isWarrantyTabActive(tabId, pathname) {
  return pathname.includes(`/warranty-manager/${tabId}`)
}

export function getWarrantyActiveTab(pathname) {
  return WARRANTY_TABS.find((tab) => isWarrantyTabActive(tab.id, pathname)) || null
}

export function warrantyTabEmptyHint(tabId, canCreate) {
  const createHint = canCreate ? ' Click "New Warranty" to add one.' : ''
  if (tabId === 'out-of-warranty') {
    return `No records without a warranty end date.${createHint}`
  }
  if (tabId === 'soon-to-expired') {
    return 'No warranties are due to expire in the next 30 days.'
  }
  if (tabId === 'expired') {
    return 'No expired warranties.'
  }
  return `No warranties currently in coverage.${createHint}`
}
