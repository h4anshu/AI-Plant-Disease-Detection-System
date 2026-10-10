import { lazy, Suspense } from "react";
import { Routes, Route, Outlet, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Navbar from "./components/Navbar";
import DemoBanner from "./components/DemoBanner";
import WorkspaceLayout from "./components/workspace/WorkspaceLayout";
import { useSiteReturn } from "./components/workspace/siteReturn";
import Home from "./pages/Home";
import Predict from "./pages/Predict";
import Overview from "./pages/Overview";
import History from "./pages/History";
import Checkup from "./pages/Checkup";
import Profile from "./pages/Profile";
import Privacy from "./pages/Privacy";

// Leaflet and the map code load only when someone opens the map
const MapPage = lazy(() => import("./pages/MapPage"));

const AuthDisabled = () => {
  const { t } = useTranslation();
  return (
    <div className="max-w-sm mx-auto px-6 pt-20 text-center">
      <span className="font-mono text-xs text-clay uppercase tracking-widest">{t('authDisabled.eyebrow')}</span>
      <h2 className="font-display text-3xl text-ink mt-2">{t('authDisabled.title')}</h2>
      <p className="font-mono text-xs text-ink-2 mt-4">{t('authDisabled.body')}</p>
    </div>
  );
};

// The landing page and the public pages: the top navbar
const SiteLayout = () => {
  useSiteReturn();   // remembers the page and scroll position, for the workspace's "back to the site" button
  return (
    <>
      <DemoBanner />
      <Navbar />
      <Outlet />
    </>
  );
};

// ponytail: login (and its pages) are switched off, so every route is open to everyone for now.
// To bring login back: restore the Login / Register routes and guard the WorkspaceLayout routes with AuthContext.
const App = () => (
  <Routes>
    <Route element={<SiteLayout />}>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<AuthDisabled />} />
      <Route path="/register" element={<AuthDisabled />} />
      <Route path="/map" element={<Suspense fallback={null}><MapPage /></Suspense>} />
      <Route path="/privacy" element={<Privacy />} />
    </Route>

    {/* the workspace: left menu on desktop, bottom tab bar on phones */}
    <Route element={<WorkspaceLayout />}>
      <Route path="/overview" element={<Overview />} />
      <Route path="/predict" element={<Predict />} />
      <Route path="/history" element={<History />} />
      <Route path="/checkup/:id" element={<Checkup />} />
      <Route path="/me" element={<Profile />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default App;
