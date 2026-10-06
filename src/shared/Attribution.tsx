/** Atribución del SRD 5.2.1 y de la traducción (obligatoria por la licencia CC-BY-4.0). */
export default function Attribution({ hotkeys = false }: { hotkeys?: boolean }) {
  return (
    <footer className="app-footer">
      <span lang="en">This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at <a href="https://www.dndbeyond.com/srd" target="_blank" rel="noopener noreferrer">https://www.dndbeyond.com/srd</a>. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noopener noreferrer">https://creativecommons.org/licenses/by/4.0/legalcode</a>.</span>
      <span>Traducción al español basada en <a href="https://github.com/foundryvtt-sinregistrar/translate-dnd5e-sdr2-es" target="_blank" rel="noopener noreferrer">translate-dnd5e-sdr2-es</a> de foundryvtt-sinregistrar (CC-BY-4.0), adaptada, corregida y completada para esta app. Aplicación no oficial, sin afiliación ni respaldo de Wizards of the Coast.</span>
      {hotkeys && <span>Pulsa <span className="kbd">?</span> para ver los atajos de teclado.</span>}
    </footer>
  );
}
