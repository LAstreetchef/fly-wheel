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

const PRODUCTS = {
  social: { name: 'Social Post', price: 500, emoji: '📱' },
  boost: { name: 'Blog Boost', price: 750, emoji: '🚀' },
  carousel: { name: 'Carousel', price: 1000, emoji: '🎠' },
  video: { name: 'Video Script', price: 1500, emoji: '🎬' },
  blog: { name: 'Blog Post', price: 2000, emoji: '📝' },
  email: { name: 'Email Blast', price: 2500, emoji: '📧' }
}

// Payment form component
function CheckoutForm({ productType, productData, onSuccess, onCancel, token }) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [paymentIntentId, setPaymentIntentId] = useState(null)

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
        // Payment succeeded - now generate the content
        const confirmRes = await fetch(`${API_URL}/api/checkout/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'ngrok-skip-browser-warning': 'true'
          },
          body: JSON.stringify({
            paymentIntentId: paymentIntent.id,
            productType,
            productData
          })
        })
        
        const confirmData = await confirmRes.json()
        
        if (!confirmRes.ok) {
          throw new Error(confirmData.error || 'Failed to process order')
        }
        
        onSuccess(confirmData)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const product = PRODUCTS[productType]

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="text-center mb-6">
        <div className="text-4xl mb-2">{product?.emoji}</div>
        <h3 className="text-xl font-bold text-white">{product?.name}</h3>
        <p className="text-3xl font-black text-cyan-400 mt-2">
          ${(product?.price / 100).toFixed(2)}
        </p>
      </div>
      
      <div className="bg-gray-800 rounded-xl p-4">
        <PaymentElement 
          options={{
            layout: 'tabs',
            theme: 'night'
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
          onClick={onCancel}
          className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-bold transition-colors"
        >
          Cancel
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
        🔒 Secured by Stripe. Your payment info never touches our servers.
      </p>
    </form>
  )
}

// Success screen
function SuccessScreen({ content, productType, onClose, onViewDashboard }) {
  const product = PRODUCTS[productType]
  
  return (
    <div className="text-center">
      <div className="text-6xl mb-4">🎉</div>
      <h3 className="text-2xl font-bold text-white mb-2">Payment Successful!</h3>
      <p className="text-gray-400 mb-6">Your {product?.name} is ready</p>
      
      {content && (
        <div className="bg-gray-800 rounded-xl p-4 mb-6 text-left max-h-60 overflow-y-auto">
          <pre className="whitespace-pre-wrap text-gray-200 font-sans text-sm">
            {content}
          </pre>
        </div>
      )}
      
      <div className="flex gap-3">
        <button
          onClick={onViewDashboard}
          className="flex-1 bg-gradient-to-r from-cyan-500 to-purple-500 text-white py-3 rounded-xl font-bold"
        >
          View in Dashboard
        </button>
        <button
          onClick={() => {
            navigator.clipboard.writeText(content)
            alert('Copied!')
          }}
          className="bg-gray-700 hover:bg-gray-600 text-white py-3 px-4 rounded-xl font-bold"
        >
          📋 Copy
        </button>
      </div>
    </div>
  )
}

// Main modal component
export default function CheckoutModal({ 
  isOpen, 
  onClose, 
  productType, 
  productData,
  user,
  token,
  onSuccess,
  onNeedLogin
}) {
  const [clientSecret, setClientSecret] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    if (isOpen && productType) {
      // Reset state
      setClientSecret(null)
      setLoading(true)
      setError(null)
      setSuccess(null)
      
      // Check if user is logged in
      if (!user || !token) {
        setLoading(false)
        return
      }
      
      // Create PaymentIntent
      fetch(`${API_URL}/api/checkout/create-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({
          productType,
          productData,
          userId: user.id
        })
      })
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            setError(data.error)
          } else {
            setClientSecret(data.clientSecret)
          }
        })
        .catch(err => setError(err.message))
        .finally(() => setLoading(false))
    }
  }, [isOpen, productType, user, token])

  if (!isOpen) return null

  const handleSuccess = (data) => {
    setSuccess(data)
    onSuccess?.(data)
  }

  const handleClose = () => {
    setClientSecret(null)
    setSuccess(null)
    setError(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 sm:p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl"
        >
          ×
        </button>
        
        {/* Not logged in */}
        {!user && (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">🔐</div>
            <h3 className="text-xl font-bold text-white mb-2">Login Required</h3>
            <p className="text-gray-400 mb-6">Please log in to purchase content</p>
            <button
              onClick={() => {
                handleClose()
                onNeedLogin?.()
              }}
              className="bg-gradient-to-r from-cyan-500 to-purple-500 text-white px-8 py-3 rounded-xl font-bold"
            >
              Login / Register
            </button>
          </div>
        )}
        
        {/* Loading */}
        {user && loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <svg className="animate-spin h-10 w-10 text-cyan-400 mb-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-gray-400">Preparing checkout...</p>
          </div>
        )}
        
        {/* Error */}
        {user && !loading && error && (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">❌</div>
            <h3 className="text-xl font-bold text-white mb-2">Something went wrong</h3>
            <p className="text-red-400 mb-6">{error}</p>
            <button
              onClick={handleClose}
              className="bg-gray-700 hover:bg-gray-600 text-white px-8 py-3 rounded-xl font-bold"
            >
              Close
            </button>
          </div>
        )}
        
        {/* Success */}
        {success && (
          <SuccessScreen 
            content={success.content}
            productType={productType}
            onClose={handleClose}
            onViewDashboard={() => {
              handleClose()
              window.location.href = '/fly-wheel/dashboard'
            }}
          />
        )}
        
        {/* Payment form */}
        {user && !loading && !error && !success && clientSecret && (
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
            <CheckoutForm 
              productType={productType}
              productData={productData}
              token={token}
              onSuccess={handleSuccess}
              onCancel={handleClose}
            />
          </Elements>
        )}
      </div>
    </div>
  )
}
