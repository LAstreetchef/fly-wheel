import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function BoostModal({ isOpen, onClose, user, token, onSuccess }) {
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
  const [postId, setPostId] = useState(null)
  
  // Step 4: Published result
  const [publishResult, setPublishResult] = useState(null)

  const reset = () => {
    setStep(1)
    setLoading(false)
    setError(null)
    setProductData({ name: '', description: '', productUrl: '', keywords: '' })
    setBlogs([])
    setSelectedBlog(null)
    setGeneratedContent(null)
    setPostId(null)
    setPublishResult(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  // Step 1 -> 2: Search for blogs
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
        `${API_URL}/api/blogs/search?keywords=${encodeURIComponent(productData.keywords)}`,
        { headers: { Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' } }
      )
      const data = await res.json()
      
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

  // Step 2 -> 3: Generate boost content
  const generateBoost = async () => {
    if (!selectedBlog) {
      setError('Select a blog first')
      return
    }
    
    setLoading(true)
    setError(null)
    
    try {
      // Generate content
      const genRes = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true',
          Authorization: `Bearer ${token}`
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
          productType: 'boost',
          content: genData.content,
          productData: {
            ...productData,
            blogUrl: selectedBlog.url,
            blogTitle: selectedBlog.title
          }
        })
      })
      
      if (createRes.ok) {
        const createData = await createRes.json()
        setPostId(createData.id)
      } else {
        // Fallback - post will be created on publish
        console.warn('Could not pre-create post')
      }
      
      setStep(3)
    } catch (err) {
      setError('Generation failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Step 3 -> 4: Publish to X
  const publishToX = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // If we don't have a postId, create the post first
      let finalPostId = postId
      if (!finalPostId) {
        const createRes = await fetch(`${API_URL}/api/content/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            productType: 'boost',
            content: generatedContent,
            productData: {
              ...productData,
              blogUrl: selectedBlog.url
            }
          })
        })
        
        if (!createRes.ok) {
          throw new Error('Could not save post')
        }
        
        const createData = await createRes.json()
        finalPostId = createData.id
        setPostId(finalPostId)
      }
      
      // Publish
      const pubRes = await fetch(`${API_URL}/api/posts/${finalPostId}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          platform: 'twitter',
          productUrl: productData.productUrl,
          blogUrl: selectedBlog.url
        })
      })
      
      const pubData = await pubRes.json()
      
      if (!pubRes.ok) {
        throw new Error(pubData.error || 'Publish failed')
      }
      
      setPublishResult(pubData)
      setStep(4)
      
      if (onSuccess) onSuccess()
    } catch (err) {
      setError('Publish failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Preview the final tweet
  const getPreview = () => {
    if (!generatedContent || !selectedBlog) return ''
    return generatedContent
      .replace('[BLOG_LINK]', selectedBlog.url)
      .replace('[PRODUCT_LINK]', productData.productUrl || '[your-product-url]')
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
          {[1, 2, 3, 4].map((s) => (
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

        {/* Step 1: Product Info + Keywords */}
        {step === 1 && (
          <>
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">🚀</div>
              <h2 className="text-2xl font-bold text-white">Blog Boost</h2>
              <p className="text-gray-400">Promote your product alongside relevant content</p>
            </div>
            
            <form onSubmit={searchBlogs} className="space-y-4">
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
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Product URL *</label>
                <input
                  type="url"
                  required
                  value={productData.productUrl}
                  onChange={(e) => setProductData({ ...productData, productUrl: e.target.value })}
                  placeholder="https://your-store.com/product"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Search Keywords *</label>
                <input
                  type="text"
                  required
                  value={productData.keywords}
                  onChange={(e) => setProductData({ ...productData, keywords: e.target.value })}
                  placeholder="e.g., natural sweeteners health benefits"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                />
                <p className="text-xs text-gray-500 mt-1">We'll find blogs matching these keywords</p>
              </div>
              
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 text-white py-4 rounded-xl font-bold text-lg disabled:opacity-50"
              >
                {loading ? 'Searching...' : 'Find Relevant Blogs →'}
              </button>
            </form>
          </>
        )}

        {/* Step 2: Select Blog */}
        {step === 2 && (
          <>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">Select a Blog</h2>
              <p className="text-gray-400">Pick a blog to promote alongside your product</p>
            </div>
            
            <div className="space-y-3 mb-6">
              {blogs.map((blog, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedBlog(blog)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    selectedBlog?.url === blog.url
                      ? 'border-cyan-400 bg-cyan-500/10'
                      : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                  }`}
                >
                  <div className="font-semibold text-white mb-1 line-clamp-2">{blog.title}</div>
                  <div className="text-sm text-gray-400 line-clamp-2 mb-2">{blog.snippet}</div>
                  <div className="text-xs text-cyan-400">{blog.source}</div>
                </button>
              ))}
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-bold"
              >
                ← Back
              </button>
              <button
                onClick={generateBoost}
                disabled={loading || !selectedBlog}
                className="flex-1 bg-gradient-to-r from-cyan-500 to-purple-500 text-white py-3 rounded-xl font-bold disabled:opacity-50"
              >
                {loading ? 'Generating...' : 'Generate Boost →'}
              </button>
            </div>
          </>
        )}

        {/* Step 3: Preview & Publish */}
        {step === 3 && (
          <>
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">✨</div>
              <h2 className="text-2xl font-bold text-white mb-2">Your Boost is Ready!</h2>
              <p className="text-gray-400">Review and publish to X</p>
            </div>
            
            <div className="bg-gray-800 rounded-xl p-4 mb-4">
              <div className="text-xs text-gray-500 mb-2">PREVIEW</div>
              <div className="text-white whitespace-pre-wrap">{getPreview()}</div>
            </div>
            
            <div className="bg-gray-800/50 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-400">Blog:</span>
                <a 
                  href={selectedBlog?.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:underline truncate"
                >
                  {selectedBlog?.title}
                </a>
              </div>
              <div className="flex items-center gap-2 text-sm mt-1">
                <span className="text-gray-400">Product:</span>
                <span className="text-white truncate">{productData.productUrl}</span>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-bold"
              >
                ← Back
              </button>
              <button
                onClick={publishToX}
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-cyan-500 to-purple-500 text-white py-3 rounded-xl font-bold disabled:opacity-50"
              >
                {loading ? 'Publishing...' : '🚀 Post to X'}
              </button>
            </div>
            
            <button
              onClick={() => {
                navigator.clipboard.writeText(getPreview())
                alert('Copied!')
              }}
              className="w-full mt-3 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-xl text-sm"
            >
              📋 Copy to clipboard instead
            </button>
          </>
        )}

        {/* Step 4: Success */}
        {step === 4 && (
          <div className="text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold text-white mb-2">Boost Posted!</h2>
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
