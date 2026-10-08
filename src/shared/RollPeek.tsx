import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';

/**
 * Móvil y tablet: la mesa de dados queda al final de la página, lejos de donde se tira. Tras cada tirada sale abajo una
 * barra con el resultado; pulsarla lleva a la mesa (daño a objetivos, efectos). Se oculta sola. En escritorio no se ve.
 */
export default function RollPeek() {
  const result = useStore((s) => s.result);
  const rolling = useStore((s) => s.rolling);
  const [shown, setShown] = useState<typeof result>(null);
  useEffect(() => {
    if (!result || rolling) return;
    setShown(result);
    const t = setTimeout(() => setShown(null), result.effect || (result.isDmg && result.parts.length) ? 9000 : 5000);
    return () => clearTimeout(t);
  }, [result, rolling]);
  if (!shown) return null;
  const go = () => {
    document.querySelector('section.col-right')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setShown(null);
  };
  return (
    <button className={'roll-peek ' + shown.cls} onClick={go} aria-label={'Tirada: ' + shown.label + ', ' + shown.total + '. Ir a la mesa de dados'}>
      <span className="roll-peek-total">{shown.total}</span>
      <span className="roll-peek-txt">
        <b>{shown.label}</b>
        <span>{shown.note || shown.detail}</span>
      </span>
      <span className="roll-peek-go" aria-hidden="true">Mesa ↓</span>
    </button>
  );
}
