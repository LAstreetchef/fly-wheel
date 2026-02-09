import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

// Base path: '/fly-wheel' for GitHub Pages, '/' for Render (daufinder.com)
const basePath = import.meta.env.VITE_BASE_PATH || '/'

// Handle GitHub Pages SPA redirect
const params = new URLSearchParams(window.location.search)
const redirectPath = params.get('p')
if (redirectPath) {
  // Remove the ?p= param and navigate to the actual path
  params.delete('p')
  const remainingParams = params.toString()
  const newUrl = basePath + redirectPath + (remainingParams ? '?' + remainingParams : '') + window.location.hash
  window.history.replaceState(null, '', newUrl)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={basePath}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
