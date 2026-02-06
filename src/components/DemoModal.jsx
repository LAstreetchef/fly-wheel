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
  
  // Step 2: Blog selection
  const [blogs, setBlogs] = useState([])
  const [selectedBlog, setSelectedBlog] = useState(null)
  
  // Step 3: Generated content
  const [generatedContent, setGeneratedContent] = useState(null)

  const reset = () => {
    setStep(1)
    setLoading(false)
    setError(null)
    setProductData({ name: '', description: '', productUrl: '', keywords: '' })
    setBlogs([])
    setSelectedBlog(null)
    setGeneratedContent(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  // Step 1 -> 2: Search for blogs (public demo endpoint)
  const searchBlogs = async (e) => {
    e.preventDefault()
    if (!productData.keywords.trim()) {
      setError('Enter keywords to find relevant blogs')
      return
    }
    
    setLoading(true)
    setError(null)
    
    try {
      const res = await fetch(
        `${API_URL}/api/demo/blogs/search?keywords=${encodeURIComponent(productData.keywords)}`,
        { headers: { 'ngrok-skip-browser-warning': 'true' } }
      )
      const data = await res.json()
      
      if (data.error) {
        throw new Error(data.error)
      }
      
      if (data.results?.length > 0) {
        setBlogs(data.results)
        setStep(2)
      } else {
        setError('No relevant blogs found. Try different keywords.')
      }
    } catch (err) {
      setError('Search failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Step 2 -> 3: Generate boost content (public demo endpoint)
  const generateBoost = async () => {
    if (!selectedBlog) {
      setError('Select a blog first')
      return
    }
    
    setLoading(true)
    setError(null)
    
    try {
      const res = await fetch(`${API_URL}/api/demo/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({
          productType: 'boost',
          productData: {
            ...productData,
            blogTitle: selectedBlog.title,
            blogUrl: selectedBlog.url,
            blogSnippet: selectedBlog.snippet
          }
        })
      })
      
      const data = await res.json()
      
      if (data.error) {
        throw new Error(data.error)
      }
      
      setGeneratedContent(data.content)
      setStep(3)
    } catch (err) {
      setError('Generation failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Get preview with links substituted
  const getPreview = () => {
    if (!generatedContent || !selectedBlog) return ''
    return generatedContent
      .replace('[BLOG_LINK]', selectedBlog.url)
      .replace('[PRODUCT_LINK]', productData.productUrl || '[your-product-url]')
  }

  // Handle purchase click
  const handlePurchase = () => {
    onPurchase?.({
      productData,
      selectedBlog,
      generatedContent
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
          {[1, 2, 3].map((s) => (
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
              {s < 3 && (
                <div className={`w-8 h-0.5 mx-1 ${s < step ? 'bg-cyan-500/50' : 'bg-gray-700'}`} />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-400 rounded-lg px-4 py-3 mb-6 text-sm">
            {error}
          </div>
        )}

        {/* Step 1: Product Info + Keywords */}
        {step === 1 && (
          <>
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">🚀</div>
              <h2 className="text-2xl font-bold text-white">Try Blog Boost</h2>
              <p className="text-gray-400 text-sm mt-1">See how we promote your product — no signup required</p>
            </div>
            
            <form onSubmit={searchBlogs} className="space-y-4">
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
                  placeholder="Brief description of your product..."
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Product URL</label>
                <input
                  type="url"
                  value={productData.productUrl}
                  onChange={(e) => setProductData({ ...productData, productUrl: e.target.value })}
                  placeholder="https://your-store.com/product"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Search Keywords *</label>
                <input
                  type="text"
                  required
                  value={productData.keywords}
                  onChange={(e) => setProductData({ ...productData, keywords: e.target.value })}
                  placeholder="e.g., creator payments fintech global"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
                <p className="text-xs text-gray-500 mt-1">We'll find blogs matching these keywords to boost your product</p>
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
                    Searching...
                  </span>
                ) : 'Find Relevant Blogs →'}
              </button>
            </form>
          </>
        )}

        {/* Step 2: Select Blog */}
        {step === 2 && (
          <>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">Select a Blog</h2>
              <p className="text-gray-400 text-sm">Pick a blog to promote alongside <span className="text-cyan-400">{productData.name}</span></p>
            </div>
            
            <div className="space-y-3 mb-6 max-h-[40vh] overflow-y-auto pr-2">
              {blogs.map((blog, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedBlog(blog)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    selectedBlog?.url === blog.url
                      ? 'border-cyan-400 bg-cyan-500/10 shadow-[0_0_20px_rgba(6,182,212,0.2)]'
                      : 'border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800'
                  }`}
                >
                  <div className="font-semibold text-white mb-1 line-clamp-2">{blog.title}</div>
                  <div className="text-sm text-gray-400 line-clamp-2 mb-2">{blog.snippet}</div>
                  <div className="text-xs text-cyan-400 truncate">{blog.source || new URL(blog.url).hostname}</div>
                </button>
              ))}
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-bold transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={generateBoost}
                disabled={loading || !selectedBlog}
                className="flex-1 bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white py-3 rounded-xl font-bold disabled:opacity-50 transition-all"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating...
                  </span>
                ) : 'Generate Boost →'}
              </button>
            </div>
          </>
        )}

        {/* Step 3: Preview & Purchase CTA */}
        {step === 3 && (
          <>
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">✨</div>
              <h2 className="text-2xl font-bold text-white mb-2">Your Boost is Ready!</h2>
              <p className="text-gray-400 text-sm">Here's what we generated for {productData.name}</p>
            </div>
            
            {/* Preview Card */}
            <div className="bg-gray-800 rounded-xl p-5 mb-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full flex items-center justify-center text-sm">🐦</div>
                <span className="text-gray-400 text-sm">Preview: X Post</span>
              </div>
              <div className="text-white whitespace-pre-wrap leading-relaxed">{getPreview()}</div>
            </div>
            
            {/* Blog & Product Info */}
            <div className="bg-gray-800/50 rounded-xl p-4 mb-6 space-y-2">
              <div className="flex items-start gap-2 text-sm">
                <span className="text-gray-500 shrink-0">📝 Blog:</span>
                <a 
                  href={selectedBlog?.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:underline line-clamp-1"
                >
                  {selectedBlog?.title}
                </a>
              </div>
              {productData.productUrl && (
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-gray-500 shrink-0">🔗 Product:</span>
                  <span className="text-white truncate">{productData.productUrl}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={handlePurchase}
                className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white py-4 rounded-xl font-bold text-lg transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(6,182,212,0.3)] flex items-center justify-center gap-2"
              >
                <span>🚀 Post This to X</span>
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-sm">$7.50</span>
              </button>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-bold transition-colors"
                >
                  ← Pick Different Blog
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(getPreview())
                    const btn = document.activeElement
                    btn.textContent = '✓ Copied!'
                    setTimeout(() => { btn.textContent = '📋 Copy' }, 2000)
                  }}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-xl font-semibold border border-gray-700 transition-colors"
                >
                  📋 Copy
                </button>
              </div>
            </div>

            {/* Trust indicators */}
            <div className="mt-6 pt-4 border-t border-gray-800 flex items-center justify-center gap-6 text-xs text-gray-500">
              <span>⚡ Instant posting</span>
              <span>📊 Click tracking</span>
              <span>🔒 Secure payment</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
