import { apiFetch } from './api'

export function getMyProfile() {
  return apiFetch('/api/profile/me')
}

export function updateMyProfile(data) {
  return apiFetch('/api/profile/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function getMyEmployee() {
  return apiFetch('/api/profile/employee')
}

export function updateMyEmployee(data) {
  return apiFetch('/api/profile/employee', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}
