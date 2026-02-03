import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, useSearchParams } from 'react-router-dom'
import Dashboard from './components/Dashboard'
import Auth from './components/Auth'
import BoostModal from './components/BoostModal'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Landing Page Component
function LandingPage({ user, token, onSelectProduct }) {
  const [searchParams] = useSearchParams()
  const [showSuccess, setShowSuccess] = useState(false)
  const [sessionData, setSessionData] = useState(null)
  const [content, setContent] = useState(null)
  const [showBoostModal, setShowBoostModal] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const success = searchParams.get('success')
    const sessionId = searchParams.get('session_id')
    const twitterStatus = searchParams.get('twitter')
    
    // Handle Twitter OAuth callback
    if (twitterStatus === 'connected') {
      navigate('/dashboard')
      return
    }
    
    if (success === 'true' && sessionId) {
      setShowSuccess(true)
      window.history.replaceState({}, '', window.location.pathname)
      
      const fetchContent = async () => {
        try {
          const response = await fetch(`${API_URL}/api/session/${sessionId}`)
          const data = await response.json()
          setSessionData(data)
          
          if (data.content) {
            setContent(data.content)
          } else {
            let attempts = 0
            const poll = setInterval(async () => {
              attempts++
              const res = await fetch(`${API_URL}/api/content/${sessionId}`)
              if (res.ok) {
                const contentData = await res.json()
                setContent(contentData)
                clearInterval(poll)
              } else if (attempts > 30) {
                clearInterval(poll)
              }
            }, 1000)
          }
        } catch (error) {
          console.error('Error fetching session:', error)
        }
      }
      
      fetchContent()
    }
  }, [searchParams, navigate])

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      <SlotBackground />
      
      <ProductModal
        isOpen={!!onSelectProduct.selected && onSelectProduct.selected !== 'boost'}
        onClose={() => onSelectProduct.setSelected(null)}
        productType={onSelectProduct.selected}
        onCheckout={onSelectProduct.checkout}
        userId={user?.id}
      />
      
      <BoostModal
        isOpen={showBoostModal || onSelectProduct.selected === 'boost'}
        onClose={() => {
          setShowBoostModal(false)
          onSelectProduct.setSelected(null)
        }}
        user={user}
        token={token}
        onSuccess={() => {}}
      />
      
      <SuccessModal
        isOpen={showSuccess}
        onClose={() => {
          setShowSuccess(false)
          setSessionData(null)
          setContent(null)
        }}
        sessionData={sessionData}
        content={content}
        user={user}
        onViewDashboard={() => navigate('/dashboard')}
      />
      
      {/* Header */}
      <header className="relative z-50 px-6 py-4">
        <nav className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/fly-wheel/logo-header.svg" alt="FlyWheel" className="h-10" />
          </div>
          
          <div className="flex items-center gap-4">
            <a href="#pricing" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">
              Pricing
            </a>
            <a href="#how" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">
              How It Works
            </a>
            {user ? (
              <button 
                onClick={() => navigate('/dashboard')}
                className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white px-5 py-2 rounded-full text-sm font-bold transition-all hover:scale-105"
              >
                Dashboard
              </button>
            ) : (
              <button 
                onClick={() => navigate('/login')}
                className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white px-5 py-2 rounded-full text-sm font-bold transition-all hover:scale-105"
              >
                Login
              </button>
            )}
          </div>
        </nav>
      </header>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-16">
            <SpinCard 
              image="/fly-wheel/squad/luna.png"
              title="Social Post"
              price="5"
              description="Single post for Instagram, Twitter, or TikTok. Caption + hashtags included."
              color="cyan"
              productType="social"
              onSelect={onSelectProduct.setSelected}
            />
            <SpinCard 
              image="/fly-wheel/squad/max.png"
              title="Blog Boost"
              price="7.50"
              description="X post promoting a relevant blog + your product. 2-for-1 exposure!"
              color="orange"
              productType="boost"
              popular
              onSelect={onSelectProduct.setSelected}
            />
            <SpinCard 
              image="/fly-wheel/squad/nova.png"
              title="Carousel"
              price="10"
              description="5-slide Instagram carousel with hooks, benefits, and CTA."
              color="purple"
              productType="carousel"
              onSelect={onSelectProduct.setSelected}
            />
            <SpinCard 
              image="/fly-wheel/squad/max.png"
              title="Video Script"
              price="15"
              description="TikTok/Reel script with hooks, talking points, and trending sounds."
              color="pink"
              productType="video"
              onSelect={onSelectProduct.setSelected}
            />
            <SpinCard 
              image="/fly-wheel/squad/stella.png"
              title="Blog Post"
              price="20"
              description="500-word SEO blog snippet. Perfect for product pages and updates."
              color="yellow"
              productType="blog"
              onSelect={onSelectProduct.setSelected}
            />
            <SpinCard 
              image="/fly-wheel/squad/nova.png"
              title="Email Blast"
              price="25"
              description="Subject line + body copy. Ready to send to your list."
              color="green"
              productType="email"
              onSelect={onSelectProduct.setSelected}
            />
          </div>
        </div>
      </section>

      {/* Hero */}
      <section className="relative z-10 px-6 pt-16 pb-24">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 rounded-full px-4 py-2 mb-8">
            <span className="text-cyan-400 text-sm font-medium">Pay-as-you-go product promotion</span>
          </div>
          
          <div className="flex justify-center mb-8">
            <img src="/fly-wheel/squad/stella.png" alt="Stella" className="w-32 h-32 object-contain drop-shadow-2xl animate-bounce-slow" />
          </div>
          
          <h1 className="text-5xl md:text-7xl font-black mb-6 leading-tight">
            <span className="text-white">Click.</span>{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Post.</span>{' '}
            <span className="text-white">Fly.</span>
          </h1>
          
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            Fly Wheel posts your product. Our Social Media engine builds the buzz. You watch it fly.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="#pricing" className="group inline-flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white px-8 py-4 rounded-full text-lg font-bold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(0,255,255,0.4)]">
              <span>Start Flying</span>
              <span className="group-hover:rotate-12 transition-transform duration-500">→</span>
            </a>
          </div>
          
          <div className="flex flex-wrap justify-center gap-8 mt-16">
            {[
              { value: '$5', label: 'Starting at' },
              { value: '< 5min', label: 'Delivery' },
              { value: '100%', label: 'AI-Powered' },
              { value: '0', label: 'Commitments' },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl md:text-3xl font-black text-cyan-400">{stat.value}</div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gray-800 px-6 py-12">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">FlyWheel</span>
            <span className="text-gray-500 text-sm">by Blog Squad</span>
          </div>
          <div className="text-gray-500 text-sm">© 2026 FlyWheel. All rights reserved.</div>
        </div>
      </footer>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.3; }
          50% { transform: translateY(-20px) rotate(180deg); opacity: 0.6; }
        }
        .animate-float { animation: float 4s ease-in-out infinite; }
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-bounce-slow { animation: bounce-slow 3s ease-in-out infinite; }
      `}</style>
    </div>
  )
}

// Background Component
function SlotBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-b from-black via-gray-950 to-black" />
      <div className="absolute top-0 left-0 w-64 h-64 bg-gradient-to-br from-cyan-500/20 to-transparent" />
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-purple-500/20 to-transparent" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-pink-500/20 to-transparent" />
      <div className="absolute bottom-0 right-0 w-64 h-64 bg-gradient-to-tl from-yellow-500/20 to-transparent" />
    </div>
  )
}

// Spin Card Component
function SpinCard({ image, title, price, description, color, productType, popular, onSelect }) {
  return (
    <button
      onClick={() => onSelect(productType)}
      className={`group relative bg-gray-900/80 backdrop-blur-sm border-2 rounded-2xl p-6 transition-all duration-300 hover:scale-105 hover:-translate-y-2 text-left w-full ${
        popular 
          ? 'border-yellow-500/50 hover:border-yellow-400 hover:shadow-[0_0_40px_rgba(234,179,8,0.3)]' 
          : 'border-gray-700 hover:border-cyan-400 hover:shadow-[0_0_40px_rgba(0,255,255,0.2)]'
      }`}
    >
      {popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-yellow-500 to-orange-500 text-black text-xs font-bold px-4 py-1 rounded-full">
          🔥 POPULAR
        </div>
      )}
      <div className="w-20 h-20 mx-auto mb-4 transform group-hover:scale-110 transition-transform">
        <img src={image} alt={title} className="w-full h-full object-contain drop-shadow-lg" />
      </div>
      <h3 className="text-xl font-bold text-white mb-2 text-center">{title}</h3>
      <p className="text-gray-400 text-sm mb-4 leading-relaxed text-center">{description}</p>
      <div className="flex items-center justify-between">
        <span className="text-3xl font-black text-cyan-400">${price}</span>
        <span className="bg-white/10 text-white px-4 py-2 rounded-full text-sm font-semibold">FLY →</span>
      </div>
    </button>
  )
}

// Product Modal Component
function ProductModal({ isOpen, onClose, productType, onCheckout, userId }) {
  const [productData, setProductData] = useState({ name: '', description: '', features: '', audience: '' })
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    await onCheckout(productType, productData, userId)
    setLoading(false)
  }

  const productNames = {
    social: 'Social Post', carousel: 'Carousel', video: 'Video Script', blog: 'Blog Post', email: 'Email Blast'
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-lg w-full">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl">&times;</button>
        <h2 className="text-2xl font-bold text-white mb-2">Create Your {productNames[productType]}</h2>
        <p className="text-gray-400 mb-6">Tell us about your product.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" required value={productData.name} onChange={(e) => setProductData({ ...productData, name: e.target.value })} placeholder="Product Name *" className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
          <textarea required value={productData.description} onChange={(e) => setProductData({ ...productData, description: e.target.value })} placeholder="Description *" rows={3} className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
          <input type="text" value={productData.features} onChange={(e) => setProductData({ ...productData, features: e.target.value })} placeholder="Key Features (optional)" className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
          <input type="text" value={productData.audience} onChange={(e) => setProductData({ ...productData, audience: e.target.value })} placeholder="Target Audience (optional)" className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
          <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 text-white py-4 rounded-xl font-bold text-lg disabled:opacity-50">
            {loading ? 'Processing...' : 'Continue to Payment →'}
          </button>
        </form>
      </div>
    </div>
  )
}

// Success Modal Component  
function SuccessModal({ isOpen, onClose, sessionData, content, user, onViewDashboard }) {
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const handleCopy = () => {
    navigator.clipboard.writeText(content?.content || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const productNames = { social: 'Social Post', carousel: 'Carousel', video: 'Video Script', blog: 'Blog Post', email: 'Email Blast' }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl">&times;</button>
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-3xl font-bold text-white mb-2">Content Generated!</h2>
          <p className="text-gray-400">Your {productNames[sessionData?.metadata?.productType] || 'content'} is ready</p>
        </div>
        {content ? (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl p-6">
              <pre className="whitespace-pre-wrap text-gray-200 font-mono text-sm leading-relaxed">{content.content}</pre>
            </div>
            <div className="flex gap-4">
              <button onClick={handleCopy} className="flex-1 bg-gradient-to-r from-cyan-500 to-purple-500 text-white py-3 rounded-xl font-bold">
                {copied ? '✓ Copied!' : '📋 Copy'}
              </button>
              {user && (
                <button onClick={onViewDashboard} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-bold">
                  View Dashboard →
                </button>
              )}
            </div>
            {!user && (
              <p className="text-center text-gray-400 text-sm">
                <a href="/fly-wheel/login" className="text-cyan-400 hover:underline">Login</a> to save and post to X
              </p>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="animate-spin text-4xl mb-4">⚡</div>
            <p className="text-gray-400">Generating your content...</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Main App Component
function App() {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null)

  useEffect(() => {
    const savedToken = localStorage.getItem('flywheel_token')
    const savedUser = localStorage.getItem('flywheel_user')
    if (savedToken && savedUser) {
      setToken(savedToken)
      setUser(JSON.parse(savedUser))
    }
  }, [])

  const handleLogin = (user, token) => {
    setUser(user)
    setToken(token)
    localStorage.setItem('flywheel_token', token)
    localStorage.setItem('flywheel_user', JSON.stringify(user))
  }

  const handleLogout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('flywheel_token')
    localStorage.removeItem('flywheel_user')
  }

  const checkoutSpin = async (productType, productData, userId) => {
    try {
      const response = await fetch(`${API_URL}/api/checkout/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productType, productData, userId }),
      })
      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert('Error: ' + (data.error || 'Could not create checkout'))
      }
    } catch (error) {
      alert('Error connecting to payment server.')
    }
  }

  const productSelector = {
    selected: selectedProduct,
    setSelected: setSelectedProduct,
    checkout: checkoutSpin,
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage user={user} token={token} onSelectProduct={productSelector} />} />
      <Route path="/login" element={
        user ? <Dashboard user={user} token={token} onLogout={handleLogout} /> : <Auth onLogin={handleLogin} />
      } />
      <Route path="/dashboard" element={
        user ? <Dashboard user={user} token={token} onLogout={handleLogout} /> : <Auth onLogin={handleLogin} />
      } />
    </Routes>
  )
}

export default App
