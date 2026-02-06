import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_51QZwkYB2mCJvcgI4TaUGPlP5RwRqA5qM3hqk7zPGYT9HJvWJZhLRMRMg4dRd7lqDMJ7y5F4vGzBGjzECFMM7n9q500jNEzUwmf'

const stripePromise = loadStripe(STRIPE_PK)

const PRODUCT_INFO = {
  social: { name: 'Social Post', emoji: '📱', description: 'Single post for X, Instagram, or TikTok', price: 500 },
  carousel: { name: 'Carousel', emoji: '🎠', description: '5-slide Instagram carousel', price: 1000 },
  video: { name: 'Video Script', emoji: '🎬', description: 'TikTok/Reel script with hooks', price: 1500 },
  blog: { name: 'Blog Post', emoji: '📝', description: '500-word SEO blog snippet', price: 2000 },
  email: { name: 'Email Blast', emoji: '📧', description: 'Subject line + body copy', price: 2500 },
}

// Payment Form Component
function PaymentForm({ onSuccess, onBack, productType, productData, token }) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  const product = PRODUCT_INFO[productType]

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return
    
    setLoading(true)
    setError(null)
    
    try {
      const { error: submitError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required'
      })
      
      if (submitError) {
        throw new Error(submitError.message)
      }
      
      if (paymentIntent.status === 'succeeded') {
        // Payment succeeded - now generate content
        const genRes = await fetch(`${API_URL}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'ngrok-skip-browser-warning': 'true'
          },
          body: JSON.stringify({ productType, productData })
        })
        
        const genData = await genRes.json()
        if (genData.error) throw new Error(genData.error)
        
        // Create post record
        const createRes = await fetch(`${API_URL}/api/content/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'ngrok-skip-browser-warning': 'true'
          },
          body: JSON.stringify({
            productType,
            content: genData.content,
            productData,
            paymentIntentId: paymentIntent.id
          })
        })
        
        const createData = await createRes.json()
        
        onSuccess({
          content: genData.content,
          postId: createData.id
        })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="text-center mb-4">
        <div className="text-4xl mb-2">{product?.emoji}</div>
        <h3 className="text-xl font-bold text-white">{product?.name}</h3>
        <p className="text-3xl font-black text-cyan-400 mt-2">
          ${(product?.price / 100).toFixed(2)}
        </p>
      </div>
      
      <div className="bg-gray-800/50 rounded-xl p-4 mb-4">
        <div className="text-sm text-gray-400 mb-2">Product: <span className="text-white">{productData.name}</span></div>
      </div>
      
      <div className="bg-gray-800 rounded-xl p-4">
        <PaymentElement 
          options={{
            layout: 'tabs'
          }}
        />
      </div>
      
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 text-red-400 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}
      
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-bold transition-colors"
        >
          ← Back
        </button>
        <button
          type="submit"
          disabled={!stripe || loading}
          className="flex-1 bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Processing...
            </span>
          ) : (
            `Pay $${(product?.price / 100).toFixed(2)}`
          )}
        </button>
      </div>
      
      <p className="text-xs text-gray-500 text-center">
        🔒 Secured by Stripe
      </p>
    </form>
  )
}

