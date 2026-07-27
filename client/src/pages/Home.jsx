import React from 'react'
import { AuthContext } from '../context/AuthContext'
import { useContext } from 'react'
import { Link } from 'react-router-dom';
const Home = () => {

  const { isAuthenticated } = useContext(AuthContext);
  return (
    <div className="max-w-5xl mx-auto px-6">
      {/* Hero */}
      <div className="grid md:grid-cols-2 gap-12 items-center pt-20 pb-16">
        <div>
          <span className="font-mono text-xs text-clay uppercase tracking-widest">
            Free Leaf Checkup
          </span>
          <h1 className="font-display text-5xl md:text-6xl leading-[1.05] text-ink mt-3 mb-6">
            Take a photo.<br />Know the<br /><em className="text-field">disease.</em>
          </h1>
          <p className="text-ink/70 font-body leading-relaxed mb-8 max-w-md">
            Take a photo of a leaf from your crop. We'll tell you what disease it has,
            how serious it is, what medicine to use, and how much crop you could lose if you wait.
          </p>
          <Link
            to={isAuthenticated ? '/predict' : '/register'}
            className="inline-block bg-field text-parchment px-6 py-3 font-mono text-sm uppercase tracking-wide hover:bg-field-dark transition-colors"
          >
            Check a leaf now →
          </Link>
        </div>

        {/* Signature element: a "specimen card" preview */}
        <div className="card-specimen p-6 -rotate-1">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-[10px] text-sage uppercase tracking-widest">Example Result</span>
            <span className="stamp border-clay text-clay text-[10px] px-2 py-0.5">MEDIUM</span>
          </div>
          <div className="vein-divider mb-4" />
          <p className="font-display text-2xl text-ink mb-1">Wheat — Leaf Rust</p>
          <p className="font-mono text-xs text-sage mb-4">87% sure</p>
          <div className="vein-divider mb-4" />
          <p className="text-sm text-ink/70 leading-relaxed">
            You could lose <span className="text-clay font-medium">30%</span> of your crop if not treated.
            Use Propiconazole spray within 5–7 days.
          </p>
        </div>
      </div>

      {/* How it works — only a sequence because it genuinely is one */}
      <div className="vein-divider mb-12" />
      <div className="grid sm:grid-cols-3 gap-8 pb-24">
        {[
          { step: '1. Take a Photo', desc: 'Click a clear picture of one leaf in daylight.' },
          { step: '2. Get Results', desc: 'We check the leaf and tell you the disease.' },
          { step: '3. Treat It', desc: 'See what to spray and how much crop is at risk.' }
        ].map((s) => (
          <div key={s.step}>
            <p className="font-display text-xl text-ink mb-1">{s.step}</p>
            <p className="text-sm text-ink/60 font-body">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
};


export default Home