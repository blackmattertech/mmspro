import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import Mailjet from 'node-mailjet'
import { getPublicAppUrl } from '../lib/appUrl.js'
import { resolveEmailConfig } from '../lib/platformIntegrations.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

let passwordResetTemplate = null
try {
  passwordResetTemplate = readFileSync(
    join(__dirname, '../templates/password-reset.html'),
    'utf8'
  )
} catch {
  passwordResetTemplate = null
}

const FROM_NAME_FALLBACK = 'MMS PRO'

let mailjet = null
let mailjetKey = ''

export async function isEmailConfigured() {
  return Boolean(await resolveEmailConfig())
}

async function getMailjetClient() {
  const config = await resolveEmailConfig()
  if (!config) return null
  const key = `${config.apiKey}:${config.secretKey}`
  if (mailjet && mailjetKey === key) return { client: mailjet, config }
  try {
    mailjet = Mailjet.apiConnect(config.apiKey, config.secretKey)
    mailjetKey = key
    return { client: mailjet, config }
  } catch (err) {
    console.warn('Mailjet failed to initialize:', err.message)
    mailjet = null
    mailjetKey = ''
    return null
  }
}

/**
 * Core send function — no-ops when Mailjet is not configured
 */
export const sendEmail = async ({ to, toName, subject, htmlContent, textContent, attachments }) => {
  const ready = await getMailjetClient()
  if (!ready) {
    console.warn(`Email not sent (Mailjet not configured): ${subject} → ${to}`)
    return null
  }
  const { client, config } = ready

  try {
    const payload = {
      From: { Email: config.fromEmail, Name: config.fromName || FROM_NAME_FALLBACK },
      To: [{ Email: to, Name: toName || to }],
      Subject: subject,
      HTMLPart: htmlContent,
      TextPart: textContent || '',
    }
    if (Array.isArray(attachments) && attachments.length) {
      payload.Attachments = attachments.map((file) => ({
        Filename: file.Filename || file.filename || 'attachment',
        ContentType: file.ContentType || file.contentType || 'application/octet-stream',
        Base64Content: file.Base64Content || file.data || '',
      }))
    }

    const response = await client.post('send', { version: 'v3.1' }).request({
      Messages: [payload],
    })

    const message = response?.body?.Messages?.[0]
    if (message?.Status && message.Status !== 'success') {
      console.warn(`Email not sent: ${subject} → ${to}`, JSON.stringify(message.Errors || message))
      return null
    }

    return response.body
  } catch (err) {
    console.warn(`Email not sent: ${subject} → ${to}`, err.message)
    return null
  }
}

// ─────────────────────────────────────────
// Ready-to-use email templates
// ─────────────────────────────────────────

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function actorInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function actorBlockHtml(actor) {
  if (!actor?.name) return ''
  const name = escapeHtml(actor.name)
  const dept = escapeHtml(actor.department || '')
  const photo = actor.photoUrl ? escapeHtml(actor.photoUrl) : ''
  const initials = escapeHtml(actorInitials(actor.name))
  const avatar = photo
    ? `<img src="${photo}" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border-radius:50%;object-fit:cover;border:0;" />`
    : `<div style="width:40px;height:40px;border-radius:50%;background:#E63946;color:#ffffff;font-size:13px;font-weight:700;line-height:40px;text-align:center;font-family:Inter,Arial,Helvetica,sans-serif;">${initials}</div>`

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
      <tr>
        <td width="44" valign="middle" style="width:44px;padding-right:12px;">${avatar}</td>
        <td valign="middle">
          <div style="font-size:14px;font-weight:600;line-height:18px;color:#111111;">${name}</div>
          ${dept ? `<div style="font-size:12px;line-height:16px;color:#6B7280;margin-top:2px;">${dept}</div>` : ''}
        </td>
      </tr>
    </table>
  `
}

function messageBlockHtml(message) {
  if (!message) return ''
  const safe = escapeHtml(message).replace(/\n/g, '<br>')
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
      <tr>
        <td style="padding:12px 14px;background:#f8f9fb;border-left:3px solid #E63946;border-radius:0 8px 8px 0;font-size:14px;line-height:21px;color:#374151;">
          ${safe}
        </td>
      </tr>
    </table>
  `
}

