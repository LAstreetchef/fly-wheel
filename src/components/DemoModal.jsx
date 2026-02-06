import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function DemoModal({ isOpen, onClose, onPurchase }) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Step 1: Product info
  const [productData, setProductData] = useState({
    name: '',
    description: '',
    productUrl: '',
    keywords: ''
  })
  
  // Step 2: Generated content
  const [blogData, setBlogData] = useState(null)
  const [promoText, setPromoText] = useState('')

  const reset = () => {
    setStep(1)
    setLoading(false)
    setError(null)
    setProductData({ name: '', description: '', productUrl: '', keywords: '' })
    setBlogData(null)
    setPromoText('')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  // Step 1 -> 2: Generate blog post and promo tweet
  const generateBlogAndPromo = async (e) => {
    e.preventDefault()
    
    if (!productData.name.trim() || !productData.description.trim()) {
      setError('Product name and description are required')
      return
    }
    
    setLoading(true)
    setError(null)
    
    try {
      const res = await fetch(`${API_URL}/api/demo/blog/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ productData })
      })
      
      const data = await res.json()
      
      if (data.error) {
        throw new Error(data.error)
      }
      
      setBlogData(data.blog)
      setPromoText(data.promo)
      setStep(2)
    } catch (err) {
      setError('Generation failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Handle purchase click
  const handlePurchase = () => {
    onPurchase?.({
      productData,
      blogData,
      promoText
    })
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
          &times;
        </button>

        {/* Demo badge */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 text-yellow-400 text-xs font-bold px-3 py-1 rounded-full">
            🎮 INTERACTIVE DEMO
          </span>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  s === step
                    ? 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white scale-110'
                    : s < step
                    ? 'bg-cyan-500/30 text-cyan-400'
                    : 'bg-gray-700 text-gray-500'
                }`}
              >
                {s < step ? '✓' : s}
              </div>
              {s < 2 && (
                <div className={`w-12 h-0.5 mx-1 ${s < step ? 'bg-cyan-500/50' : 'bg-gray-700'}`} />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-400 rounded-lg px-4 py-3 mb-6 text-sm">
            {error}
          </div>
        )}

        {/* Step 1: Product Info */}
        {step === 1 && (
          <>
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">✍️</div>
              <h2 className="text-2xl font-bold text-white">Try Blog Boost</h2>
              <p className="text-gray-400 text-sm mt-1">We'll create a blog post AND a promo tweet for your product</p>
            </div>
            
            <div className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/20 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🚀</span>
                <div>
                  <h3 className="font-semibold text-white text-sm">What you'll get:</h3>
                  <ul className="text-gray-400 text-sm mt-1 space-y-1">
                    <li>✓ Full blog post (~600 words) hosted on FlyWheel</li>
                    <li>✓ Promo tweet ready to post on X</li>
                    <li>✓ Shareable link with your product CTA</li>
                  </ul>
                </div>
              </div>
            </div>
            
            <form onSubmit={generateBlogAndPromo} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  value={productData.name}
                  onChange={(e) => setProductData({ ...productData, name: e.target.value })}
                  placeholder="e.g., SwordPay"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Description *</label>
                <textarea
                  required
                  value={productData.description}
                  onChange={(e) => setProductData({ ...productData, description: e.target.value })}
                  placeholder="What does your product do? Who is it for?"
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Product URL</label>
                <input
                  type="url"
                  value={productData.productUrl}
                  onChange={(e) => setProductData({ ...productData, productUrl: e.target.value })}
                  placeholder="https://your-product.com"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Keywords (optional)</label>
                <input
                  type="text"
                  value={productData.keywords}
                  onChange={(e) => setProductData({ ...productData, keywords: e.target.value })}
                  placeholder="e.g., payments, creators, fintech"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
              
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white py-4 rounded-xl font-bold text-lg disabled:opacity-50 transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(6,182,212,0.3)]"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating Your Content...
                  </span>
                ) : 'Generate Blog + Promo →'}
              </button>
            </form>
          </>
        )}

        {/* Step 2: Preview & Purchase CTA */}
        {step === 2 && blogData && (
          <>
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">🎉</div>
              <h2 className="text-2xl font-bold text-white mb-2">Your Content is Ready!</h2>
              <p className="text-gray-400 text-sm">Blog post created and promo tweet generated</p>
            </div>
            
            {/* Blog Post Preview */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">📝</span>
                <span className="text-sm font-semibold text-gray-300">Blog Post</span>
                <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">LIVE</span>
              </div>
              <a 
                href={blogData.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-cyan-500/50 transition-colors group"
              >
                <h3 className="font-bold text-white mb-2 group-hover:text-cyan-400 transition-colors">{blogData.title}</h3>
                <p className="text-gray-400 text-sm mb-3 line-clamp-2">{blogData.excerpt}</p>
                <div className="flex items-center gap-2 text-cyan-400 text-sm">
                  <span>View Blog Post</span>
                  <span>→</span>
                </div>
              </a>
            </div>
            
            {/* Promo Tweet Preview */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🐦</span>
                <span className="text-sm font-semibold text-gray-300">Promo Tweet</span>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="text-white whitespace-pre-wrap leading-relaxed text-sm">{promoText}</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={handlePurchase}
                className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white py-4 rounded-xl font-bold text-lg transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(6,182,212,0.3)] flex items-center justify-center gap-2"
              >
                <span>🚀 Post to X Now</span>
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-sm">$7.50</span>
              </button>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-bold transition-colors"
                >
                  ← Edit Product
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(promoText)
                    const btn = document.activeElement
                    const original = btn.textContent
                    btn.textContent = '✓ Copied!'
                    setTimeout(() => { btn.textContent = original }, 2000)
                  }}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-xl font-semibold border border-gray-700 transition-colors"
                >
                  📋 Copy Tweet
                </button>
              </div>
              
              <a 
                href={blogData.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-xl font-semibold border border-gray-700 transition-colors"
              >
                🔗 Share Blog Link
              </a>
            </div>

            {/* Trust indicators */}
            <div className="mt-6 pt-4 border-t border-gray-800 flex items-center justify-center gap-6 text-xs text-gray-500">
              <span>⚡ Instant posting</span>
              <span>📊 View tracking</span>
              <span>🔒 Secure payment</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
