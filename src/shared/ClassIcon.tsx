import type { ReactNode } from 'react';
import { norm } from '../engine/util';

/** Color e icono de cada clase, para reconocer de un vistazo a cada personaje en las tarjetas del grupo. */
interface ClassLook { color: string; icon: ReactNode }

const LOOKS: Record<string, ClassLook> = {
  barbaro: { color: '#d0553a', icon: <><path d="M5 20L14 9" /><path d="M12 6c2-3 6-3 8-2 0 3-1 6-4 8l-4-6z" /></> },
  bardo: { color: '#c86fb0', icon: <><path d="M9 18V6l10-2v12" /><circle cx="7" cy="18" r="2.2" /><circle cx="17" cy="16" r="2.2" /></> },
  clerigo: { color: '#e0d6b0', icon: <><circle cx="12" cy="12" r="3.5" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></> },
  druida: { color: '#6aa152', icon: <><path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15" /><path d="M5 19l9-9" /></> },
  guerrero: { color: '#9aa7b4', icon: <path d="M5 5l9 9M19 5l-9 9M4 20l4-4M20 20l-4-4M14 14l2 2M10 14l-2 2" /> },
  monje: { color: '#3fa6a0', icon: <><path d="M12 4c2 3 2 6 0 9-2-3-2-6 0-9z" /><path d="M12 13c-3 0-6-1-8-4 3-1 6 0 8 4zM12 13c3 0 6-1 8-4-3-1-6 0-8 4z" /><path d="M5 19h14" /></> },
  paladin: { color: '#e8c062', icon: <path d="M12 3v15M7 8h10M10 18h4M12 18v3" /> },
  explorador: { color: '#8a9a4a', icon: <path d="M5 19L19 5M19 5h-5M19 5v5M5 19l3-1M5 19l1-3" /> },
  picaro: { color: '#8e7bb8', icon: <><path d="M12 3l3 9-3 3-3-3z" /><path d="M12 15v6M9 15h6" /></> },
  hechicero: { color: '#e0793a', icon: <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" /> },
  brujo: { color: '#8a5ac2', icon: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></> },
  mago: { color: '#5a86a8', icon: <path d="M12 3l2.5 6 6.5.5-5 4 1.8 6.5L12 16.5 6.2 20l1.8-6.5-5-4 6.5-.5z" /> },
};
const ALIAS: Record<string, string> = {
  barbarian: 'barbaro', bard: 'bardo', cleric: 'clerigo', druid: 'druida', fighter: 'guerrero', monk: 'monje', paladin: 'paladin',
  ranger: 'explorador', guardabosques: 'explorador', rogue: 'picaro', sorcerer: 'hechicero', hechicera: 'hechicero', warlock: 'brujo', wizard: 'mago',
};
const FALLBACK: ClassLook = { color: '#d4a94f', icon: <circle cx="12" cy="12" r="8" /> };

/** La primera clase que aparece en el texto («Paladín 3 / Brujo 5» → paladín); sin clase conocida, el aspecto dorado de siempre. */
export function classLook(cls: string): ClassLook {
  const word = norm(cls).match(/[a-z]+/)?.[0] || '';
  return LOOKS[ALIAS[word] || word] || FALLBACK;
}

export function ClassIcon({ cls, size = 16 }: { cls: string; size?: number }) {
  const { color, icon } = classLook(cls);
  return (
    <svg className="class-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>
  );
}

/** Escudo con la clase de armadura dentro, con el filo del color de la clase. */
export function Shield({ ac, cls, size = 44 }: { ac: string; cls: string; size?: number }) {
  const { color } = classLook(cls);
  const txt = ac || '—';
  return (
    <svg className="ac-shield" width={size} height={Math.round(size * 1.14)} viewBox="0 0 40 46" role="img" aria-label={'Clase de armadura ' + txt}>
      <path d="M20 2 L37 8 V22 C37 33 30 41 20 45 C10 41 3 33 3 22 V8 Z" fill="#26211d" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      <text x="20" y={txt.length > 2 ? 27 : 28} textAnchor="middle" fontSize={txt.length > 2 ? 12 : 17} fontWeight="700" fill="#f3d48a" fontFamily="'IM Fell English SC',Georgia,serif">{txt}</text>
    </svg>
  );
}
