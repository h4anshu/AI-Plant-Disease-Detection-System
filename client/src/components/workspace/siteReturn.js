import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// "Back to the site": the workspace's back button returns to the public page the visitor came from (the landing page, the map)
// at the scroll position they left it. The public layout keeps {path, y} in sessionStorage; the workspace only reads it.
const KEY = 'siteReturn';
export const readReturn = () => {
  try { return JSON.parse(sessionStorage.getItem(KEY)) || null; } catch { return null; }
};

export const useSiteReturn = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    const saved = readReturn();
    // retry for ~1 s: right after the page mounts it may not be tall enough yet (images, fonts)
    let tries = 0;
    const restore = saved?.path === pathname && saved.y > 0 ? setInterval(() => {
      window.scrollTo(0, saved.y);
      if (Math.abs(window.scrollY - saved.y) < 4 || ++tries > 20) clearInterval(restore);
    }, 50) : 0;
    let frame = 0;
    const remember = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { try { sessionStorage.setItem(KEY, JSON.stringify({ path: pathname, y: Math.round(window.scrollY) })); } catch { /* private mode: back goes to "/" */ } });
    };
    // the first entry (no scroll yet) still records the page, so "back" knows where to go
    if (!saved || saved.path !== pathname) remember();
    window.addEventListener('scroll', remember, { passive: true });
    return () => { clearInterval(restore); window.removeEventListener('scroll', remember); cancelAnimationFrame(frame); };
  }, [pathname]);
};
