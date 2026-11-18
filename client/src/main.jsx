import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/global.css'
import '@fontsource/inter/latin-400.css'
import { initAnalytics } from './lib/firebase'
import { initAssetCssVars } from './lib/assets'
import { installChunkLoadRecovery } from './lib/chunkLoadRecovery'
import { installCompanyTableAutofit } from './lib/companyTableAutofit'
import App from './App.jsx'

installChunkLoadRecovery()
installCompanyTableAutofit()

const scheduleIdle = (run, timeout = 3000) => {
  if (typeof window === 'undefined') return
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout })
  } else {
    setTimeout(run, Math.min(timeout, 100))
  }
}

const scheduleAnalyticsInit = () => {
  scheduleIdle(() => {
    initAnalytics().catch(() => {})
  }, 3000)
}

const scheduleDeferredFonts = () => {
  scheduleIdle(() => {
    import('@fontsource/inter/latin-500.css')
    import('@fontsource/inter/latin-600.css')
    import('@fontsource/inter/latin-700.css')
  }, 2500)
}

scheduleAnalyticsInit()
scheduleDeferredFonts()
initAssetCssVars()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
