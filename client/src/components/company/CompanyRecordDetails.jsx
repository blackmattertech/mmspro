import { useState } from 'react'
import {
  DetailView,
  DetailSection,
  DetailGrid,
  DetailField,
} from '../shared/DetailView'
import { formatDepartmentLocation } from './DepartmentModal'
import { countryFlag, getCountryByIso, parsePhoneE164 } from '../../lib/countryCodes'
import { isLocationHeadEmployee } from '../../lib/employeeRoles'
import './CompanyShared.css'
import '../shared/DetailView.css'
import './EmployeeDetail.css'

export function LocationDetailContent({ location, employees = [] }) {
  if (!location) return null

  const head = employees.find((employee) => employee.id === location.head_employee_id)

  return (
    <DetailView>
      <DetailSection title="Location">
        <DetailGrid>
          <DetailField label="Name" value={location.name} />
          <DetailField label="Code" value={location.code} />
          <DetailField label="City" value={location.city} />
          <DetailField label="State" value={location.state} />
          <DetailField label="Postal code" value={location.postal_code} />
          <DetailField label="Country" value={location.country} />
          <DetailField label="Address line 1" value={location.address_line1} fullWidth />
          <DetailField label="Address line 2" value={location.address_line2} fullWidth />
          <DetailField label="Location head" value={head?.name} />
          <DetailField label="Primary" value={location.is_primary ? 'Yes' : 'No'} />
          <DetailField label="Status" value={location.is_active === false ? 'Inactive' : 'Active'} />
        </DetailGrid>
      </DetailSection>
    </DetailView>
  )
}

export function DepartmentDetailContent({ department }) {
  if (!department) return null

  return (
    <DetailView>
      <DetailSection title="Department">
        <DetailGrid>
          <DetailField label="Code" value={department.code} />
          <DetailField label="Name" value={department.name} />
          <DetailField label="Location" value={formatDepartmentLocation(department)} />
          <DetailField label="Description" value={department.description} fullWidth />
          <DetailField label="Status" value={department.is_active === false ? 'Inactive' : 'Active'} />
        </DetailGrid>
      </DetailSection>
    </DetailView>
  )
}

const EMPLOYEE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity Log' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'security', label: 'Security' },
]

function formatDetailDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDetailDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function IconPhone() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8.5 4.75H7.2C6.15 4.75 5.25 5.65 5.25 6.7V17.3C5.25 18.35 6.15 19.25 7.2 19.25H16.8C17.85 19.25 18.75 18.35 18.75 17.3V6.7C18.75 5.65 17.85 4.75 16.8 4.75H15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M9.5 4.75C9.5 3.92 10.17 3.25 11 3.25H13C13.83 3.25 14.5 3.92 14.5 4.75V5.75H9.5V4.75Z" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

function IconMail() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.75" y="5.75" width="16.5" height="12.5" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M4.5 7.5L12 12.5L19.5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconBriefcase() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.75" y="8.25" width="16.5" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8.75 8.25V6.75C8.75 5.645 9.645 4.75 10.75 4.75H13.25C14.355 4.75 15.25 5.645 15.25 6.75V8.25" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

function IconPin() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21.25C12 21.25 5.75 14.8 5.75 10.5C5.75 7.05 8.55 4.25 12 4.25C15.45 4.25 18.25 7.05 18.25 10.5C18.25 14.8 12 21.25 12 21.25Z" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="12" cy="10.5" r="2.25" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

function IconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5.75 18.25C6.7 15.7 9.1 14.25 12 14.25C14.9 14.25 17.3 15.7 18.25 18.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.75L19.25 6.5V11.5C19.25 15.7 16.4 19.2 12 20.25C7.6 19.2 4.75 15.7 4.75 11.5V6.5L12 3.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  )
}

