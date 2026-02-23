import { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || 'https://fly-wheel.onrender.com';

const BUNDLE = { price: 7.99, originalPrice: 39.75, boosts: 25,
  perks: ["25 AI-powered boosts over 5 festival days","SXSW keyword targeting (#SXSW2026, Austin)","Priority scheduling during peak festival hours","Real-time performance dashboard","Dedicated festival audience reach"]
};

const SLIDES = [
  { url: "https://images.unsplash.com/photo-1531218150217-54595bc2b934?w=800&q=75", caption: "Austin, TX" },
  { url: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=75", caption: "Live Music Capital of the World" },
  { url: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=75", caption: "10,000+ Industry Attendees" },
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
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/80" />
      <div className="absolute top-3 left-3 flex gap-2 items-center">
        <span className="bg-yellow-400 text-black text-[10px] font-black px-2 py-0.5 rounded">LIMITED OFFER</span>
        <span className="text-yellow-400 text-[10px] font-bold tracking-wider">⚡ SOUTH BY SOUTHWEST 2026</span>
      </div>
      <span className="absolute bottom-8 left-3 text-white/60 text-[11px]">📍 {SLIDES[idx].caption}</span>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
        {SLIDES.map((_,i) => (
          <button key={i} onClick={() => setIdx(i)}
            className="w-1.5 h-1.5 rounded-full transition-all"
            style={{ background: i===idx ? '#FACC15' : 'rgba(255,255,255,0.35)' }} />
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
  if (t.expired) return <p className="text-yellow-400 font-bold">🎸 SXSW is live!</p>;
  return (
    <div className="flex gap-2 justify-center">
      {[["days",t.d],["hrs",t.h],["min",t.m],["sec",t.s]].map(([label,val]) => (
        <div key={label} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-center min-w-[52px]">
          <div className="text-yellow-400 font-black text-2xl leading-none">{String(val??0).padStart(2,"0")}</div>
          <div className="text-gray-500 text-[9px] font-semibold tracking-widest mt-1">{label}</div>
        </div>
      ))}
    </div>
  );
}

export default function SXSWModal() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState("offer");
  const [form, setForm] = useState({ product: "", keywords: "", email: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { if (!dismissed) setOpen(true); }, 2000);
    return () => clearTimeout(t);
  }, [dismissed]);

  const close = () => { setOpen(false); setDismissed(true); };
  const [error, setError] = useState("");
  
  const submit = async e => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    try {
      const res = await fetch(`${API_URL}/api/checkout/sxsw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          product: form.product,
          keywords: form.keywords,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Checkout failed');
      }
      
      // Redirect to Stripe checkout
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="fixed bottom-6 right-6 z-50 bg-yellow-400 text-black font-black text-sm px-5 py-3 rounded-full shadow-lg shadow-yellow-400/30 hover:scale-105 transition-transform">
      🎸 SXSW Deal
    </button>
  );

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm" onClick={close} />
      <div
        className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(480px,94vw)] max-h-[90vh] overflow-y-auto bg-[#0d0d0d] border border-gray-800 rounded-2xl"
        style={{ scrollbarWidth: "none" }}
      >
        <button onClick={close}
          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-black/60 border border-white/10 text-gray-400 text-xs flex items-center justify-center hover:text-white">
          ✕
        </button>

        <Slider />

        <div className="p-6">
          {step === "offer" && <>
            <h2 className="text-4xl font-black text-white tracking-tight mb-1">Get Noticed at SXSW</h2>
            <p className="text-gray-500 text-sm mb-4">AI-targeted boosts reaching Austin's tech, music &amp; startup crowd — all week long.</p>
            <div className="flex items-baseline gap-2 mb-5">
              <span className="text-gray-600 line-through text-base">${BUNDLE.originalPrice}</span>
              <span className="text-yellow-400 text-5xl font-black leading-none">${BUNDLE.price}</span>
              <span className="text-gray-600 text-sm">/ festival week</span>
            </div>
            <ul className="space-y-2 mb-5">
              {BUNDLE.perks.map((p,i) => (
                <li key={i} className="flex gap-2 text-gray-400 text-sm border-b border-gray-800 pb-2">
                  <span className="text-yellow-400 mt-0.5">✦</span>{p}
                </li>
              ))}
            </ul>
            <p className="text-gray-600 text-[10px] font-bold tracking-widest text-center mb-2">SXSW 2026 STARTS IN</p>
            <Countdown />
            <button onClick={() => setStep("form")}
              className="mt-5 w-full bg-yellow-400 text-black font-black py-4 rounded-xl text-base hover:bg-yellow-300 transition-colors">
              Claim My Festival Pack →
            </button>
            <p className="text-center text-gray-700 text-xs mt-3">One-time charge · No subscription · Instant activation</p>
          </>}

          {step === "form" && <>
            <h2 className="text-3xl font-black text-white mb-1">Set Up Your Campaign</h2>
            <p className="text-gray-500 text-sm mb-5">Tell us about your product and we'll handle the rest.</p>
            <form onSubmit={submit} className="space-y-4">
              {[
                ["Product / App Name","text","e.g. LaunchKit, NeonPay","product"],
                ["Target Keywords","text","e.g. fintech, AI tools, food & drink","keywords"],
                ["Email for Reports","email","you@yourcompany.com","email"]
              ].map(([label,type,ph,key]) => (
                <div key={key}>
                  <label className="block text-gray-600 text-[11px] font-bold tracking-widest mb-1">{label}</label>
                  <input type={type} placeholder={ph} required value={form[key]}
                    onChange={e => setForm({...form,[key]:e.target.value})}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-yellow-400" />
                </div>
              ))}
              {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
              )}
              <button type="submit" disabled={loading}
                className="w-full bg-yellow-400 text-black font-black py-4 rounded-xl text-base hover:bg-yellow-300 transition-colors disabled:opacity-50">
                {loading ? "Processing..." : `Pay $${BUNDLE.price} & Launch 🚀`}
              </button>
            </form>
            <button onClick={() => setStep("offer")} className="block mx-auto mt-3 text-gray-600 text-sm hover:text-gray-400">← Back</button>
          </>}

          {step === "success" && (
            <div className="text-center py-4">
              <div className="text-5xl mb-3">🎉</div>
              <h2 className="text-3xl font-black text-white mb-2">You're In!</h2>
              <p className="text-gray-500 text-sm mb-5">Campaign queued. Confirmation sent to <span className="text-yellow-400 font-bold">{form.email}</span>.</p>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-left space-y-2 mb-5">
                {[["Product",form.product],["Boosts",`${BUNDLE.boosts} over 5 days`],["Charged",`$${BUNDLE.price}`]].map(([k,v]) => (
                  <div key={k} className="flex justify-between text-sm border-b border-gray-800 pb-2">
                    <span className="text-gray-500">{k}</span><strong className="text-white">{v}</strong>
                  </div>
                ))}
              </div>
              <button onClick={close} className="w-full bg-yellow-400 text-black font-black py-3 rounded-xl hover:bg-yellow-300">Done</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
