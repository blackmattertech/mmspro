import { useEffect, useState } from 'react'

let iconsPromise = null
let iconsCache = null

function loadIcons() {
  if (iconsCache) return Promise.resolve(iconsCache)
  if (!iconsPromise) {
    iconsPromise = import('./navIconsData.jsx').then((mod) => {
      iconsCache = mod.icons
      return iconsCache
    })
  }
  return iconsPromise
}

/** Shell-safe icon: SVG map loads in a separate chunk after first paint. */
export default function NavIcon({ name }) {
  const [node, setNode] = useState(() => (iconsCache ? iconsCache[name] || null : null))

  useEffect(() => {
    let cancelled = false
    if (iconsCache) {
      setNode(iconsCache[name] || null)
      return undefined
    }
    loadIcons().then((icons) => {
      if (!cancelled) setNode(icons[name] || null)
    })
    return () => {
      cancelled = true
    }
  }, [name])

  return node
}

export { loadIcons }
