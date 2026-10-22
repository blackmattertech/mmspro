import { resolveCashfreeConfig } from '../lib/platformIntegrations.js'

function cashfreeBase(environment) {
  return environment === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg'
}

export async function verifyCashfree() {
  const config = await resolveCashfreeConfig()
  if (!config) {
    const error = new Error('Cashfree is not configured.')
    error.status = 400
    throw error
  }
  const response = await fetch(`${cashfreeBase(config.environment)}/orders/mmspro-credential-check`, {
    headers: {
      'x-client-id': config.appId,
      'x-client-secret': config.secretKey,
      'x-api-version': '2023-08-01',
      accept: 'application/json',
    },
  })
  if (response.status === 401 || response.status === 403) {
    const error = new Error('Cashfree rejected the App ID or secret key.')
    error.status = 400
    throw error
  }
  if (!response.ok && response.status !== 404) {
    const error = new Error(`Cashfree check failed (${response.status}).`)
    error.status = 502
    throw error
  }
  return { ok: true, environment: config.environment }
}

export async function getCashfreeOrder(orderId) {
  const config = await resolveCashfreeConfig()
  if (!config) {
    const error = new Error('Cashfree is not configured.')
    error.status = 400
    throw error
  }
  const response = await fetch(`${cashfreeBase(config.environment)}/orders/${encodeURIComponent(orderId)}`, {
    headers: {
      'x-client-id': config.appId,
      'x-client-secret': config.secretKey,
      'x-api-version': '2023-08-01',
      accept: 'application/json',
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body?.message || 'Could not load the Cashfree order.')
    error.status = response.status === 404 ? 404 : 502
    throw error
  }
  return {
    orderId: body.order_id,
    status: body.order_status || '',
    amount: body.order_amount,
    currency: body.order_currency || 'INR',
  }
}

export async function createCashfreeOrder({
  orderId,
  amount,
  currency = 'INR',
  customerId,
  customerEmail,
  customerPhone,
  customerName,
  returnUrl,
}) {
  const config = await resolveCashfreeConfig()
  if (!config) {
    const error = new Error('Cashfree is not configured.')
    error.status = 400
    throw error
  }
  const response = await fetch(`${cashfreeBase(config.environment)}/orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-client-id': config.appId,
      'x-client-secret': config.secretKey,
      'x-api-version': '2023-08-01',
    },
    body: JSON.stringify({
      order_id: orderId,
      order_amount: amount,
      order_currency: currency,
      customer_details: {
        customer_id: customerId,
        customer_phone: customerPhone,
        ...(customerEmail ? { customer_email: customerEmail } : {}),
        ...(customerName ? { customer_name: customerName } : {}),
      },
      order_meta: returnUrl ? { return_url: returnUrl } : undefined,
    }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body?.message || 'Cashfree order could not be created.')
    error.status = response.status
    throw error
  }
  return body
}
