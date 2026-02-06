import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Max character image 
const MAX_IMAGE = '/fly-wheel/squad/max.png'

// Agent messages for different stages
const AGENT_MESSAGES = {
  welcome: [
    "Hey! I'm Max, your Blog Boost guide. 👋",
    "I'll help you promote your product alongside relevant blog content. It's like getting 2-for-1 exposure!",
    "Ready to get started? Just tell me about your product below."
  ],
  searching: [
    "Great product! Let me find some relevant blogs for you...",
    "I'm searching through thousands of articles to find the perfect match. ✨"
  ],
  blogsFound: [
    "Found some great blogs! 🎯",
    "Pick the one that best fits your product's vibe. The closer the match, the more natural your promo will feel."
  ],
  generating: [
    "Nice choice! Now let me craft the perfect promo...",
    "I'm writing something that highlights both the blog AND your product. Magic happening! ✍️"
  ],
  ready: [
    "Your boost is ready! 🚀",
    "Take a look at the preview. If you love it, hit publish and watch your product fly!"
  ],
  published: [
    "BOOM! You're live on X! 🎉",
    "Your product is now riding the wave of that blog's audience. Nice work!"
  ],
  noBlogs: [
    "Hmm, I couldn't find blogs with those keywords. 🤔",
    "Try different keywords — think about topics your audience cares about, not just your product name."
  ]
}

