import { useState } from 'react'
import { useOrg } from '../../hooks/useOrg'
import CompanyDetailsTab from '../../components/company/CompanyDetailsTab'
import LocationsTab from '../../components/company/LocationsTab'
import DepartmentsTab from '../../components/company/DepartmentsTab'
import DesignationsTab from '../../components/company/DesignationsTab'
import EmployeesTab from '../../components/company/EmployeesTab'
import './Company.css'

const TABS = [
  { id: 'details', label: 'Company Details' },
  { id: 'locations', label: 'Locations' },
  { id: 'departments', label: 'Departments' },
  { id: 'designations', label: 'Designations' },
  { id: 'employees', label: 'Employees' },
]

export default function Company() {
  const [activeTab, setActiveTab] = useState('details')
  const { orgRole, loading } = useOrg()
  const canManage = orgRole === 'owner' || orgRole === 'admin'

  if (loading) {
    return (
      <div className="company-page">
        <div className="company-loading">Loading...</div>
      </div>
    )
  }

  return (
    <div className="company-page">
      <header className="company-page__header">
        <h1 className="company-page__title">Company</h1>
        <p className="company-page__subtitle">Manage your organization settings, sites, departments, designations, and employees</p>

        <nav className="company-tabs" aria-label="Company sections">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`company-tabs__btn ${activeTab === tab.id ? 'company-tabs__btn--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="company-page__content">
        {!canManage && (
          <p className="company-readonly-note">
            You have read-only access. Contact an owner or admin to make changes.
          </p>
        )}

        {activeTab === 'details' && <CompanyDetailsTab canManage={canManage} />}
        {activeTab === 'locations' && <LocationsTab canManage={canManage} />}
        {activeTab === 'departments' && <DepartmentsTab canManage={canManage} />}
        {activeTab === 'designations' && <DesignationsTab canManage={canManage} />}
        {activeTab === 'employees' && <EmployeesTab canManage={canManage} />}
      </div>
    </div>
  )
}
