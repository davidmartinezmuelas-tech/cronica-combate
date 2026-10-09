import type { RosterEntry } from '../../data/types';
import { uid } from '../../engine/util';
import { blankRoster, buildExport, mergeImport } from '../persist';
import { base64ToBlob, blobToBase64, getPdf, looksLikePdf, MAX_PDF_BYTES, putPdf } from '../pdfs';
import { savedSlice } from '../saved';
import type { GetState, GroupSlice, SetState } from '../state';

export function createGroupSlice(set: SetState, get: GetState): GroupSlice {
  return {
    roster: [], pcForm: blankRoster(), editingPcId: null, pcMsg: '', ioMsg: '',

    savePc() {
      const p = get().pcForm;
      if (!p.name.trim()) { set({ pcMsg: 'Ponle nombre al personaje.' }); return; }
      const rec: RosterEntry = { ...p, name: p.name.trim(), id: get().editingPcId || 'r-' + uid() };
      get().snap('guardar ' + rec.name);
      const s = get();
      set({ roster: s.editingPcId ? s.roster.map((x) => (x.id === rec.id ? rec : x)) : s.roster.concat([rec]), pcForm: blankRoster(), editingPcId: null, pcMsg: '' });
      get().showToast(rec.name + ' guardado en tu grupo');
    },
    deletePc(id) {
      const r = get().roster.find((x) => x.id === id);
      if (!r) return;
      get().confirm('pc-' + id, () => { get().snap('quitar ' + r.name); set({ roster: get().roster.filter((x) => x.id !== id) }); });
    },

    updatePc(id, patch, label) {
      get().snap(label || 'editar jugador');
      set({ roster: get().roster.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
    },

    async attachPdf(id, file) {
      if (file.size > MAX_PDF_BYTES) return 'El PDF pesa más de 30 MB.';
      if (!(await looksLikePdf(file))) return 'Ese archivo no es un PDF.';
      const pdfId = 'pdf-' + uid();
      try { await putPdf(pdfId, file); } catch { return 'No se pudo guardar el PDF en este navegador.'; }
      get().updatePc(id, { pdf: { id: pdfId, name: file.name || 'hoja.pdf', size: file.size } }, 'hoja de personaje');
      return '';
    },

    removePdf(id) {
      // el archivo se borra al abrir la app si nadie lo usa (así «Deshacer» puede recuperarlo)
      get().updatePc(id, { pdf: null }, 'quitar hoja de personaje');
    },

    async exportData(opts) {
      const s = savedSlice(get());
      const pdfs: Record<string, string> = {};
      for (const r of s.roster) {
        if (!r.pdf) continue;
        const b = await getPdf(r.pdf.id);
        if (b) pdfs[r.pdf.id] = await blobToBase64(b);
      }
      return JSON.stringify(buildExport(s, pdfs, opts?.book ? get().book : undefined), null, 1);
    },
    async importText(text) {
      const r = mergeImport(text, { ...savedSlice(get()), book: get().book });
      if (!r.ok) { set({ ioMsg: r.message }); return; }
      let saved = 0;
      for (const [pid, data] of Object.entries(r.pdfs || {})) {
        try { await putPdf(pid, base64ToBlob(data)); saved++; } catch { /* sin espacio: el jugador queda sin hoja */ }
      }
      get().snap('importar');
      // las criaturas del Manual van a su almacén del dispositivo (no a las criaturas propias ni a la cuenta)
      if (r.book) get().setBook(r.book);
      set({ roster: r.roster!, custom: r.custom!, encounters: r.encounters!, ...(r.combat || {}), ioMsg: r.message + (saved ? ' Con ' + saved + (saved === 1 ? ' hoja' : ' hojas') + ' de personaje.' : '') });
    },
  };
}
