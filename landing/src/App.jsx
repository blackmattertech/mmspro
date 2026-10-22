import { useEffect, useRef, useState } from 'react'

const INTERVALS = {
  trial: 'Trial',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half yearly',
  yearly: 'Yearly',
  custom: 'Custom',
}

const STATUS_COPY = {
  ACTIVE: 'Payment was not completed.',
  EXPIRED: 'This checkout has expired.',
}

function paymentMessage(order) {
  if (order.status !== 'PAID') {
    return STATUS_COPY[order.status] || `Payment status: ${order.status || 'unknown'}.`
  }
  if (order.welcomeEmailSent) {
    return 'Payment received. We emailed your login and a temporary password. Sign in and change it from your profile.'
  }
  if (order.welcomePending) {
    return 'Payment received. Your login email is on the way.'
  }
  if (order.welcomeEmailError) {
    return `Payment received. The login email could not be sent. ${order.welcomeEmailError}`
  }
  return 'Payment received.'
}

function formatPrice(price, currency = 'INR') {
  if (price == null || price === '') return 'Free'
  const amount = Number(price)
  if (!Number.isFinite(amount)) return 'Free'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatValidity(days) {
  const count = Number(days)
  if (!Number.isFinite(count)) return ''
  return `${count} day${count === 1 ? '' : 's'}`
}

function canPay(plan) {
  return plan.is_active !== false && Number(plan.price) >= 1
}

function loadCashfree() {
  if (window.Cashfree) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load Cashfree checkout.'))
    document.head.appendChild(script)
  })
}

function reportDroppedCheckout(orderId, reason) {
  if (!orderId) return Promise.resolve()
  return fetch(`/api/public/plans/orders/${encodeURIComponent(orderId)}/dropped`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason: reason || '' }),
  }).catch(() => {})
}

