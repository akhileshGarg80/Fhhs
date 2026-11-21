import 'leaflet/dist/leaflet.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (import.meta.env.PROD) {
  registerSW({ immediate: true });
} else if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  Promise.all([
    navigator.serviceWorker.getRegistrations().then((regs) =>
      Promise.all(regs.map((reg) => reg.unregister().catch(() => false)))
    ),
    'caches' in window
      ? caches.keys().then((keys) =>
          Promise.all(
            keys
              .filter((k) => k.includes('tile') || k.includes('workbox'))
              .map((k) => caches.delete(k).catch(() => false))
          )
        )
      : Promise.resolve([]),
  ]).then(([results]) => {
    const unregisteredAny = Array.isArray(results) && results.some(Boolean);
    if ((hadController || unregisteredAny) && !sessionStorage.getItem('gp_sw_reset')) {
      sessionStorage.setItem('gp_sw_reset', '1');
      window.location.reload();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
