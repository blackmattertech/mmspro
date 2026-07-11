import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import Mailjet from 'node-mailjet'
import { getPublicAppUrl } from '../lib/appUrl.js'

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

const FROM_EMAIL = process.env.MAILJET_FROM_EMAIL
const FROM_NAME = process.env.MAILJET_FROM_NAME || 'MMSPro'

const isPlaceholder = (value) => !value || /^your_/i.test(value)

export const isEmailConfigured = Boolean(
  process.env.MAILJET_API_KEY &&
  process.env.MAILJET_SECRET_KEY &&
  FROM_EMAIL &&
  !isPlaceholder(process.env.MAILJET_API_KEY) &&
  !isPlaceholder(process.env.MAILJET_SECRET_KEY) &&
  !isPlaceholder(FROM_EMAIL)
)

let mailjet = null

function getMailjetClient() {
  if (!isEmailConfigured) return null
  if (mailjet) return mailjet
  try {
    mailjet = Mailjet.apiConnect(
      process.env.MAILJET_API_KEY,
      process.env.MAILJET_SECRET_KEY
    )
  } catch (err) {
    console.warn('Mailjet failed to initialize:', err.message)
    mailjet = null
  }
  return mailjet
}

/**
 * Core send function — no-ops when Mailjet is not configured
 */
export const sendEmail = async ({ to, toName, subject, htmlContent, textContent }) => {
  const client = getMailjetClient()
  if (!client) {
    console.warn(`Email not sent (Mailjet not configured): ${subject} → ${to}`)
    return null
  }

  try {
    const response = await client.post('send', { version: 'v3.1' }).request({
      Messages: [
        {
          From: { Email: FROM_EMAIL, Name: FROM_NAME },
          To: [{ Email: to, Name: toName || to }],
          Subject: subject,
          HTMLPart: htmlContent,
          TextPart: textContent || '',
        },
      ],
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

export const sendWelcomeEmail = (to, { name, orgName, orgSlug }) => {
  const dashboardUrl = `${getPublicAppUrl()}/${orgSlug}/dashboard`
  return sendEmail({
    to,
    toName: name,
    subject: `Welcome to MMSPro!`,
    htmlContent: `
      <h2>Welcome to MMSPro, ${name}!</h2>
      <p>Your account for <strong>${orgName}</strong> is ready.</p>
      <p><a href="${dashboardUrl}">Go to Dashboard →</a></p>
    `,
    textContent: `Welcome to MMSPro, ${name}! Your account for ${orgName} is ready. Visit: ${dashboardUrl}`,
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

export const sendNotificationEmail = (to, { subject, title, message, ctaText, ctaUrl }) =>
  sendEmail({
    to,
    subject,
    htmlContent: `
      <h2>${title}</h2>
      <p>${message}</p>
      ${ctaText && ctaUrl ? `<p><a href="${ctaUrl}">${ctaText} →</a></p>` : ''}
    `,
    textContent: `${title}\n\n${message}${ctaUrl ? `\n\n${ctaText}: ${ctaUrl}` : ''}`,
  })

