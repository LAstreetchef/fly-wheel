import { useState, useEffect } from 'react';

const PRODUCT_SLIDES = [
  { 
    url: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&q=75", 
    caption: "AI-Powered Promotion",
    stat: "500+ boosts delivered"
  },
  { 
    url: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=75", 
    caption: "Real Blog References",
    stat: "Authentic engagement"
  },
  { 
    url: "https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?w=800&q=75", 
    caption: "Grow Your Audience",
    stat: "Reach new customers"
  },
];

const MUSIC_SLIDES = [
  { 
    url: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=75", 
    caption: "Live Performance",
    stat: "Get heard by real fans"
  },
  { 
    url: "https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?w=800&q=75", 
    caption: "Studio Sessions",
    stat: "Reach playlist curators"
  },
  { 
    url: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&q=75", 
    caption: "Music Production",
    stat: "Connect with music blogs"
  },
  { 
    url: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&q=75", 
    caption: "Festival Vibes",
    stat: "Build your fanbase"
  },
];

export default function HeroCarousel({ artistMode = false }) {
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(false);
  
  const SLIDES = artistMode ? MUSIC_SLIDES : PRODUCT_SLIDES;

  useEffect(() => {
    setIdx(0); // Reset on mode change
  }, [artistMode]);

  useEffect(() => {
    const t = setInterval(() => {
      setFade(true);
      setTimeout(() => { 
        setIdx(i => (i + 1) % SLIDES.length); 
        setFade(false); 
      }, 400);
    }, 4000);
    return () => clearInterval(t);
  }, [SLIDES.length]);

  const accentColor = artistMode ? '#A855F7' : '#FACC15'; // purple for music, yellow for products

  return (
    <div className="relative h-64 sm:h-80 overflow-hidden rounded-2xl">
      <img 
        src={SLIDES[idx].url} 
        alt={SLIDES[idx].caption}
        className="w-full h-full object-cover"
        style={{ opacity: fade ? 0 : 1, transition: "opacity 0.4s ease" }} 
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
      
      {/* Badge */}
      <div className="absolute top-4 left-4 flex gap-2 items-center">
        <span 
          className="text-[10px] font-black px-2.5 py-1 rounded-full"
          style={{ background: accentColor, color: artistMode ? 'white' : 'black' }}
        >
          {artistMode ? 'CONCERT PITCH' : 'NEW'}
        </span>
        <span style={{ color: accentColor }} className="text-xs font-bold tracking-wider">
          {artistMode ? '🎵 A440 Hz' : '✦ AI-POWERED BOOSTS'}
        </span>
      </div>
      
      {/* Stats overlay */}
      <div className="absolute bottom-12 left-4">
        <span className="text-white/90 text-sm font-medium bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full">
          {artistMode ? '🎵' : '📈'} {SLIDES[idx].stat}
        </span>
      </div>
      
      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {SLIDES.map((_, i) => (
          <button 
            key={i} 
            onClick={() => setIdx(i)}
            className="w-2 h-2 rounded-full transition-all"
            style={{ 
              background: i === idx ? accentColor : 'rgba(255,255,255,0.35)',
              transform: i === idx ? 'scale(1.2)' : 'scale(1)'
            }} 
          />
        ))}
      </div>
    </div>
  );
}
