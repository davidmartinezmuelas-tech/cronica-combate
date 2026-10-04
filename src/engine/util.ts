export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

/** Normaliza para búsquedas: minúsculas y sin tildes. */
export const norm = (s: string | null | undefined) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export const nfmt = (n: number) => Number(n || 0).toLocaleString('es-ES');

export const crNum = (cr: string) => {
  const s = String(cr);
  if (s.includes('/')) {
    const [a, b] = s.split('/');
    return Number(a) / Number(b);
  }
  return Number(s) || 0;
};

/** Bonificador por competencia según el VD. */
export const pbOf = (cr: string) => {
  const s = String(cr);
  if (s.includes('/')) return 2;
  const n = parseInt(s, 10) || 0;
  return n >= 29 ? 9 : n >= 25 ? 8 : n >= 21 ? 7 : n >= 17 ? 6 : n >= 13 ? 5 : n >= 9 ? 4 : n >= 5 ? 3 : 2;
};

export const num = (v: unknown, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
