import { lazy, Suspense } from "react";
import { Routes, Route, Outlet, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import DemoBanner from "./components/DemoBanner";
import WorkspaceLayout from "./components/workspace/WorkspaceLayout";
import { useSiteReturn } from "./components/workspace/siteReturn";
import Home from "./pages/Home";
import Predict from "./pages/Predict";
import Overview from "./pages/Overview";
import FieldNew from "./pages/FieldNew";
import History from "./pages/History";
import Checkup from "./pages/Checkup";
import Profile from "./pages/Profile";
import Privacy from "./pages/Privacy";
import Auth from "./pages/Auth";

// Leaflet and the map code load only when someone opens the map
const MapPage = lazy(() => import("./pages/MapPage"));

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

// Signing in is optional (docs/AUTH.md): every route is open to guests, whose records stay in their browser; an account's follow it.
const App = () => (
  <Routes>
    <Route element={<SiteLayout />}>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Auth mode="login" />} />
      <Route path="/register" element={<Auth mode="register" />} />
      <Route path="/map" element={<Suspense fallback={null}><MapPage /></Suspense>} />
      <Route path="/privacy" element={<Privacy />} />
    </Route>

    {/* the workspace: left menu on desktop, bottom tab bar on phones */}
    <Route element={<WorkspaceLayout />}>
      <Route path="/overview" element={<Overview />} />
      <Route path="/fields/new" element={<FieldNew />} />
      <Route path="/predict" element={<Predict />} />
      <Route path="/history" element={<History />} />
      <Route path="/checkup/:id" element={<Checkup />} />
      <Route path="/me" element={<Profile />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default App;
