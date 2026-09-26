import React from 'react'
import { AuthContext } from '../context/AuthContext'
import { useContext } from 'react'
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
const Home = () => {

  const { isAuthenticated } = useContext(AuthContext);
  const { t } = useTranslation();
  return (
    <div className="max-w-5xl mx-auto px-6">
      {/* Hero */}
      <div className="grid md:grid-cols-2 gap-12 items-center pt-20 pb-16">
        <div>
          <span className="font-mono text-xs text-clay uppercase tracking-widest">
            {t('home.eyebrow')}
          </span>
          <h1 className="font-display text-5xl md:text-6xl leading-[1.05] text-ink mt-3 mb-6">
            {t('home.title1')}<br />{t('home.title2')}<br /><em className="text-field">{t('home.titleEm')}</em>
          </h1>
          <p className="text-ink/70 font-body leading-relaxed mb-8 max-w-md">
            {t('home.intro')}
          </p>
          {/* ponytail: login temporarily disabled, always send to /predict. Restore the ternary below once login is back on. */}
          <Link
            to={'/predict'}
            // to={isAuthenticated ? '/predict' : '/register'}
            className="inline-block bg-field text-parchment px-6 py-3 font-mono text-sm uppercase tracking-wide hover:bg-field-dark transition-colors"
          >
            {t('home.cta')}
          </Link>
        </div>

        {/* Signature element: a "specimen card" preview */}
        <div className="card-specimen p-6 -rotate-1">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-[10px] text-sage uppercase tracking-widest">{t('home.exampleLabel')}</span>
            <span className="stamp border-clay text-clay text-[10px] px-2 py-0.5">{t('home.exampleStamp')}</span>
          </div>
          <div className="vein-divider mb-4" />
          <p className="font-display text-2xl text-ink mb-1">{t('home.exampleTitle')}</p>
          <p className="font-mono text-xs text-sage mb-4">{t('home.exampleSure')}</p>
          <div className="vein-divider mb-4" />
          <p className="text-sm text-ink/70 leading-relaxed">
            <Trans i18nKey="home.exampleAdvice" components={{ b: <span className="text-clay font-medium" /> }} />
          </p>
        </div>
      </div>

      {/* How it works — only a sequence because it genuinely is one */}
      <div className="vein-divider mb-12" />
      <div className="grid sm:grid-cols-3 gap-8 pb-24">
        {[
          { step: t('home.step1'), desc: t('home.step1Desc') },
          { step: t('home.step2'), desc: t('home.step2Desc') },
          { step: t('home.step3'), desc: t('home.step3Desc') }
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