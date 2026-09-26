import React, { lazy, Suspense, useContext } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthContext } from "./context/AuthContext";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Predict from "./pages/Predict";
import History from "./pages/History";
import Privacy from "./pages/Privacy";

// Leaflet and the map code load only when someone opens the map
const MapPage = lazy(() => import("./pages/MapPage"));

const AuthDisabled = () => {
  const { t } = useTranslation();
  return (
    <div className="max-w-sm mx-auto px-6 pt-20 text-center">
      <span className="font-mono text-xs text-clay uppercase tracking-widest">{t('authDisabled.eyebrow')}</span>
      <h2 className="font-display text-3xl text-ink mt-2">{t('authDisabled.title')}</h2>
      <p className="font-mono text-xs text-sage mt-4">{t('authDisabled.body')}</p>
    </div>
  );
};

// ponytail: login temporarily disabled, so routes below are open to everyone for now.
// Restore the commented body once login is back on.
const ProtectedRoute = ({ children }) => {
  return children;
  // const { isAuthenticated, loading } = useContext(AuthContext);
  // if (loading) return <div>Loading...</div>;
  // return isAuthenticated ? children : <Navigate to="/login" />;
};

const App = () => {
  const { t } = useTranslation();
  return (
    <>
      {/* TODO(auth): remove when login returns */}
      <div className="bg-wheat/20 border-b border-wheat/40 px-6 py-2 text-center font-mono text-[11px] text-ink/70">
        {t('banner')}
      </div>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        {/* ponytail: email/password auth temporarily disabled, restore the two lines below to re-enable */}
        <Route path="/login" element={<AuthDisabled />} />
        <Route path="/register" element={<AuthDisabled />} />
        {/* <Route path="/login" element={<Login />} /> */}
        {/* <Route path="/register" element={<Register />} /> */}

        <Route
          path="/predict"
          element={
            <ProtectedRoute>
              <Predict />
            </ProtectedRoute>
          }
        />

        <Route path="/map" element={<Suspense fallback={null}><MapPage /></Suspense>} />
        <Route path="/privacy" element={<Privacy />} />

        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          }
        />
      </Routes>

    </>
  );
};

export default App;
