import {
  resolveSessionPermissions,
  hasModulePermission,
  hasAnyModulePermission,
} from '../lib/orgPermissions.js'

/**
 * Attach req.orgPermissions (session matrix) for downstream handlers.
 */
export async function loadOrgPermissions(req, _res, next) {
  try {
    if (!req.orgPermissions) {
      req.orgPermissions = await resolveSessionPermissions(req.userProfile)
    }
    next()
  } catch (err) {
    next(err)
  }
}

/**
 * Require a single module action (create|read|update|delete).
 * Org admins always pass. Default deny for everyone else.
 */
export function requireModulePermission(moduleKey, action) {
  return async (req, res, next) => {
    try {
      if (!req.orgPermissions) {
        req.orgPermissions = await resolveSessionPermissions(req.userProfile)
      }
      if (!hasModulePermission(req.orgPermissions, moduleKey, action)) {
        return res.status(403).json({
          error: `You do not have permission to ${action} ${moduleKey.replace(/_/g, ' ')}`,
        })
      }
      next()
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  }
}

/**
 * Require any of several [moduleKey, action] pairs.
 */
export function requireAnyModulePermission(checks) {
  return async (req, res, next) => {
    try {
      if (!req.orgPermissions) {
        req.orgPermissions = await resolveSessionPermissions(req.userProfile)
      }
      if (!hasAnyModulePermission(req.orgPermissions, checks)) {
        return res.status(403).json({
          error: 'You do not have permission to perform this action',
        })
      }
      next()
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  }
}
