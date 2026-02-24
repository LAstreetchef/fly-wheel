import { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || 'https://fly-wheel.onrender.com';

const BUNDLE = { 
  price: 44.00, 
  originalPrice: 110.00, 
  boosts: 25,
  perks: [
    "25 Concert Pitch boosts during SXSW",
    "Music blog & playlist curator targeting",
    "#SXSW2026 #AustinMusic hashtag focus",
    "Peak festival hours scheduling",
    "Genre-specific audience reach"
  ]
};

const SLIDES = [
  { url: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=75", caption: "Live Performance" },
  { url: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&q=75", caption: "Festival Stage" },
  { url: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=75", caption: "Live Music Capital" },
  { url: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&q=75", caption: "Studio to Stage" },
];

function Slider() {
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(false);
  useEffect(() => {
    const t = setInterval(() => {
      setFade(true);
      setTimeout(() => { setIdx(i => (i+1)%SLIDES.length); setFade(false); }, 400);
    }, 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="relative h-48 overflow-hidden rounded-t-2xl">
      <img src={SLIDES[idx].url} alt={SLIDES[idx].caption}
        className="w-full h-full object-cover"
        style={{ opacity: fade ? 0 : 1, transition: "opacity 0.4s ease" }} />
      <div className="absolute inset-0 bg-gradient-to-b from-purple-900/30 to-black/90" />
      <div className="absolute top-3 left-3 flex gap-2 items-center">
        <span className="bg-purple-500 text-white text-[10px] font-black px-2 py-0.5 rounded">ARTIST PACK</span>
        <span className="text-purple-300 text-[10px] font-bold tracking-wider">🎵 SXSW 2026</span>
      </div>
      <span className="absolute bottom-8 left-3 text-white/60 text-[11px]">🎤 {SLIDES[idx].caption}</span>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
        {SLIDES.map((_,i) => (
          <button key={i} onClick={() => setIdx(i)}
            className="w-1.5 h-1.5 rounded-full transition-all"
            style={{ background: i===idx ? '#A855F7' : 'rgba(255,255,255,0.35)' }} />
        ))}
      </div>
    </div>
  );
}

function Countdown() {
  const [t, setT] = useState({});
  useEffect(() => {
    const calc = () => {
      const diff = new Date("2026-03-13T00:00:00-06:00") - new Date();
      if (diff <= 0) return setT({ expired: true });
      setT({
        d: Math.floor(diff/86400000),
        h: Math.floor((diff%86400000)/3600000),
        m: Math.floor((diff%3600000)/60000),
        s: Math.floor((diff%60000)/1000)
      });
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, []);
  if (t.expired) return <p className="text-purple-400 font-bold">🎸 SXSW is live!</p>;
  return (
    <div className="flex gap-2 justify-center">
      {[["days",t.d],["hrs",t.h],["min",t.m],["sec",t.s]].map(([label,val]) => (
        <div key={label} className="bg-gray-800 border border-purple-500/30 rounded-lg px-3 py-2 text-center min-w-[52px]">
          <div className="text-purple-400 font-black text-2xl leading-none">{String(val??0).padStart(2,"0")}</div>
          <div className="text-gray-500 text-[9px] font-semibold tracking-widest mt-1">{label}</div>
        </div>
      ))}
    </div>
  );
}

export default function SXSWArtistModal({ onClose }) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState("offer");
  const [form, setForm] = useState({ artist: "", trackUrl: "", genre: "", email: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Check if user is in artist mode or came from /music
    const isArtistContext = localStorage.getItem('showArtistSXSW') === 'true' || 
                           window.location.pathname.includes('/music') ||
                           new URLSearchParams(window.location.search).get('mode') === 'music';
    
    if (isArtistContext && !dismissed) {
      const t = setTimeout(() => setOpen(true), 2500);
      return () => clearTimeout(t);
    }
  }, [dismissed]);

  const close = () => { setOpen(false); setDismissed(true); };
  
  const submit = async e => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    try {
      const res = await fetch(`${API_URL}/api/checkout/sxsw-artist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          artist: form.artist,
          trackUrl: form.trackUrl,
          genre: form.genre,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Checkout failed');
      }
      
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="fixed bottom-6 left-6 z-50 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-black text-sm px-5 py-3 rounded-full shadow-lg shadow-purple-500/30 hover:scale-105 transition-transform">
      🎵 SXSW Artist Pack
    </button>
  );

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm" onClick={close} />
      <div
        className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(480px,94vw)] max-h-[90vh] overflow-y-auto bg-[#0d0d0d] border border-purple-500/30 rounded-2xl"
        style={{ scrollbarWidth: "none" }}
      >
        <button onClick={close}
          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-black/60 border border-white/10 text-gray-400 text-xs flex items-center justify-center hover:text-white">
          ✕
        </button>

        <Slider />

        <div className="p-6">
          {step === "offer" && <>
            <h2 className="text-4xl font-black text-white tracking-tight mb-1">Get Heard at SXSW</h2>
            <p className="text-gray-500 text-sm mb-4">25 Concert Pitch boosts targeting music blogs, playlist curators & SXSW attendees.</p>
            <div className="flex items-baseline gap-2 mb-5">
              <span className="text-gray-600 line-through text-base">${BUNDLE.originalPrice}</span>
              <span className="text-purple-400 text-5xl font-black leading-none">${BUNDLE.price}</span>
              <span className="text-gray-600 text-sm">/ festival week</span>
            </div>
            <ul className="space-y-2 mb-5">
              {BUNDLE.perks.map((p,i) => (
                <li key={i} className="flex gap-2 text-gray-400 text-sm border-b border-gray-800 pb-2">
                  <span className="text-purple-400 mt-0.5">🎵</span>{p}
                </li>
              ))}
            </ul>
            <p className="text-gray-600 text-[10px] font-bold tracking-widest text-center mb-2">SXSW 2026 STARTS IN</p>
            <Countdown />
            <button onClick={() => setStep("form")}
              className="mt-5 w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-black py-4 rounded-xl text-base hover:from-purple-400 hover:to-pink-400 transition-colors">
              Claim Artist Pack →
            </button>
            <p className="text-center text-gray-700 text-xs mt-3">One-time charge · No subscription · Perfect for SXSW showcases</p>
          </>}

          {step === "form" && <>
            <h2 className="text-3xl font-black text-white mb-1">Set Up Your Campaign</h2>
            <p className="text-gray-500 text-sm mb-5">Tell us about your music and we'll handle the rest.</p>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-gray-600 text-[11px] font-bold tracking-widest mb-1">ARTIST / TRACK NAME</label>
                <input type="text" placeholder="e.g., Your Name - Track Title" required value={form.artist}
                  onChange={e => setForm({...form, artist: e.target.value})}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="block text-gray-600 text-[11px] font-bold tracking-widest mb-1">TRACK URL (SPOTIFY, SOUNDCLOUD, ETC.)</label>
                <input type="url" placeholder="https://open.spotify.com/track/..." required value={form.trackUrl}
                  onChange={e => setForm({...form, trackUrl: e.target.value})}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="block text-gray-600 text-[11px] font-bold tracking-widest mb-1">GENRE</label>
                <select required value={form.genre}
                  onChange={e => setForm({...form, genre: e.target.value})}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500">
                  <option value="">Select genre</option>
                  <option value="Hip-Hop">Hip-Hop</option>
                  <option value="R&B">R&B</option>
                  <option value="Pop">Pop</option>
                  <option value="Rock">Rock</option>
                  <option value="Indie">Indie</option>
                  <option value="Electronic">Electronic</option>
                  <option value="EDM">EDM</option>
                  <option value="Country">Country</option>
                  <option value="Latin">Latin</option>
                  <option value="Jazz">Jazz</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-600 text-[11px] font-bold tracking-widest mb-1">EMAIL FOR REPORTS</label>
                <input type="email" placeholder="you@email.com" required value={form.email}
                  onChange={e => setForm({...form, email: e.target.value})}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500" />
              </div>
              {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
              )}
              <button type="submit" disabled={loading}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-black py-4 rounded-xl text-base hover:from-purple-400 hover:to-pink-400 transition-colors disabled:opacity-50">
                {loading ? "Processing..." : `Pay $${BUNDLE.price} & Launch 🚀`}
              </button>
            </form>
            <button onClick={() => setStep("offer")} className="block mx-auto mt-3 text-gray-600 text-sm hover:text-gray-400">← Back</button>
          </>}
        </div>
      </div>
    </>
  );
}
