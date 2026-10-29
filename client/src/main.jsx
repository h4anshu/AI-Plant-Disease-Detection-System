import { BrowserRouter } from "react-router-dom";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./i18n";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";

// Browser error reports, only when a DSN is configured (docs/MONITORING.md). Loaded as a separate
// chunk, so with no DSN the SDK is never downloaded. No IPs or cookies (sendDefaultPii: false).
if (import.meta.env.VITE_SENTRY_DSN) {
  import("@sentry/react").then((Sentry) =>
    Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN, sendDefaultPii: false, tracesSampleRate: 0 }));
}

// Offline: the service worker keeps the app's own files so it opens with no signal (docs/OFFLINE.md). Not in development, where it would
// serve stale files.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>,
);
