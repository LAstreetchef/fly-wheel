import { useState, useEffect } from 'react'
import { ProductDropdown } from './ProductPicker'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const PRODUCT_INFO = {
  social: { name: 'Social Post', emoji: '📱', description: 'Single post for X, Instagram, or TikTok' },
  carousel: { name: 'Carousel', emoji: '🎠', description: '5-slide Instagram carousel' },
  video: { name: 'Video Script', emoji: '🎬', description: 'TikTok/Reel script with hooks' },
  blog: { name: 'Blog Post', emoji: '📝', description: '500-word SEO blog snippet' },
  email: { name: 'Email Blast', emoji: '📧', description: 'Subject line + body copy' },
}

export default function ContentModal({ isOpen, onClose, productType, user, token, onSuccess }) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  const [selectedShopifyProduct, setSelectedShopifyProduct] = useState(null)
  const [shopifyConnected, setShopifyConnected] = useState(false)
  
  const [productData, setProductData] = useState({
    name: '',
    description: '',
    features: '',
    audience: '',
    productUrl: ''
  })
  
  const [generatedContent, setGeneratedContent] = useState(null)
  const [postId, setPostId] = useState(null)
  const [publishResult, setPublishResult] = useState(null)

  const product = PRODUCT_INFO[productType] || {}
  
  // Check Shopify connection on mount
  useEffect(() => {
    if (isOpen && token) {
      fetch(`${API_URL}/api/shopify/status`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.json())
        .then(d => setShopifyConnected(d.connected))
        .catch(() => setShopifyConnected(false))
    }
  }, [isOpen, token])
  
  // When a Shopify product is selected, pre-fill the form
  const handleShopifyProductSelect = (shopifyProduct) => {
    setSelectedShopifyProduct(shopifyProduct)
    if (shopifyProduct) {
      setProductData({
        name: shopifyProduct.title || '',
        description: shopifyProduct.description || '',
        features: shopifyProduct.tags?.join(', ') || '',
        audience: '',
        productUrl: shopifyProduct.url || ''
      })
    } else {
      // Clear form if no product selected
      setProductData({
        name: '',
        description: '',
        features: '',
        audience: '',
        productUrl: ''
      })
    }
  }

  const reset = () => {
    setStep(1)
    setLoading(false)
    setError(null)
    setSelectedShopifyProduct(null)
    setProductData({ name: '', description: '', features: '', audience: '', productUrl: '' })
    setGeneratedContent(null)
    setPostId(null)
    setPublishResult(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  // Step 1 -> 2: Generate content
  const generateContent = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      const genRes = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          productType,
          productData
        })
      })
      
      const genData = await genRes.json()
      
      if (genData.error) {
        throw new Error(genData.error)
      }
      
      setGeneratedContent(genData.content)
      
      // Create post record
      const createRes = await fetch(`${API_URL}/api/content/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          productType,
          content: genData.content,
          productData
        })
      })
      
      if (createRes.ok) {
        const createData = await createRes.json()
        setPostId(createData.id)
      }
      
      setStep(2)
    } catch (err) {
      setError('Generation failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Step 2 -> 3: Publish to X
  const publishToX = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const pubRes = await fetch(`${API_URL}/api/posts/${postId}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          platform: 'twitter',
          productUrl: productData.productUrl || null
        })
      })
      
      const pubData = await pubRes.json()
      
      if (!pubRes.ok) {
        throw new Error(pubData.error || 'Publish failed')
      }
      
      setPublishResult(pubData)
      setStep(3)
      
      if (onSuccess) onSuccess()
    } catch (err) {
      setError('Publish failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />
      
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <button 
          onClick={handleClose} 
          className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl"
        >
          &times;
        </button>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`w-3 h-3 rounded-full transition-all ${
                s === step
                  ? 'bg-cyan-400 scale-125'
                  : s < step
                  ? 'bg-cyan-400/50'
                  : 'bg-gray-700'
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
            </div>
            
            <form onSubmit={generateContent} className="space-y-4">
              {/* Shopify Product Picker */}
              {shopifyConnected && (
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">
                    🛍️ Import from Shopify
                  </label>
                  <ProductDropdown
                    token={token}
                    selectedProduct={selectedShopifyProduct}
                    onSelect={handleShopifyProductSelect}
                  />
                  {selectedShopifyProduct && (
                    <p className="text-xs text-cyan-400 mt-1">
                      ✓ Product loaded from Shopify - edit below if needed
                    </p>
                  )}
                </div>
              )}
              
              {!shopifyConnected && (
                <div className="text-center text-gray-500 text-sm mb-4 py-2 border border-dashed border-gray-700 rounded-lg">
                  💡 Connect Shopify in settings to import products automatically
                </div>
              )}
              
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
                  placeholder="Brief description of your product..."
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
                  placeholder="e.g., Low glycemic, rich in minerals, sustainable"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Target Audience</label>
                <input
                  type="text"
                  value={productData.audience}
                  onChange={(e) => setProductData({ ...productData, audience: e.target.value })}
                  placeholder="e.g., Health-conscious consumers, diabetics"
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
                {loading ? 'Generating...' : 'Generate Content →'}
              </button>
            </form>
          </>
        )}

        {/* Step 2: Preview & Publish */}
        {step === 2 && (
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
                onClick={() => setStep(1)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-bold"
              >
                ← Back
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
                navigator.clipboard.writeText(generatedContent)
                alert('Copied!')
              }}
              className="w-full mt-3 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-xl text-sm"
            >
              📋 Copy to clipboard instead
            </button>
            
            <button
              onClick={() => {
                if (onSuccess) onSuccess()
                handleClose()
              }}
              className="w-full mt-2 text-gray-500 hover:text-gray-300 py-2 text-sm"
            >
              Save without posting
            </button>
          </>
        )}

        {/* Step 3: Success */}
        {step === 3 && (
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
                Tracking clicks at: <code className="text-cyan-400">{publishResult.trackedLink}</code>
              </p>
            )}
            
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-white"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
