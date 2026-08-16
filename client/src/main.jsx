import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/global.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import { initAnalytics } from './lib/firebase'
import { initAssetCssVars } from './lib/assets'
import App from './App.jsx'

const scheduleAnalyticsInit = () => {
  if (typeof window === 'undefined') return
  const run = () => {
    initAnalytics().catch(() => {})
  }
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 3000 })
  } else {
    setTimeout(run, 0)
  }
}

scheduleAnalyticsInit()
initAssetCssVars()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
