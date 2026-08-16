import { apiFetch } from './api'

export function listNotifications() {
  return apiFetch('/api/notifications')
}

export function markNotificationRead(id) {
  return apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
}

export function markAllNotificationsRead() {
  return apiFetch('/api/notifications/read-all', { method: 'POST' })
}

export function savePushToken(token) {
  return apiFetch('/api/notifications/token', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
}