function IconLock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5.75" y="10.75" width="12.5" height="8.5" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8.75 10.75V8.5C8.75 6.7 10.2 5.25 12 5.25C13.8 5.25 15.25 6.7 15.25 8.5V10.75" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="7.25" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8.75 12.25L10.9 14.4L15.25 9.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconNote() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7.75 4.75H16.25C17.355 4.75 18.25 5.645 18.25 6.75V17.25C18.25 18.355 17.355 19.25 16.25 19.25H7.75C6.645 19.25 5.75 18.355 5.75 17.25V6.75C5.75 5.645 6.645 4.75 7.75 4.75Z" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8.75 9.25H15.25M8.75 12.25H15.25M8.75 15.25H12.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.75" y="5.75" width="16.5" height="14.5" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M3.75 9.75H20.25M8.25 3.75V6.75M15.75 3.75V6.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function IconBuilding() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.75 20.25V6.75C4.75 5.645 5.645 4.75 6.75 4.75H12.25C13.355 4.75 14.25 5.645 14.25 6.75V20.25" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M14.25 9.75H17.25C18.355 9.75 19.25 10.645 19.25 11.75V20.25" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8.25 8.75H10.75M8.25 12.25H10.75M8.25 15.75H10.75M4.75 20.25H19.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function DetailItem({ icon, label, value, extra, tone, wide = false }) {
  return (
    <div className={`employee-detail__item${wide ? ' employee-detail__item--wide' : ''}`}>
      <span className={`employee-detail__icon${tone ? ` employee-detail__icon--${tone}` : ''}`}>{icon}</span>
      <div className="employee-detail__copy">
        <span className="employee-detail__label">{label}</span>
        <span className="employee-detail__value">{value || '—'}</span>
        {extra}
      </div>
    </div>
  )
}

