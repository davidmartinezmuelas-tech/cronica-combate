import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { initPrefs } from './shared/prefs';
import './fonts/fonts.css';
import './styles.css';

registerSW({ immediate: true });
initPrefs();

// estadísticas de visitas (Cloudflare Web Analytics: sin cookies ni seguimiento entre webs), solo en la web publicada
if (location.hostname === 'cronicadecombate.com') {
  const s = document.createElement('script');
  s.defer = true;
  s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  s.dataset.cfBeacon = JSON.stringify({ token: 'e907fc737db54b058cab93a84c097b2d' });
  document.head.appendChild(s);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
