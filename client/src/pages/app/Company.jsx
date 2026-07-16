import { useMemo, useState } from 'react'
import { usePermissions } from '../../hooks/usePermissions'
import CompanyDetailsTab from '../../components/company/CompanyDetailsTab'
import LocationsTab from '../../components/company/LocationsTab'
import DepartmentsTab from '../../components/company/DepartmentsTab'
import EmployeesTab from '../../components/company/EmployeesTab'
import './Company.css'

const ALL_TABS = [
  { id: 'details', label: 'Company Details', moduleKey: 'company', manage: 'update' },
  { id: 'locations', label: 'Locations', moduleKey: 'locations', manage: 'crud' },
  { id: 'departments', label: 'Departments', moduleKey: 'departments', manage: 'crud' },
  { id: 'employees', label: 'Employees', moduleKey: 'employees', manage: 'crud' },
]

function canManageTab(tab, { canCreate, canUpdate, canDelete }) {
  if (tab.manage === 'update') return canUpdate(tab.moduleKey)
  return canCreate(tab.moduleKey) || canUpdate(tab.moduleKey) || canDelete(tab.moduleKey)
}

export default function Company() {
  const { loading, canRead, canUpdate, canCreate, canDelete } = usePermissions()

  const tabs = useMemo(
    () => ALL_TABS.filter((tab) => canRead(tab.moduleKey)),
    [canRead],
  )
  const [activeTab, setActiveTab] = useState(() => tabs[0]?.id || 'details')

  const visibleTab = tabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : (tabs[0]?.id || 'details')

  const activeTabConfig = tabs.find((tab) => tab.id === visibleTab)
  const canManageActive = activeTabConfig
    ? canManageTab(activeTabConfig, { canCreate, canUpdate, canDelete })
    : false

  if (loading) {
    return (
      <div className="company-page">
        <div className="company-loading">Loading...</div>
      </div>
    )
  }

  if (!tabs.length) {
    return (
      <div className="company-page">
        <div className="company-empty">You do not have permission to view company data.</div>
      </div>
    )
  }

  return (
    <div className="company-page">
      <header className="company-page__header">
        <h1 className="company-page__title">Company</h1>
        <p className="company-page__subtitle">Manage your organization settings, sites, departments, and employees</p>

        <nav className="company-tabs" aria-label="Company sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`company-tabs__btn ${visibleTab === tab.id ? 'company-tabs__btn--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="company-page__content">
        {!canManageActive && (
          <p className="company-readonly-note">
            You have read-only access. Contact a company admin to make changes.
          </p>
        )}

        {visibleTab === 'details' && <CompanyDetailsTab canManage={canManageActive} />}
        {visibleTab === 'locations' && <LocationsTab canManage={canManageActive} />}
        {visibleTab === 'departments' && <DepartmentsTab canManage={canManageActive} />}
        {visibleTab === 'employees' && <EmployeesTab canManage={canManageActive} />}
      </div>
    </div>
  )
}
