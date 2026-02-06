import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_51QZwkYB2mCJvcgI4TaUGPlP5RwRqA5qM3hqk7zPGYT9HJvWJZhLRMRMg4dRd7lqDMJ7y5F4vGzBGjzECFMM7n9q500jNEzUwmf'

const stripePromise = loadStripe(STRIPE_PK)

// Pricing tiers
const BOOST_PACKS = [
  { id: 'single', name: '1 Boost', boosts: 1, price: 750, priceDisplay: '$7.50', popular: false },
  { id: 'starter', name: '10 Boosts', boosts: 10, price: 6000, priceDisplay: '$60', savings: 'Save 20%', popular: true },
  { id: 'growth', name: '50 Boosts', boosts: 50, price: 25000, priceDisplay: '$250', savings: 'Save 33%', popular: false },
  { id: 'scale', name: '100 Boosts', boosts: 100, price: 45000, priceDisplay: '$450', savings: 'Save 40%', popular: false },
]

// Payment Form Component
function PaymentForm({ pack, onSuccess, onCancel, token }) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return
    
    setLoading(true)
    setError(null)
    
    try {
      const { error: submitError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required'
      })
      
      if (submitError) throw new Error(submitError.message)
      
      if (paymentIntent.status === 'succeeded') {
        // Add boosts to user account
        const res = await fetch(`${API_URL}/api/boosts/add`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'ngrok-skip-browser-warning': 'true'
          },
          body: JSON.stringify({
            paymentIntentId: paymentIntent.id,
            packId: pack.id,
            boosts: pack.boosts
          })
        })
        
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to add boosts')
        
        onSuccess(data)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="text-center mb-4">
        <h3 className="text-xl font-bold text-white">{pack.name}</h3>
        <p className="text-3xl font-black text-orange-400 mt-2">{pack.priceDisplay}</p>
        {pack.savings && <p className="text-green-400 text-sm">{pack.savings}</p>}
      </div>
      
      <div className="bg-gray-800 rounded-xl p-4">
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>
      
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 text-red-400 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}
      
      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-bold">
          Cancel
        </button>
        <button type="submit" disabled={!stripe || loading} className="flex-1 bg-gradient-to-r from-orange-500 to-yellow-500 text-white py-3 rounded-xl font-bold disabled:opacity-50">
          {loading ? 'Processing...' : `Pay ${pack.priceDisplay}`}
        </button>
      </div>
    </form>
  )
}