export function EmployeeDetailContent({ employee, employees = [] }) {
  const [tab, setTab] = useState('overview')
  if (!employee) return null

  const extraEmails = (employee.org_employee_emails || []).map((row) => row.email).filter(Boolean)
  const manager = employee.manager
    || employees.find((row) => row.id === employee.manager_id)
  const isActive = employee.is_active !== false
  const roleName = employee.access_role?.name
  const phoneMeta = employee.mobile ? parsePhoneE164(employee.mobile) : null
  const phoneCountry = phoneMeta ? getCountryByIso(phoneMeta.iso) : null
  const emails = [employee.email, ...extraEmails].filter(Boolean)

  return (
    <DetailView className="employee-detail">
      <div className="employee-detail__tabs" role="tablist" aria-label="Employee details">
        {EMPLOYEE_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`employee-detail__tab${tab === item.id ? ' employee-detail__tab--active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="employee-detail__grid">
            <section className="employee-detail__card">
              <h3 className="employee-detail__card-title"><IconPhone /> Contact Information</h3>
              <div className="employee-detail__rows">
                <DetailItem
                  icon={<IconPhone />}
                  label="Mobile Number"
                  value={employee.mobile && phoneCountry
                    ? `${phoneCountry.dial} ${phoneMeta.national}`
                    : '—'}
                  extra={phoneCountry && (
                    <span className="employee-detail__country">
                      <span aria-hidden="true">{countryFlag(phoneCountry.iso)}</span>
                      {phoneCountry.name}
                    </span>
                  )}
                />
                <DetailItem
                  icon={<IconMail />}
                  label="Email Address"
                  value={emails.join('\n') || '—'}
                />
              </div>
            </section>

            <section className="employee-detail__card">
              <h3 className="employee-detail__card-title"><IconBuilding /> Organization Details</h3>
              <div className="employee-detail__fields">
                <DetailItem icon={<IconUser />} label="Employee ID" value={employee.emp_id} />
                <DetailItem icon={<IconUser />} label="Full Name" value={employee.name} />
                <DetailItem icon={<IconBriefcase />} label="Department" value={employee.departments?.name} />
                <DetailItem icon={<IconPin />} label="Location" value={employee.org_locations?.name} />
                <DetailItem icon={<IconUser />} label="Manager" value={manager?.name} wide />
              </div>
            </section>

            <section className="employee-detail__card">
              <h3 className="employee-detail__card-title"><IconShield /> Access & Login</h3>
              <div className="employee-detail__rows">
                <DetailItem icon={<IconUser />} tone="blue" label="Access Role" value={roleName} />
                <DetailItem
                  icon={<IconLock />}
                  tone="sky"
                  label="Login Requirement"
                  value={employee.login_required ? 'Required' : 'Not required'}
                />
                <DetailItem
                  icon={<IconCheck />}
                  tone="green"
                  label="Status"
                  value={isActive ? 'Active' : 'Inactive'}
                />
              </div>
            </section>

            <section className="employee-detail__card">
              <h3 className="employee-detail__card-title"><IconNote /> Additional Notes</h3>
              <div className="employee-detail__empty">
                <IconNote />
                <p>No additional notes available. Add notes about this employee from Edit to keep track of important information.</p>
              </div>
            </section>
          </div>

          <div className="employee-detail__footer">
            <div className="employee-detail__footer-item">
              <span className="employee-detail__footer-icon"><IconUser /></span>
              <div className="employee-detail__copy">
                <span className="employee-detail__label">Created</span>
                <span className="employee-detail__value">{formatDetailDateTime(employee.created_at)}</span>
              </div>
            </div>
            <div className="employee-detail__footer-item">
              <span className="employee-detail__footer-icon"><IconUser /></span>
              <div className="employee-detail__copy">
                <span className="employee-detail__label">Last updated</span>
                <span className="employee-detail__value">{formatDetailDateTime(employee.updated_at || employee.created_at)}</span>
              </div>
            </div>
            <div className="employee-detail__footer-item">
              <span className="employee-detail__footer-icon"><IconCalendar /></span>
              <div className="employee-detail__copy">
                <span className="employee-detail__label">Member since</span>
                <span className="employee-detail__value">{formatDetailDate(employee.created_at)}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'activity' && (
        <div className="employee-detail__panel">
          <div className="employee-detail__empty">
            <IconNote />
            <p>No activity recorded for this employee yet.</p>
          </div>
        </div>
      )}

      {tab === 'permissions' && (
        <div className="employee-detail__panel">
          <div className="employee-detail__rows">
            <DetailItem icon={<IconUser />} tone="blue" label="Access Role" value={roleName || 'No role assigned'} />
            <DetailItem
              icon={<IconShield />}
              tone="green"
              label="Location Head"
              value={isLocationHeadEmployee(employee) ? 'Yes' : 'No'}
            />
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="employee-detail__panel">
          <div className="employee-detail__rows">
            <DetailItem
              icon={<IconLock />}
              tone="sky"
              label="Login Requirement"
              value={employee.login_required ? 'Required' : 'Not required'}
            />
            <DetailItem
              icon={<IconCheck />}
              tone="green"
              label="Account Status"
              value={isActive ? 'Active' : 'Inactive'}
            />
            <DetailItem icon={<IconMail />} label="Login Email" value={employee.email} />
          </div>
        </div>
      )}
    </DetailView>
  )
}

export function AreaDetailContent({ area }) {
  if (!area) return null

  return (
    <DetailView>
      <DetailSection title="Area">
        <DetailGrid>
          <DetailField label="Name" value={area.name} />
          <DetailField label="Code" value={area.code} />
          <DetailField label="Location" value={area.org_locations?.name} />
          <DetailField label="Department" value={area.departments?.name} />
          <DetailField label="Status" value={area.is_active === false ? 'Inactive' : 'Active'} />
        </DetailGrid>
      </DetailSection>
    </DetailView>
  )
}

export function WorkCenterDetailContent({ workCenter }) {
  if (!workCenter) return null

  return (
    <DetailView>
      <DetailSection title="Work Center">
        <DetailGrid>
          <DetailField label="Name" value={workCenter.name} />
          <DetailField label="Code" value={workCenter.code} />
          <DetailField label="Location" value={workCenter.org_locations?.name || 'All locations'} />
          <DetailField label="Description" value={workCenter.description} fullWidth />
          <DetailField label="Status" value={workCenter.is_active === false ? 'Inactive' : 'Active'} />
        </DetailGrid>
      </DetailSection>
    </DetailView>
  )
}

export function EquipmentDetailContent({ equipment }) {
  if (!equipment) return null

  return (
    <DetailView>
      <DetailSection title="Equipment">
        <DetailGrid>
          <DetailField label="Name" value={equipment.name} />
          <DetailField label="Code" value={equipment.code} />
          <DetailField label="Location" value={equipment.org_locations?.name || equipment.locations?.name} />
          <DetailField label="Department" value={equipment.departments?.name} />
          <DetailField label="Area" value={equipment.areas?.name} />
          <DetailField label="Status" value={equipment.is_active === false ? 'Inactive' : 'Active'} />
        </DetailGrid>
      </DetailSection>
    </DetailView>
  )
}
