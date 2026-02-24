import { useState, useEffect } from 'react';

const EXAMPLE_TWEETS = [
  {
    account: '@flywheelsquad',
    avatar: 'https://pbs.twimg.com/profile_images/1234567890/stella_400x400.jpg',
    name: 'Fly Wheel Squad',
    verified: true,
    date: 'Feb 19',
    text: 'Just found this gem on content monetization - 8 proven strategies that don\'t require a massive following 💡\n\nSpeaking of finding the right audience, if you\'re looking to connect with daily active users for your product, check out DAUfinder',
    blogTitle: '8 Proven Content Monetization Strategies | Circle Blog',
    blogDomain: 'circle.so',
    impressions: '1.2K',
    likes: 24,
    retweets: 4,
    replies: 3,
  },
  {
    account: '@flywheelsquad',
    avatar: 'https://pbs.twimg.com/profile_images/1234567890/stella_400x400.jpg',
    name: 'Fly Wheel Squad',
    verified: true,
    date: 'Feb 19',
    text: 'Product-Led Growth is reshaping SaaS! 🚀 This deep dive into PLG strategies from companies like Slack & Zoom is packed with insights\n\nSpeaking of finding users - if you need help discovering DAUs for your product, check out DAUfinder',
    blogTitle: 'Product-Led Growth (PLG): What it means, examples...',
    blogDomain: 'productled.com',
    impressions: '890',
    likes: 18,
    retweets: 3,
    replies: 2,
  },
  {
    account: '@GreenTruck',
    avatar: 'https://pbs.twimg.com/profile_images/greentruck_400x400.jpg',
    name: 'Green Truck 🌱🍃',
    verified: true,
    date: 'Feb 19',
    text: '🌮 Street food culture is exploding globally - but what does this mean for our health & planet? The latest trends reveal some surprising insights about how we can eat better while supporting local communities! 🌱',
    blogTitle: 'Street Food And The Growth Of Street Food Culture - Tastewise',
    blogDomain: 'tastewise.io',
    impressions: '654',
    likes: 15,
    retweets: 2,
    replies: 4,
  },
  {
    account: '@dogedoctortips',
    avatar: 'https://pbs.twimg.com/profile_images/drdoge_400x400.jpg',
    name: 'Dr Doge',
    verified: true,
    date: 'Feb 20',
    text: 'The government dropped a 10 gig bounty board disguised as a Medicaid dataset. 30-50% of whatever fraud you find. First come first served.',
    blogTitle: 'DogeWatch — Crowdsourced Medicaid Fraud Detection',
    blogDomain: 'dogedoctor.com',
    impressions: '2.4K',
    likes: 89,
    retweets: 34,
    replies: 12,
  },
];

function TweetCard({ tweet, darkMode }) {
  return (
    <div className={`flex-shrink-0 w-80 rounded-2xl p-4 ${darkMode ? 'bg-gray-800/80 border border-gray-700' : 'bg-white border border-gray-200 shadow-lg'}`}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-yellow-400 flex items-center justify-center text-white font-bold text-sm">
          {tweet.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className={`font-bold text-sm truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{tweet.name}</span>
            {tweet.verified && <span className="text-blue-400 text-xs">✓</span>}
          </div>
          <div className="text-gray-500 text-xs">{tweet.account} · {tweet.date}</div>
        </div>
      </div>
      
      {/* Tweet Text */}
      <p className={`text-sm mb-3 line-clamp-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
        {tweet.text}
      </p>
      
      {/* Blog Card Preview */}
      <div className={`rounded-xl overflow-hidden border mb-3 ${darkMode ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'}`}>
        <div className="p-3">
          <div className="text-xs text-gray-500 mb-1">{tweet.blogDomain}</div>
          <div className={`text-sm font-medium line-clamp-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{tweet.blogTitle}</div>
        </div>
      </div>
      
      {/* Stats */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>💬 {tweet.replies}</span>
        <span>🔁 {tweet.retweets}</span>
        <span>❤️ {tweet.likes}</span>
        <span>📊 {tweet.impressions}</span>
      </div>
    </div>
  );
}

export default function TweetCarousel({ darkMode = true }) {
  const [scrollPos, setScrollPos] = useState(0);
  
  return (
    <div className="py-12">
      <div className="text-center mb-8">
        <h3 className={`text-2xl font-black mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Real Boosts, Real Results
        </h3>
        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Here's what your boost will look like on X
        </p>
      </div>
      
      {/* Carousel */}
      <div className="relative">
        <div 
          className="flex gap-4 overflow-x-auto pb-4 px-4 snap-x snap-mandatory scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {EXAMPLE_TWEETS.map((tweet, i) => (
            <div key={i} className="snap-start">
              <TweetCard tweet={tweet} darkMode={darkMode} />
            </div>
          ))}
        </div>
        
        {/* Scroll indicators */}
        <div className="flex justify-center gap-2 mt-4">
          {EXAMPLE_TWEETS.map((_, i) => (
            <div 
              key={i} 
              className={`w-2 h-2 rounded-full transition-all ${i === 0 ? (darkMode ? 'bg-orange-500' : 'bg-orange-500') : (darkMode ? 'bg-gray-600' : 'bg-gray-300')}`}
            />
          ))}
        </div>
      </div>
      
      {/* CTA */}
      <div className="text-center mt-6">
        <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          Your boost gets posted to our network of 10K+ followers
        </p>
      </div>
    </div>
  );
}