async function openCheckout(plan, company) {
  const response = await fetch(`/api/public/plans/${plan.id}/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(company),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Could not start checkout.')
  await loadCashfree()
  const cashfree = window.Cashfree({
    mode: body.environment === 'production' ? 'production' : 'sandbox',
  })
  const result = await cashfree.checkout({
    paymentSessionId: body.paymentSessionId,
    redirectTarget: '_self',
  })
  if (result?.error) {
    const message = result.error.message || 'Cashfree checkout could not open.'
    await reportDroppedCheckout(body.orderId, message)
    throw new Error(message)
  }
}

const EMPTY_COMPANY = {
  companyName: '',
  contactName: '',
  email: '',
  phone: '',
  website: '',
  taxId: '',
  addressLine1: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
}

function CompanySignup({ selectedPlan, onSelectPlan }) {
  const [form, setForm] = useState(EMPTY_COMPANY)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const sectionRef = useRef(null)

  useEffect(() => {
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selectedPlan?.id])

  const setField = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }))
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!selectedPlan || !canPay(selectedPlan)) {
      setError('Choose a plan before continuing.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await openCheckout(selectedPlan, form)
    } catch (err) {
      setError(err.message || 'Could not open checkout.')
      setBusy(false)
    }
  }

  return (
    <section className="signup" id="company-signup" ref={sectionRef} aria-labelledby="signup-title">
      <div className="signup__copy">
        <h2 id="signup-title">Create your company</h2>
        <p>Tell us about the company, then pay. We email your login and a temporary password after the payment is received.</p>
        {selectedPlan ? (
          <p className="signup__plan">
            Selected plan: <strong>{selectedPlan.name}</strong>
            <button type="button" onClick={() => onSelectPlan(null)}>Clear</button>
          </p>
        ) : null}
      </div>

      {error ? <p className="landing__alert signup__alert" role="alert">{error}</p> : null}

      <form className="signup__form" onSubmit={submit}>
        <label>
          Company name
          <input value={form.companyName} onChange={setField('companyName')} required maxLength={120} autoComplete="organization" />
        </label>
        <label>
          Your name
          <input value={form.contactName} onChange={setField('contactName')} required maxLength={80} autoComplete="name" />
        </label>
        <label>
          Work email
          <input type="email" value={form.email} onChange={setField('email')} required maxLength={254} autoComplete="email" />
        </label>
        <label>
          Mobile
          <input value={form.phone} onChange={setField('phone')} required inputMode="tel" autoComplete="tel" placeholder="+919876543210" />
          <span>Include the country code, for example +91.</span>
        </label>
        <label>
          Website
          <input value={form.website} onChange={setField('website')} inputMode="url" autoComplete="url" placeholder="www.example.com" />
        </label>
        <label>
          Tax ID / GSTIN
          <input value={form.taxId} onChange={setField('taxId')} maxLength={32} />
        </label>
        <label className="signup__wide">
          Address
          <input value={form.addressLine1} onChange={setField('addressLine1')} maxLength={200} autoComplete="street-address" />
        </label>
        <label>
          City
          <input value={form.city} onChange={setField('city')} maxLength={80} autoComplete="address-level2" />
        </label>
        <label>
          State
          <input value={form.state} onChange={setField('state')} maxLength={80} autoComplete="address-level1" />
        </label>
        <label>
          Postal code
          <input value={form.postalCode} onChange={setField('postalCode')} maxLength={16} autoComplete="postal-code" />
        </label>
        <label>
          Country
          <input value={form.country} onChange={setField('country')} maxLength={80} autoComplete="country-name" />
        </label>
        <button type="submit" className="plan-card__pay signup__submit" disabled={busy}>
          {busy ? 'Opening Cashfree…' : 'Continue to payment'}
        </button>
      </form>
    </section>
  )
}

function PlansPage() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedPlan, setSelectedPlan] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/public/plans')
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'Could not load plans.')
        return body.plans || []
      })
      .then((next) => {
        if (!cancelled) setPlans(next)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load plans.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const choosePlan = (plan) => {
    if (!canPay(plan)) return
    setSelectedPlan(plan)
    setError('')
  }

  return (
    <main className="landing">
      <header className="landing__intro">
        <p className="landing__mark">MMS PRO</p>
        <h1>Plans</h1>
        <p className="landing__note">Choose a plan, then add your company details. We email a temporary password after payment.</p>
      </header>

      {error ? <p className="landing__alert" role="alert">{error}</p> : null}

      {loading ? <p className="landing__status">Loading plans…</p> : null}

      {!loading && !plans.length ? (
        <p className="landing__status">No plans yet. Create them from the Super Admin plans page.</p>
      ) : null}

      <section className="plan-grid" aria-label="Plans">
        {plans.map((plan) => {
          const payable = canPay(plan)
          return (
            <article key={plan.id} className={`plan-card${plan.is_active === false ? ' is-inactive' : ''}${selectedPlan?.id === plan.id ? ' is-selected' : ''}`}>
              <p className="plan-card__type">{INTERVALS[plan.interval_type] || plan.interval_type}</p>
              <h2>{plan.name}</h2>
              <p className="plan-card__price">{formatPrice(plan.price, plan.currency)}</p>
              <p className="plan-card__validity">{formatValidity(plan.duration_days)}</p>
              {plan.description ? <p className="plan-card__description">{plan.description}</p> : null}
              {plan.is_active === false ? <p className="plan-card__inactive">Not available</p> : null}
              <button
                type="button"
                className="plan-card__pay"
                disabled={!payable}
                onClick={() => choosePlan(plan)}
              >
                {payable ? 'Choose this Plan' : 'No payment'}
              </button>
            </article>
          )
        })}
      </section>

      {selectedPlan ? (
        <CompanySignup selectedPlan={selectedPlan} onSelectPlan={setSelectedPlan} />
      ) : null}
    </main>
  )
}

function ReturnPage() {
  const orderId = new URLSearchParams(window.location.search).get('order_id') || ''
  const [message, setMessage] = useState('Checking payment…')

  useEffect(() => {
    if (!/^[A-Za-z0-9_-]{3,45}$/.test(orderId)) {
      setMessage('This payment link is missing an order.')
      return undefined
    }
    let cancelled = false
    fetch(`/api/public/plans/orders/${encodeURIComponent(orderId)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'Could not confirm the payment.')
        return body
      })
      .then((order) => {
        if (!cancelled) setMessage(paymentMessage(order))
      })
      .catch((err) => {
        if (!cancelled) setMessage(err.message || 'Could not confirm the payment.')
      })
    return () => { cancelled = true }
  }, [orderId])

  return (
    <main className="landing">
      <header className="landing__intro">
        <p className="landing__mark">MMS PRO</p>
        <h1>Checkout</h1>
        <p className="landing__note">{message}</p>
        <a className="plan-card__pay landing__back" href="/">Back to plans</a>
      </header>
    </main>
  )
}

export default function App() {
  if (window.location.pathname === '/return') return <ReturnPage />
  return <PlansPage />
}
