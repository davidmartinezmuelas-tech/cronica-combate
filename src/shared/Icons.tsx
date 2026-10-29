const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export const ChevronLeft = () => (<svg width="18" height="18" viewBox="0 0 24 24" {...base}><path d="M15 18l-6-6 6-6" /></svg>);
export const ChevronRight = () => (<svg width="18" height="18" viewBox="0 0 24 24" {...base}><path d="M9 18l6-6-6-6" /></svg>);
export const ChevronUp = () => (<svg width="16" height="16" viewBox="0 0 24 24" {...base}><path d="M18 15l-6-6-6 6" /></svg>);
export const UndoIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" {...base}><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>);
export const D20Icon = ({ size = 16 }: { size?: number }) => (<svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2}><path d="M12 2 21 7v10l-9 5-9-5V7Z" /><path d="M12 2 7 10h10Z" /></svg>);
export const Logo = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="#d4a94f" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 3 35 11.5v17L20 37 5 28.5v-17Z" /><path d="M20 3 12 16h16Z" />
    <path d="M12 16 5 28.5M28 16l7 12.5M12 16l8 13 8-13M20 29v8M5 28.5 20 29l15-.5M5 11.5 12 16M35 11.5 28 16" />
  </svg>
);

// iconos de las secciones del máster
const sec = { width: 20, height: 20, viewBox: '0 0 24 24', ...base };
export const ScrollIcon = () => (<svg {...sec}><path d="M6 3h9l4 4v14H6Z" /><path d="M14 3v5h5" /><path d="M9 12h7M9 16h7" /></svg>);
export const SwordsIcon = () => (<svg {...sec}><path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="M13 19l6-6M16 16l4 4M19 21l2-2" /><path d="M14.5 6.5 18 3h3v3l-3.5 3.5" /><path d="M5 14l4 4M7 17l-3 3M3 19l2 2" /></svg>);
export const SkullIcon = () => (<svg {...sec}><path d="M9 12h.01M15 12h.01" /><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5" /><path d="M19 12c0 3-1 4-2 5v3H7v-3c-1-1-2-2-2-5a7 7 0 0 1 14 0Z" /></svg>);
export const PartyIcon = () => (<svg {...sec}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>);
export const HammerIcon = () => (<svg {...sec}><path d="m15 12-8.5 8.5a2.12 2.12 0 0 1-3-3L12 9" /><path d="M17.64 15 22 10.64" /><path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91" /></svg>);
export const BookIcon = () => (<svg {...sec}><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>);
