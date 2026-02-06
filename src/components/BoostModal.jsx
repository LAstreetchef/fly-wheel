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
  
  // Step 2: Blog selection (for inspiration/topic)
  const [blogs, setBlogs] = useState([])
  const [selectedBlog, setSelectedBlog] = useState(null)
  
  // Step 3: Created blog + generated promo
  const [blogData, setBlogData] = useState(null)
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
    setBlogData(null)
    setGeneratedContent(null)
    setPostId(null)
    setPublishResult(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  // Step 1 -> 2: Search for topic inspiration
  const searchBlogs = async (e) => {
    e.preventDefault()
    if (!productData.keywords.trim()) {
      setError('Enter keywords to find relevant topics')
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
        setError('No relevant topics found. Try different keywords.')
      }
    } catch (err) {
      setError('Search failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Step 2 -> 3: Create blog post + generate promo
  const generateBoost = async () => {
    if (!selectedBlog) {
      setError('Select a topic first')
      return
    }
    
    setLoading(true)
    setError(null)
    
    try {
      // Create blog post using the topic as inspiration
      const blogRes = await fetch(`${API_URL}/api/blog/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          productData: {
            ...productData,
            // Use selected blog as topic inspiration
            topicTitle: selectedBlog.title,
            topicSnippet: selectedBlog.snippet
          }
        })
      })
      
      const blogResult = await blogRes.json()
      
      if (blogResult.error) {
        throw new Error(blogResult.error)
      }
      
      setBlogData(blogResult.blog)
      setGeneratedContent(blogResult.promo)
      setPostId(blogResult.postId)
      
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
      const pubRes = await fetch(`${API_URL}/api/posts/quick-publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          content: generatedContent,
          productType: 'boost',
          productData: {
            ...productData,
            blogId: blogData?.id,
            blogUrl: blogData?.url,
            blogTitle: blogData?.title
          },
          blogUrl: blogData?.url,
          productUrl: productData.productUrl
        })
      })
      
      const pubData = await pubRes.json()
      
      if (!pubRes.ok || pubData.error) {
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
              <p className="text-gray-400">Create a blog post + promo tweet for your product</p>
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
                <label className="block text-sm text-gray-400 mb-1">Topic Keywords *</label>
                <input
                  type="text"
                  required
                  value={productData.keywords}
                  onChange={(e) => setProductData({ ...productData, keywords: e.target.value })}
                  placeholder="e.g., creator payments fintech"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                />
                <p className="text-xs text-gray-500 mt-1">We'll find trending topics to inspire your blog post</p>
              </div>
              
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 text-white py-4 rounded-xl font-bold text-lg disabled:opacity-50"
              >
                {loading ? 'Searching...' : 'Find Topics →'}
              </button>
            </form>
          </>
        )}

        {/* Step 2: Select Topic for Blog */}
        {step === 2 && (
          <>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">Choose a Topic</h2>
              <p className="text-gray-400">Select a topic to inspire your blog post about <span className="text-cyan-400">{productData.name}</span></p>
            </div>
            
            <div className="space-y-3 mb-6 max-h-[40vh] overflow-y-auto">
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
                {loading ? 'Creating Blog...' : 'Generate Boost →'}
              </button>
            </div>
          </>
        )}

        {/* Step 3: Preview Blog + Promo */}
        {step === 3 && blogData && (
          <>
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">✨</div>
              <h2 className="text-2xl font-bold text-white mb-2">Your Boost is Ready!</h2>
              <p className="text-gray-400">Blog post created + promo tweet generated</p>
            </div>
            
            {/* Blog Preview */}
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
                className="block bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-cyan-500/50 transition-colors"
              >
                <div className="font-bold text-white mb-2">{blogData.title}</div>
                <div className="text-sm text-gray-400 line-clamp-2 mb-2">{blogData.excerpt}</div>
                <div className="text-cyan-400 text-sm">View Blog Post →</div>
              </a>
            </div>
            
            {/* Tweet Preview */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🐦</span>
                <span className="text-sm font-semibold text-gray-300">Promo Tweet</span>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="text-white whitespace-pre-wrap">{generatedContent}</div>
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
                navigator.clipboard.writeText(generatedContent)
                alert('Copied!')
              }}
              className="w-full mt-3 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-xl text-sm"
            >
              📋 Copy tweet to clipboard
            </button>
          </>
        )}

        {/* Step 4: Success */}
        {step === 4 && (
          <div className="text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold text-white mb-2">Posted!</h2>
            <p className="text-gray-400 mb-6">Your blog post and tweet are live</p>
            
            <div className="space-y-3 mb-6">
              <a
                href={publishResult?.tweetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-blue-500 hover:bg-blue-600 text-white py-4 rounded-xl font-bold transition-colors"
              >
                View Tweet on X →
              </a>
              
              <a
                href={blogData?.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-semibold transition-colors"
              >
                View Blog Post →
              </a>
            </div>
            
            {publishResult?.trackedLink && (
              <p className="text-sm text-gray-400 mb-6">
                Tracking: <code className="text-cyan-400">{publishResult.trackedLink}</code>
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
