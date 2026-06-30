import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/global.css'
import { initAnalytics } from './lib/firebase'
import App from './App.jsx'

initAnalytics()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
