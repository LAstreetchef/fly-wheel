import { useState, useEffect } from 'react'
import BoostModal from './BoostModal'
import ContentModal from './ContentModal'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const PRODUCTS = [
  { type: 'boost', name: 'Blog Boost', price: '7.50', image: '/fly-wheel/squad/max.png', description: 'X post + relevant blog link', color: 'from-orange-500 to-red-500' },
  { type: 'social', name: 'Social Post', price: '5', image: '/fly-wheel/squad/luna.png', description: 'Single post with hashtags', color: 'from-cyan-500 to-blue-500' },
  { type: 'carousel', name: 'Carousel', price: '10', image: '/fly-wheel/squad/nova.png', description: '5-slide Instagram carousel', color: 'from-purple-500 to-pink-500' },
  { type: 'video', name: 'Video Script', price: '15', image: '/fly-wheel/squad/max.png', description: 'TikTok/Reel script', color: 'from-pink-500 to-rose-500' },
  { type: 'blog', name: 'Blog Post', price: '20', image: '/fly-wheel/squad/stella.png', description: '500-word SEO snippet', color: 'from-yellow-500 to-orange-500' },
  { type: 'email', name: 'Email Blast', price: '25', image: '/fly-wheel/squad/nova.png', description: 'Subject + body copy', color: 'from-green-500 to-emerald-500' },
]

