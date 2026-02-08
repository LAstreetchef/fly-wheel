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
  
  // Prime state
  const [showPrime, setShowPrime] = useState(false)
  const [primeAccount, setPrimeAccount] = useState(null)
  const [primeTiers, setPrimeTiers] = useState([])
  const [primeEmail, setPrimeEmail] = useState(() => localStorage.getItem('primeEmail') || '')

  // Load ElevenLabs widget
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed'
    script.async = true
    document.body.appendChild(script)
    return () => script.remove()
  }, [])
  
  // Load Prime tiers
  useEffect(() => {
    fetch(`${API_URL}/api/prime/tiers`)
      .then(res => res.json())
      .then(data => setPrimeTiers(data.tiers || []))
      .catch(err => console.error('Failed to load tiers:', err))
  }, [])
  
  // Check Prime account on load
  useEffect(() => {
    if (primeEmail) {
      checkPrimeAccount(primeEmail)
      // Auto-fill email in product data
      setProductData(prev => ({ ...prev, email: prev.email || primeEmail }))
    }
  }, [primeEmail])
  
  // Check for Prime subscription success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('prime_success') === 'true') {
      const email = params.get('email')
      if (email) {
        localStorage.setItem('primeEmail', email)
        setPrimeEmail(email)
        setShowPrime(true)
        // Poll for account to be created (webhook may take a moment)
        let attempts = 0
        const poll = setInterval(async () => {
          attempts++
          try {
            const res = await fetch(`${API_URL}/api/account/${encodeURIComponent(email)}`)
            const data = await res.json()
            if (data.exists) {
              clearInterval(poll)
              setPrimeAccount(data)
              window.history.replaceState({}, '', '/fly-wheel/')
            } else if (attempts > 15) {
              clearInterval(poll)
              window.history.replaceState({}, '', '/fly-wheel/')
            }
          } catch (e) {
            if (attempts > 15) clearInterval(poll)
          }
        }, 2000)
      }
    }
    if (params.get('prime') === 'true') {
      setShowPrime(true)
      window.history.replaceState({}, '', '/fly-wheel/')
    }
  }, [])
  
  const checkPrimeAccount = async (email) => {
    try {
      const res = await fetch(`${API_URL}/api/account/${encodeURIComponent(email)}`)
      const data = await res.json()
      if (data.exists) {
        setPrimeAccount(data)
      } else {
        setPrimeAccount(null)
      }
    } catch (e) {
      console.error('Failed to check account:', e)
    }
  }
  
  const loginPrime = async () => {
    if (!primeEmail) return
    localStorage.setItem('primeEmail', primeEmail)
    await checkPrimeAccount(primeEmail)
  }
  
  const logoutPrime = () => {
    localStorage.removeItem('primeEmail')
    setPrimeEmail('')
    setPrimeAccount(null)
  }
  
  const subscribePrime = async (tier) => {
    if (!primeEmail) {
      setError('Please enter your email first')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: primeEmail, tier })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      window.location.href = data.url
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }
  
  const usePrimeBoost = async () => {
    if (!primeAccount || primeAccount.boostBalance <= 0) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/prime/boost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: primeEmail,
          productData,
          blog: selectedBlog,
          content
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      
      setResult({ tweetUrl: data.tweetUrl })
      setPrimeAccount(prev => ({ ...prev, boostBalance: data.remainingBalance }))
      setStep('done')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

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
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setShowPrime(false); reset(); }}>
            <img src="/fly-wheel/squad/stella.png" alt="Stella" className="w-10 h-10 object-contain" />
            <span className="text-xl font-bold">
              <span className="text-white">DAU</span>
              <span className="text-orange-400">finder</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            {primeAccount && (
              <div className="hidden sm:flex items-center gap-2 text-sm">
                <span className="text-yellow-400">⚡ {primeAccount.boostBalance}</span>
                <span className="text-gray-500">boosts</span>
              </div>
            )}
            <button
              onClick={() => setShowPrime(!showPrime)}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
                showPrime || primeAccount
                  ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-black'
                  : 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-600'
              }`}
            >
              {primeAccount ? '⚡ Prime' : 'Go Prime'}
            </button>
            {!showPrime && (
              <div className="bg-gradient-to-r from-orange-500 to-yellow-500 text-black px-3 py-1 rounded-full text-sm font-black">
                $1.99/post
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-400 rounded-xl px-4 py-3 mb-6">
            {error}
          </div>
        )}

        {/* Hero - changes based on Prime mode */}
        {!showPrime ? (
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-black mb-4">
              <span className="text-white">Get Your Product</span>{' '}
              <span className="text-orange-400">In Front of Readers</span>
            </h1>
            <p className="text-gray-400 text-lg">We find relevant blogs, craft a promo post, and publish it to X. Just $1.99.</p>
          </div>
        ) : (
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-black mb-4">
              <span className="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">DAUfinder Prime</span>
            </h1>
            <p className="text-gray-400 text-lg">
              {primeAccount 
                ? `Welcome back! You have ${primeAccount.boostBalance} boosts remaining.`
                : 'Subscribe for bulk boosts at a fraction of the cost.'
              }
            </p>
          </div>
        )}
        
        {/* Prime Section */}
        {showPrime && (
          <div className="mb-12">
            {/* Login/Account Section */}
            <div className="bg-gray-900/80 backdrop-blur border border-gray-700 rounded-2xl p-6 mb-8 max-w-xl mx-auto">
              {!primeAccount ? (
                <div>
                  <h3 className="text-lg font-bold mb-4">Enter your email to get started</h3>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={primeEmail}
                      onChange={(e) => setPrimeEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                    />
                    <button
                      onClick={loginPrime}
                      className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-xl font-bold"
                    >
                      Check
                    </button>
                  </div>
                  <p className="text-gray-500 text-sm mt-2">Already subscribed? Enter your email to check your balance.</p>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-yellow-400 text-2xl font-black">{primeAccount.boostBalance}</span>
                      <span className="text-gray-400">boosts remaining</span>
                    </div>
                    <p className="text-gray-500 text-sm">{primeEmail} · {primeAccount.tierName} plan</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowPrime(false)}
                      className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-6 py-3 rounded-xl font-bold"
                    >
                      Use a Boost →
                    </button>
                    <button
                      onClick={logoutPrime}
                      className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-3 rounded-xl"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            {/* Pricing Tiers */}
            {!primeAccount && (
              <div>
                <h2 className="text-2xl font-black text-center mb-6">Choose Your Plan</h2>
                <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                  {primeTiers.map((tier) => (
                    <div 
                      key={tier.id}
                      className={`bg-gray-900/80 backdrop-blur border rounded-2xl p-6 ${
                        tier.id === 'growth' 
                          ? 'border-orange-500 ring-2 ring-orange-500/50' 
                          : 'border-gray-700'
                      }`}
                    >
                      {tier.id === 'growth' && (
                        <div className="bg-gradient-to-r from-orange-500 to-yellow-500 text-black text-xs font-bold px-3 py-1 rounded-full w-fit mb-4">
                          MOST POPULAR
                        </div>
                      )}
                      <h3 className="text-xl font-bold mb-2">{tier.name}</h3>
                      <div className="mb-4">
                        <span className="text-4xl font-black">${tier.price}</span>
                        <span className="text-gray-400">/mo</span>
                      </div>
                      <div className="space-y-2 mb-6 text-sm">
                        <div className="flex items-center gap-2 text-gray-300">
                          <span className="text-green-400">✓</span>
                          <span><strong className="text-white">{tier.boosts.toLocaleString()}</strong> boosts/month</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-300">
                          <span className="text-green-400">✓</span>
                          <span><strong className="text-orange-400">${tier.pricePerBoost}</strong> per boost</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-300">
                          <span className="text-green-400">✓</span>
                          <span>Same great quality</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-300">
                          <span className="text-green-400">✓</span>
                          <span>Cancel anytime</span>
                        </div>
                      </div>
                      <button
                        onClick={() => subscribePrime(tier.id)}
                        disabled={loading || !primeEmail}
                        className={`w-full py-3 rounded-xl font-bold transition-all ${
                          tier.id === 'growth'
                            ? 'bg-gradient-to-r from-orange-500 to-yellow-500 text-black hover:scale-105'
                            : 'bg-gray-700 hover:bg-gray-600 text-white'
                        } disabled:opacity-50 disabled:hover:scale-100`}
                      >
                        {loading ? 'Loading...' : 'Subscribe'}
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-center text-gray-500 text-sm mt-6">
                  💳 Secure checkout via Stripe · Cancel anytime · Boosts reset monthly
                </p>
                
                {/* Comparison with pay-per-boost */}
                <div className="mt-12 bg-gray-900/50 border border-gray-700 rounded-2xl p-6 max-w-2xl mx-auto">
                  <h3 className="text-lg font-bold mb-4 text-center">💡 Prime vs Pay-Per-Boost</h3>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div></div>
                    <div className="text-center font-bold text-gray-400">Pay-Per-Boost</div>
                    <div className="text-center font-bold text-orange-400">Prime</div>
                    
                    <div className="text-gray-400">Price per boost</div>
                    <div className="text-center">$1.99</div>
                    <div className="text-center text-green-400">As low as $0.10</div>
                    
                    <div className="text-gray-400">100 boosts</div>
                    <div className="text-center">$175</div>
                    <div className="text-center text-green-400">$29 (83% off)</div>
                    
                    <div className="text-gray-400">1000 boosts</div>
                    <div className="text-center">$1,990</div>
                    <div className="text-center text-green-400">$199 (89% off)</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Two Column Layout - hide when viewing Prime pricing */}
        <div className={`grid lg:grid-cols-2 gap-8 ${showPrime && !primeAccount ? 'hidden' : ''}`}>
          
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
                  <label className="block text-sm text-gray-400 mb-1">
                    Your Email * <span className="text-gray-500">(for performance stats)</span>
                    {primeAccount && <span className="text-yellow-400 ml-2">⚡ Prime</span>}
                  </label>
                  <input 
                    type="email" required value={productData.email || primeEmail}
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
                
                {/* Prime member quick boost */}
                {primeAccount && primeAccount.boostBalance > 0 && (
                  <div className="mb-4 p-4 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-xl">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-yellow-400 font-bold">⚡ Use Prime Boost</p>
                        <p className="text-sm text-gray-400">{primeAccount.boostBalance} boosts remaining</p>
                      </div>
                      <button
                        onClick={usePrimeBoost}
                        disabled={loading}
                        className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-6 py-3 rounded-xl font-bold disabled:opacity-50"
                      >
                        {loading ? 'Posting...' : 'Post Free →'}
                      </button>
                    </div>
                  </div>
                )}
                
                <div className="flex gap-3">
                  <button onClick={() => setStep('blogs')} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-bold">
                    ← Back
                  </button>
                  {!primeAccount ? (
                    <button onClick={checkout} disabled={loading} className="flex-[2] bg-gradient-to-r from-orange-500 to-yellow-500 text-black py-3 rounded-xl font-bold text-lg disabled:opacity-50">
                      {loading ? 'Loading...' : 'Pay $1.99 & Post →'}
                    </button>
                  ) : (
                    <button onClick={checkout} disabled={loading} className="flex-[2] bg-gray-600 hover:bg-gray-500 text-white py-3 rounded-xl font-bold text-lg disabled:opacity-50">
                      {loading ? 'Loading...' : 'Or Pay $1.99 →'}
                    </button>
                  )}
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
                {primeAccount && (
                  <p className="text-yellow-400 mt-4">
                    ⚡ {primeAccount.boostBalance} Prime boosts remaining
                  </p>
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
                { img: '/fly-wheel/squad/glasses.png', icon: '📝', title: 'Enter your product', desc: 'Name, URL, description, and keywords' },
                { img: '/fly-wheel/squad/wink.png', icon: '🔍', title: 'Pick a blog', desc: 'We find relevant content your audience reads' },
                { img: '/fly-wheel/squad/jimmy.png', icon: '✨', title: 'AI crafts your boost', desc: 'Natural promo linking blog + your product' },
                { img: '/fly-wheel/squad/stella.png', icon: '🚀', title: 'Pay & post', desc: '$1.99 — we post instantly + send you performance stats' },
              ].map((s, i) => (
                <div key={i} className="flex items-start gap-4 group">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full overflow-hidden border-2 border-gray-600 group-hover:border-orange-500 transition-all duration-300">
                    <img 
                      src={s.img} 
                      alt="" 
                      className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-300"
                    />
                  </div>
                  <div>
                    <h3 className="font-bold text-white flex items-center gap-2 group-hover:text-orange-400 transition-colors">
                      <span>{s.icon}</span> {s.title}
                    </h3>
                    <p className="text-gray-400 text-sm">{s.desc}</p>
                  </div>
                </div>
              ))}
              
              {/* Stats Preview Eye Candy - with social logo hover */}
              <div className="mt-4 p-4 bg-gradient-to-br from-gray-800/80 to-gray-900/80 rounded-xl border border-gray-700/50 relative overflow-hidden group/stats cursor-pointer">
                {/* Stats View (default) */}
                <div className="transition-all duration-500 group-hover/stats:opacity-0 group-hover/stats:scale-95">
                  <div className="absolute top-2 right-2 text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">📊 Sample Stats</div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-2xl font-black text-orange-400">2.8K</div>
                      <div className="text-xs text-gray-500">Impressions</div>
                      <div className="mt-1 h-8 flex items-end justify-center gap-0.5">
                        {[40, 65, 45, 80, 60, 90, 75].map((h, i) => (
                          <div key={i} className="w-1.5 bg-gradient-to-t from-orange-500 to-yellow-400 rounded-t" style={{height: `${h}%`}}></div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-2xl font-black text-green-400">156</div>
                      <div className="text-xs text-gray-500">Engagements</div>
                      <div className="mt-1 h-8 flex items-end justify-center gap-0.5">
                        {[30, 50, 70, 55, 85, 65, 95].map((h, i) => (
                          <div key={i} className="w-1.5 bg-gradient-to-t from-green-500 to-emerald-400 rounded-t" style={{height: `${h}%`}}></div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-2xl font-black text-blue-400">89</div>
                      <div className="text-xs text-gray-500">Link Clicks</div>
                      <div className="mt-1 h-8 flex items-end justify-center gap-0.5">
                        {[25, 40, 60, 45, 70, 80, 65].map((h, i) => (
                          <div key={i} className="w-1.5 bg-gradient-to-t from-blue-500 to-cyan-400 rounded-t" style={{height: `${h}%`}}></div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 text-center text-xs text-gray-500">You'll get real stats like these emailed to you 📧</div>
                </div>
                
                {/* Social Logos (hover) */}
                <div className="absolute inset-0 p-4 flex flex-col items-center justify-center opacity-0 scale-105 group-hover/stats:opacity-100 group-hover/stats:scale-100 transition-all duration-500">
                  <div className="text-xs text-orange-400 font-bold mb-3">📣 Amplify Everywhere</div>
                  <div className="grid grid-cols-4 gap-4">
                    {/* X/Twitter */}
                    <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center text-white text-xl font-bold shadow-lg hover:scale-110 transition-transform">𝕏</div>
                    {/* Instagram */}
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 rounded-lg flex items-center justify-center text-white shadow-lg hover:scale-110 transition-transform">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                    </div>
                    {/* LinkedIn */}
                    <div className="w-10 h-10 bg-[#0077B5] rounded-lg flex items-center justify-center text-white shadow-lg hover:scale-110 transition-transform">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                    </div>
                    {/* TikTok */}
                    <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center text-white shadow-lg hover:scale-110 transition-transform">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/></svg>
                    </div>
                  </div>
                  <div className="mt-3 text-center text-xs text-gray-400">Coming soon: Multi-platform posting 🚀</div>
                </div>
              </div>
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
          © 2026 DAUfinder
        </div>
      </footer>
    </div>
  )
}
