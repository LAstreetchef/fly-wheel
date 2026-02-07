import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Stella - ElevenLabs Agent ID
const ELEVENLABS_AGENT_ID = 'agent_0501kgsz28fveqbvb5td8k3zpeqb'

// Price
const BOOST_PRICE = '$1.75'

export default function BlogBoostPage() {
  const [searchParams] = useSearchParams()
  
  // Flow state
  const [step, setStep] = useState('input') // input, searching, selectBlog, generating, preview, paying, published
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Product data
  const [productData, setProductData] = useState({ name: '', description: '', productUrl: '', keywords: '', xHandles: '' })
  const [blogs, setBlogs] = useState([])
  const [selectedBlog, setSelectedBlog] = useState(null)
  const [generatedContent, setGeneratedContent] = useState(null)
  
  // Result
  const [publishResult, setPublishResult] = useState(null)

  // Load ElevenLabs widget script
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed'
    script.async = true
    script.type = 'text/javascript'
    document.body.appendChild(script)
    return () => {
      const existingScript = document.querySelector('script[src*="elevenlabs"]')
      if (existingScript) existingScript.remove()
    }
  }, [])

  // Check for payment success on mount
  useEffect(() => {
    const sessionId = searchParams.get('session_id')
    const success = searchParams.get('success')
    
    if (success === 'true' && sessionId) {
      setStep('paying')
      checkPaymentAndPublish(sessionId)
    }
  }, [searchParams])

  // After Stripe payment, check status and publish
  const checkPaymentAndPublish = async (sessionId) => {
    try {
      // Poll for result (webhook may have already processed it)
      let attempts = 0
      const poll = setInterval(async () => {
        attempts++
        const res = await fetch(`${API_URL}/api/boost/status/${sessionId}`, {
          headers: { 'ngrok-skip-browser-warning': 'true' }
        })
        const data = await res.json()
        
        if (data.status === 'published') {
          clearInterval(poll)
          setPublishResult(data)
          setStep('published')
          window.history.replaceState({}, '', window.location.pathname)
        } else if (data.status === 'failed' || attempts > 60) {
          clearInterval(poll)
          setError(data.error || 'Something went wrong. Contact support.')
          setStep('input')
          window.history.replaceState({}, '', window.location.pathname)
        }
      }, 2000)
    } catch (err) {
      setError('Failed to check payment status: ' + err.message)
      setStep('input')
    }
  }

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
      if (!res.ok) throw new Error(result.error || `Server error: ${res.status}`)
      
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

  const handleSelectBlog = async (blog) => {
    setSelectedBlog(blog)
    setLoading(true)
    setStep('generating')
    
    try {
      const genRes = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({
          productType: 'boost',
          productData: { ...productData, blogTitle: blog.title, blogUrl: blog.url, blogSnippet: blog.snippet }
        })
      })
      
      const genData = await genRes.json()
      if (genData.error) throw new Error(genData.error)
      
      setGeneratedContent(genData.content)
      setStep('preview')
    } catch (err) {
      setError('Generation failed: ' + err.message)
      setStep('selectBlog')
    } finally {
      setLoading(false)
    }
  }

  const handlePayAndPost = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Create Stripe Checkout session with all the data
      const res = await fetch(`${API_URL}/api/boost/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({
          productData,
          blog: selectedBlog,
          content: generatedContent
        })
      })
      
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      
      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      setError('Checkout failed: ' + err.message)
      setLoading(false)
    }
  }

  const getPreview = () => {
    if (!generatedContent || !selectedBlog) return ''
    return generatedContent
      .replace('[BLOG_LINK]', selectedBlog.url)
      .replace('[PRODUCT_LINK]', productData.productUrl || '[your-product-url]')
  }

  const handleStartOver = () => {
    setStep('input')
    setProductData({ name: '', description: '', productUrl: '', keywords: '', xHandles: '' })
    setBlogs([])
    setSelectedBlog(null)
    setGeneratedContent(null)
    setPublishResult(null)
    setError(null)
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-orange-950/30 via-gray-950 to-black" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-br from-orange-500/20 to-transparent rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-50 px-6 py-4 border-b border-gray-800/50">
        <nav className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/fly-wheel/squad/stella.png" alt="Stella" className="w-10 h-10 object-contain" />
            <span className="text-2xl font-bold">
              <span className="text-white">Blog</span>
              <span className="text-orange-400">Boost</span>
            </span>
          </div>
          <div className="bg-gradient-to-r from-orange-500 to-yellow-500 text-black px-4 py-1 rounded-full text-sm font-black">
            {BOOST_PRICE}/post
          </div>
        </nav>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto px-4 py-8">
        {/* Error */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-400 rounded-xl px-6 py-4 mb-6">
            {error}
          </div>
        )}

        {/* Hero - only show on input step */}
        {step === 'input' && (
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-black mb-4">
              <span className="text-white">Get Your Product</span>
              <br />
              <span className="text-orange-400">In Front of Readers</span>
            </h1>
            <p className="text-gray-400 text-lg">We find relevant blogs, craft a promo post, and publish it to X. Just {BOOST_PRICE}.</p>
          </div>
        )}

        {/* Main Card */}
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-2xl p-6 md:p-8 mb-8">
          
          {/* Step: Input */}
          {(step === 'input' || step === 'searching') && (
            <>
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-orange-500 text-black flex items-center justify-center text-sm font-black">1</span>
                Tell us about your product
              </h2>
              <form onSubmit={(e) => { e.preventDefault(); handleSearchBlogs() }} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Product Name *</label>
                    <input type="text" required value={productData.name} onChange={(e) => setProductData({ ...productData, name: e.target.value })} placeholder="e.g., SwordPay" className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Product URL</label>
                    <input type="url" value={productData.productUrl} onChange={(e) => setProductData({ ...productData, productUrl: e.target.value })} placeholder="https://your-product.com" className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Description</label>
                  <textarea value={productData.description} onChange={(e) => setProductData({ ...productData, description: e.target.value })} placeholder="What does your product do? Who is it for?" rows={2} className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Search Keywords * <span className="text-gray-500">(we'll find blogs about this)</span></label>
                  <input type="text" required value={productData.keywords} onChange={(e) => setProductData({ ...productData, keywords: e.target.value })} placeholder="e.g., creator economy, payments, fintech" className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">X Accounts to Tag <span className="text-gray-500">(optional)</span></label>
                  <input type="text" value={productData.xHandles} onChange={(e) => setProductData({ ...productData, xHandles: e.target.value })} placeholder="e.g., @elonmusk, @blogsquad" className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
                </div>
                <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-orange-500 to-yellow-500 text-black py-4 rounded-xl font-bold text-lg disabled:opacity-50 hover:scale-[1.02] transition-transform">
                  {loading ? 'Searching...' : 'Find Relevant Blogs →'}
                </button>
              </form>
            </>
          )}

          {/* Step: Select Blog */}
          {step === 'selectBlog' && (
            <>
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-orange-500 text-black flex items-center justify-center text-sm font-black">2</span>
                Pick a blog to boost alongside
              </h2>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {blogs.map((blog, i) => (
                  <button key={i} onClick={() => handleSelectBlog(blog)} disabled={loading} className="w-full text-left p-4 rounded-xl border-2 transition-all hover:border-orange-400 hover:bg-orange-500/10 border-gray-700 bg-gray-800/50 disabled:opacity-50">
                    <div className="font-semibold text-white mb-1 line-clamp-1">{blog.title}</div>
                    <div className="text-sm text-gray-400 line-clamp-2">{blog.snippet}</div>
                    <div className="text-xs text-orange-400 mt-2">{blog.source}</div>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep('input')} className="text-gray-400 hover:text-white text-sm mt-4">← Different keywords</button>
            </>
          )}

          {/* Step: Generating */}
          {step === 'generating' && (
            <div className="flex flex-col items-center justify-center py-16">
              <svg className="animate-spin h-12 w-12 text-orange-400 mb-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-gray-400 text-lg">Crafting your boost...</p>
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && (
            <>
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-orange-500 text-black flex items-center justify-center text-sm font-black">3</span>
                Preview & Pay
              </h2>
              <div className="bg-gray-800 rounded-xl p-5 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-orange-500 to-yellow-500 flex items-center justify-center text-black font-bold text-sm">BB</div>
                  <div>
                    <div className="font-bold text-white text-sm">@BlogBoost</div>
                    <div className="text-gray-500 text-xs">will post this</div>
                  </div>
                </div>
                <div className="text-white whitespace-pre-wrap text-sm leading-relaxed">{getPreview()}</div>
              </div>
              <div className="text-sm text-gray-400 mb-6">
                📝 Promoting alongside: <a href={selectedBlog?.url} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:underline">{selectedBlog?.title?.substring(0, 50)}...</a>
              </div>
              
              <div className="flex gap-3">
                <button onClick={() => setStep('selectBlog')} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-4 rounded-xl font-bold">
                  ← Back
                </button>
                <button onClick={handlePayAndPost} disabled={loading} className="flex-[2] bg-gradient-to-r from-orange-500 to-yellow-500 text-black py-4 rounded-xl font-bold text-lg disabled:opacity-50 hover:scale-[1.02] transition-transform">
                  {loading ? 'Loading...' : `Pay ${BOOST_PRICE} & Post →`}
                </button>
              </div>
            </>
          )}

          {/* Step: Paying/Processing */}
          {step === 'paying' && (
            <div className="flex flex-col items-center justify-center py-16">
              <svg className="animate-spin h-12 w-12 text-orange-400 mb-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-gray-400 text-lg">Payment received! Posting your boost...</p>
              <p className="text-gray-500 text-sm mt-2">This usually takes about 10 seconds</p>
            </div>
          )}

          {/* Step: Published */}
          {step === 'published' && (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">🎉</div>
              <h3 className="text-3xl font-black text-white mb-2">You're Live!</h3>
              <p className="text-gray-400 mb-8">Your boost has been posted to X</p>
              
              {publishResult?.tweetUrl && (
                <a href={publishResult.tweetUrl.replace('twitter.com', 'x.com')} target="_blank" rel="noopener noreferrer" className="inline-block bg-gradient-to-r from-orange-500 to-yellow-500 text-black px-8 py-4 rounded-xl font-bold text-lg mb-6 hover:scale-105 transition-transform">
                  View Your Boost on X →
                </a>
              )}
              
              <br />
              <button onClick={handleStartOver} className="text-orange-400 hover:text-orange-300 font-medium mt-4">
                Create Another Boost
              </button>
            </div>
          )}
        </div>

        {/* How It Works - compact version on side for larger screens */}
        {step === 'input' && (
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {[
              { icon: '🔍', title: 'Find', desc: 'We search for blogs your audience reads' },
              { icon: '✨', title: 'Craft', desc: 'AI creates a natural promo post' },
              { icon: '🚀', title: 'Post', desc: 'Goes live on X instantly' },
            ].map((item, i) => (
              <div key={i} className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-center">
                <div className="text-3xl mb-2">{item.icon}</div>
                <h3 className="font-bold text-white">{item.title}</h3>
                <p className="text-gray-400 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        )}

        {/* Ask Stella - floating */}
        <div className="fixed bottom-4 right-4 z-50">
          <div dangerouslySetInnerHTML={{ __html: `<elevenlabs-convai agent-id="${ELEVENLABS_AGENT_ID}"></elevenlabs-convai>` }} />
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gray-800 px-6 py-6 mt-8">
        <div className="max-w-4xl mx-auto text-center text-gray-500 text-sm">
          <p>© 2026 BlogBoost by FlyWheel</p>
        </div>
      </footer>
    </div>
  )
}
