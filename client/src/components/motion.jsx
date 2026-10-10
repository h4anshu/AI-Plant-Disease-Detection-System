import { useLayoutEffect, useRef } from 'react';

// Scroll motion for the landing page. Markup opts in with data-rv="up|left|right|zoom|fade|t" (+ style --d for a delay);
// the transitions live in index.css ("Motion"), which only hides anything when the visitor has not asked for reduced motion.
const calm = () => !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window);

// Call once from the page: adds .in to each [data-rv] when it scrolls into view
export const useReveal = () => {
  useLayoutEffect(() => {
    if (!('IntersectionObserver' in window)) return undefined;
    const root = document.documentElement;
    root.classList.add('rv-js');   // content is only hidden once this script is running, so a failed script never leaves a blank page
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
      { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll('[data-rv]').forEach((el) => io.observe(el));
    return () => { io.disconnect(); root.classList.remove('rv-js'); };
  }, []);
};

// A number that counts up from 0 when it scrolls into view. The final text is always what is in the DOM at rest (tests, reduced motion, no JS observer).
export const CountUp = ({ to, dec = 0, prefix = '', suffix = '', delay = 0, ms = 1300 }) => {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const fmt = (v) => `${prefix}${v.toFixed(dec)}${suffix}`;
    el.textContent = fmt(to);
    if (calm()) return undefined;
    el.textContent = fmt(0);
    let raf;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now() + delay * 1000;
      const tick = (now) => {
        const p = Math.min(1, Math.max(0, (now - t0) / ms));
        el.textContent = fmt(to * (1 - (1 - p) ** 3));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); el.textContent = fmt(to); };
  }, [to, dec, prefix, suffix, delay, ms]);
  return <span ref={ref} />;
};

// style helper: reveal delay in seconds
export const d = (s) => ({ '--d': `${s}s` });
