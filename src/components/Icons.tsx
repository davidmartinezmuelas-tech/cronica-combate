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
