import { useEffect, useState } from 'react';
import Legal, { feedbackHref, LEGAL_HASH } from './Legal';

/** Pie: enlace para apoyar el proyecto y atribución del SRD 5.2.1 y de la traducción (obligatoria por la licencia CC-BY-4.0). */
export default function Attribution({ hotkeys = false }: { hotkeys?: boolean }) {
  // privacidad y aviso legal: en una ventana (también al entrar con la dirección #/privacidad)
  const [legal, setLegal] = useState(() => location.hash === LEGAL_HASH);
  useEffect(() => {
    const on = () => { if (location.hash === LEGAL_HASH) setLegal(true); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const close = () => { setLegal(false); if (location.hash === LEGAL_HASH) history.replaceState(null, '', location.pathname + location.search); };
  return (
    <footer className="app-footer">
      {/* donación voluntaria: no desbloquea nada (la app es gratis y completa) */}
      <span className="footer-links">
        <a className="support-link" href="https://ko-fi.com/zmuelas" target="_blank" rel="noopener noreferrer">¿Quieres echar una mano? Tira iniciativa en Ko-fi</a>
        <a href={feedbackHref()} onClick={(e) => { e.currentTarget.href = feedbackHref(); }}>Enviar sugerencia o fallo</a>
        <button type="button" className="linkbtn" onClick={() => setLegal(true)}>Privacidad y aviso legal</button>
      </span>
      <span lang="en">This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at <a href="https://www.dndbeyond.com/srd" target="_blank" rel="noopener noreferrer">https://www.dndbeyond.com/srd</a>. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noopener noreferrer">https://creativecommons.org/licenses/by/4.0/legalcode</a>.</span>
      <span>Traducción al español basada en <a href="https://github.com/foundryvtt-sinregistrar/translate-dnd5e-sdr2-es" target="_blank" rel="noopener noreferrer">translate-dnd5e-sdr2-es</a> de foundryvtt-sinregistrar (CC-BY-4.0), adaptada, corregida y completada para esta app. Aplicación no oficial, sin afiliación ni respaldo de Wizards of the Coast.</span>
      {legal && <Legal onClose={close} />}
      {hotkeys && <span>Pulsa <span className="kbd">?</span> para ver los atajos de teclado.</span>}
    </footer>
  );
}