export default function BlogBoostPage({ user, token, onLogin }) {
  const [searchParams] = useSearchParams()
  const widgetRef = useRef(null)
  
  // State
  const [step, setStep] = useState('input')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  
  // User boosts
  const [boostCredits, setBoostCredits] = useState(0)
  
  // Checkout
  const [selectedPack, setSelectedPack] = useState(null)
  const [clientSecret, setClientSecret] = useState(null)
  
  // Product data
  const [productData, setProductData] = useState({ name: '', description: '', productUrl: '', keywords: '' })
  const [blogs, setBlogs] = useState([])
  const [selectedBlog, setSelectedBlog] = useState(null)
  const [generatedContent, setGeneratedContent] = useState(null)
  const [postId, setPostId] = useState(null)
  const [publishResult, setPublishResult] = useState(null)
  const [twitterStatus, setTwitterStatus] = useState(null)

  // Check for twitter=connected on mount
  useEffect(() => {
    if (searchParams.get('twitter') === 'connected') {
      setSuccess(`✅ X account @${searchParams.get('username') || ''} connected!`)
      checkTwitterConnection()
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [searchParams])

  // Load user data
  useEffect(() => {
    if (user && token) {
      checkTwitterConnection()
      fetchBoostCredits()
    }
  }, [user, token])

  const fetchBoostCredits = async () => {
    if (!user || !token) return
    try {
      const res = await fetch(`${API_URL}/api/boosts/balance`, {
        headers: { 'Authorization': `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' }
      })
      const data = await res.json()
      setBoostCredits(data.boosts || 0)
    } catch (e) {
      console.error('Failed to fetch boost credits:', e)
    }
  }

  const checkTwitterConnection = async () => {
    if (!user || !token) return false
    try {
      const res = await fetch(`${API_URL}/api/twitter/status`, {
        headers: { 'Authorization': `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' }
      })
      const data = await res.json()
      setTwitterStatus(data.connected ? 'connected' : 'not_connected')
      return data.connected
    } catch {
      setTwitterStatus('not_connected')
      return false
    }
  }

  const connectTwitter = async () => {
    if (!user || !token) {
      onLogin?.()
      return
    }
    try {
      const res = await fetch(`${API_URL}/api/twitter/auth?returnTo=/boost`, {
        headers: { 'Authorization': `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' }
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      setError('Failed to start Twitter auth: ' + err.message)
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
        { headers: { 'ngrok-skip-browser-warning': 'true', ...(token && { 'Authorization': `Bearer ${token}` }) } }
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
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
          ...(token && { Authorization: `Bearer ${token}` })
        },
        body: JSON.stringify({
          productType: 'boost',
          productData: { ...productData, blogTitle: blog.title, blogUrl: blog.url, blogSnippet: blog.snippet }
        })
      })
      
      const genData = await genRes.json()
      if (genData.error) throw new Error(genData.error)
      
      setGeneratedContent(genData.content)
      
      if (user && token) {
        const createRes = await fetch(`${API_URL}/api/content/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ productType: 'boost', content: genData.content, productData: { ...productData, blogUrl: blog.url, blogTitle: blog.title } })
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

  const handlePublish = async () => {
    if (!user || !token) {
      onLogin?.()
      return
    }
    
    // TODO: Re-enable boost credit check after testing
    // if (boostCredits < 1) {
    //   setError('You need boost credits to publish. Purchase a pack below!')
    //   return
    // }
    
    setLoading(true)
    setError(null)
    
    try {
      let finalPostId = postId
      if (!finalPostId) {
        const createRes = await fetch(`${API_URL}/api/content/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ productType: 'boost', content: generatedContent, productData: { ...productData, blogUrl: selectedBlog.url } })
        })
        if (!createRes.ok) throw new Error('Could not save post')
        finalPostId = (await createRes.json()).id
        setPostId(finalPostId)
      }
      
      const pubRes = await fetch(`${API_URL}/api/posts/${finalPostId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ platform: 'twitter', productUrl: productData.productUrl, blogUrl: selectedBlog.url, useBoostCredit: true })
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
      setBoostCredits(prev => prev - 1)
      setStep('published')
    } catch (err) {
      setError(err.message)
    } finally {
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
    setProductData({ name: '', description: '', productUrl: '', keywords: '' })
    setBlogs([])
    setSelectedBlog(null)
    setGeneratedContent(null)
    setPostId(null)
    setPublishResult(null)
    setError(null)
    setSuccess(null)
  }

  // Buy boost pack
  const buyPack = async (pack) => {
    if (!user || !token) {
      onLogin?.()
      return
    }
    
    setSelectedPack(pack)
    setError(null)
    
    try {
      const res = await fetch(`${API_URL}/api/boosts/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ packId: pack.id, userId: user.id })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setClientSecret(data.clientSecret)
    } catch (err) {
      setError(err.message)
      setSelectedPack(null)
    }
  }

  const handlePurchaseSuccess = (data) => {
    setBoostCredits(data.newBalance || boostCredits + selectedPack.boosts)
    setSuccess(`✅ ${selectedPack.boosts} boost${selectedPack.boosts > 1 ? 's' : ''} added to your account!`)
    setSelectedPack(null)
    setClientSecret(null)
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
        <nav className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚀</span>
            <span className="text-2xl font-bold">
              <span className="text-white">Blog</span>
              <span className="text-orange-400">Boost</span>
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <div className="bg-orange-500/20 border border-orange-500/30 rounded-full px-4 py-1">
                  <span className="text-orange-400 font-bold">{boostCredits}</span>
                  <span className="text-gray-400 text-sm ml-1">boosts</span>
                </div>
                <span className="text-gray-400 text-sm">{user.email}</span>
              </>
            ) : (
              <button onClick={onLogin} className="bg-gradient-to-r from-orange-500 to-yellow-500 text-white px-5 py-2 rounded-full text-sm font-bold">
                Login
              </button>
            )}
          </div>
        </nav>
      </header>

      {/* Purchase Modal */}
      {selectedPack && clientSecret && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setSelectedPack(null); setClientSecret(null) }} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full">
            <button onClick={() => { setSelectedPack(null); setClientSecret(null) }} className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl">×</button>
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'night', variables: { colorPrimary: '#f97316', colorBackground: '#1f2937', colorText: '#ffffff', borderRadius: '12px' } } }}>
              <PaymentForm pack={selectedPack} token={token} onSuccess={handlePurchaseSuccess} onCancel={() => { setSelectedPack(null); setClientSecret(null) }} />
            </Elements>
          </div>
        </div>
      )}

      <main className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {/* Success/Error Messages */}
        {success && (
          <div className="bg-green-500/20 border border-green-500/50 text-green-400 rounded-xl px-6 py-4 mb-6 text-center">
            {success}
          </div>
        )}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-400 rounded-xl px-6 py-4 mb-6">
            {error}
          </div>
        )}

        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-black mb-4">
            <span className="text-white">Promote Your Product</span>
            <br />
            <span className="text-orange-400">Alongside Relevant Content</span>
          </h1>
          <p className="text-gray-400 text-lg">We find blogs your audience already reads, then post your product alongside them.</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mb-16">
          {/* Create Boost Form */}
          <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <span className="text-2xl">✍️</span> Create a Boost
            </h2>

            {/* Twitter Status */}
            {user && (
              <div className="mb-4">
                {twitterStatus === 'connected' ? (
                  <div className="flex items-center gap-2 text-green-400 text-sm">
                    <span>✅</span> X Connected
                  </div>
                ) : (
                  <button onClick={connectTwitter} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold">
                    🔗 Connect X Account
                  </button>
                )}
              </div>
            )}

            {(step === 'input' || step === 'searching') && (
              <form onSubmit={(e) => { e.preventDefault(); handleSearchBlogs() }} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Product Name *</label>
                  <input type="text" required value={productData.name} onChange={(e) => setProductData({ ...productData, name: e.target.value })} placeholder="e.g., SwordPay" className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Description</label>
                  <textarea value={productData.description} onChange={(e) => setProductData({ ...productData, description: e.target.value })} placeholder="Brief description..." rows={2} className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Product URL</label>
                  <input type="url" value={productData.productUrl} onChange={(e) => setProductData({ ...productData, productUrl: e.target.value })} placeholder="https://your-product.com" className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Search Keywords *</label>
                  <input type="text" required value={productData.keywords} onChange={(e) => setProductData({ ...productData, keywords: e.target.value })} placeholder="e.g., creator payments fintech" className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
                </div>
                <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-orange-500 to-yellow-500 text-white py-4 rounded-xl font-bold text-lg disabled:opacity-50">
                  {loading ? 'Searching...' : 'Find Relevant Blogs →'}
                </button>
              </form>
            )}

            {step === 'selectBlog' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-400 mb-4">Select a blog to boost alongside:</p>
                <div className="max-h-80 overflow-y-auto space-y-2">
                  {blogs.map((blog, i) => (
                    <button key={i} onClick={() => handleSelectBlog(blog)} disabled={loading} className="w-full text-left p-4 rounded-xl border-2 transition-all hover:border-orange-400 hover:bg-orange-500/10 border-gray-700 bg-gray-800/50">
                      <div className="font-semibold text-white mb-1 line-clamp-1">{blog.title}</div>
                      <div className="text-sm text-gray-400 line-clamp-2">{blog.snippet}</div>
                      <div className="text-xs text-orange-400 mt-2">{blog.source}</div>
                    </button>
                  ))}
                </div>
                <button onClick={() => setStep('input')} className="text-gray-400 hover:text-white text-sm">← Different keywords</button>
              </div>
            )}

            {step === 'generating' && (
              <div className="flex flex-col items-center justify-center py-12">
                <svg className="animate-spin h-10 w-10 text-orange-400 mb-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-gray-400">Crafting your boost...</p>
              </div>
            )}

            {step === 'preview' && (
              <div className="space-y-4">
                <div className="bg-gray-800 rounded-xl p-4">
                  <div className="text-xs text-gray-500 mb-2">PREVIEW</div>
                  <div className="text-white whitespace-pre-wrap text-sm">{getPreview()}</div>
                </div>
                <div className="text-sm text-gray-400">
                  📝 Blog: <a href={selectedBlog?.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">{selectedBlog?.title?.substring(0, 40)}...</a>
                </div>
                
                {user && twitterStatus === 'not_connected' && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                    <p className="text-blue-400 text-sm mb-2">Connect X to post</p>
                    <button onClick={connectTwitter} className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold text-sm">🔗 Connect X</button>
                  </div>
                )}
                
                {/* TODO: Re-enable after testing
                {boostCredits < 1 && user && (
                  <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
                    <p className="text-orange-400 text-sm">You need boost credits to publish. Get some below! 👇</p>
                  </div>
                )}
                */}
                
                <div className="flex gap-3">
                  <button onClick={() => setStep('selectBlog')} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-bold">← Back</button>
                  <button onClick={() => navigator.clipboard.writeText(getPreview())} className="bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 px-4 rounded-xl border border-gray-700">📋</button>
                  <button onClick={user ? handlePublish : onLogin} disabled={loading || (user && twitterStatus === 'not_connected')} className="flex-1 bg-gradient-to-r from-orange-500 to-yellow-500 text-white py-3 rounded-xl font-bold disabled:opacity-50">
                    {loading ? '...' : user ? '🚀 Post to X (1 boost)' : '🔐 Login'}
                  </button>
                </div>
              </div>
            )}

            {step === 'published' && (
              <div className="text-center py-8">
                <div className="text-6xl mb-4">🎉</div>
                <h3 className="text-2xl font-bold text-white mb-2">Boost Posted!</h3>
                <p className="text-gray-400 mb-6">Your content is live on X</p>
                <a href={publishResult?.tweetUrl?.replace('twitter.com', 'x.com')} target="_blank" rel="noopener noreferrer" className="inline-block bg-gradient-to-r from-orange-500 to-yellow-500 text-white px-6 py-3 rounded-xl font-bold mb-4">
                  View on X →
                </a>
                <br />
                <button onClick={handleStartOver} className="text-gray-400 hover:text-white mt-4">Create Another Boost</button>
              </div>
            )}
          </div>

          {/* How It Works */}
          <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-6">How It Works</h2>
            <div className="space-y-6">
              {[
                { num: '1', title: 'Enter your product', desc: 'Name, description, and keywords' },
                { num: '2', title: 'Pick a blog', desc: 'We find relevant content your audience reads' },
                { num: '3', title: 'AI crafts your boost', desc: 'Natural promo that links blog + product' },
                { num: '4', title: 'Post to X', desc: 'One click, tracked links, instant exposure' },
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-4">
                  <span className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-r from-orange-500 to-yellow-500 text-black flex items-center justify-center text-lg font-black">{step.num}</span>
                  <div>
                    <h3 className="font-bold text-white">{step.title}</h3>
                    <p className="text-gray-400 text-sm">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Pricing Section */}
        <div id="pricing" className="mb-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-black text-white mb-2">Get Boost Credits</h2>
            <p className="text-gray-400">Buy once, use anytime. No subscriptions.</p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {BOOST_PACKS.map((pack) => (
              <div key={pack.id} className={`relative bg-gray-900 border rounded-2xl p-6 ${pack.popular ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-gray-700'}`}>
                {pack.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-black text-xs font-bold px-3 py-1 rounded-full">
                    MOST POPULAR
                  </div>
                )}
                <div className="text-center">
                  <h3 className="text-xl font-bold text-white mb-1">{pack.name}</h3>
                  <div className="text-3xl font-black text-orange-400 mb-1">{pack.priceDisplay}</div>
                  {pack.savings && <div className="text-green-400 text-sm mb-4">{pack.savings}</div>}
                  {!pack.savings && <div className="text-gray-500 text-sm mb-4">&nbsp;</div>}
                  <button onClick={() => buyPack(pack)} className={`w-full py-3 rounded-xl font-bold transition-all ${pack.popular ? 'bg-gradient-to-r from-orange-500 to-yellow-500 text-white hover:scale-105' : 'bg-gray-800 hover:bg-gray-700 text-white'}`}>
                    Buy Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">FAQ</h2>
          <div className="space-y-4">
            {[
              { q: 'What is a "boost"?', a: 'A boost is a single X post that promotes your product alongside a relevant blog post. We find content your audience already reads, then craft a natural promo linking both.' },
              { q: 'Do boost credits expire?', a: 'No! Buy once, use whenever. Your credits stay in your account until you use them.' },
              { q: 'Can I use this for any product?', a: 'Yes - SaaS, physical products, services, apps. If you can describe it and give us keywords, we can boost it.' },
            ].map((item, i) => (
              <div key={i} className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
                <h3 className="font-bold text-white mb-2">{item.q}</h3>
                <p className="text-gray-400 text-sm">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gray-800 px-6 py-8 mt-16">
        <div className="max-w-6xl mx-auto text-center text-gray-500 text-sm">
          <p>© 2026 BlogBoost. Part of the FlyWheel suite.</p>
        </div>
      </footer>
    </div>
  )
}
