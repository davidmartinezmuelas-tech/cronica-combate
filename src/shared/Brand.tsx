import { HOME_HASH } from '../app/mode';
import { Logo } from './Icons';

/** Logo y título; pulsarlo vuelve a la pantalla de elegir modo (máster o jugador). */
export default function Brand({ subtitle }: { subtitle: string }) {
  return (
    <a className="brand" href={HOME_HASH} title="Cambiar de modo (máster o jugador)">
      <Logo />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="display brand-title">Crónica de Combate</span>
        <span className="brand-sub">{subtitle}</span>
      </span>
    </a>
  );
}