export default function BlogBoostPage({ user, token, onLogin }) {
  const navigate = useNavigate()
  const chatEndRef = useRef(null)
  
  // Chat messages
  const [messages, setMessages] = useState([])
  const [isTyping, setIsTyping] = useState(false)
  
  // Flow state
  const [step, setStep] = useState('welcome') // welcome, searching, selectBlog, generating, preview, published
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

  // Scroll to bottom of chat
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Add agent messages with typing effect
  const addAgentMessages = async (messageKeys) => {
    const msgs = AGENT_MESSAGES[messageKeys] || [messageKeys]
    
    for (const msg of msgs) {
      setIsTyping(true)
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500))
      setIsTyping(false)
      setMessages(prev => [...prev, { type: 'agent', text: msg }])
      await new Promise(resolve => setTimeout(resolve, 300))
    }
  }

  // Initialize with welcome message
  useEffect(() => {
    addAgentMessages('welcome')
  }, [])

  // Scroll when messages change
  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping])

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
  const handleSearchBlogs = async (e) => {
    e.preventDefault()
    
    if (!productData.name.trim() || !productData.keywords.trim()) {
      setError('Please fill in product name and keywords')
      return
    }
    
    setError(null)
    setLoading(true)
    setStep('searching')
    
    // Add user message
    setMessages(prev => [...prev, { 
      type: 'user', 
      text: `Product: ${productData.name}\nKeywords: ${productData.keywords}` 
    }])
    
    await addAgentMessages('searching')
    
    try {
      const res = await fetch(
        `${API_URL}/api/blogs/search?keywords=${encodeURIComponent(productData.keywords)}`,
        { headers: { 'ngrok-skip-browser-warning': 'true' } }
      )
      const data = await res.json()
      
      if (data.results?.length > 0) {
        setBlogs(data.results)
        setStep('selectBlog')
        await addAgentMessages('blogsFound')
      } else {
        setStep('welcome')
        await addAgentMessages('noBlogs')
      }
    } catch (err) {
      setError('Search failed: ' + err.message)
      setStep('welcome')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Generate boost content
  const handleSelectBlog = async (blog) => {
    setSelectedBlog(blog)
    setMessages(prev => [...prev, { 
      type: 'user', 
      text: `Selected: "${blog.title}"` 
    }])
    
    setLoading(true)
    setStep('generating')
    await addAgentMessages('generating')
    
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
        
        // Check Twitter status
        await checkTwitterConnection()
      }
      
      setStep('preview')
      await addAgentMessages('ready')
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
      await addAgentMessages('published')
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
    setStep('welcome')
    setProductData({ name: '', description: '', productUrl: '', keywords: '' })
    setBlogs([])
    setSelectedBlog(null)
    setGeneratedContent(null)
    setPostId(null)
    setPublishResult(null)
    setError(null)
    setMessages([])
    addAgentMessages('welcome')
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
      <main className="relative z-10 max-w-4xl mx-auto px-4 py-8">
        {/* Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500/20 to-yellow-500/20 border border-orange-500/30 rounded-full px-4 py-2 mb-4">
            <span className="text-orange-400 text-sm font-medium">🚀 Blog Boost</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black mb-2">
            Promote Your Product with <span className="text-orange-400">Relevant Content</span>
          </h1>
          <p className="text-gray-400">Max will guide you through creating the perfect promo</p>
        </div>

        {/* Chat Interface */}
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-2xl overflow-hidden">
          {/* Chat Header */}
          <div className="bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border-b border-gray-700 px-6 py-4 flex items-center gap-4">
            <img src={MAX_IMAGE} alt="Max" className="w-12 h-12 object-contain" />
            <div>
              <h2 className="font-bold text-white">Max</h2>
              <p className="text-sm text-gray-400">Your Blog Boost Guide</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-gray-400">Online</span>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="h-96 overflow-y-auto p-6 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.type === 'agent' && (
                  <img src={MAX_IMAGE} alt="Max" className="w-8 h-8 object-contain mr-3 flex-shrink-0" />
                )}
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.type === 'user' 
                    ? 'bg-gradient-to-r from-orange-500 to-yellow-500 text-white' 
                    : 'bg-gray-800 text-gray-200'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div className="flex justify-start">
                <img src={MAX_IMAGE} alt="Max" className="w-8 h-8 object-contain mr-3" />
                <div className="bg-gray-800 rounded-2xl px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            
            <div ref={chatEndRef} />
          </div>

          {/* Error Display */}
          {error && (
            <div className="mx-6 mb-4 bg-red-500/20 border border-red-500/50 text-red-400 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {/* Input Area - Changes based on step */}
          <div className="border-t border-gray-700 p-6">
            {/* Step: Welcome - Product Form */}
            {step === 'welcome' && (
              <form onSubmit={handleSearchBlogs} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    required
                    value={productData.name}
                    onChange={(e) => setProductData({ ...productData, name: e.target.value })}
                    placeholder="Product Name *"
                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                  />
                  <input
                    type="url"
                    value={productData.productUrl}
                    onChange={(e) => setProductData({ ...productData, productUrl: e.target.value })}
                    placeholder="Product URL"
                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <textarea
                  value={productData.description}
                  onChange={(e) => setProductData({ ...productData, description: e.target.value })}
                  placeholder="Brief description (optional)"
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                />
                <div className="flex gap-4">
                  <input
                    type="text"
                    required
                    value={productData.keywords}
                    onChange={(e) => setProductData({ ...productData, keywords: e.target.value })}
                    placeholder="Search keywords (e.g., health benefits, organic food) *"
                    className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-400 hover:to-yellow-400 text-white px-8 py-3 rounded-xl font-bold transition-all hover:scale-105 disabled:opacity-50"
                  >
                    {loading ? '...' : 'Find Blogs →'}
                  </button>
                </div>
              </form>
            )}

            {/* Step: Searching */}
            {step === 'searching' && (
              <div className="flex items-center justify-center gap-4 py-4">
                <svg className="animate-spin h-6 w-6 text-orange-400" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-gray-400">Searching for relevant blogs...</span>
              </div>
            )}

            {/* Step: Select Blog */}
            {step === 'selectBlog' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-400 mb-2">Select a blog to promote alongside:</p>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {blogs.map((blog, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelectBlog(blog)}
                      disabled={loading}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all hover:border-orange-400 hover:bg-orange-500/10 ${
                        selectedBlog?.url === blog.url
                          ? 'border-orange-400 bg-orange-500/10'
                          : 'border-gray-700 bg-gray-800/50'
                      }`}
                    >
                      <div className="font-semibold text-white mb-1 line-clamp-1">{blog.title}</div>
                      <div className="text-sm text-gray-400 line-clamp-2">{blog.snippet}</div>
                      <div className="text-xs text-orange-400 mt-2">{blog.source}</div>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setStep('welcome')}
                  className="text-gray-400 hover:text-white text-sm"
                >
                  ← Search different keywords
                </button>
              </div>
            )}

            {/* Step: Generating */}
            {step === 'generating' && (
              <div className="flex items-center justify-center gap-4 py-4">
                <svg className="animate-spin h-6 w-6 text-orange-400" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-gray-400">Crafting your perfect promo...</span>
              </div>
            )}

            {/* Step: Preview */}
            {step === 'preview' && (
              <div className="space-y-4">
                <div className="bg-gray-800 rounded-xl p-4">
                  <div className="text-xs text-gray-500 mb-2">PREVIEW</div>
                  <div className="text-white whitespace-pre-wrap">{getPreview()}</div>
                </div>
                
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <span>📝 Blog:</span>
                  <a href={selectedBlog?.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline truncate">
                    {selectedBlog?.title}
                  </a>
                </div>

                {/* Twitter Status */}
                {user && twitterStatus === 'not_connected' && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                    <p className="text-blue-400 text-sm mb-2">Connect your X account to post</p>
                    <button
                      onClick={connectTwitter}
                      className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold text-sm transition-colors"
                    >
                      🔗 Connect X Account
                    </button>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('selectBlog')}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-bold transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(getPreview())
                    }}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 px-4 rounded-xl font-semibold border border-gray-700"
                  >
                    📋 Copy
                  </button>
                  <button
                    onClick={user ? handlePublish : onLogin}
                    disabled={loading || (user && twitterStatus === 'not_connected')}
                    className="flex-1 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-400 hover:to-yellow-400 text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50"
                  >
                    {loading ? 'Publishing...' : user ? '🚀 Post to X' : '🔐 Login to Post'}
                  </button>
                </div>
              </div>
            )}

            {/* Step: Published */}
            {step === 'published' && (
              <div className="text-center space-y-4">
                <div className="flex justify-center gap-4">
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
                {publishResult?.trackedLink && (
                  <p className="text-sm text-gray-500">
                    Tracking: <code className="text-cyan-400">{publishResult.trackedLink}</code>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* How It Works */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-center mb-8">How Blog Boost Works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { emoji: '🔍', title: 'Find Relevant Content', desc: 'We search for blog posts that match your product\'s niche' },
              { emoji: '✨', title: 'AI-Crafted Promo', desc: 'Our AI writes a tweet that naturally promotes both the blog AND your product' },
              { emoji: '🚀', title: 'Post & Track', desc: 'Publish to X with one click and track your clicks' }
            ].map((step, i) => (
              <div key={i} className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 text-center">
                <div className="text-4xl mb-4">{step.emoji}</div>
                <h3 className="font-bold text-white mb-2">{step.title}</h3>
                <p className="text-gray-400 text-sm">{step.desc}</p>
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
