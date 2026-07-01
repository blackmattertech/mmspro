/**
 * Restrict route to specific org roles. Run after requireOrgAccess.
 */
export const requireOrgRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.userProfile?.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' })
  }
  next()
}
