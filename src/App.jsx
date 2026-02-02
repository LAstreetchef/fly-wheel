import { useState } from 'react'

// Stripe Payment Links (placeholder - update with real links)
const PAYMENT_LINKS = {
  social: 'https://buy.stripe.com/flywheel-social',
  carousel: 'https://buy.stripe.com/flywheel-carousel', 
  video: 'https://buy.stripe.com/flywheel-video',
  blog: 'https://buy.stripe.com/flywheel-blog',
  email: 'https://buy.stripe.com/flywheel-email',
  credits50: 'https://buy.stripe.com/flywheel-credits-50',
  credits100: 'https://buy.stripe.com/flywheel-credits-100',
}

// Neon glow animation component
const NeonGlow = ({ color = 'cyan', children, className = '' }) => (
  <div className={`relative ${className}`}>
    <div className={`absolute inset-0 blur-xl opacity-50 bg-${color}-500`} />
    <div className="relative">{children}</div>
  </div>
)

// Animated slot machine reels background
const SlotBackground = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none">
    {/* Gradient overlay */}
    <div className="absolute inset-0 bg-gradient-to-b from-black via-gray-950 to-black" />
    
    {/* Animated grid */}
    <div 
      className="absolute inset-0 opacity-10"
      style={{
        backgroundImage: `
          linear-gradient(rgba(0, 255, 255, 0.1) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0, 255, 255, 0.1) 1px, transparent 1px)
        `,
        backgroundSize: '50px 50px',
      }}
    />
    
    {/* Floating coins/tokens */}
    {[...Array(20)].map((_, i) => (
      <div
        key={i}
        className="absolute w-4 h-4 rounded-full animate-float"
        style={{
          background: `linear-gradient(135deg, #ffd700, #ffaa00)`,
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          animationDelay: `${Math.random() * 5}s`,
          animationDuration: `${3 + Math.random() * 4}s`,
          opacity: 0.3,
        }}
      />
    ))}
    
    {/* Neon corner accents */}
    <div className="absolute top-0 left-0 w-64 h-64 bg-gradient-to-br from-cyan-500/20 to-transparent" />
    <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-purple-500/20 to-transparent" />
    <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-pink-500/20 to-transparent" />
    <div className="absolute bottom-0 right-0 w-64 h-64 bg-gradient-to-tl from-yellow-500/20 to-transparent" />
  </div>
)

