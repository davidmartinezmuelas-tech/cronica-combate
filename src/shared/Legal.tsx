import { InfoDialog } from './Card';

/** Contacto del responsable (privacidad, aviso legal y sugerencias). */
export const CONTACT = 'hola@cronicadecombate.com';
export const LEGAL_HASH = '#/privacidad';

/** Correo de sugerencias con lo que ayuda a reproducir un fallo (dónde estaba y con qué navegador). */
export function feedbackHref() {
  const body = '\n\n---\nPantalla: ' + location.hash + '\nNavegador: ' + navigator.userAgent;
  return 'mailto:' + CONTACT + '?subject=' + encodeURIComponent('Crónica de Combate: sugerencia o fallo') + '&body=' + encodeURIComponent(body);
}

/** Política de privacidad y aviso legal (RGPD y LSSI), en una ventana. También se abre con la dirección #/privacidad. */
export default function Legal({ onClose }: { onClose: () => void }) {
  return (
    <InfoDialog title="Privacidad y aviso legal" onClose={onClose}>
      <div className="legal">
        <h3>Quién es el responsable</h3>
        <p>Crónica de Combate es una aplicación gratuita creada por David Martínez Muelas, como particular. Para cualquier consulta sobre tus datos o esta página: <a href={'mailto:' + CONTACT}>{CONTACT}</a>.</p>

        <h3>Sin cuenta: todo se queda en tu dispositivo</h3>
        <p>La app funciona sin registrarte. Tus personajes, tu grupo, tus criaturas, encuentros, el combate, tu biblioteca y los PDF que importes se guardan en el almacenamiento de tu navegador y no nos llegan. Puedes borrarlos desde la app o borrando los datos del sitio en tu navegador. Ese almacenamiento es necesario para que la app funcione, así que no requiere consentimiento.</p>

        <h3>Con cuenta (opcional)</h3>
        <p>Si inicias sesión con Google o con tu correo, se guardan en Firebase (Google) tu correo, tu nombre de Google si entras con él y un identificador, junto con tus personajes y, como máster, tus criaturas, encuentros y grupo, para tenerlos en tus otros dispositivos. Las hojas en PDF, la biblioteca y lo importado de tus libros nunca se suben. La base legal es tu consentimiento al crear la cuenta y la prestación del servicio que pides. Se conservan hasta que borres la cuenta.</p>

        <h3>Salas</h3>
        <p>Si creas o entras en una sala, se comparten con los demás participantes el nombre de tu personaje, tus PG y las tiradas que hagas en ella. Para entrar sin cuenta se usa un acceso de invitado anónimo. Al cerrar la sala, su contenido se borra.</p>

        <h3>Quién más interviene</h3>
        <ul>
          <li>Google (Firebase): cuentas y datos en la nube. Puede tratar datos fuera de la UE con las garantías que exige el RGPD.</li>
          <li>GitHub: aloja la web y, como cualquier servidor, registra la dirección IP de las visitas por seguridad.</li>
          <li>Cloudflare: gestiona el dominio y reenvía el correo de contacto.</li>
          <li>Ko-fi: si decides apoyar el proyecto, el pago se hace en su web, con su propia política de privacidad.</li>
        </ul>
        <p>No hay publicidad, ni analítica, ni cookies de seguimiento.</p>

        <h3>Tus derechos</h3>
        <p>Puedes acceder a tus datos, rectificarlos, llevártelos (con las copias de seguridad de la app) o borrarlos. Para borrar la cuenta y todo lo suyo en la nube, usa «Borrar mi cuenta» en el apartado de la cuenta. Para lo demás, escribe a <a href={'mailto:' + CONTACT}>{CONTACT}</a>. Si crees que no se han respetado tus derechos, puedes reclamar ante la Agencia Española de Protección de Datos (<a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">aepd.es</a>). Para crear una cuenta debes tener al menos 14 años o el permiso de tus padres o tutores.</p>

        <h3>Aviso legal y contenido</h3>
        <p>Titular: David Martínez Muelas · <a href={'mailto:' + CONTACT}>{CONTACT}</a> · cronicadecombate.com. La app es gratuita; las donaciones son voluntarias y no desbloquean nada.</p>
        <p>Las reglas, criaturas y conjuros proceden del System Reference Document 5.2.1 de Wizards of the Coast LLC, bajo licencia Creative Commons Attribution 4.0 (ver la atribución al pie). Es una aplicación no oficial, sin afiliación ni respaldo de Wizards of the Coast. Lo que importes de tus propios libros es responsabilidad tuya y se queda en tu dispositivo.</p>
        <p className="muted small">Última actualización: octubre de 2026.</p>
      </div>
    </InfoDialog>
  );
}
