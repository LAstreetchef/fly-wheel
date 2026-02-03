import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

// Handle GitHub Pages SPA redirect
const params = new URLSearchParams(window.location.search)
const redirectPath = params.get('p')
if (redirectPath) {
  // Remove the ?p= param and navigate to the actual path
  params.delete('p')
  const remainingParams = params.toString()
  const newUrl = '/fly-wheel' + redirectPath + (remainingParams ? '?' + remainingParams : '') + window.location.hash
  window.history.replaceState(null, '', newUrl)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename="/fly-wheel">
      <App />
    </BrowserRouter>
  </StrictMode>,
)
