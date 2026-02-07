import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'https://fly-wheel.onrender.com'
const ELEVENLABS_AGENT_ID = 'agent_0501kgsz28fveqbvb5td8k3zpeqb'

export default function App() {
  const [step, setStep] = useState('input')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  const [productData, setProductData] = useState({ name: '', description: '', productUrl: '', keywords: '', email: '' })
  const [blogs, setBlogs] = useState([])
  const [selectedBlog, setSelectedBlog] = useState(null)
  const [content, setContent] = useState(null)
  const [result, setResult] = useState(null)

  // Load ElevenLabs widget
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed'
    script.async = true
    document.body.appendChild(script)
    return () => script.remove()
  }, [])

  // Check for payment success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session_id')
    const success = params.get('success')
    
    if (success === 'true' && sessionId) {
      setStep('processing')
      pollStatus(sessionId)
    }
  }, [])

  const pollStatus = async (sessionId) => {
    let attempts = 0
    const poll = setInterval(async () => {
      attempts++
      try {
        const res = await fetch(`${API_URL}/api/status/${sessionId}`)
        const data = await res.json()
        
        if (data.status === 'published') {
          clearInterval(poll)
          setResult(data)
          setStep('done')
          window.history.replaceState({}, '', '/fly-wheel/')
        } else if (data.status === 'failed' || attempts > 30) {
          clearInterval(poll)
          setError(data.error || 'Something went wrong')
          setStep('input')
          window.history.replaceState({}, '', '/fly-wheel/')
        }
      } catch (e) {
        if (attempts > 30) {
          clearInterval(poll)
          setError('Failed to check status')
          setStep('input')
        }
      }
    }, 2000)
  }

  const searchBlogs = async () => {
    if (!productData.name?.trim() || !productData.keywords?.trim()) {
      setError('Please fill in product name and keywords')
      return
    }
    setError(null)
    setLoading(true)
    setStep('searching')
    
    try {
      const res = await fetch(`${API_URL}/api/blogs/search?keywords=${encodeURIComponent(productData.keywords)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      
      if (data.results?.length > 0) {
        setBlogs(data.results)
        setStep('blogs')
      } else {
        setError('No blogs found. Try different keywords.')
        setStep('input')
      }
    } catch (e) {
      setError(e.message)
      setStep('input')
    } finally {
      setLoading(false)
    }
  }

  const selectBlog = async (blog) => {
    setSelectedBlog(blog)
    setLoading(true)
    setStep('generating')
    
    try {
      const res = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productData, blog })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      
      setContent(data.content)
      setStep('preview')
    } catch (e) {
      setError(e.message)
      setStep('blogs')
    } finally {
      setLoading(false)
    }
  }

  const checkout = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productData, blog: selectedBlog, content })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      
      window.location.href = data.url
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  const preview = content?.replace('[BLOG_LINK]', selectedBlog?.url || '').replace('[PRODUCT_LINK]', productData.productUrl || '')

  const reset = () => {
    setStep('input')
    setProductData({ name: '', description: '', productUrl: '', keywords: '', email: '' })
    setBlogs([])
    setSelectedBlog(null)
    setContent(null)
    setResult(null)
    setError(null)
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-orange-950/30 via-gray-950 to-black" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-500/20 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 px-6 py-4 border-b border-gray-800/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/fly-wheel/squad/stella.png" alt="Stella" className="w-10 h-10 object-contain" />
            <span className="text-xl font-bold">
              <span className="text-white">Blog</span>
              <span className="text-orange-400">Boost</span>
            </span>
          </div>
          <div className="bg-gradient-to-r from-orange-500 to-yellow-500 text-black px-3 py-1 rounded-full text-sm font-black">
            $1.75/post
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-400 rounded-xl px-4 py-3 mb-6">
            {error}
          </div>
        )}

        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-black mb-4">
            <span className="text-white">Get Your Product</span>{' '}
            <span className="text-orange-400">In Front of Readers</span>
          </h1>
          <p className="text-gray-400 text-lg">We find relevant blogs, craft a promo post, and publish it to X. Just $1.75.</p>
        </div>

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-2 gap-8">
          
          {/* Left: Form */}
          <div className="bg-gray-900/80 backdrop-blur border border-gray-700 rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <span className="text-2xl">✍️</span> Create a Boost
            </h2>
            
            {/* Input Step */}
            {(step === 'input' || step === 'searching') && (
              <form onSubmit={(e) => { e.preventDefault(); searchBlogs() }} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Product Name *</label>
                  <input 
                    type="text" required value={productData.name}
                    onChange={(e) => setProductData({ ...productData, name: e.target.value })}
                    placeholder="e.g., SwordPay"
                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Product URL</label>
                  <input 
                    type="url" value={productData.productUrl}
                    onChange={(e) => setProductData({ ...productData, productUrl: e.target.value })}
                    placeholder="https://..."
                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Description</label>
                  <textarea 
                    value={productData.description}
                    onChange={(e) => setProductData({ ...productData, description: e.target.value })}
                    placeholder="What does your product do?"
                    rows={2}
                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Keywords * <span className="text-gray-500">(we'll find blogs about this)</span></label>
                  <input 
                    type="text" required value={productData.keywords}
                    onChange={(e) => setProductData({ ...productData, keywords: e.target.value })}
                    placeholder="e.g., fintech, payments, creators"
                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Your Email * <span className="text-gray-500">(for performance stats)</span></label>
                  <input 
                    type="email" required value={productData.email}
                    onChange={(e) => setProductData({ ...productData, email: e.target.value })}
                    placeholder="you@example.com"
                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <button 
                  type="submit" disabled={loading}
                  className="w-full bg-gradient-to-r from-orange-500 to-yellow-500 text-black py-4 rounded-xl font-bold text-lg disabled:opacity-50"
                >
                  {loading ? 'Searching...' : 'Find Relevant Blogs →'}
                </button>
              </form>
            )}

            {/* Select Blog */}
            {step === 'blogs' && (
              <div>
                <p className="text-sm text-gray-400 mb-4">Pick a blog to boost alongside:</p>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {blogs.map((blog, i) => (
                    <button 
                      key={i} onClick={() => selectBlog(blog)} disabled={loading}
                      className="w-full text-left p-4 rounded-xl border-2 border-gray-700 bg-gray-800/50 hover:border-orange-400 hover:bg-orange-500/10 transition-all disabled:opacity-50"
                    >
                      <div className="font-semibold text-white line-clamp-1">{blog.title}</div>
                      <div className="text-sm text-gray-400 line-clamp-2 mt-1">{blog.snippet}</div>
                      <div className="text-xs text-orange-400 mt-2">{blog.source}</div>
                    </button>
                  ))}
                </div>
                <button onClick={() => setStep('input')} className="text-gray-400 hover:text-white text-sm mt-4">
                  ← Different keywords
                </button>
              </div>
            )}

            {/* Generating */}
            {step === 'generating' && (
              <div className="text-center py-12">
                <div className="animate-spin h-10 w-10 border-4 border-orange-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-gray-400">Crafting your boost...</p>
              </div>
            )}

            {/* Preview */}
            {step === 'preview' && (
              <div>
                <p className="text-sm text-gray-400 mb-4">Preview your boost:</p>
                <div className="bg-gray-800 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-r from-orange-500 to-yellow-500 flex items-center justify-center text-black font-bold text-xs">FW</div>
                    <span className="font-bold text-sm">@flywheelsquad</span>
                  </div>
                  <div className="text-white whitespace-pre-wrap text-sm">{preview}</div>
                </div>
                <p className="text-sm text-gray-400 mb-6">
                  📝 Alongside: <a href={selectedBlog?.url} target="_blank" className="text-orange-400 hover:underline">{selectedBlog?.title?.substring(0, 40)}...</a>
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setStep('blogs')} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-bold">
                    ← Back
                  </button>
                  <button onClick={checkout} disabled={loading} className="flex-[2] bg-gradient-to-r from-orange-500 to-yellow-500 text-black py-3 rounded-xl font-bold text-lg disabled:opacity-50">
                    {loading ? 'Loading...' : 'Pay $1.75 & Post →'}
                  </button>
                </div>
              </div>
            )}

            {/* Processing */}
            {step === 'processing' && (
              <div className="text-center py-12">
                <div className="animate-spin h-10 w-10 border-4 border-orange-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-gray-400 text-lg">Payment received!</p>
                <p className="text-gray-500 text-sm mt-2">Posting your boost...</p>
              </div>
            )}

            {/* Done */}
            {step === 'done' && (
              <div className="text-center py-8">
                <div className="text-5xl mb-4">🎉</div>
                <h2 className="text-2xl font-black mb-2">You're Live!</h2>
                <p className="text-gray-400 mb-6">Your boost has been posted to X</p>
                {result?.tweetUrl && (
                  <a 
                    href={result.tweetUrl} target="_blank"
                    className="inline-block bg-gradient-to-r from-orange-500 to-yellow-500 text-black px-6 py-3 rounded-xl font-bold mb-4 hover:scale-105 transition-transform"
                  >
                    View on X →
                  </a>
                )}
                <br />
                <button onClick={reset} className="text-orange-400 hover:text-orange-300 mt-4">
                  Create Another Boost
                </button>
              </div>
            )}
          </div>

          {/* Right: How It Works + Stella */}
          <div className="bg-gray-900/80 backdrop-blur border border-gray-700 rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-6">How It Works</h2>
            
            <div className="space-y-6">
              {[
                { num: '1', icon: '📝', title: 'Enter your product', desc: 'Name, URL, description, and keywords' },
                { num: '2', icon: '🔍', title: 'Pick a blog', desc: 'We find relevant content your audience reads' },
                { num: '3', icon: '✨', title: 'AI crafts your boost', desc: 'Natural promo linking blog + your product' },
                { num: '4', icon: '🚀', title: 'Pay & post', desc: '$1.75 via Stripe, posted instantly to X' },
              ].map((s, i) => (
                <div key={i} className="flex items-start gap-4">
                  <span className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-r from-orange-500 to-yellow-500 text-black flex items-center justify-center text-lg font-black">
                    {s.num}
                  </span>
                  <div>
                    <h3 className="font-bold text-white flex items-center gap-2">
                      <span>{s.icon}</span> {s.title}
                    </h3>
                    <p className="text-gray-400 text-sm">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Ask Stella */}
            <div className="mt-8 pt-6 border-t border-gray-700">
              <p className="text-gray-300 mb-4">
                Questions? <span className="font-bold text-orange-400">Ask Stella!</span>
              </p>
              <div 
                dangerouslySetInnerHTML={{ __html: `<elevenlabs-convai agent-id="${ELEVENLABS_AGENT_ID}"></elevenlabs-convai>` }} 
              />
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-gray-800 px-6 py-6 mt-16">
        <div className="max-w-6xl mx-auto text-center text-gray-500 text-sm">
          © 2026 BlogBoost
        </div>
      </footer>
    </div>
  )
}