export default function Dashboard({ user, token, onLogout }) {
  const [stats, setStats] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(null)
  const [productUrl, setProductUrl] = useState('')
  const [showBoostModal, setShowBoostModal] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)

  useEffect(() => {
    fetchDashboard()
  }, [])

  const fetchDashboard = async () => {
    try {
      const [statsRes, postsRes] = await Promise.all([
        fetch(`${API_URL}/api/dashboard`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_URL}/api/posts`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ])
      
      const statsData = await statsRes.json()
      const postsData = await postsRes.json()
      
      setStats(statsData)
      setPosts(postsData)
    } catch (error) {
      console.error('Dashboard fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  const connectTwitter = async () => {
    try {
      const res = await fetch(`${API_URL}/api/twitter/auth`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      alert('Error connecting to X: ' + error.message)
    }
  }

  const disconnectTwitter = async () => {
    if (!confirm('Disconnect your X account?')) return
    
    try {
      await fetch(`${API_URL}/api/twitter/disconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      fetchDashboard()
    } catch (error) {
      alert('Error disconnecting: ' + error.message)
    }
  }

  const publishToX = async (postId) => {
    if (!stats?.twitterConnected) {
      alert('Connect your X account first!')
      return
    }

    const url = prompt('Enter your product URL (optional):', 'https://')
    setPublishing(postId)
    
    try {
      const res = await fetch(`${API_URL}/api/posts/${postId}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ 
          platform: 'twitter',
          productUrl: url && url !== 'https://' ? url : null
        })
      })
      
      const data = await res.json()
      
      if (res.ok) {
        alert(`🎉 Posted to X!\n\n${data.tweetUrl}`)
        fetchDashboard()
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error) {
      alert('Error publishing: ' + error.message)
    } finally {
      setPublishing(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-2xl">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <a href="/fly-wheel/" className="text-2xl font-bold">
            <span className="text-white">Fly</span>
            <span className="text-cyan-400">Wheel</span>
          </a>
          
          <div className="flex items-center gap-4">
            <span className="text-gray-400">{user.email}</span>
            <button
              onClick={onLogout}
              className="text-gray-400 hover:text-white text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <BoostModal
        isOpen={showBoostModal}
        onClose={() => setShowBoostModal(false)}
        user={user}
        token={token}
        onSuccess={() => {
          setShowBoostModal(false)
          fetchDashboard()
        }}
      />
      
      <ContentModal
        isOpen={!!selectedProduct && selectedProduct !== 'boost'}
        onClose={() => setSelectedProduct(null)}
        productType={selectedProduct}
        user={user}
        token={token}
        onSuccess={() => {
          setSelectedProduct(null)
          fetchDashboard()
        }}
      />

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="text-gray-400 text-sm mb-1">Total Posts</div>
            <div className="text-3xl font-bold text-white">{stats?.totalPosts || 0}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="text-gray-400 text-sm mb-1">Posted to X</div>
            <div className="text-3xl font-bold text-cyan-400">{stats?.postedCount || 0}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="text-gray-400 text-sm mb-1">Link Clicks</div>
            <div className="text-3xl font-bold text-green-400">{stats?.totalClicks || 0}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="text-gray-400 text-sm mb-1">X Account</div>
            {stats?.twitterConnected ? (
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold text-white">@{stats.twitterUsername}</span>
                <button
                  onClick={disconnectTwitter}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={connectTwitter}
                className="bg-cyan-500 hover:bg-cyan-400 text-black px-4 py-2 rounded-lg text-sm font-bold"
              >
                Connect X
              </button>
            )}
          </div>
        </div>

        {/* Create New Content */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4">Create New Content</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {PRODUCTS.map((product) => (
              <button
                key={product.type}
                onClick={() => {
                  if (product.type === 'boost') {
                    setShowBoostModal(true)
                  } else {
                    setSelectedProduct(product.type)
                  }
                }}
                className={`group relative bg-gradient-to-br ${product.color} p-[2px] rounded-xl transition-all hover:scale-105 hover:shadow-lg`}
              >
                <div className="bg-gray-900 rounded-xl p-4 h-full">
                  <img src={product.image} alt={product.name} className="w-12 h-12 object-contain mx-auto mb-2 group-hover:scale-110 transition-transform" />
                  <div className="font-bold text-white text-sm">{product.name}</div>
                  <div className="text-gray-400 text-xs mt-1">{product.description}</div>
                  <div className="text-cyan-400 font-bold mt-2">${product.price}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Posts List */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800">
            <h2 className="text-xl font-bold">Your Content</h2>
          </div>
          
          {posts.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <div className="text-4xl mb-4">🎰</div>
              <p>No content yet. Start flying!</p>
              <a
                href="/fly-wheel/#pricing"
                className="inline-block mt-4 bg-gradient-to-r from-cyan-500 to-purple-500 text-white px-6 py-2 rounded-full font-bold"
              >
                Start Flying
              </a>
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {posts.map((post) => (
                <div key={post.id} className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">
                          {post.product_type === 'social' && '📱'}
                          {post.product_type === 'boost' && '🚀'}
                          {post.product_type === 'carousel' && '🎠'}
                          {post.product_type === 'video' && '🎬'}
                          {post.product_type === 'blog' && '📝'}
                          {post.product_type === 'email' && '📧'}
                        </span>
                        <span className="font-semibold capitalize">{post.product_type}</span>
                        <span className="text-gray-500 text-sm">
                          {new Date(post.created_at).toLocaleDateString()}
                        </span>
                        {post.posted_to && (
                          <span className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded-full">
                            Posted to X
                          </span>
                        )}
                      </div>
                      
                      <pre className="text-gray-300 text-sm whitespace-pre-wrap font-sans bg-gray-800/50 rounded-lg p-4 max-h-40 overflow-y-auto">
                        {post.content?.slice(0, 500)}{post.content?.length > 500 ? '...' : ''}
                      </pre>
                      
                      {post.link_clicks > 0 && (
                        <div className="mt-2 text-sm text-gray-400">
                          🔗 {post.link_clicks} click{post.link_clicks !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      {!post.posted_to && (
                        <button
                          onClick={() => publishToX(post.id)}
                          disabled={publishing === post.id || !stats?.twitterConnected}
                          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                            stats?.twitterConnected
                              ? 'bg-cyan-500 hover:bg-cyan-400 text-black'
                              : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          {publishing === post.id ? 'Posting...' : 'Post to X'}
                        </button>
                      )}
                      {post.twitter_post_id && (
                        <a
                          href={`https://twitter.com/i/status/${post.twitter_post_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-400 hover:text-cyan-300 text-sm text-center"
                        >
                          View on X →
                        </a>
                      )}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(post.content)
                          alert('Copied!')
                        }}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
                      >
                        📋 Copy
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
