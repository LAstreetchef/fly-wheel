import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Katana - ElevenLabs Agent ID
const ELEVENLABS_AGENT_ID = 'agent_0501kgsz28fveqbvb5td8k3zpeqb'

export default function BlogBoostPage({ user, token, onLogin }) {
  const navigate = useNavigate()
  const widgetRef = useRef(null)
  
  // Flow state
  const [step, setStep] = useState('input') // input, searching, selectBlog, generating, preview, published
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Product data
  const [productData, setProductData] = useState({
    name: '',
    description: '',
    productUrl: '',
    keywords: ''
  })
  
  // Blog selection
  const [blogs, setBlogs] = useState([])
  const [selectedBlog, setSelectedBlog] = useState(null)
  
  // Generated content
  const [generatedContent, setGeneratedContent] = useState(null)
  const [postId, setPostId] = useState(null)
  
  // Published result
  const [publishResult, setPublishResult] = useState(null)
  
  // Twitter status
  const [twitterStatus, setTwitterStatus] = useState(null)

  // Load ElevenLabs widget script
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed'
    script.async = true
    script.type = 'text/javascript'
    document.body.appendChild(script)
    
    return () => {
      // Cleanup if needed
      const existingScript = document.querySelector('script[src*="elevenlabs"]')
      if (existingScript) {
        existingScript.remove()
      }
    }
  }, [])

  // Setup client tools for the ElevenLabs widget
  useEffect(() => {
    const setupWidget = () => {
      const widget = document.querySelector('elevenlabs-convai')
      if (widget) {
        widget.addEventListener('elevenlabs-convai:call', (event) => {
          event.detail.config.clientTools = {
            // Tool to start the boost process
            startBoost: ({ productName, productDescription, productUrl, keywords }) => {
              setProductData({
                name: productName || '',
                description: productDescription || '',
                productUrl: productUrl || '',
                keywords: keywords || ''
              })
              if (productName && keywords) {
                handleSearchBlogs({ 
                  name: productName, 
                  description: productDescription || '', 
                  productUrl: productUrl || '', 
                  keywords 
                })
              }
              return { success: true, message: 'Product data received' }
            },
            // Tool to select a blog
            selectBlog: ({ blogIndex }) => {
              if (blogs[blogIndex]) {
                handleSelectBlog(blogs[blogIndex])
                return { success: true, message: `Selected: ${blogs[blogIndex].title}` }
              }
              return { success: false, message: 'Invalid blog index' }
            },
            // Tool to publish
            publishToX: () => {
              handlePublish()
              return { success: true, message: 'Publishing...' }
            },
            // Tool to get current state
            getStatus: () => {
              return {
                step,
                hasBlogs: blogs.length > 0,
                blogCount: blogs.length,
                selectedBlog: selectedBlog?.title || null,
                hasContent: !!generatedContent,
                isLoggedIn: !!user
              }
            }
          }
        })
      }
    }
    
    // Wait for widget to be available
    const interval = setInterval(() => {
      if (document.querySelector('elevenlabs-convai')) {
        setupWidget()
        clearInterval(interval)
      }
    }, 500)
    
    return () => clearInterval(interval)
  }, [blogs, selectedBlog, generatedContent, user, step])

  // Check Twitter connection
  const checkTwitterConnection = async () => {
    if (!user || !token) return false
    
    try {
      const res = await fetch(`${API_URL}/api/twitter/status`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'ngrok-skip-browser-warning': 'true'
        }
      })
      const data = await res.json()
      setTwitterStatus(data.connected ? 'connected' : 'not_connected')
      return data.connected
    } catch {
      setTwitterStatus('not_connected')
      return false
    }
  }

  // Connect Twitter
  const connectTwitter = async () => {
    if (!user || !token) {
      onLogin?.()
      return
    }
    
    try {
      const res = await fetch(`${API_URL}/api/twitter/auth`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'ngrok-skip-browser-warning': 'true'
        }
      })
      const data = await res.json()
      
      if (data.url) {
        window.open(data.url, '_blank', 'width=600,height=700')
        const pollInterval = setInterval(async () => {
          const connected = await checkTwitterConnection()
          if (connected) clearInterval(pollInterval)
        }, 2000)
        setTimeout(() => clearInterval(pollInterval), 120000)
      }
    } catch (err) {
      setError('Failed to start Twitter auth')
    }
  }

  // Step 1: Search for blogs
  const handleSearchBlogs = async (data = productData) => {
    if (!data.name?.trim() || !data.keywords?.trim()) {
      setError('Please fill in product name and keywords')
      return
    }
    
    setError(null)
    setLoading(true)
    setStep('searching')
    
    try {
      const res = await fetch(
        `${API_URL}/api/blogs/search?keywords=${encodeURIComponent(data.keywords)}`,
        { headers: { 'ngrok-skip-browser-warning': 'true' } }
      )
      const result = await res.json()
      
      if (result.results?.length > 0) {
        setBlogs(result.results)
        setStep('selectBlog')
      } else {
        setStep('input')
        setError('No blogs found. Try different keywords.')
      }
    } catch (err) {
      setError('Search failed: ' + err.message)
      setStep('input')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Generate boost content
  const handleSelectBlog = async (blog) => {
    setSelectedBlog(blog)
    setLoading(true)
    setStep('generating')
    
    try {
      const genRes = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
          ...(token && { Authorization: `Bearer ${token}` })
        },
        body: JSON.stringify({
          productType: 'boost',
          productData: {
            ...productData,
            blogTitle: blog.title,
            blogUrl: blog.url,
            blogSnippet: blog.snippet
          }
        })
      })
      const genData = await genRes.json()
      
      if (genData.error) throw new Error(genData.error)
      
      setGeneratedContent(genData.content)
      
      // Create post record if logged in
      if (user && token) {
        const createRes = await fetch(`${API_URL}/api/content/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            productType: 'boost',
            content: genData.content,
            productData: { ...productData, blogUrl: blog.url, blogTitle: blog.title }
          })
        })
        
        if (createRes.ok) {
          const createData = await createRes.json()
          setPostId(createData.id)
        }
        
        await checkTwitterConnection()
      }
      
      setStep('preview')
    } catch (err) {
      setError('Generation failed: ' + err.message)
      setStep('selectBlog')
    } finally {
      setLoading(false)
    }
  }

  // Step 3: Publish to X
  const handlePublish = async () => {
    if (!user || !token) {
      onLogin?.()
      return
    }
    
    setLoading(true)
    setError(null)
    
    try {
      let finalPostId = postId
      if (!finalPostId) {
        const createRes = await fetch(`${API_URL}/api/content/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            productType: 'boost',
            content: generatedContent,
            productData: { ...productData, blogUrl: selectedBlog.url }
          })
        })
        
        if (!createRes.ok) throw new Error('Could not save post')
        const createData = await createRes.json()
        finalPostId = createData.id
        setPostId(finalPostId)
      }
      
      const pubRes = await fetch(`${API_URL}/api/posts/${finalPostId}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
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
        if (pubData.error?.includes('not connected')) {
          setTwitterStatus('not_connected')
          throw new Error('Please connect your X account first')
        }
        throw new Error(pubData.error || 'Publish failed')
      }
      
      setPublishResult(pubData)
      setStep('published')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Get preview text with links
  const getPreview = () => {
    if (!generatedContent || !selectedBlog) return ''
    return generatedContent
      .replace('[BLOG_LINK]', selectedBlog.url)
      .replace('[PRODUCT_LINK]', productData.productUrl || '[your-product-url]')
  }

  // Start over
  const handleStartOver = () => {
    setStep('input')
    setProductData({ name: '', description: '', productUrl: '', keywords: '' })
    setBlogs([])
    setSelectedBlog(null)
    setGeneratedContent(null)
    setPostId(null)
    setPublishResult(null)
    setError(null)
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-orange-950/30 via-gray-950 to-black" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-br from-orange-500/20 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-gradient-to-tl from-cyan-500/10 to-transparent rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-50 px-6 py-4 border-b border-gray-800/50">
        <nav className="max-w-6xl mx-auto flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img src="/fly-wheel/logo-header.svg" alt="FlyWheel" className="h-8" />
          </button>
          
          <div className="flex items-center gap-4">
            {user ? (
              <button 
                onClick={() => navigate('/dashboard')}
                className="text-gray-400 hover:text-white transition-colors text-sm font-medium"
              >
                Dashboard
              </button>
            ) : (
              <button 
                onClick={onLogin}
                className="bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-400 hover:to-yellow-400 text-white px-5 py-2 rounded-full text-sm font-bold transition-all hover:scale-105"
              >
                Login
              </button>
            )}
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {/* Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500/20 to-yellow-500/20 border border-orange-500/30 rounded-full px-4 py-2 mb-4">
            <span className="text-orange-400 text-sm font-medium">🚀 Blog Boost</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black mb-2">
            Promote Your Product with <span className="text-orange-400">Relevant Content</span>
          </h1>
          <p className="text-gray-400">Promote your product alongside relevant blog content — 2-for-1 exposure!</p>
        </div>

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left: Katana Agent */}
          <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-2xl p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-orange-500 to-yellow-500 flex items-center justify-center text-xl shadow-lg shadow-orange-500/40">
                🚀
              </div>
              <h2 className="text-xl font-black bg-gradient-to-r from-orange-400 to-yellow-400 bg-clip-text text-transparent">Blog Boost</h2>
            </div>
            
            <div className="flex-1 flex flex-col bg-gray-800/50 rounded-xl relative overflow-hidden p-8">
              {/* Quick Explainer */}
              <div className="space-y-6">
                <h3 className="text-2xl font-black text-white">How it works<span className="text-orange-400">:</span></h3>
                
                <div className="flex items-center gap-4">
                  <span className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-r from-orange-500 to-yellow-500 text-black flex items-center justify-center text-lg font-black shadow-lg shadow-orange-500/30">1</span>
                  <p className="text-white text-lg">Enter your <span className="font-bold text-orange-400">product name</span> and <span className="font-bold text-yellow-400">keywords</span></p>
                </div>
                
                <div className="flex items-center gap-4">
                  <span className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-r from-orange-500 to-yellow-500 text-black flex items-center justify-center text-lg font-black shadow-lg shadow-orange-500/30">2</span>
                  <p className="text-white text-lg">Pick a <span className="font-bold text-orange-400">relevant blog</span> from our search</p>
                </div>
                
                <div className="flex items-center gap-4">
                  <span className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-r from-orange-500 to-yellow-500 text-black flex items-center justify-center text-lg font-black shadow-lg shadow-orange-500/30">3</span>
                  <p className="text-white text-lg">Review your <span className="font-bold text-yellow-400">AI-generated</span> promo</p>
                </div>
                
                <div className="flex items-center gap-4">
                  <span className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-r from-orange-500 to-yellow-500 text-black flex items-center justify-center text-lg font-black shadow-lg shadow-orange-500/30">4</span>
                  <p className="text-white text-lg"><span className="font-bold text-orange-400">Post to X</span> and watch it fly! 🚀</p>
                </div>

                <div className="mt-8 pt-6 border-t border-gray-700/50">
                  <p className="text-gray-300 text-base mb-4">Questions? <span className="font-bold bg-gradient-to-r from-orange-400 to-yellow-400 bg-clip-text text-transparent">Ask Stella!</span></p>
                  {/* ElevenLabs Widget */}
                  <div 
                    dangerouslySetInnerHTML={{
                      __html: `<elevenlabs-convai agent-id="agent_0501kgsz28fveqbvb5td8k3zpeqb"></elevenlabs-convai>`
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right: Manual Form + Progress */}
          <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-bold text-white">Or use the form</h2>
              {/* Progress indicator */}
              <div className="flex items-center gap-1">
                {['input', 'selectBlog', 'preview', 'published'].map((s, i) => (
                  <div
                    key={s}
                    className={`w-2 h-2 rounded-full transition-all ${
                      step === s || (s === 'input' && step === 'searching') || (s === 'preview' && step === 'generating')
                        ? 'bg-orange-400 scale-125'
                        : ['input', 'searching'].includes(step) && i > 0
                        ? 'bg-gray-700'
                        : step === 'selectBlog' && i > 1
                        ? 'bg-gray-700'
                        : step === 'preview' || step === 'generating' && i > 2
                        ? 'bg-gray-700'
                        : step === 'published'
                        ? 'bg-orange-400/50'
                        : 'bg-orange-400/50'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-red-400 rounded-lg px-4 py-3 text-sm mb-4">
                {error}
              </div>
            )}

            {/* Step: Input */}
            {(step === 'input' || step === 'searching') && (
              <form onSubmit={(e) => { e.preventDefault(); handleSearchBlogs(); }} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={productData.name}
                    onChange={(e) => setProductData({ ...productData, name: e.target.value })}
                    placeholder="e.g., SwordPay"
                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Description</label>
                  <textarea
                    value={productData.description}
                    onChange={(e) => setProductData({ ...productData, description: e.target.value })}
                    placeholder="Brief description..."
                    rows={2}
                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Product URL</label>
                  <input
                    type="url"
                    value={productData.productUrl}
                    onChange={(e) => setProductData({ ...productData, productUrl: e.target.value })}
                    placeholder="https://your-product.com"
                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Search Keywords *</label>
                  <input
                    type="text"
                    required
                    value={productData.keywords}
                    onChange={(e) => setProductData({ ...productData, keywords: e.target.value })}
                    placeholder="e.g., payments, fintech, creators"
                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-400 hover:to-yellow-400 text-white py-4 rounded-xl font-bold transition-all hover:scale-[1.02] disabled:opacity-50"
                >
                  {loading ? 'Searching...' : 'Find Relevant Blogs →'}
                </button>
              </form>
            )}

            {/* Step: Select Blog */}
            {step === 'selectBlog' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-400">Select a blog to promote alongside:</p>
                <div className="max-h-80 overflow-y-auto space-y-2">
                  {blogs.map((blog, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelectBlog(blog)}
                      disabled={loading}
                      className="w-full text-left p-4 rounded-xl border-2 transition-all hover:border-orange-400 hover:bg-orange-500/10 border-gray-700 bg-gray-800/50"
                    >
                      <div className="font-semibold text-white mb-1 line-clamp-1">{blog.title}</div>
                      <div className="text-sm text-gray-400 line-clamp-2">{blog.snippet}</div>
                      <div className="text-xs text-orange-400 mt-2">{blog.source}</div>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setStep('input')}
                  className="text-gray-400 hover:text-white text-sm"
                >
                  ← Different keywords
                </button>
              </div>
            )}

            {/* Step: Generating */}
            {step === 'generating' && (
              <div className="flex flex-col items-center justify-center py-12">
                <svg className="animate-spin h-10 w-10 text-orange-400 mb-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-gray-400">Crafting your promo...</p>
              </div>
            )}

            {/* Step: Preview */}
            {step === 'preview' && (
              <div className="space-y-4">
                <div className="bg-gray-800 rounded-xl p-4">
                  <div className="text-xs text-gray-500 mb-2">PREVIEW</div>
                  <div className="text-white whitespace-pre-wrap text-sm">{getPreview()}</div>
                </div>
                
                <div className="text-sm text-gray-400">
                  <span>📝 Blog:</span>{' '}
                  <a href={selectedBlog?.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
                    {selectedBlog?.title?.substring(0, 50)}...
                  </a>
                </div>

                {user && twitterStatus === 'not_connected' && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                    <p className="text-blue-400 text-sm mb-2">Connect your X account to post</p>
                    <button
                      onClick={connectTwitter}
                      className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold text-sm"
                    >
                      🔗 Connect X
                    </button>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('selectBlog')}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-bold"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={() => navigator.clipboard.writeText(getPreview())}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 px-4 rounded-xl border border-gray-700"
                  >
                    📋
                  </button>
                  <button
                    onClick={user ? handlePublish : onLogin}
                    disabled={loading || (user && twitterStatus === 'not_connected')}
                    className="flex-1 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-400 hover:to-yellow-400 text-white py-3 rounded-xl font-bold disabled:opacity-50"
                  >
                    {loading ? '...' : user ? '🚀 Post to X' : '🔐 Login'}
                  </button>
                </div>
              </div>
            )}

            {/* Step: Published */}
            {step === 'published' && (
              <div className="text-center py-8">
                <div className="text-6xl mb-4">🎉</div>
                <h3 className="text-2xl font-bold text-white mb-2">Posted!</h3>
                <p className="text-gray-400 mb-6">Your boost is live on X</p>
                
                <div className="flex flex-col gap-3">
                  <a
                    href={publishResult?.tweetUrl?.replace('twitter.com', 'x.com')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-gradient-to-r from-orange-500 to-yellow-500 text-white px-6 py-3 rounded-xl font-bold"
                  >
                    View on X →
                  </a>
                  <button
                    onClick={handleStartOver}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-xl font-bold"
                  >
                    Create Another
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* How It Works */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold text-center mb-8">How Blog Boost Works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { emoji: '🔍', title: 'Find Relevant Content', desc: 'We search for blog posts that match your product\'s niche' },
              { emoji: '✨', title: 'AI-Crafted Promo', desc: 'Our AI writes a tweet that naturally promotes both the blog AND your product' },
              { emoji: '🚀', title: 'Post & Track', desc: 'Publish to X with one click and track your clicks' }
            ].map((item, i) => (
              <div key={i} className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 text-center">
                <div className="text-4xl mb-4">{item.emoji}</div>
                <h3 className="font-bold text-white mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing Note */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-full px-6 py-3">
            <span className="text-2xl font-bold text-orange-400">$7.50</span>
            <span className="text-gray-400">per boost</span>
          </div>
          <p className="text-sm text-gray-500 mt-2">No subscriptions. Pay only when you post.</p>
        </div>
      </main>
    </div>
  )
}