export const sendNotificationEmail = ({
  to,
  toName,
  title,
  body,
  actionUrl,
  actor,
  message,
}) => {
  const summary = String(body || '').trim()
  const quote = String(message || '').trim()
  const safeTitle = escapeHtml(title || 'MMS PRO notification')
  const safeBody = summary && summary !== quote ? escapeHtml(summary) : ''
  const safeUrl = escapeHtml(actionUrl || getPublicAppUrl())
  const preview = [actor?.name, title, quote || summary].filter(Boolean).join(' — ')
  const textLines = [
    title,
    actor?.name && [actor.name, actor.department].filter(Boolean).join(' · '),
    summary && summary !== quote ? summary : null,
    quote,
    actionUrl,
  ].filter(Boolean)

  return sendEmail({
    to,
    toName,
    subject: title || 'MMS PRO notification',
    htmlContent: `
      <div style="margin:0;padding:0;background:#f5f6f8;font-family:Inter,Arial,Helvetica,sans-serif;">
        <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preview)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8edf3;">
                <tr>
                  <td style="padding:20px 28px;background:#ffffff;border-bottom:3px solid #E63946;">
                    <div style="font-size:16px;font-weight:700;color:#111111;">MMS PRO</div>
                    <div style="font-size:12px;color:#6B7280;">Maintenance Solution</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px;">
                    <h1 style="margin:0 0 16px;font-size:20px;line-height:26px;color:#111111;">${safeTitle}</h1>
                    ${actorBlockHtml(actor)}
                    ${safeBody ? `<p style="margin:0 0 16px;font-size:15px;line-height:22px;color:#374151;">${safeBody}</p>` : ''}
                    ${messageBlockHtml(quote)}
                    <a href="${safeUrl}" style="display:inline-block;padding:10px 18px;background:#E63946;color:#ffffff;font-size:14px;font-weight:600;border-radius:8px;">Open in MMS PRO</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 28px 22px;font-size:12px;line-height:18px;color:#9CA3AF;">
                    You received this because you have a work order or work request update in MMS PRO.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `,
    textContent: textLines.join('\n\n'),
  })
}

export const sendInviteEmail = (to, { inviterName, orgName, inviteToken }) => {
  const inviteUrl = `${getPublicAppUrl()}/invite/${inviteToken}`
  return sendEmail({
    to,
    subject: `${inviterName} invited you to join ${orgName} on MMSPro`,
    htmlContent: `
      <h2>You've been invited!</h2>
      <p><strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on MMSPro.</p>
      <p><a href="${inviteUrl}">Accept Invitation →</a></p>
      <p style="color:#999;font-size:12px;">This link expires in 7 days.</p>
    `,
    textContent: `${inviterName} invited you to join ${orgName} on MMSPro. Accept here: ${inviteUrl}`,
  })
}

export const sendPasswordResetEmail = (to, { resetUrl, subject, textContent: textOverride }) => {
  const htmlContent = passwordResetTemplate
    ? passwordResetTemplate.replaceAll('{{RESET_URL}}', resetUrl)
    : `
      <h2>Password Reset</h2>
      <p>Click the link below to reset your password. This link expires in 1 hour.</p>
      <p><a href="${resetUrl}">Reset Password →</a></p>
      <p style="color:#999;font-size:12px;">If you didn't request this, ignore this email.</p>
    `

  return sendEmail({
    to,
    subject: subject || 'Reset your MMS PRO password',
    htmlContent,
    textContent: textOverride || `Reset your MMS PRO password here: ${resetUrl}`,
  })
}

export const sendOwnerPasswordSetupEmail = (to, { resetUrl, orgName }) =>
  sendPasswordResetEmail(to, {
    resetUrl,
    subject: orgName
      ? `Set up your password for ${orgName} on MMS PRO`
      : 'Set up your MMS PRO password',
    textContent: `Create your MMS PRO password here: ${resetUrl}`,
  })

export const sendEmployeePasswordSetupEmail = (to, { resetUrl, orgName, employeeName }) =>
  sendPasswordResetEmail(to, {
    resetUrl,
    subject: orgName
      ? `Set up your MMS PRO login for ${orgName}`
      : 'Set up your MMS PRO login',
    textContent: employeeName
      ? `Hello ${employeeName},\n\nCreate your MMS PRO password here: ${resetUrl}`
      : `Create your MMS PRO password here: ${resetUrl}`,
  })

function detailRows(lines) {
  return lines
    .filter((line) => line.value)
    .map((line) => `
      <tr>
        <td style="padding:6px 12px 6px 0;font-size:13px;line-height:18px;color:#6B7280;vertical-align:top;">${escapeHtml(line.label)}</td>
        <td style="padding:6px 0;font-size:14px;line-height:18px;color:#111111;font-weight:600;">${escapeHtml(line.value)}</td>
      </tr>
    `)
    .join('')
}

