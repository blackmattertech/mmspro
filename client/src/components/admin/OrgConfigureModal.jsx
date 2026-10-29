import { useState, useEffect, lazy, Suspense } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useAdminEquipmentFields } from '../../hooks/useAdminEquipmentFields'
import { updateOrganization } from '../../lib/api'
import {
  PRODUCT_MODULE_GROUPS,
  isProductModuleEnabled,
  normalizeDisabledModules,
} from '../../lib/orgModules'
import PageBack from '../shared/PageBack'
import NavIcon from '../layout/NavIcon'
import EquipmentMasterFields from './EquipmentMasterFields'
import GooToggle from '../ui/GooToggle'
import '../company/CompanyShared.css'
import './CreateOrgModal.css'
import './OrgConfigureModal.css'

const FormBuilderPanel = lazy(() => import('./FormBuilderPanel'))

const HOME_CARDS = [
  {
    id: 'forms',
    label: 'Form Builder',
    text: 'Arrange the fields on each company form.',
    icon: 'document',
  },
  {
    id: 'masters',
    label: 'Masters',
    text: 'Asset fields used when this company creates assets.',
    icon: 'list',
  },
  {
    id: 'modules',
    label: 'Modules',
    text: 'Choose which modules this company can use.',
    icon: 'shieldLock',
  },
]

const MASTER_CARDS = [
  {
    id: 'equipment',
    label: 'Assets',
    text: 'Fields and options saved on each asset record.',
    icon: 'washer',
  },
]

function OrgAvatar({ org }) {
  const letter = (org?.name?.[0] || 'O').toUpperCase()

  if (org?.logo_signed_url) {
    return <img src={org.logo_signed_url} alt="" className="org-configure-modal__avatar" />
  }

  return (
    <span className="org-configure-modal__avatar org-configure-modal__avatar--fallback" aria-hidden="true">
      {letter}
    </span>
  )
}

export default function OrgConfigureModal({ org, onClose, onOrgUpdated }) {
  const [screen, setScreen] = useState('home')
  const handleBackdropClick = useBackdropClose(onClose)
  const equipmentFieldsState = useAdminEquipmentFields(screen === 'equipment' ? org?.id : null)
  const title = screen === 'forms'
    ? 'Form Builder'
    : screen === 'masters'
      ? 'Masters'
      : screen === 'equipment'
        ? 'Assets'
        : screen === 'modules'
          ? 'Modules'
          : 'Configure'
  const back = screen === 'equipment'
    ? { label: 'Masters', onClick: () => setScreen('masters') }
    : screen === 'home'
      ? { label: 'Organizations', onClick: onClose }
      : { label: 'Configure', onClick: () => setScreen('home') }

  return (
    <div className="admin-modal-overlay" onMouseDown={handleBackdropClick} role="presentation">
      <div
        className="admin-modal org-configure-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="org-configure-title"
      >
        <div className="admin-modal__header org-configure-modal__header">
          <div className="org-configure-modal__header-top">
            <div className="org-configure-modal__heading">
              <PageBack onClick={back.onClick} className="org-configure-modal__back" label={back.label} />
              <div className="org-configure-modal__title-row">
                <OrgAvatar org={org} />
                <div className="org-configure-modal__titles">
                  <h2 id="org-configure-title" className="admin-modal__title">
                    {title}
                  </h2>
                  {org?.name && (
                    <p className="org-configure-modal__org-name">
                      {org.name}
                      {org.slug && <span className="org-configure-modal__slug">/{org.slug}</span>}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <button type="button" className="admin-modal__close" onClick={onClose} aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="org-configure-modal__body">
          {screen === 'home' && (
            <ConfigureCards cards={HOME_CARDS} onOpen={setScreen} />
          )}
          {screen === 'masters' && (
            <ConfigureCards cards={MASTER_CARDS} onOpen={setScreen} />
          )}
          {screen === 'forms' && (
            <Suspense fallback={<p className="company-empty">Loading form builder…</p>}>
              <FormBuilderPanel org={org} />
            </Suspense>
          )}
          {screen === 'modules' && (
            <OrgModulesPanel org={org} onOrgUpdated={onOrgUpdated} />
          )}
          {screen === 'equipment' && (
            <EquipmentMasterFields orgId={org?.id} fieldsState={equipmentFieldsState} />
          )}
        </div>
      </div>
    </div>
  )
}

function ConfigureCards({ cards, onOpen }) {
  return (
    <div className="org-configure-cards">
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          className="org-configure-card"
          onClick={() => onOpen(card.id)}
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
  )
}

function OrgModulesPanel({ org, onOrgUpdated }) {
  const [disabledModules, setDisabledModules] = useState(
    () => normalizeDisabledModules(org?.disabled_modules),
  )
  const [savingId, setSavingId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    setDisabledModules(normalizeDisabledModules(org?.disabled_modules))
  }, [org?.id, org?.disabled_modules])

  const handleToggle = async (moduleId, enabled) => {
    const previous = disabledModules
    const next = enabled
      ? previous.filter((id) => id !== moduleId)
      : [...previous, moduleId]
    const normalized = normalizeDisabledModules(next)
    setDisabledModules(normalized)
    setSavingId(moduleId)
    setError(null)
    try {
      const updated = await updateOrganization(org.id, { disabled_modules: normalized })
      setDisabledModules(normalizeDisabledModules(updated.disabled_modules))
      onOrgUpdated?.(updated)
    } catch (err) {
      setDisabledModules(previous)
      setError(err.message)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="org-modules">
      <p className="org-modules__hint">
        Off hides the module from this company's users, including org admins. Role permissions are kept.
      </p>
      {error && <div className="company-alert">{error}</div>}
      <div className="org-modules__grid">
        {PRODUCT_MODULE_GROUPS.map((group) => (
          <section key={group.id} className="org-modules__group">
            <h3 className="org-modules__group-title">{group.label}</h3>
            <ul className="org-modules__list">
              {group.modules.map((mod) => {
                const enabled = isProductModuleEnabled(disabledModules, mod.id)
                return (
                  <li key={mod.id} className="org-modules__row">
                    <span className="org-modules__label">{mod.label}</span>
                    <GooToggle
                      checked={enabled}
                      disabled={!org?.id || savingId === mod.id}
                      onChange={(checked) => handleToggle(mod.id, checked)}
                      ariaLabel={`${enabled ? 'Disable' : 'Enable'} ${mod.label}`}
                    />
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
