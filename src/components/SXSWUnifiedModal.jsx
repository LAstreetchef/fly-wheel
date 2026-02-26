import { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || 'https://fly-wheel.onrender.com';

// Three SXSW Packs
const PACKS = {
  startup: {
    id: 'startup',
    name: 'Startup Pack',
    tagline: 'Get Noticed at SXSW',
    description: "AI-targeted boosts reaching Austin's tech, music & startup crowd — all week long.",
    price: 7.99,
    originalPrice: 39.75,
    boosts: 25,
    color: 'yellow',
    gradient: 'from-yellow-400 to-orange-500',
    icon: '🚀',
    perks: [
      "25 AI-powered boosts over 5 festival days",
      "SXSW keyword targeting (#SXSW2026, Austin)",
      "Tech & startup blog targeting",
      "Priority scheduling during peak hours",
      "Real-time performance dashboard"
    ],
    slides: [
      { url: "https://images.unsplash.com/photo-1531218150217-54595bc2b934?w=800&q=75", caption: "Austin, TX" },
      { url: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=75", caption: "10,000+ Industry Attendees" },
      { url: "https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=800&q=75", caption: "Tech Capital" },
    ],
    fields: ['product', 'keywords', 'email'],
    endpoint: '/api/checkout/sxsw',
  },
  artist: {
    id: 'artist',
    name: 'Artist Pack',
    tagline: 'Get Heard at SXSW',
    description: "25 Concert Pitch boosts targeting music blogs, playlist curators & SXSW attendees.",
    price: 44.00,
    originalPrice: 110.00,
    boosts: 25,
    color: 'purple',
    gradient: 'from-purple-500 to-pink-500',
    icon: '🎵',
    perks: [
      "25 Concert Pitch boosts during SXSW",
      "Music blog & playlist curator targeting",
      "#SXSW2026 #AustinMusic hashtag focus",
      "Peak festival hours scheduling",
      "Genre-specific audience reach"
    ],
    slides: [
      { url: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=75", caption: "Live Performance" },
      { url: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&q=75", caption: "Festival Stage" },
      { url: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=75", caption: "Live Music Capital" },
    ],
    fields: ['artist', 'trackUrl', 'genre', 'email'],
    endpoint: '/api/checkout/sxsw-artist',
  },
  podcast: {
    id: 'podcast',
    name: 'Podcast Pack',
    tagline: 'Get Heard at SXSW',
    description: "25 Podcast Boosts targeting podcast blogs, listeners & SXSW media coverage.",
    price: 29.99,
    originalPrice: 74.75,
    boosts: 25,
    color: 'emerald',
    gradient: 'from-emerald-500 to-teal-500',
    icon: '🎙️',
    perks: [
      "25 Podcast Boosts during SXSW week",
      "Podcast blog & newsletter targeting",
      "#SXSW2026 #Podcasting hashtag focus",
      "LinkedIn cross-posting available",
      "Guest tagging for amplification"
    ],
    slides: [
      { url: "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=800&q=75", caption: "Podcast Studio" },
      { url: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=800&q=75", caption: "Live Recording" },
      { url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=75", caption: "SXSW Conversations" },
    ],
    fields: ['showName', 'episodeUrl', 'category', 'email'],
    endpoint: '/api/checkout/sxsw-podcast',
  }
};

const PACK_ORDER = ['startup', 'artist', 'podcast'];
const GENRES = ['Hip-Hop', 'R&B', 'Pop', 'Rock', 'Indie', 'Electronic', 'EDM', 'Jazz', 'Country', 'Latin', 'Other'];
const PODCAST_CATEGORIES = ['True Crime', 'Comedy', 'News & Politics', 'Business', 'Technology', 'Health & Wellness', 'Sports', 'Music', 'Society & Culture', 'Education', 'Science', 'Other'];

function Slider({ slides, color }) {
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(false);
  
  useEffect(() => {
    const t = setInterval(() => {
      setFade(true);
      setTimeout(() => { setIdx(i => (i + 1) % slides.length); setFade(false); }, 400);
    }, 3000);
    return () => clearInterval(t);
  }, [slides.length]);
  
  const colorClasses = {
    yellow: 'bg-yellow-400 text-black',
    purple: 'bg-purple-500 text-white',
    emerald: 'bg-emerald-500 text-white',
  };
  const textColors = {
    yellow: 'text-yellow-400',
    purple: 'text-purple-400',
    emerald: 'text-emerald-400',
  };
  
  return (
    <div className="relative h-48 overflow-hidden rounded-t-2xl">
      <img 
        src={slides[idx].url} 
        alt={slides[idx].caption}
        className="w-full h-full object-cover"
        style={{ opacity: fade ? 0 : 1, transition: "opacity 0.4s ease" }} 
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/80" />
      <div className="absolute top-3 left-3 flex gap-2 items-center">
        <span className={`${colorClasses[color]} text-[10px] font-black px-2 py-0.5 rounded`}>LIMITED OFFER</span>
        <span className={`${textColors[color]} text-[10px] font-bold tracking-wider`}>⚡ SOUTH BY SOUTHWEST 2026</span>
      </div>
      <span className="absolute bottom-8 left-3 text-white/60 text-[11px]">📍 {slides[idx].caption}</span>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
        {slides.map((_, i) => (
          <button 
            key={i} 
            onClick={() => setIdx(i)}
            className="w-1.5 h-1.5 rounded-full transition-all"
            style={{ background: i === idx ? (color === 'yellow' ? '#FACC15' : color === 'purple' ? '#A855F7' : '#10B981') : 'rgba(255,255,255,0.35)' }} 
          />
        ))}
      </div>
    </div>
  );
}

function Countdown({ color }) {
  const [t, setT] = useState({});
  
  useEffect(() => {
    const calc = () => {
      const diff = new Date("2026-03-13T00:00:00-06:00") - new Date();
      if (diff <= 0) return setT({ expired: true });
      setT({
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff % 86400000) / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000)
      });
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, []);
  
  const textColors = {
    yellow: 'text-yellow-400',
    purple: 'text-purple-400',
    emerald: 'text-emerald-400',
  };
  const borderColors = {
    yellow: 'border-yellow-500/30',
    purple: 'border-purple-500/30',
    emerald: 'border-emerald-500/30',
  };
  
  if (t.expired) return <p className={`${textColors[color]} font-bold`}>🎸 SXSW is live!</p>;
  
  return (
    <div className="flex gap-2 justify-center">
      {[["days", t.d], ["hrs", t.h], ["min", t.m], ["sec", t.s]].map(([label, val]) => (
        <div key={label} className={`bg-gray-800 border ${borderColors[color]} rounded-lg px-3 py-2 text-center min-w-[52px]`}>
          <div className={`${textColors[color]} font-black text-2xl leading-none`}>{String(val ?? 0).padStart(2, "0")}</div>
          <div className="text-gray-500 text-[9px] font-semibold tracking-widest mt-1">{label}</div>
        </div>
      ))}
    </div>
  );
}

function PackSelector({ currentPack, onSelect }) {
  return (
    <div className="flex gap-1 mb-4">
      {PACK_ORDER.map(packId => {
        const pack = PACKS[packId];
        const isActive = currentPack === packId;
        const bgClasses = {
          startup: isActive ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700',
          artist: isActive ? 'bg-purple-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700',
          podcast: isActive ? 'bg-emerald-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700',
        };
        return (
          <button
            key={packId}
            onClick={() => onSelect(packId)}
            className={`flex-1 py-2 px-2 rounded-lg text-xs font-bold transition-all ${bgClasses[packId]}`}
          >
            {pack.icon} {pack.name.split(' ')[0]}
          </button>
        );
      })}
    </div>
  );
}

export default function SXSWUnifiedModal() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [currentPack, setCurrentPack] = useState('startup');
  const [step, setStep] = useState("offer");
  const [form, setForm] = useState({
    product: '', keywords: '', email: '',
    artist: '', trackUrl: '', genre: '',
    showName: '', episodeUrl: '', category: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const pack = PACKS[currentPack];

  // Auto-rotate packs every 8 seconds when on offer step
  useEffect(() => {
    if (step !== 'offer' || !open) return;
    const t = setInterval(() => {
      setCurrentPack(prev => {
        const idx = PACK_ORDER.indexOf(prev);
        return PACK_ORDER[(idx + 1) % PACK_ORDER.length];
      });
    }, 8000);
    return () => clearInterval(t);
  }, [step, open]);

  // Auto-open after 2s
  useEffect(() => {
    const t = setTimeout(() => { if (!dismissed) setOpen(true); }, 2000);
    return () => clearTimeout(t);
  }, [dismissed]);

  const close = () => { setOpen(false); setDismissed(true); };

  const submit = async e => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      let body = { email: form.email };
      
      if (currentPack === 'startup') {
        body = { ...body, product: form.product, keywords: form.keywords };
      } else if (currentPack === 'artist') {
        body = { ...body, artist: form.artist, trackUrl: form.trackUrl, genre: form.genre };
      } else if (currentPack === 'podcast') {
        body = { ...body, showName: form.showName, episodeUrl: form.episodeUrl, category: form.category };
      }

      const res = await fetch(`${API_URL}${pack.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const gradientClasses = {
    startup: 'from-yellow-400 to-orange-500',
    artist: 'from-purple-500 to-pink-500',
    podcast: 'from-emerald-500 to-teal-500',
  };
  const buttonTextClasses = {
    startup: 'text-black',
    artist: 'text-white',
    podcast: 'text-white',
  };

  if (!open) return (
    <button 
      onClick={() => setOpen(true)}
      className={`fixed bottom-6 right-6 z-50 bg-gradient-to-r ${gradientClasses[currentPack]} ${buttonTextClasses[currentPack]} font-black text-sm px-5 py-3 rounded-full shadow-lg hover:scale-105 transition-transform`}
    >
      {pack.icon} SXSW {pack.name}
    </button>
  );

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm" onClick={close} />
      <div
        className={`fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(480px,94vw)] max-h-[90vh] overflow-y-auto bg-[#0d0d0d] border border-${pack.color}-500/30 rounded-2xl`}
        style={{ scrollbarWidth: "none" }}
      >
        <button 
          onClick={close}
          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-black/60 border border-white/10 text-gray-400 text-xs flex items-center justify-center hover:text-white"
        >
          ✕
        </button>

        <Slider slides={pack.slides} color={pack.color} />

        <div className="p-6">
          <PackSelector currentPack={currentPack} onSelect={setCurrentPack} />

          {step === "offer" && (
            <>
              <h2 className="text-4xl font-black text-white tracking-tight mb-1">{pack.tagline}</h2>
              <p className="text-gray-500 text-sm mb-4">{pack.description}</p>
              
              <div className="flex items-baseline gap-2 mb-5">
                <span className="text-gray-600 line-through text-base">${pack.originalPrice}</span>
                <span className={`text-${pack.color}-400 text-5xl font-black leading-none`}>${pack.price}</span>
                <span className="text-gray-600 text-sm">/ festival week</span>
              </div>
              
              <ul className="space-y-2 mb-5">
                {pack.perks.map((p, i) => (
                  <li key={i} className="flex gap-2 text-gray-400 text-sm border-b border-gray-800 pb-2">
                    <span className={`text-${pack.color}-400 mt-0.5`}>✦</span>{p}
                  </li>
                ))}
              </ul>
              
              <p className="text-gray-600 text-[10px] font-bold tracking-widest text-center mb-2">SXSW 2026 STARTS IN</p>
              <Countdown color={pack.color} />
              
              <button 
                onClick={() => setStep("form")}
                className={`mt-5 w-full bg-gradient-to-r ${gradientClasses[currentPack]} ${buttonTextClasses[currentPack]} font-black py-4 rounded-xl text-base hover:opacity-90 transition-opacity`}
              >
                Claim {pack.name} →
              </button>
              <p className="text-center text-gray-700 text-xs mt-3">One-time charge · No subscription · Perfect for SXSW</p>
            </>
          )}

          {step === "form" && (
            <>
              <h2 className="text-3xl font-black text-white mb-1">Set Up Your Campaign</h2>
              <p className="text-gray-500 text-sm mb-5">Tell us about your {currentPack === 'startup' ? 'product' : currentPack === 'artist' ? 'music' : 'podcast'} and we'll handle the rest.</p>
              
              <form onSubmit={submit} className="space-y-4">
                {currentPack === 'startup' && (
                  <>
                    <div>
                      <label className="block text-gray-600 text-[11px] font-bold tracking-widest mb-1">PRODUCT NAME</label>
                      <input 
                        type="text" 
                        placeholder="e.g., SwordPay" 
                        required 
                        value={form.product}
                        onChange={e => setForm({...form, product: e.target.value})}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-yellow-500" 
                      />
                    </div>
                    <div>
                      <label className="block text-gray-600 text-[11px] font-bold tracking-widest mb-1">KEYWORDS</label>
                      <input 
                        type="text" 
                        placeholder="e.g., fintech, payments, startup" 
                        required 
                        value={form.keywords}
                        onChange={e => setForm({...form, keywords: e.target.value})}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-yellow-500" 
                      />
                    </div>
                  </>
                )}

                {currentPack === 'artist' && (
                  <>
                    <div>
                      <label className="block text-gray-600 text-[11px] font-bold tracking-widest mb-1">ARTIST / TRACK NAME</label>
                      <input 
                        type="text" 
                        placeholder="e.g., Your Name - Track Title" 
                        required 
                        value={form.artist}
                        onChange={e => setForm({...form, artist: e.target.value})}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500" 
                      />
                    </div>
                    <div>
                      <label className="block text-gray-600 text-[11px] font-bold tracking-widest mb-1">TRACK URL (SPOTIFY, SOUNDCLOUD, ETC.)</label>
                      <input 
                        type="url" 
                        placeholder="https://open.spotify.com/track/..." 
                        required 
                        value={form.trackUrl}
                        onChange={e => setForm({...form, trackUrl: e.target.value})}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500" 
                      />
                    </div>
                    <div>
                      <label className="block text-gray-600 text-[11px] font-bold tracking-widest mb-1">GENRE</label>
                      <select 
                        required 
                        value={form.genre}
                        onChange={e => setForm({...form, genre: e.target.value})}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500"
                      >
                        <option value="">Select genre</option>
                        {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                  </>
                )}

                {currentPack === 'podcast' && (
                  <>
                    <div>
                      <label className="block text-gray-600 text-[11px] font-bold tracking-widest mb-1">SHOW NAME</label>
                      <input 
                        type="text" 
                        placeholder="e.g., The Daily" 
                        required 
                        value={form.showName}
                        onChange={e => setForm({...form, showName: e.target.value})}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-emerald-500" 
                      />
                    </div>
                    <div>
                      <label className="block text-gray-600 text-[11px] font-bold tracking-widest mb-1">EPISODE URL (SPOTIFY, APPLE, ETC.)</label>
                      <input 
                        type="url" 
                        placeholder="https://open.spotify.com/episode/..." 
                        required 
                        value={form.episodeUrl}
                        onChange={e => setForm({...form, episodeUrl: e.target.value})}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-emerald-500" 
                      />
                    </div>
                    <div>
                      <label className="block text-gray-600 text-[11px] font-bold tracking-widest mb-1">CATEGORY</label>
                      <select 
                        required 
                        value={form.category}
                        onChange={e => setForm({...form, category: e.target.value})}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">Select category</option>
                        {PODCAST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-gray-600 text-[11px] font-bold tracking-widest mb-1">EMAIL FOR REPORTS</label>
                  <input 
                    type="email" 
                    placeholder="you@email.com" 
                    required 
                    value={form.email}
                    onChange={e => setForm({...form, email: e.target.value})}
                    className={`w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-${pack.color}-500`}
                  />
                </div>

                {error && <p className="text-red-400 text-sm text-center">{error}</p>}

                <button 
                  type="submit" 
                  disabled={loading}
                  className={`w-full bg-gradient-to-r ${gradientClasses[currentPack]} ${buttonTextClasses[currentPack]} font-black py-4 rounded-xl text-base hover:opacity-90 transition-opacity disabled:opacity-50`}
                >
                  {loading ? "Processing..." : `Pay $${pack.price} & Launch 🚀`}
                </button>
              </form>
              
              <button onClick={() => setStep("offer")} className="block mx-auto mt-3 text-gray-600 text-sm hover:text-gray-400">
                ← Back
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