export const sendCheckoutDroppedEmail = (to, { company, planName, amount, currency, orderId, reason }) => {
  const companyName = company?.companyName || 'A company'
  const lines = [
    { label: 'Company', value: company?.companyName },
    { label: 'Contact', value: company?.contactName },
    { label: 'Email', value: company?.email },
    { label: 'Mobile', value: company?.phone },
    { label: 'Website', value: company?.website },
    { label: 'Tax ID', value: company?.taxId },
    { label: 'Address', value: company?.addressLine1 },
    { label: 'City', value: company?.city },
    { label: 'State', value: company?.state },
    { label: 'Postal code', value: company?.postalCode },
    { label: 'Country', value: company?.country },
    { label: 'Plan', value: planName },
    { label: 'Amount', value: amount != null ? `${amount} ${currency || ''}`.trim() : '' },
    { label: 'Order', value: orderId },
  ]
  const text = [
    `Checkout was not completed for ${companyName}.`,
    reason,
    ...lines.filter((line) => line.value).map((line) => `${line.label}: ${line.value}`),
  ].filter(Boolean)

  return sendEmail({
    to,
    subject: `Checkout dropped: ${companyName}`,
    htmlContent: `
      <div style="margin:0;padding:0;background:#f5f6f8;font-family:Inter,Arial,Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8edf3;">
                <tr>
                  <td style="padding:20px 28px;background:#ffffff;border-bottom:3px solid #E63946;">
                    <div style="font-size:16px;font-weight:700;color:#111111;">MMS PRO</div>
                    <div style="font-size:12px;color:#6B7280;">Maintenance Solution</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px;">
                    <h1 style="margin:0 0 12px;font-size:20px;line-height:26px;color:#111111;">Checkout was not completed</h1>
                    <p style="margin:0 0 16px;font-size:15px;line-height:22px;color:#374151;">${escapeHtml(reason || 'The customer did not finish payment.')}</p>
                    <table role="presentation" cellpadding="0" cellspacing="0">${detailRows(lines)}</table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `,
    textContent: text.join('\n'),
  })
}

export const sendCompanyWelcomeEmail = (to, { contactName, companyName, temporaryPassword, loginUrl }) => {
  const safeName = escapeHtml(contactName || 'there')
  const safeCompany = escapeHtml(companyName || 'your company')
  const safeEmail = escapeHtml(to)
  const safePassword = escapeHtml(temporaryPassword)
  const safeUrl = escapeHtml(loginUrl)
  const greeting = contactName ? `Hello ${contactName}` : 'Hello'

  return sendEmail({
    to,
    toName: contactName || to,
    subject: companyName
      ? `Your MMS PRO login for ${companyName}`
      : 'Your MMS PRO login',
    htmlContent: `
      <div style="margin:0;padding:0;background:#f5f6f8;font-family:Inter,Arial,Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8edf3;">
                <tr>
                  <td style="padding:20px 28px;background:#ffffff;border-bottom:3px solid #E63946;">
                    <div style="font-size:16px;font-weight:700;color:#111111;">MMS PRO</div>
                    <div style="font-size:12px;color:#6B7280;">Maintenance Solution</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px;">
                    <h1 style="margin:0 0 12px;font-size:20px;line-height:26px;color:#111111;">Your company is ready</h1>
                    <p style="margin:0 0 16px;font-size:15px;line-height:22px;color:#374151;">Hello ${safeName}, ${safeCompany} now has an MMS PRO account. Sign in with the temporary password below, then change it from your profile.</p>
                    <p style="margin:0 0 6px;font-size:13px;color:#6B7280;">Email</p>
                    <p style="margin:0 0 14px;font-size:15px;font-weight:600;color:#111111;">${safeEmail}</p>
                    <p style="margin:0 0 6px;font-size:13px;color:#6B7280;">Temporary password</p>
                    <p style="margin:0 0 18px;font-size:18px;font-weight:700;letter-spacing:0.04em;color:#111111;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${safePassword}</p>
                    <a href="${safeUrl}" style="display:inline-block;padding:10px 18px;background:#E63946;color:#ffffff;font-size:14px;font-weight:600;border-radius:8px;text-decoration:none;">Sign in</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 28px 22px;font-size:12px;line-height:18px;color:#9CA3AF;">
                    Use this temporary password as your current password when you change it. If you did not request this account, you can ignore this email.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `,
    textContent: [
      `${greeting},`,
      `${companyName || 'Your company'} is ready on MMS PRO.`,
      `Sign in: ${loginUrl}`,
      `Email: ${to}`,
      `Temporary password: ${temporaryPassword}`,
      'After you sign in, open your profile and change this password. Use the temporary password as your current password.',
    ].join('\n\n'),
  })
}

