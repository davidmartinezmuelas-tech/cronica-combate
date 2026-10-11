import { create } from 'zustand';

/** Pestañas de la hoja en el móvil: cada una muestra solo su parte (así no hay que bajar por toda la hoja). */
export type MTab = 'combate' | 'tiradas' | 'conjuros' | 'rasgos' | 'sala';

const PHONE = '(max-width: 719px)';
const isPhone = () => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE).matches;

interface MobileTabs {
  phone: boolean; // pantalla de móvil (se actualiza al girar)
  tab: MTab;
  sheet: boolean; // hay una hoja a la vista (no el editor ni la lista vacía)
  spells: boolean; // el personaje lanza conjuros (si no, sin pestaña de conjuros)
  setTab: (t: MTab) => void;
}

export const useMobileTabs = create<MobileTabs>()((set) => ({
  phone: isPhone(),
  tab: 'combate',
  sheet: false,
  spells: false,
  setTab: (tab) => { set({ tab }); window.scrollTo({ top: 0 }); },
}));

if (typeof window !== 'undefined' && window.matchMedia) {
  const mq = window.matchMedia(PHONE);
  mq.addEventListener?.('change', () => useMobileTabs.setState({ phone: mq.matches }));
}