export default function ContentModal({ isOpen, onClose, productType, user, token, onSuccess }) {
  const [step, setStep] = useState(1) // 1: info, 2: payment, 3: preview, 4: published
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  
  const [productData, setProductData] = useState({
    name: '',
    description: '',
    features: '',
    audience: '',
    productUrl: ''
  })
  
  const [clientSecret, setClientSecret] = useState(null)
  const [generatedContent, setGeneratedContent] = useState(null)
  const [postId, setPostId] = useState(null)
  const [publishResult, setPublishResult] = useState(null)

  const product = PRODUCT_INFO[productType] || {}
  
  // Import product from URL
  const importFromUrl = async () => {
    if (!importUrl.trim()) return
    
    setImporting(true)
    setImportError('')
    
    try {
      const res = await fetch(`${API_URL}/api/product/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ url: importUrl })
      })
      
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      
      const p = data.product
      setProductData({
        name: p.title || '',
        description: p.description || '',
        features: p.tags?.join(', ') || '',
        audience: '',
        productUrl: p.url || importUrl.split('?')[0]
      })
      setImportUrl('')
    } catch (e) {
      setImportError(e.message)
    } finally {
      setImporting(false)
    }
  }

  const reset = () => {
    setStep(1)
    setLoading(false)
    setError(null)
    setImportUrl('')
    setImportError('')
    setProductData({ name: '', description: '', features: '', audience: '', productUrl: '' })
    setClientSecret(null)
    setGeneratedContent(null)
    setPostId(null)
    setPublishResult(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  // Step 1 -> 2: Go to payment
  const goToPayment = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      // Create PaymentIntent
      const res = await fetch(`${API_URL}/api/checkout/create-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({
          productType,
          productData,
          userId: user?.id
        })
      })
      
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      
      setClientSecret(data.clientSecret)
      setStep(2)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Payment success callback
  const handlePaymentSuccess = ({ content, postId: newPostId }) => {
    setGeneratedContent(content)
    setPostId(newPostId)
    setStep(3)
  }

  // Step 3 -> 4: Publish to X
  const publishToX = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const pubRes = await fetch(`${API_URL}/api/posts/${postId}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({
          platform: 'twitter',
          productUrl: productData.productUrl || null
        })
      })
      
      const pubData = await pubRes.json()
      if (!pubRes.ok) throw new Error(pubData.error || 'Publish failed')
      
      setPublishResult(pubData)
      setStep(4)
      onSuccess?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />
      
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 sm:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <button 
          onClick={handleClose} 
          className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl"
        >
          ×
        </button>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`w-3 h-3 rounded-full transition-all ${
                s === step ? 'bg-cyan-400 scale-125' : s < step ? 'bg-cyan-400/50' : 'bg-gray-700'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-400 rounded-lg px-4 py-3 mb-6">
            {error}
          </div>
        )}

        {/* Step 1: Product Info */}
        {step === 1 && (
          <>
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">{product.emoji}</div>
              <h2 className="text-2xl font-bold text-white">{product.name}</h2>
              <p className="text-gray-400">{product.description}</p>
              <p className="text-2xl font-bold text-cyan-400 mt-2">${(product.price / 100).toFixed(2)}</p>
            </div>
            
            <form onSubmit={goToPayment} className="space-y-4">
              {/* Quick Import */}
              <div className="bg-gray-800/50 rounded-xl p-4 mb-2">
                <label className="block text-sm text-gray-400 mb-2">🔗 Quick Import from Product URL</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="Paste your Shopify product link..."
                    className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={importFromUrl}
                    disabled={importing || !importUrl.trim()}
                    className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50 whitespace-nowrap"
                  >
                    {importing ? '...' : 'Import'}
                  </button>
                </div>
                {importError && <p className="text-xs text-red-400 mt-2">{importError}</p>}
                {productData.name && !importUrl && <p className="text-xs text-green-400 mt-2">✓ Product imported!</p>}
              </div>
              
              <div className="border-t border-gray-700 pt-4"></div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  value={productData.name}
                  onChange={(e) => setProductData({ ...productData, name: e.target.value })}
                  placeholder="e.g., Living Nectar Palmyra Sugar"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Description *</label>
                <textarea
                  required
                  value={productData.description}
                  onChange={(e) => setProductData({ ...productData, description: e.target.value })}
                  placeholder="Brief description..."
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Key Features</label>
                <input
                  type="text"
                  value={productData.features}
                  onChange={(e) => setProductData({ ...productData, features: e.target.value })}
                  placeholder="e.g., Low glycemic, sustainable"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Product URL</label>
                <input
                  type="url"
                  value={productData.productUrl}
                  onChange={(e) => setProductData({ ...productData, productUrl: e.target.value })}
                  placeholder="https://your-store.com/product"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 text-white py-4 rounded-xl font-bold text-lg disabled:opacity-50"
              >
                {loading ? 'Loading...' : `Continue to Payment →`}
              </button>
            </form>
          </>
        )}

        {/* Step 2: Payment */}
        {step === 2 && clientSecret && (
          <Elements 
            stripe={stripePromise} 
            options={{
              clientSecret,
              appearance: {
                theme: 'night',
                variables: {
                  colorPrimary: '#06b6d4',
                  colorBackground: '#1f2937',
                  colorText: '#ffffff',
                  colorDanger: '#ef4444',
                  fontFamily: 'system-ui, sans-serif',
                  borderRadius: '12px'
                }
              }
            }}
          >
            <PaymentForm 
              productType={productType}
              productData={productData}
              token={token}
              onSuccess={handlePaymentSuccess}
              onBack={() => setStep(1)}
            />
          </Elements>
        )}

        {/* Step 3: Preview & Publish */}
        {step === 3 && (
          <>
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">✨</div>
              <h2 className="text-2xl font-bold text-white mb-2">Content Ready!</h2>
              <p className="text-gray-400">Review and publish</p>
            </div>
            
            <div className="bg-gray-800 rounded-xl p-4 mb-6 max-h-80 overflow-y-auto">
              <pre className="whitespace-pre-wrap text-gray-200 font-sans text-sm">{generatedContent}</pre>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generatedContent)
                  alert('Copied!')
                }}
                className="bg-gray-700 hover:bg-gray-600 text-white py-3 px-4 rounded-xl font-bold"
              >
                📋
              </button>
              <button
                onClick={publishToX}
                disabled={loading || !postId}
                className="flex-1 bg-gradient-to-r from-cyan-500 to-purple-500 text-white py-3 rounded-xl font-bold disabled:opacity-50"
              >
                {loading ? 'Publishing...' : '🚀 Post to X'}
              </button>
            </div>
            
            <button
              onClick={() => {
                onSuccess?.()
                handleClose()
              }}
              className="w-full mt-3 text-gray-500 hover:text-gray-300 py-2 text-sm"
            >
              Save without posting
            </button>
          </>
        )}

        {/* Step 4: Success */}
        {step === 4 && (
          <div className="text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold text-white mb-2">Posted!</h2>
            <p className="text-gray-400 mb-6">Your content is live on X</p>
            
            <a
              href={publishResult?.tweetUrl?.replace('twitter.com', 'x.com')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-gradient-to-r from-cyan-500 to-purple-500 text-white px-8 py-4 rounded-xl font-bold text-lg mb-4"
            >
              View on X →
            </a>
            
            {publishResult?.trackedLink && (
              <p className="text-sm text-gray-400 mb-6">
                Tracking: <code className="text-cyan-400">{publishResult.trackedLink}</code>
              </p>
            )}
            
            <button onClick={handleClose} className="text-gray-400 hover:text-white">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
