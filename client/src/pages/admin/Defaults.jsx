import { useEffect, useState } from 'react'
import PageBack from '../../components/shared/PageBack'
import NavIcon from '../../components/layout/NavIcon'
import {
  getAdminDefaultForms,
  getAdminDefaultHierarchies,
  markAdminDefaultForm,
  markAdminDefaultHierarchy,
} from '../../lib/api-admin-defaults'
import '../../components/company/CompanyShared.css'
import '../../components/admin/OrgConfigureModal.css'
import './AdminPage.css'
import './Defaults.css'

const HOME_CARDS = [
  {
    id: 'forms',
    label: 'Forms',
    text: 'Unique forms already built for any company. Mark one of each as the default.',
    icon: 'document',
  },
  {
    id: 'hierarchy',
    label: 'Asset Hierarchy',
    text: 'Unique asset hierarchies from any company. Mark one as the default.',
    icon: 'list',
  },
]

function companyList(orgs) {
  if (!orgs?.length) return 'No companies'
  if (orgs.length <= 3) return orgs.map((org) => org.name).join(', ')
  return `${orgs.slice(0, 3).map((org) => org.name).join(', ')} and ${orgs.length - 3} more`
}

function VariantCard({ title, text, orgs, isDefault, busy, onMark }) {
  return (
    <article className={`defaults-variant ${isDefault ? 'defaults-variant--default' : ''}`}>
      <div className="defaults-variant__copy">
        <div className="defaults-variant__title-row">
          <h4>{title}</h4>
          {isDefault ? <span className="defaults-badge">Default</span> : null}
        </div>
        {text ? <p className="defaults-variant__text">{text}</p> : null}
        <p className="defaults-variant__orgs">{companyList(orgs)}</p>
      </div>
      <button
        type="button"
        className="company-btn company-btn--secondary company-btn--compact"
        disabled={busy || isDefault}
        onClick={onMark}
      >
        {busy ? 'Saving…' : isDefault ? 'Default' : 'Mark as default'}
      </button>
    </article>
  )
}

export default function Defaults() {
  const [screen, setScreen] = useState('home')
  const [forms, setForms] = useState([])
  const [hierarchies, setHierarchies] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [marking, setMarking] = useState('')

  const loadForms = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getAdminDefaultForms()
      setForms(data?.modules || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadHierarchies = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getAdminDefaultHierarchies()
      setHierarchies(data?.variants || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (screen === 'forms') loadForms()
    if (screen === 'hierarchy') loadHierarchies()
  }, [screen])

  const title = screen === 'forms'
    ? 'Forms'
    : screen === 'hierarchy'
      ? 'Asset Hierarchy'
      : 'Default'

  const markForm = async (formId, sourceOrgId, fingerprint) => {
    if (!window.confirm('Use this form as the default for every company that does not have its own?')) return
    setMarking(fingerprint)
    setError('')
    try {
      await markAdminDefaultForm(formId, sourceOrgId)
      await loadForms()
    } catch (err) {
      setError(err.message)
    } finally {
      setMarking('')
    }
  }

  const markHierarchy = async (sourceOrgId, fingerprint) => {
    if (!window.confirm('Use this hierarchy as the default for every company that does not have its own?')) return
    setMarking(fingerprint)
    setError('')
    try {
      await markAdminDefaultHierarchy(sourceOrgId)
      await loadHierarchies()
    } catch (err) {
      setError(err.message)
    } finally {
      setMarking('')
    }
  }

  return (
    <div className="admin-page defaults-page">
      <div className="admin-page__header">
        <div>
          {screen !== 'home' ? (
            <PageBack onClick={() => setScreen('home')} label="Default" />
          ) : null}
          <h1 className="admin-page__title">{title}</h1>
          <p className="admin-page__subtitle">
            {screen === 'home'
              ? 'Choose the forms and asset hierarchy used until a company has its own.'
              : 'Unique items already created. Mark one as the platform default.'}
          </p>
        </div>
      </div>
      <div className="admin-page__content">
        {error ? <div className="company-error">{error}</div> : null}

        {screen === 'home' && (
          <div className="org-configure-cards defaults-home-cards">
            {HOME_CARDS.map((card) => (
              <button
                key={card.id}
                type="button"
                className="org-configure-card"
                onClick={() => setScreen(card.id)}
              >
                <span className="org-configure-card__icon" aria-hidden="true">
                  <NavIcon name={card.icon} />
                </span>
                <span className="org-configure-card__copy">
                  <span className="org-configure-card__title">{card.label}</span>
                  <span className="org-configure-card__text">{card.text}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {screen === 'forms' && (
          <div className="defaults-list">
            {loading ? <p className="company-empty">Loading forms…</p> : null}
            {!loading && !forms.some((module) => module.forms?.some((form) => form.variants?.length)) ? (
              <p className="company-empty">No company forms have been saved yet. Build one from Configure on a company.</p>
            ) : null}
            {forms.map((module) => (
              <section key={module.moduleId} className="defaults-module">
                <h2>{module.label}</h2>
                {module.forms.map((form) => (
                  <div key={form.formId} className="defaults-form">
                    <h3>{form.label}</h3>
                    {!form.variants?.length ? (
                      <p className="defaults-empty">No saved layouts for this form yet.</p>
                    ) : (
                      form.variants.map((variant) => (
                        <VariantCard
                          key={variant.fingerprint}
                          title={`${variant.summary?.field_count || 0} fields`}
                          text={variant.summary?.catalog_names?.length
                            ? variant.summary.catalog_names.join(', ')
                            : `${variant.summary?.section_count || 0} sections`}
                          orgs={variant.orgs}
                          isDefault={variant.isDefault}
                          busy={marking === variant.fingerprint}
                          onMark={() => markForm(form.formId, variant.source_org_id, variant.fingerprint)}
                        />
                      ))
                    )}
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}

        {screen === 'hierarchy' && (
          <div className="defaults-list">
            {loading ? <p className="company-empty">Loading hierarchies…</p> : null}
            {!loading && !hierarchies.length ? (
              <p className="company-empty">No asset hierarchies have been created yet. Add one from Configure on a company.</p>
            ) : null}
            {hierarchies.map((variant) => (
              <VariantCard
                key={variant.fingerprint}
                title={variant.label}
                text={`${variant.parent_count} level${variant.parent_count === 1 ? '' : 's'}`}
                orgs={variant.orgs}
                isDefault={variant.isDefault}
                busy={marking === variant.fingerprint}
                onMark={() => markHierarchy(variant.source_org_id, variant.fingerprint)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
