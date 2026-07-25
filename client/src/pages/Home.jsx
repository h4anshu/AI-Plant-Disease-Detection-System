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
            Specimen No. 001 — Leaf Diagnosis
          </span>
          <h1 className="font-display text-5xl md:text-6xl leading-[1.05] text-ink mt-3 mb-6">
            Read the leaf<br />before it reads<br /><em className="text-field">your yield.</em>
          </h1>
          <p className="text-ink/70 font-body leading-relaxed mb-8 max-w-md">
            Photograph a leaf. Get a diagnosis, a severity reading, and what it means
            for what you'll harvest — in under a minute, right from the field.
          </p>
          <Link
            to={isAuthenticated ? '/predict' : '/register'}
            className="inline-block bg-field text-parchment px-6 py-3 font-mono text-sm uppercase tracking-wide hover:bg-field-dark transition-colors"
          >
            Diagnose a leaf →
          </Link>
        </div>

        {/* Signature element: a "specimen card" preview */}
        <div className="card-specimen p-6 -rotate-1">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-[10px] text-sage uppercase tracking-widest">Sample Reading</span>
            <span className="stamp border-clay text-clay text-[10px] px-2 py-0.5">MODERATE</span>
          </div>
          <div className="vein-divider mb-4" />
          <p className="font-display text-2xl text-ink mb-1">Wheat — Leaf Rust</p>
          <p className="font-mono text-xs text-sage mb-4">confidence 87.3%</p>
          <div className="vein-divider mb-4" />
          <p className="text-sm text-ink/70 leading-relaxed">
            Est. yield loss: <span className="text-clay font-medium">30%</span> if untreated.
            Apply Propiconazole within 5–7 days.
          </p>
        </div>
      </div>

      {/* How it works — only a sequence because it genuinely is one */}
      <div className="vein-divider mb-12" />
      <div className="grid sm:grid-cols-3 gap-8 pb-24">
        {[
          { step: 'Capture', desc: 'Photograph a single leaf in natural light.' },
          { step: 'Diagnose', desc: 'The model reads the disease and its severity.' },
          { step: 'Act', desc: 'Get treatment advice and the yield cost of waiting.' }
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
