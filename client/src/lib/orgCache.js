const orgCacheByUserId = new Map()

export function getOrgCache(userId) {
  return orgCacheByUserId.get(userId)
}

export function setOrgCache(userId, entry) {
  orgCacheByUserId.set(userId, entry)
}

export function clearOrgCache() {
  orgCacheByUserId.clear()
}