// Spin item card component
const SpinCard = ({ image, title, price, description, color, link, popular }) => (
  <a
    href={link}
    className={`group relative bg-gray-900/80 backdrop-blur-sm border-2 rounded-2xl p-6 transition-all duration-300 hover:scale-105 hover:-translate-y-2 ${
      popular 
        ? 'border-yellow-500/50 hover:border-yellow-400 hover:shadow-[0_0_40px_rgba(234,179,8,0.3)]' 
        : `border-${color}-500/30 hover:border-${color}-400 hover:shadow-[0_0_40px_rgba(0,255,255,0.2)]`
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
      <span className={`text-3xl font-black text-${color}-400`}>${price}</span>
      <span className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-full text-sm font-semibold transition-colors">
        SPIN →
      </span>
    </div>
  </a>
)

// Credit pack card
const CreditPack = ({ amount, bonus, price, link, featured }) => (
  <a
    href={link}
    className={`group relative bg-gradient-to-br ${
      featured 
        ? 'from-yellow-500/20 to-orange-500/20 border-yellow-500/50 hover:border-yellow-400' 
        : 'from-gray-900 to-gray-800 border-gray-700 hover:border-cyan-500'
    } border-2 rounded-2xl p-6 text-center transition-all duration-300 hover:scale-105`}
  >
    {featured && (
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-yellow-500 to-orange-500 text-black text-xs font-bold px-3 py-1 rounded-full">
        BEST VALUE
      </div>
    )}
    
    <div className="text-4xl mb-2">💳</div>
    <div className="text-3xl font-black text-white mb-1">${amount}</div>
    {bonus > 0 && (
      <div className="text-green-400 text-sm font-semibold mb-2">+${bonus} BONUS</div>
    )}
    <div className="text-gray-400 text-sm">{Math.floor((amount + bonus) / 5)} spins</div>
    <div className="mt-4 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-full text-sm font-semibold transition-colors">
      BUY CREDITS
    </div>
  </a>
)

// Live feed item
const LiveFeedItem = ({ type, product, time }) => (
  <div className="flex items-center gap-3 bg-gray-900/50 rounded-lg px-4 py-3 animate-slide-in">
    <div className="text-2xl">
      {type === 'social' && '📱'}
      {type === 'carousel' && '🎠'}
      {type === 'video' && '🎬'}
      {type === 'blog' && '📝'}
      {type === 'email' && '📧'}
    </div>
    <div className="flex-1">
      <div className="text-white text-sm font-medium">{product}</div>
      <div className="text-gray-500 text-xs">{type} posted • {time}</div>
    </div>
    <div className="text-green-400 text-xs">✓ LIVE</div>
  </div>
)

function App() {
  const [activeTab, setActiveTab] = useState('spins')

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      <SlotBackground />
      
      {/* Header */}
      <header className="relative z-50 px-6 py-4">
        <nav className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/fly-wheel/logo-header.svg" 
              alt="FlyWheel" 
              className="h-10"
            />
          </div>
          
          <div className="flex items-center gap-4">
            <a href="#pricing" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">
              Pricing
            </a>
            <a href="#how" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">
              How It Works
            </a>
            <a 
              href={PAYMENT_LINKS.credits50}
              className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white px-5 py-2 rounded-full text-sm font-bold transition-all hover:scale-105"
            >
              Get Credits
            </a>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative z-10 px-6 pt-16 pb-24">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 rounded-full px-4 py-2 mb-8">
            <span className="text-cyan-400 text-sm font-medium">Pay-as-you-go product promotion</span>
          </div>
          
          <div className="flex justify-center mb-8">
            <img 
              src="/fly-wheel/squad/stella.png" 
              alt="Stella" 
              className="w-32 h-32 object-contain drop-shadow-2xl animate-bounce-slow"
            />
          </div>
          
          <h1 className="text-5xl md:text-7xl font-black mb-6 leading-tight">
            <span className="text-white">Spin.</span>{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Post.</span>{' '}
            <span className="text-white">Profit.</span>
          </h1>
          
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            Upload your product once. Then spin the wheel to instantly generate and post 
            social content, blogs, emails — watch engagement roll in real-time.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="#pricing"
              className="group inline-flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white px-8 py-4 rounded-full text-lg font-bold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(0,255,255,0.4)]"
            >
              <span>Start Spinning</span>
              <span className="group-hover:rotate-12 transition-transform duration-500">→</span>
            </a>
            <a 
              href="#how"
              className="inline-flex items-center justify-center gap-2 border-2 border-white/20 hover:border-white/40 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:bg-white/5"
            >
              See How It Works
            </a>
          </div>
          
          {/* Quick stats */}
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

      {/* How It Works */}
      <section id="how" className="relative z-10 px-6 py-24 bg-gradient-to-b from-transparent via-gray-950/50 to-transparent">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-4">
              How It <span className="text-cyan-400">Works</span>
            </h2>
            <p className="text-gray-400 text-lg">Three steps. Zero friction.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                image: '/fly-wheel/squad/luna.png',
                title: 'Upload Once',
                description: 'Add your product photos, name, description, and what makes it special. Takes 2 minutes.',
              },
              {
                step: '02', 
                image: '/fly-wheel/squad/nova.png',
                title: 'Spin & Pay',
                description: 'Pick what you want — social post, carousel, blog, email. Pay per spin. No subscriptions.',
              },
              {
                step: '03',
                image: '/fly-wheel/squad/max.png',
                title: 'Watch It Go Live',
                description: 'AI generates your content and posts it instantly. Watch engagement roll in real-time.',
              },
            ].map((item, i) => (
              <div key={i} className="relative bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center group hover:border-cyan-500/50 transition-colors">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-cyan-500 text-black text-xs font-bold px-3 py-1 rounded-full">
                  STEP {item.step}
                </div>
                <div className="w-20 h-20 mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <img src={item.image} alt={item.title} className="w-full h-full object-contain drop-shadow-lg" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{item.title}</h3>
                <p className="text-gray-400 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing - Spin Menu */}
      <section id="pricing" className="relative z-10 px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-4">
              Pick Your <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">Spin</span>
            </h2>
            <p className="text-gray-400 text-lg">No subscriptions. No commitments. Just results.</p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-16">
            <SpinCard 
              image="/fly-wheel/squad/luna.png"
              title="Social Post"
              price="5"
              description="Single post for Instagram, Twitter, or TikTok. Caption + hashtags included."
              color="cyan"
              link={PAYMENT_LINKS.social}
            />
            <SpinCard 
              image="/fly-wheel/squad/nova.png"
              title="Carousel"
              price="10"
              description="5-slide Instagram carousel with hooks, benefits, and CTA."
              color="purple"
              link={PAYMENT_LINKS.carousel}
              popular
            />
            <SpinCard 
              image="/fly-wheel/squad/max.png"
              title="Video Script"
              price="15"
              description="TikTok/Reel script with hooks, talking points, and trending sounds."
              color="pink"
              link={PAYMENT_LINKS.video}
            />
            <SpinCard 
              image="/fly-wheel/squad/stella.png"
              title="Blog Post"
              price="20"
              description="500-word SEO blog snippet. Perfect for product pages and updates."
              color="yellow"
              link={PAYMENT_LINKS.blog}
            />
            <SpinCard 
              image="/fly-wheel/squad/nova.png"
              title="Email Blast"
              price="25"
              description="Subject line + body copy. Ready to send to your list."
              color="green"
              link={PAYMENT_LINKS.email}
            />
          </div>
          
          {/* Credit Packs */}
          <div className="bg-gradient-to-r from-gray-900/80 to-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-3xl p-8 md:p-12">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-white mb-2">Credit Packs</h3>
              <p className="text-gray-400">Buy in bulk, spin more, save more</p>
            </div>
            
            <div className="grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
              <CreditPack amount={25} bonus={0} price={25} link={PAYMENT_LINKS.credits50} />
              <CreditPack amount={50} bonus={10} price={50} link={PAYMENT_LINKS.credits50} featured />
              <CreditPack amount={100} bonus={25} price={100} link={PAYMENT_LINKS.credits100} />
            </div>
          </div>
        </div>
      </section>

      {/* Live Feed Preview */}
      <section className="relative z-10 px-6 py-24 bg-gradient-to-b from-transparent via-purple-950/20 to-transparent">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-black mb-4">
              🔴 Live <span className="text-cyan-400">Feed</span>
            </h2>
            <p className="text-gray-400">Watch content go live in real-time</p>
          </div>
          
          <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-3">
            <LiveFeedItem type="social" product="Devil's Garden Hot Sauce" time="2 min ago" />
            <LiveFeedItem type="carousel" product="Wireless Earbuds Pro" time="5 min ago" />
            <LiveFeedItem type="email" product="Organic Coffee Beans" time="8 min ago" />
            <LiveFeedItem type="blog" product="Fitness Resistance Bands" time="12 min ago" />
            <LiveFeedItem type="video" product="Natural Skincare Set" time="15 min ago" />
            
            <div className="text-center pt-4">
              <span className="text-gray-500 text-sm">Your product could be next...</span>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-6 py-24">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-black mb-6">
            Ready to <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">Spin</span>?
          </h2>
          <p className="text-xl text-gray-400 mb-10">
            No subscriptions. No contracts. Just pay, spin, and watch your product blow up.
          </p>
          <a 
            href={PAYMENT_LINKS.credits50}
            className="inline-flex items-center justify-center gap-3 bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white px-10 py-5 rounded-full text-xl font-bold transition-all hover:scale-105 hover:shadow-[0_0_60px_rgba(0,255,255,0.4)]"
          >
            Get $50 in Credits
            <span className="text-2xl">→</span>
          </a>
          <p className="text-gray-500 text-sm mt-4">+$10 bonus on your first purchase</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gray-800 px-6 py-12">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">FlyWheel</span>
            <span className="text-gray-500 text-sm">by Blog Squad</span>
          </div>
          
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="https://blogsquad.ai" className="hover:text-white transition-colors">Blog Squad</a>
          </div>
          
          <div className="text-gray-500 text-sm">
            © 2026 FlyWheel. All rights reserved.
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.3; }
          50% { transform: translateY(-20px) rotate(180deg); opacity: 0.6; }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
        @keyframes slide-in {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-bounce-slow {
          animation: bounce-slow 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}

export default App
