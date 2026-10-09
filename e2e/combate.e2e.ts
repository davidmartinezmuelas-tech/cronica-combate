import { expect, test, type Page } from '@playwright/test';

/**
 * Abre la app y espera a que cargue. Cada test tiene ya un navegador limpio (Playwright aísla el
 * almacenamiento por test); borrar la base de datos aquí dejaba el borrado pendiente mientras la app
 * la tenía abierta y podía ejecutarse más tarde, tras una recarga, llevándose lo guardado.
 */
async function open(page: Page) {
  await page.goto('/#/dm');
  await expect(page.getByText('Prepara el encuentro')).toBeVisible();
}

async function addMonsters(page: Page, search: string, name: string, qty: number) {
  await page.getByRole('button', { name: 'Bestiario', exact: true }).click();
  await page.getByLabel('Buscar (español o inglés)').fill(search);
  const card = page.locator('li.beast').filter({ has: page.locator('.beast-name', { hasText: new RegExp('^' + name) }) }).first();
  for (let i = 1; i < qty; i++) await card.getByRole('button', { name: 'Uno más de ' + name }).click();
  await card.getByRole('button', { name: 'Al combate' }).click();
}

async function addPlayer(page: Page, name: string, init: string) {
  await page.getByRole('button', { name: 'Grupo', exact: true }).click();
  await page.getByLabel('Personaje').fill(name);
  await page.getByLabel('Nivel total').fill('5');
  await page.getByLabel('PG máx.').fill('40');
  await page.getByRole('button', { name: 'Guardar jugador' }).click();
  await page.locator('li.beast', { hasText: name }).getByRole('button', { name: 'Al combate' }).click();
  await page.getByRole('button', { name: 'Combate', exact: true }).click();
  await page.getByLabel('Iniciativa de ' + name).fill(init);
  await page.getByLabel('Iniciativa de ' + name).press('Enter');
}

const activeName = (page: Page) => page.locator('.init-row.active');

/** Espera a que el guardado automático haya llegado a IndexedDB con el texto indicado (sin pausas fijas). */
async function persisted(page: Page, text: string) {
  await page.waitForFunction((t) => new Promise<boolean>((resolve) => {
    const req = indexedDB.open('cronica-combate');
    req.onerror = () => resolve(false);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('estado')) { db.close(); resolve(false); return; }
      const all = db.transaction('estado').objectStore('estado').getAll();
      all.onsuccess = () => { db.close(); resolve(JSON.stringify(all.result).includes(t)); };
      all.onerror = () => { db.close(); resolve(false); };
    };
  }), text, { timeout: 15000 });
}

test('combate completo: iniciativa, turnos, quitar al activo y guardado tras recargar', async ({ page }) => {
  await open(page);
  await addMonsters(page, 'guerrero goblin', 'Guerrero goblin', 2);
  await page.getByRole('button', { name: 'Combate', exact: true }).click();
  await page.getByRole('button', { name: 'Tirar iniciativa de monstruos' }).click();
  // dos iguales: pregunta si en grupo o individual
  await expect(page.getByRole('dialog', { name: 'Iniciativa de monstruos' })).toContainText('Guerrero goblin ×2');
  await page.getByRole('button', { name: /^En grupo/ }).click();
  await expect(page.getByRole('dialog', { name: 'Iniciativa de monstruos' })).toHaveCount(0);
  await addPlayer(page, 'Jimena', '30');

  await page.getByTitle('Empezar combate (N)').click();
  await expect(activeName(page)).toContainText('Jimena');

  // N pasa al primer goblin
  await page.getByRole('heading', { name: 'Iniciativa' }).click();
  await page.keyboard.press('n');
  await expect(activeName(page)).toContainText('Guerrero goblin 1');

  // quitar al goblin que está en turno: le toca al siguiente, no vuelve a Jimena
  await page.getByRole('button', { name: 'Quitar del combate' }).click();
  await page.getByRole('button', { name: '¿Seguro? Pulsa otra vez' }).click();
  await expect(activeName(page)).toContainText('Guerrero goblin 2');
  await expect(page.getByText('Ronda 1 · inicio de turno')).toBeVisible();

  // el combate sobrevive a una recarga
  await page.waitForTimeout(600);
  await page.reload();
  await expect(activeName(page)).toContainText('Guerrero goblin 2');
  await expect(page.locator('.init-row')).toHaveCount(2);
});

test('herramientas del DM: daño alternativo y encuentros guardados', async ({ page }) => {
  await open(page);
  await addMonsters(page, 'guerrero goblin', 'Guerrero goblin', 3);
  await page.getByRole('button', { name: 'Combate', exact: true }).click();
  await page.locator('.init-row', { hasText: 'Guerrero goblin 1' }).click();

  await page.getByRole('button', { name: /^Daño con ventaja: 1d6 \+ 2 cortante \+ 1d4 cortante/ }).first().click();
  await expect(page.locator('.plaque-label')).toHaveText('Guerrero goblin 1 · Cimitarra: daño con ventaja');

  await page.getByLabel('Guardar los monstruos actuales como').fill('Emboscada');
  await page.getByRole('button', { name: 'Guardar encuentro' }).click();
  await page.getByRole('button', { name: 'Vaciar encuentro' }).click();
  await page.getByRole('button', { name: '¿Seguro? Pulsa otra vez' }).click();
  await expect(page.locator('.init-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cargar' }).click();
  await expect(page.locator('.init-row')).toHaveCount(3);
});

test('funciona sin conexión una vez cargada', async ({ page, context }) => {
  await open(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect(page.getByText('Prepara el encuentro')).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Sin conexión')).toBeVisible();
  await page.getByRole('button', { name: 'Bestiario', exact: true }).click();
  await expect(page.getByText('341 criaturas')).toBeVisible();
  await context.setOffline(false);
});

test('la página no se sale de la pantalla', async ({ page }) => {
  await open(page);
  for (const tab of ['Combate', 'Bestiario', 'Grupo', 'Forja']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, 'desborde horizontal en ' + tab).toBeLessThanOrEqual(0);
  }
});

test('dados 3D: se usan cuando el equipo puede, un toque salta la animación y se pueden cambiar a 2D', async ({ page }) => {
  await open(page);
  const toggle = page.getByLabel(/^Dados 3D/);
  await expect(toggle).toBeChecked();
  await expect(page.locator('canvas.felt-3d')).toBeVisible();
  await page.waitForTimeout(2500); // la escena 3D se carga en segundo plano
  await page.getByRole('button', { name: 'Tirar d20' }).click();
  await page.waitForTimeout(150);
  await page.locator('canvas.felt-3d').click();
  await expect(page.locator('.plaque-in')).toBeVisible({ timeout: 1000 });
  await expect(page.locator('.die-spot')).toHaveCount(0); // en 3D no se pintan los dados 2D
  await page.waitForTimeout(700); // el total sube hasta su valor
  const total = Number(await page.locator('.plaque-total').textContent());
  expect(total).toBeGreaterThanOrEqual(1);
  expect(total).toBeLessThanOrEqual(20);

  await toggle.uncheck();
  await expect(page.locator('canvas.felt-3d')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tirar d20' }).click();
  await expect(page.locator('.die-spot')).toHaveCount(1);
  await page.waitForTimeout(600); // guardado automático
  await page.reload();
  await expect(page.getByLabel(/^Dados 3D/)).not.toBeChecked(); // la preferencia se guarda
});

test('con «reducir movimiento» empiezan los dados 2D, pero se pueden activar los 3D', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await open(page);
  const toggle = page.getByLabel(/^Dados 3D/);
  await expect(page.locator('canvas.felt-3d')).toHaveCount(0);
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toBeChecked();
  await page.getByRole('button', { name: 'Tirar d20' }).click();
  await expect(page.locator('.plaque-in')).toBeVisible();
  await toggle.check();
  await expect(page.locator('canvas.felt-3d')).toBeVisible();
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Tirar d20' }).click();
  await expect(page.locator('.plaque-in')).toBeVisible({ timeout: 4000 });
  await expect(page.locator('.die-spot')).toHaveCount(0);
  await ctx.close();
});

test('reglas: buscar en inglés o español, seguir enlaces y abrir un estado desde el combate', async ({ page }) => {
  await open(page);
  await page.keyboard.press('r');
  // consulta rápida sin escribir
  await page.locator('.rule-quick').getByRole('button', { name: 'Ataques de oportunidad' }).click();
  await expect(page.locator('.rule-view .sb-name')).toHaveText('Ataques de oportunidad');
  const search = page.getByLabel('Buscar (español o inglés)');
  await search.fill('prone');
  await page.locator('.rule-item').first().click();
  await expect(page.locator('.rule-view .sb-name')).toHaveText('Derribado');
  await page.locator('.rule-view .rule-link', { hasText: 'Velocidad' }).first().click();
  await expect(page.locator('.rule-view .sb-name')).toHaveText('Velocidad');
  await page.getByRole('button', { name: '← Atrás' }).click();
  await expect(page.locator('.rule-view .sb-name')).toHaveText('Derribado');
  await search.fill('bola de fuego');
  await page.locator('.rule-item').first().click();
  await expect(page.locator('.rule-view')).toContainText('Conjuro de nivel 3 de evocación');

  // desde el combate: el estado «Apresado» abre su regla (el SRD traducido lo llamaba «Restringido»)
  await addMonsters(page, 'guerrero goblin', 'Guerrero goblin', 1);
  await page.getByRole('button', { name: 'Combate', exact: true }).click();
  await page.locator('.init-row', { hasText: 'Guerrero goblin' }).click();
  await page.locator('.combatant-card summary', { hasText: 'Estados' }).click(); // los estados van en un desplegable
  await page.getByRole('button', { name: 'Apresado', exact: true }).click();
  await expect(page.locator('.combatant-card summary', { hasText: 'Estados' })).toContainText('Apresado');
  await page.getByTitle('Ver la regla completa de Apresado').click();
  await expect(page.locator('.rule-view .sb-name')).toHaveText('Apresado');
});

const MINI_PDF = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<<>>>>endobj\n4 0 obj<</Length 30>>stream\n0.6 0.1 0.1 rg 40 40 120 120 re f\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';

/** PDF inventado con campos rellenables como los de una hoja de personaje (nombre y valor de cada campo). */
function formPdf(fields: Record<string, string>) {
  const names = Object.keys(fields);
  const widgets = names.map((n, i) => `${5 + i} 0 obj<</Type/Annot/Subtype/Widget/FT/Tx/T(${n})/V(${fields[n]})/Rect[10 ${190 - i * 12} 190 ${200 - i * 12}]/P 3 0 R>>endobj\n`);
  const refs = names.map((_, i) => `${5 + i} 0 R`).join(' ');
  return '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R/AcroForm<</Fields[' + refs + ']>>>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Annots[' + refs + ']/Resources<<>>>>endobj\n' + widgets.join('') + 'trailer<</Root 1 0 R>>\n%%EOF\n';
}

test('fichas del grupo: los datos de una hoja rellenable se copian solo tras confirmarlos', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Grupo', exact: true }).click();
  await page.getByLabel('Personaje').fill('Draxx');
  await page.getByLabel('PG máx.').fill('20');
  await page.getByRole('button', { name: 'Guardar jugador' }).click();
  await page.locator('.pc-sheet-head', { hasText: 'Draxx' }).click();
  await page.getByLabel('Notas').fill('Odia a los kobolds');

  const pdf = formPdf({ Name: 'Draxx', Class: 'Paladin', Subclass: 'Oath of Devotion', Species: 'Dragonborn', Level: '3', AC: '18', 'Max HP': '32', INIT: '+2', PERCEPTION: '+1', SPEED: '30', TRAITS: 'You have resistance to acid damage.' });
  await page.getByLabel('Hoja de personaje de Draxx').setInputFiles({ name: 'draxx.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
  const dialog = page.getByRole('dialog', { name: 'Datos de la hoja de personaje' });
  await expect(dialog).toBeVisible({ timeout: 15000 });
  await expect(dialog.getByLabel('Clase en la hoja')).toHaveValue('Paladín 3');
  await expect(dialog.getByLabel('Copiar Nombre')).not.toBeChecked(); // ya coincide
  await dialog.getByLabel('Copiar CA').uncheck();
  await dialog.getByLabel('PG máx. en la hoja').fill('35');
  await dialog.getByRole('button', { name: 'Copiar a la ficha' }).click();
  await expect(dialog).toHaveCount(0);

  const sheet = page.locator('.pc-sheet', { hasText: 'Draxx' });
  await expect(sheet.locator('.pc-sheet-sub')).toContainText('Paladín 3');
  await expect(sheet.locator('.pc-sheet-stats')).toContainText('35');
  await expect(sheet.locator('.pc-sheet-grid')).toContainText('ácido');
  await expect(sheet.locator('.pc-sheet-grid div', { hasText: 'Percepción pasiva' })).toContainText('11');
  await expect(sheet.locator('.pc-sheet-stats span', { hasText: /^CA/ })).toContainText('—');
  await expect(page.getByLabel('Notas')).toHaveValue('Odia a los kobolds\n\nEspecie: Dragonborn · Subclase: Oath of Devotion · Velocidad: 30 pies');

  // se puede volver a leer, y no se cambia nada si se cancela
  await page.getByRole('button', { name: 'Leer datos de la hoja' }).click();
  await expect(dialog.getByLabel('Añadir resistencias')).toBeDisabled();
  await dialog.getByRole('button', { name: 'No copiar nada' }).click();
  await expect(sheet.locator('.pc-sheet-stats')).toContainText('35');
  await page.getByText('Hojas de personaje compatibles').click();
  await expect(page.getByRole('link', { name: /Hoja oficial de 2024/ })).toHaveAttribute('href', /dndbeyond\.com/);
});

test('fichas del grupo: desplegar, notas y hoja de personaje en PDF (también en la copia)', async ({ page }) => {
  // dibuja el PDF tres veces, recarga y descarga la copia: con muchas pruebas a la vez necesita más de 30 s
  test.slow();
  await open(page);
  await page.getByRole('button', { name: 'Grupo', exact: true }).click();
  await page.getByLabel('Personaje').fill('Jimena');
  await page.getByRole('button', { name: 'Guardar jugador' }).click();
  const head = page.locator('.pc-sheet-head', { hasText: 'Jimena' });
  await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('Notas').fill('Busca a su hermana desaparecida');

  // un archivo que no es PDF se rechaza
  await page.getByLabel('Hoja de personaje de Jimena').setInputFiles({ name: 'falso.pdf', mimeType: 'application/pdf', buffer: Buffer.from('hola') });
  await expect(page.getByRole('alert')).toContainText('no es un PDF');
  await page.getByLabel('Hoja de personaje de Jimena').setInputFiles({ name: 'jimena.pdf', mimeType: 'application/pdf', buffer: Buffer.from(MINI_PDF) });
  await expect(page.locator('.pdf-page')).toHaveCount(1, { timeout: 15000 });
  await expect(page.locator('.pc-sheet-name .tag.pdf')).toBeVisible();
  await page.getByRole('button', { name: 'Pantalla completa' }).click();
  await expect(page.locator('.pdf-dialog .pdf-page')).toHaveCount(1, { timeout: 15000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('.pdf-dialog')).toHaveCount(0);

  // sigue ahí tras recargar y va dentro de la copia
  await persisted(page, '"name":"jimena.pdf"');
  await page.reload();
  await page.getByRole('button', { name: 'Grupo', exact: true }).click();
  await page.locator('.pc-sheet-head', { hasText: 'Jimena' }).click();
  await expect(page.getByLabel('Notas')).toHaveValue('Busca a su hermana desaparecida');
  await expect(page.locator('.pdf-page')).toHaveCount(1, { timeout: 15000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar copia' }).click();
  const copy = JSON.parse(await (await (await download).createReadStream()).toArray().then((b) => Buffer.concat(b).toString('utf8')));
  expect(Object.values(copy.pdfs as Record<string, string>)[0].startsWith('JVBERi')).toBe(true);
  expect(copy.roster[0].notes).toBe('Busca a su hermana desaparecida');
});

test('en el móvil, al tocar a alguien de la iniciativa se baja hasta su ficha', async ({ page }) => {
  test.skip(test.info().project.name !== 'escritorio');
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await addMonsters(page, 'ogro', 'Ogro', 1);
  await addMonsters(page, 'goblin', 'Esbirro goblin', 3);
  await page.getByRole('button', { name: 'Combate', exact: true }).click();
  await page.locator('.init-row', { hasText: 'Ogro' }).click();
  await expect(page.locator('.combatant-card')).toBeInViewport();
  await page.getByRole('button', { name: 'Ir a sus acciones' }).click();
  await expect(page.getByRole('button', { name: /Ataque \+6/ }).first()).toBeInViewport();
});

test('daño manual: sin tipo por defecto y aviso si sus defensas cambian la cantidad', async ({ page }) => {
  await open(page);
  await addMonsters(page, 'esqueleto', 'Esqueleto', 1);
  await page.getByRole('button', { name: 'Combate', exact: true }).click();
  await page.locator('.init-row', { hasText: 'Esqueleto' }).first().click();
  await expect(page.getByLabel('Tipo de daño')).toHaveValue('');
  await page.getByLabel('Cantidad').fill('6');
  await expect(page.getByRole('status').filter({ hasText: 'recibirá' })).toHaveCount(0);
  await page.getByLabel('Tipo de daño').selectOption('contundente');
  await expect(page.getByText('Por sus defensas recibirá 12 en vez de 6.')).toBeVisible();
  await page.getByLabel('Tipo de daño').selectOption('veneno');
  await expect(page.getByText('Es inmune: no recibirá daño.')).toBeVisible();
});

test('acciones legendarias: el aviso abre la hoja del monstruo en sus acciones legendarias', async ({ page }) => {
  await open(page);
  await addMonsters(page, 'dragón rojo adulto', 'Dragón rojo adulto', 1);
  await addPlayer(page, 'Jimena', '40');
  await page.getByRole('button', { name: 'Tirar iniciativa de monstruos' }).click();
  await expect(page.locator('.init-row', { hasText: 'Dragón' }).locator('.init-badge')).not.toHaveText('—', { timeout: 15000 });
  await page.getByRole('button', { name: 'Empezar combate' }).first().click();
  await expect(activeName(page)).toContainText('Jimena');
  await page.locator('.banner').getByRole('button', { name: /Dragón rojo adulto · 4\/4/ }).click();
  await expect(page.locator('.combatant-card h2')).toHaveText('Dragón rojo adulto');
  await expect(page.locator('.sheet-col section[aria-label="Acciones legendarias"]')).toBeInViewport();
});

test('forja: avisa del daño mal escrito, pide confirmar al quitar y la criatura llega al combate con su ataque', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Forja', exact: true }).click();
  await page.getByLabel('Nombre', { exact: true }).first().fill('Ogro de prueba');
  const feats = page.locator('.sub').filter({ has: page.getByRole('button', { name: /Quitar/ }) });
  const n = await feats.count();
  await page.getByRole('button', { name: '+ Acción' }).click();
  await page.getByRole('button', { name: '+ Rasgo' }).click();
  await expect(feats).toHaveCount(n + 2);
  // quitar pide una segunda pulsación
  await feats.last().getByRole('button', { name: 'Quitar' }).click();
  await expect(feats).toHaveCount(n + 2);
  await page.getByRole('button', { name: '¿Seguro? Quitar' }).click();
  await expect(feats).toHaveCount(n + 1);
  const act = feats.last();
  await act.getByLabel('Nombre').fill('Garrote');
  await act.getByLabel('Daño', { exact: true }).fill('2d6 + 4 contundente');
  await expect(page.getByText('No se entiende «2d6 + 4 contundente»', { exact: false })).toBeVisible();
  await act.getByLabel('Daño', { exact: true }).fill('2d6+4');
  await expect(page.getByText('No se entiende', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Guardar y al combate' }).click();
  await page.getByRole('button', { name: 'Combate', exact: true }).click();
  await page.locator('.init-row', { hasText: 'Ogro de prueba' }).click();
  await expect(page.locator('.sheet-col').getByRole('button', { name: /^Daño 2d6 \+ 4/ })).toBeVisible();
});

test('generador de encuentro: propone monstruos de la dificultad elegida y los añade', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Grupo', exact: true }).click();
  for (const n of ['Aria', 'Bram', 'Cora']) {
    await page.getByLabel('Personaje').fill(n);
    await page.getByLabel('Nivel total').fill('3');
    await page.getByRole('button', { name: 'Guardar jugador' }).click();
  }
  await page.getByRole('button', { name: 'Combate', exact: true }).click();
  const gen = page.getByRole('region', { name: 'Generador de encuentro' });
  await expect(gen).toContainText('3 PJ (niv. 3, 3, 3)');
  await gen.getByRole('button', { name: 'Alta' }).click();
  await expect(gen).toContainText('entre 1200 y 1500 PX');
  await gen.getByRole('button', { name: 'Proponer' }).click();
  await gen.getByRole('button', { name: 'Añadir al encuentro' }).click();
  await expect(page.locator('.init-row').first()).toBeVisible();
  await page.getByRole('button', { name: 'Añadir todo el grupo' }).click();
  await expect(page.locator('.diff-mini-label')).toHaveText('Alta');
});

test('al entrar se elige modo; se recuerda y se puede cambiar desde el título', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Soy el máster/ })).toBeVisible();
  await page.getByRole('button', { name: /Soy jugador/ }).click();
  await expect(page).toHaveURL(/#\/jugador$/);
  await expect(page.getByRole('heading', { name: 'Mis personajes' })).toBeVisible();
  await page.getByRole('button', { name: 'Tirar d20' }).click();
  await expect(page.locator('.plaque-label')).toContainText('d20', { timeout: 15000 });
  await page.getByRole('button', { name: 'Reglas', exact: true }).click();
  await page.locator('.rule-tile', { hasText: 'Derribado' }).click();
  await expect(page.locator('.rule-view .sb-name')).toHaveText('Derribado');

  // se recuerda al volver a entrar sin dirección
  await page.goto('/');
  await expect(page).toHaveURL(/#\/jugador$/);
  // el título lleva a elegir otra vez
  await page.getByTitle('Cambiar de modo (máster o jugador)').click();
  await page.getByRole('button', { name: /Soy el máster/ }).click();
  await expect(page.getByText('Prepara el encuentro')).toBeVisible();
});

test('modo jugador: crear personaje, tirar desde la hoja y que se guarde', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Brakka');
  await page.getByLabel('Especie', { exact: true }).selectOption({ label: 'Enano' });
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Guerrero' });
  await page.getByLabel('Nivel', { exact: true }).fill('3');
  await page.getByLabel('Trasfondo', { exact: true }).selectOption({ label: 'Soldado' });
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByLabel('Armadura', { exact: true }).selectOption({ label: 'Cota de malla (CA 16)' });
  await page.getByLabel('Escudo (+2 CA)').check();
  await page.getByLabel('Arma para añadir').selectOption({ label: 'Espada larga (1d8 cortante)' });
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();

  // FUE 15 (+2), competencia +2: espada larga +4 y 1d8+2; CA 16 + escudo; PG 10+1+2×(6+1) + 3 (enano) = 28
  const sheet = page.locator('.pc');
  await expect(sheet.getByRole('heading', { name: 'Brakka' })).toBeVisible();
  await expect(sheet).toContainText('Enano · Guerrero 3 (Campeón) · Soldado');
  await expect(sheet.locator('.stat', { hasText: 'CA' }).first()).toContainText('18');
  await expect(sheet.locator('.stat', { hasText: 'PG' }).first()).toContainText('28 / 28');
  await sheet.getByRole('button', { name: 'Ataque +4' }).click();
  await expect(page.locator('.plaque-label')).toContainText('Brakka · Espada larga: ataque', { timeout: 15000 });
  await expect(sheet.getByRole('button', { name: /Daño 1d8\+2 cortante/ })).toBeVisible();
  const traits = sheet.locator('section[aria-label="Rasgos y dotes"]');
  await expect(traits.locator('.card', { hasText: 'Segundo aliento' })).toBeVisible();
  await expect(traits.locator('.card', { hasText: 'Crítico mejorado' })).toBeVisible();

  // PG: daño y curación
  await sheet.getByLabel('Cantidad de PG').fill('7');
  await sheet.getByRole('button', { name: 'Daño', exact: true }).click();
  await expect(sheet.locator('.stat', { hasText: 'PG' }).first()).toContainText('21 / 28');

  // se guarda en el dispositivo
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.locator('.pc').getByRole('heading', { name: 'Brakka' })).toBeVisible();
  await expect(page.locator('.pc .stat', { hasText: 'PG' }).first()).toContainText('21 / 28');
});

test('modo jugador: arma mágica con daño extra, conjuros de su lista, subclase y dote propia', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Korvak');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Paladín' });
  await page.getByLabel('Nivel', { exact: true }).fill('3');
  await expect(page.getByLabel('Subclase (desde el nivel 3)')).toHaveValue('srd');
  await page.getByLabel('Subclase (desde el nivel 3)').selectOption({ label: 'Otra (escríbela)' });
  await page.getByLabel('Nombre de la subclase').fill('Juramento de la Estirpe');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByLabel('Arma para añadir').selectOption({ label: 'Espada larga (1d8 cortante)' });
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Espada flamígera');
  await page.getByRole('button', { name: '+ Daño extra' }).click();
  await page.getByLabel('Conjuro', { exact: false }).first().fill('castigo');
  await page.locator('.ce-spell-results .chip', { hasText: 'Castigo Divino' }).click();
  await page.getByRole('button', { name: '+ Dote o rasgo propio' }).click();
  await page.locator('#cf-n').fill('Protección');
  await page.locator('#cf-c').selectOption({ label: 'Estilo de combate' });
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();

  const sheet = page.locator('.pc');
  await expect(sheet).toContainText('Paladín 3 (Juramento de la Estirpe)');
  // FUE 15 → +2: 1d8+2 cortante + 1d6 fuego
  await expect(sheet.getByRole('button', { name: 'Daño 1d8+2 cortante + 1d6 fuego' })).toBeVisible();
  await expect(sheet.locator('.card', { hasText: 'Castigo Divino' })).toBeVisible();
  await expect(sheet.locator('.card', { hasText: 'Protección' })).toContainText('Estilo de combate');
  // con otra subclase no salen los rasgos de la del SRD
  await expect(sheet.locator('.card', { hasText: 'Juramento de devoción' })).toHaveCount(0);
});

test('biblioteca propia: cargar un archivo y usar sus trasfondos, dotes y conjuros al crear el personaje', async ({ page }) => {
  // biblioteca inventada (misma forma que la que genera el importador del libro)
  const lib = {
    app: 'cronica-combate', tipo: 'biblioteca', v: 1, source: 'Pruebas',
    feats: [{ id: 'lib-dote-vigia', n: 'Vigía nocturno', cat: 'origin', req: '', d: 'Nunca duermes del todo.' }],
    backgrounds: [{ id: 'lib-trasfondo-farero', n: 'Farero', abil: ['con', 'wis', 'cha'], skills: ['prc', 'sur'], tool: '', feat: 'Vigía nocturno', equip: '', d: 'Cuidabas el faro.' }],
    spells: [{ id: 'lib-conjuro-rayo-de-faro', n: 'Rayo de faro', l: 1, esc: 'Evocación', classes: ['paladin'], ct: 'Acción', r: '18 m', cmp: 'V, S', du: 'Instantánea', c: 0, rit: 0, t: 'Un haz de luz.' }],
    subclasses: [{ id: 'lib-subclase-paladin-juramento-del-faro', n: 'Juramento del faro', cls: 'paladin', d: 'Guardas la luz.', f: [{ lv: 3, n: 'Luz guía', d: 'Iluminas el camino.' }, { lv: 7, n: 'Aura del faro', d: 'Brillas.' }] }],
  };
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByLabel('Archivo de biblioteca').setInputFiles({ name: 'biblioteca.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(lib)) });
  await expect(page.getByRole('status').filter({ hasText: 'Biblioteca cargada' })).toBeVisible();
  await expect(page.locator('.stat', { hasText: 'Conjuros' })).toContainText('1');

  await page.getByRole('button', { name: 'Mi personaje', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Elia');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Paladín' });
  await page.getByLabel('Nivel', { exact: true }).fill('3');
  await page.getByLabel('Subclase (desde el nivel 3)').selectOption({ label: 'Juramento del faro' });
  await page.getByLabel('Trasfondo', { exact: true }).selectOption({ label: 'Farero' });
  await expect(page.getByText('competencia en Percepción y Supervivencia', { exact: false })).toBeVisible();
  await page.locator('.ce-spell-results .chip', { hasText: 'Rayo de faro' }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const sheet = page.locator('.pc');
  await expect(sheet).toContainText('Paladín 3 (Juramento del faro) · Farero');
  await expect(sheet.locator('.card', { hasText: 'Luz guía' })).toContainText('Juramento del faro 3');
  await expect(sheet.locator('.card', { hasText: 'Aura del faro' })).toHaveCount(0); // es de nivel 7
  await expect(sheet.locator('.card', { hasText: 'Vigía nocturno' })).toContainText('Dote de origen');
  await expect(sheet.locator('.card', { hasText: 'Rayo de faro' })).toBeVisible();
});

test('elecciones y conjuros de subclase: maniobras del libro, opción que cambia tras descansar y conjuros siempre preparados', async ({ page }) => {
  // subclase inventada con un apartado de opciones, como lo deja el importador del libro
  const lib = {
    app: 'cronica-combate', tipo: 'biblioteca', v: 1, source: 'Pruebas', feats: [], backgrounds: [], spells: [],
    subclasses: [{
      id: 'lib-subclase-fighter-maestro-del-combate', n: 'Maestro del combate', cls: 'fighter', d: '', f: [{ lv: 3, n: 'Supremacía', d: 'Aprendes maniobras.' }],
      x: [{ n: 'Opciones de maniobras', d: 'En orden alfabético.\n\nAlfa. Suma el dado de supremacía a la tirada de daño del ataque. El objetivo deberá superar una tirada de salvación de Fuerza.\n\nBeta. Cuando hagas una prueba de Destreza (Sigilo), súmalo a la tirada.\n\nDelta. Reduce el daño en el dado más tu modificador por Fuerza o Destreza.\n\nGamma. Golpe gamma.' }],
    }],
  };
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByLabel('Archivo de biblioteca').setInputFiles({ name: 'biblioteca.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(lib)) });
  await expect(page.getByRole('status').filter({ hasText: 'Biblioteca cargada' })).toBeVisible();

  await page.getByRole('button', { name: 'Mi personaje', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Tarsa');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Guerrero' });
  await page.getByLabel('Nivel', { exact: true }).fill('3');
  await page.getByLabel('Subclase (desde el nivel 3)').selectOption({ label: 'Maestro del combate' });
  const picker = page.locator('details.picker', { hasText: 'Maniobras' });
  await picker.locator(':scope > summary').click();
  for (const m of ['Alfa', 'Beta', 'Delta']) await picker.getByRole('button', { name: m, exact: true }).click();
  await expect(picker.locator(':scope > summary')).toContainText('(3 de 3)');
  await expect(picker.getByRole('button', { name: 'Gamma', exact: true })).toBeDisabled();
  await page.getByLabel('Estudioso de la guerra: habilidad').selectOption({ label: 'Historia' });
  await page.getByLabel('Arma para añadir').selectOption({ label: 'Espada larga (1d8 cortante)' });
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const sheet = page.locator('.pc');
  await expect(sheet.locator('.pc-features .card', { hasText: 'Beta' }).first()).toBeVisible();
  await expect(sheet.locator('.pc-skill', { hasText: 'Historia' }).locator('.dot')).toHaveClass(/on/);

  // las maniobras se usan desde la hoja: cada tirada gasta un dado de supremacía
  const man = sheet.locator('section[aria-label="Maniobras"]');
  await expect(man).toContainText('Dados de supremacía: 4 de 4 (d8)');
  await expect(man.locator('.card', { hasText: 'Alfa' })).toContainText('CD 10 Fuerza');
  await expect(man.getByRole('button', { name: 'Daño con Espada larga a dos manos + d8' })).toBeVisible();
  await man.getByRole('button', { name: 'Daño con Espada larga + d8' }).click();
  await expect(page.locator('.result-label, .dice-result, [aria-live]').filter({ hasText: 'Alfa' }).first()).toBeVisible();
  await man.getByRole('button', { name: /^Sigilo .* \+ d8$/ }).click();
  await expect(man).toContainText('Dados de supremacía: 2 de 4');
  await expect(man.getByRole('button', { name: /^Tirar d8/ })).toBeVisible();
  await page.getByRole('button', { name: 'Descanso corto' }).click();
  await page.getByRole('button', { name: 'Terminar descanso corto' }).click();
  await expect(man).toContainText('Dados de supremacía: 4 de 4');

  // brujo del SRD: sus conjuros de patrón salen solos; explorador cazador: la presa se cambia desde la hoja
  await page.getByRole('button', { name: 'Editar hoja' }).click();
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Brujo' });
  await page.getByLabel('Subclase (desde el nivel 3)').selectOption({ label: 'Patrón infernal' });
  await expect(page.getByText('Por tu subclase siempre tienes preparados', { exact: false })).toContainText('Manos ardientes');
  await page.getByRole('button', { name: 'Listo' }).first().click();
  await expect(sheet.locator('.card', { hasText: 'Manos ardientes' })).toContainText('Subclase · siempre preparado');
  await page.getByRole('button', { name: 'Editar hoja' }).click();
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Explorador' });
  await page.getByLabel('Subclase (desde el nivel 3)').selectOption({ label: 'Cazador' });
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const prey = sheet.getByLabel('Presa del cazador');
  await expect(prey.locator('option')).toHaveCount(3);
  await prey.selectOption({ index: 1 });
  await expect(sheet.locator('.pc-features .card').filter({ hasText: 'Presa del cazador' }).first()).toBeVisible();
});

test('rasgos de subclase con tirada: patrón infernal y cazador (SRD) y guerrero psiónico (biblioteca)', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Mirel');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Brujo' });
  await page.getByLabel('Nivel', { exact: true }).fill('14');
  await page.getByLabel('Subclase (desde el nivel 3)').selectOption({ label: 'Patrón infernal' });
  await page.locator('#ce-ab-cha').fill('16');
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const fiend = page.locator('section[aria-label="Patrón infernal"]');
  await fiend.getByRole('button', { name: 'Ganar 17 PG temporales' }).click();
  await expect(page.locator('.stat-tmp')).toContainText('+17');
  await expect(fiend.locator('.card', { hasText: 'Arrojar a través del Infierno' })).toContainText(/CD \d+ Carisma/);
  const luck = fiend.locator('.card', { hasText: 'Suerte propia del Oscuro' });
  for (let i = 0; i < 3; i++) await luck.getByRole('button', { name: 'Tirar 1d10' }).click();
  await expect(luck.getByRole('button', { name: 'Tirar 1d10' })).toBeDisabled();

  // explorador cazador: Matacolosos suma 1d8 al daño de cada arma
  await page.getByRole('button', { name: 'Editar hoja' }).click();
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Explorador' });
  await page.getByLabel('Subclase (desde el nivel 3)').selectOption({ label: 'Cazador' });
  await page.getByLabel(/Presa del cazador/).selectOption({ label: 'Matacolosos' });
  await page.getByLabel('Arma para añadir').selectOption({ label: 'Espada larga (1d8 cortante)' });
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  await expect(page.locator('section[aria-label="Cazador"]').getByRole('button', { name: 'Daño con Espada larga a dos manos + 1d8' })).toBeVisible();

  // guerrero psiónico con su texto en la biblioteca: los dados se gastan y el descanso corto recupera uno
  const lib = { app: 'cronica-combate', tipo: 'biblioteca', v: 1, source: 'x', feats: [], backgrounds: [], spells: [],
    subclasses: [{ id: 'lib-subclase-fighter-guerrero-psionico', n: 'Guerrero psiónico', cls: 'fighter', d: '', f: [{ lv: 3, n: 'Poder psiónico', d: 'Tienes dados.\n\nCampo protector. Reduces daño.\n\nGolpe psiónico. Daño de fuerza extra.' }] }] };
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByLabel('Archivo de biblioteca').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(lib)) });
  await expect(page.getByRole('status').filter({ hasText: 'Biblioteca cargada' })).toBeVisible();
  await page.getByRole('button', { name: 'Mi personaje', exact: true }).click();
  await page.getByRole('button', { name: 'Editar hoja' }).click();
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Guerrero' });
  await page.getByLabel('Nivel', { exact: true }).fill('5');
  await page.getByLabel('Subclase (desde el nivel 3)').selectOption({ label: 'Guerrero psiónico' });
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const psi = page.locator('section[aria-label="Poder psiónico"]');
  await expect(psi).toContainText('Dados de energía psiónica: 6 de 6 (d8)');
  await psi.locator('.card', { hasText: 'Golpe psiónico' }).getByRole('button', { name: /^Daño d8/ }).click();
  await psi.locator('.card', { hasText: 'Campo protector' }).getByRole('button', { name: /^Tirar d8/ }).click();
  await expect(psi).toContainText('4 de 6');
  await page.getByRole('button', { name: 'Descanso corto' }).click();
  await page.getByRole('button', { name: 'Terminar descanso corto' }).click();
  await expect(psi).toContainText('5 de 6');
});

test('dotes con botones: atacante salvaje, ataque extra con arma ligera, sin armas, suerte y recuperación', async ({ page }) => {
  const lib = { app: 'cronica-combate', tipo: 'biblioteca', v: 1, source: 'x', backgrounds: [], spells: [], subclasses: [],
    feats: [
      { id: 'lib-dote-afortunado', n: 'Afortunado', cat: 'origin', req: '', d: 'Tienes suerte.' },
      { id: 'lib-dote-resistente', n: 'Resistente', cat: 'general', req: '', d: 'Aguantas.' },
      { id: 'lib-dote-maton-de-taberna', n: 'Matón de taberna', cat: 'origin', req: '', d: 'Pegas.' },
    ] };
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByLabel('Archivo de biblioteca').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(lib)) });
  await expect(page.getByRole('status').filter({ hasText: 'Biblioteca cargada' })).toBeVisible();
  await page.getByRole('button', { name: 'Mi personaje', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Dag');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Guerrero' });
  await page.getByLabel('Nivel', { exact: true }).fill('5');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  for (const w of ['Espada corta (1d6 perforante)', 'Daga (1d4 perforante)']) {
    await page.getByLabel('Arma para añadir').selectOption({ label: w });
    await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  }
  await page.locator('details').evaluateAll((ds) => ds.forEach((d) => ((d as HTMLDetailsElement).open = true)));
  for (const f of ['Atacante salvaje', 'Combate con dos armas', 'Afortunado', 'Resistente', 'Matón de taberna']) await page.locator('.chip', { hasText: f }).first().click();
  await page.getByRole('button', { name: 'Listo' }).first().click();

  const atk = page.locator('section[aria-label="Ataques"]');
  const short = atk.locator('.pc-attack', { hasText: 'Espada corta' });
  await expect(short.getByRole('button', { name: /^Acción adicional 1d6\+\d perforante$/ })).toBeVisible();
  await atk.getByRole('button', { name: 'Atacante salvaje' }).click();
  await short.getByRole('button', { name: /^Daño / }).click();
  await expect(page.locator('.plaque-label')).toContainText('(atacante salvaje)');
  await expect(atk.getByRole('button', { name: 'Atacante salvaje' })).toHaveAttribute('aria-pressed', 'false');
  await expect(atk.locator('.pc-attack', { hasText: 'Ataque sin armas' })).toContainText('repite los 1');

  const feats = page.locator('section[aria-label="Dotes"]');
  await expect(feats.getByRole('button', { name: 'Usos de Puntos de suerte' }).or(feats.locator('.card', { hasText: 'Afortunado' }))).toBeVisible();
  await feats.getByRole('button', { name: /^Recuperación rápida 1d10$/ }).click();
  await expect(page.locator('.plaque-label')).toContainText('recuperación rápida');
  await expect(feats).toContainText('dados de golpe: 4/5');
});

test('crítico con Perforador y Don del ataque imparable; Duelo se quita por arma', async ({ page }) => {
  const lib = { app: 'cronica-combate', tipo: 'biblioteca', v: 1, source: 'x', backgrounds: [], spells: [], subclasses: [],
    feats: [
      { id: 'lib-dote-perforador', n: 'Perforador', cat: 'general', req: '', d: 'x' },
      { id: 'lib-dote-don-del-ataque-imparable', n: 'Don del ataque imparable', cat: 'epic-boon', req: '', d: 'x' },
      { id: 'lib-dote-duelo', n: 'Duelo', cat: 'fighting-style', req: '', d: 'x' },
    ] };
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByLabel('Archivo de biblioteca').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(lib)) });
  await expect(page.getByRole('status').filter({ hasText: 'Biblioteca cargada' })).toBeVisible();
  await page.getByRole('button', { name: 'Mi personaje', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Vesna');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Guerrero' });
  await page.getByLabel('Nivel', { exact: true }).fill('19');
  await page.getByRole('button', { name: /Matriz estándar/ }).click(); // FUE 15, DES 14
  await page.getByLabel('Arma para añadir').selectOption({ label: 'Estoque (1d8 perforante)' });
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await page.locator('details').evaluateAll((ds) => ds.forEach((d) => ((d as HTMLDetailsElement).open = true)));
  for (const f of ['Perforador', 'Don del ataque imparable', 'Duelo']) await page.locator('.chip', { hasText: f }).first().click();
  await page.getByRole('button', { name: 'Listo' }).first().click();

  const rapier = page.locator('section[aria-label="Ataques"] .pc-attack', { hasText: 'Estoque' });
  await expect(rapier.getByRole('button', { name: /^Daño 1d8\+4 perforante$/ })).toBeVisible(); // +2 FUE +2 Duelo
  await rapier.getByRole('checkbox', { name: /Duelo/ }).uncheck();
  await expect(rapier.getByRole('button', { name: /^Daño 1d8\+2 perforante$/ })).toBeVisible();

  // todos los dados al máximo: 20 natural en el ataque y crítico en el daño
  await page.evaluate(() => { Math.random = () => 0.999; });
  await rapier.getByRole('button', { name: /^Ataque/ }).click();
  await expect(page.locator('.plaque')).toContainText('¡Crítico!', { timeout: 10000 }); // 20 natural
  await rapier.getByRole('button', { name: /^Daño/ }).click();
  await expect(page.locator('.plaque-label')).toContainText('daño');
  // 2d8 (16) + 2 + un d8 más de Perforador (8) + Fuerza 15 de Don del ataque imparable = 41
  await expect(page.locator('.plaque-total')).toHaveText('41', { timeout: 10000 });
});

test('recursos de clase: Inspiración bárdica, Canalizar divinidad (clérigo) y Canalización divina (paladín)', async ({ page }) => {
  await page.goto('/#/jugador');
  const make = async (name: string, cls: string, lv: string, sub: string, abil: [string, string]) => {
    await page.getByRole('button', { name: 'Nuevo personaje' }).click();
    await page.getByLabel('Nombre del personaje').fill(name);
    await page.getByLabel('Clase', { exact: true }).selectOption({ label: cls });
    await page.getByLabel('Nivel', { exact: true }).fill(lv);
    await page.getByLabel(/^Subclase/).selectOption({ label: sub });
    await page.locator('#ce-ab-' + abil[0]).fill(abil[1]);
    await page.getByRole('button', { name: 'Listo' }).first().click();
  };
  const shortRest = async () => {
    await page.getByRole('button', { name: 'Descanso corto' }).click();
    await page.getByRole('button', { name: 'Terminar descanso corto' }).click();
  };

  // bardo del Saber, nivel 5, Carisma 16: 3 usos de d8; Fuente de inspiración: el descanso corto los recupera todos
  await make('Lira', 'Bardo', '5', 'Colegio del Saber', ['cha', '16']);
  const bard = page.locator('section[aria-label="Inspiración bárdica"]');
  await expect(bard.locator('.res-head')).toHaveText('3 de 3 (d8)');
  await bard.locator('.card', { hasText: 'Palabras hirientes' }).getByRole('button', { name: 'Tirar d8' }).click();
  await bard.getByRole('button', { name: 'Dar un dado a un aliado' }).click();
  await expect(bard).toContainText('1 de 3');
  await shortRest();
  await expect(bard).toContainText('3 de 3');

  // clérigo de la Vida, nivel 6, Sabiduría 16: 3 usos; el descanso corto recupera uno
  await make('Ilsa', 'Clérigo', '6', 'Dominio de la Vida', ['wis', '16']);
  const cleric = page.locator('section[aria-label="Canalizar divinidad"]');
  await expect(cleric.locator('.res-head')).toHaveText('3 de 3');
  await expect(cleric.locator('.card', { hasText: 'Preservar vida' })).toContainText('reparte 30 PG');
  await cleric.locator('.card', { hasText: 'Chispa' }).getByRole('button', { name: 'Curar 1d8+3' }).click();
  await cleric.locator('.card', { hasText: 'Preservar vida' }).getByRole('button', { name: 'Usar en otros (gasta un uso)' }).click();
  await expect(cleric).toContainText('1 de 3');
  await shortRest();
  await expect(cleric).toContainText('2 de 3');

  // paladín de devoción, nivel 3, Carisma 16: Arma sagrada +3
  await make('Aldo', 'Paladín', '3', 'Juramento de devoción', ['cha', '16']);
  const pal = page.locator('section[aria-label="Canalización divina"]');
  await expect(pal.locator('.res-head')).toHaveText('2 de 2');
  await expect(pal.locator('.card', { hasText: 'Arma sagrada' })).toContainText('+3 al ataque');
});

test('Preservar vida te cura a ti; conjuros de la escuela del mago; Caballero arcano lanza con Inteligencia', async ({ page }) => {
  await page.goto('/#/jugador');
  const make = async (name: string, cls: string, lv: string, sub: string, abil: [string, string], other?: string) => {
    await page.getByRole('button', { name: 'Nuevo personaje' }).click();
    await page.getByLabel('Nombre del personaje').fill(name);
    await page.getByLabel('Clase', { exact: true }).selectOption({ label: cls });
    await page.getByLabel('Nivel', { exact: true }).fill(lv);
    await page.getByLabel(/^Subclase/).selectOption({ label: sub });
    if (other) await page.getByLabel('Nombre de la subclase').fill(other);
    await page.locator('#ce-ab-' + abil[0]).fill(abil[1]);
  };

  // clérigo de la Vida 6 (33 PG): a 8 PG se cura hasta la mitad (16), quedan 22 de 30 para los demás
  await make('Ilsa', 'Clérigo', '6', 'Dominio de la Vida', ['wis', '16']);
  await page.getByRole('button', { name: 'Listo' }).first().click();
  await page.getByLabel('Cantidad de PG').fill('25');
  await page.getByRole('button', { name: 'Daño', exact: true }).click();
  const preserve = page.locator('section[aria-label="Canalizar divinidad"] li', { hasText: 'Preservar vida' });
  await preserve.getByRole('button', { name: 'Usar y curarme 8 PG' }).click();
  await expect(preserve.getByRole('status')).toContainText('Te curas 8 PG; quedan 22');
  await expect(page.locator('.stat', { hasText: 'PG' }).first()).toContainText('16');
  await expect(preserve.getByRole('button', { name: /^Usar y curarme/ })).toBeDisabled(); // ya está a la mitad: nada que curarse

  // mago evocador 3: dos conjuros de evocación gratis, que salen en la hoja
  await make('Oren', 'Mago', '3', 'Evocador', ['int', '16']);
  const pick = page.locator('details.picker', { hasText: 'Conjuros de tu escuela' });
  await pick.locator(':scope > summary').click();
  await pick.getByLabel(/^Buscar en/).fill('proyectil');
  await pick.getByRole('button', { name: /Proyectil mágico/ }).click();
  await expect(pick.locator(':scope > summary')).toContainText('(1 de 2)');
  await page.getByRole('button', { name: 'Listo' }).first().click();
  await expect(page.locator('section[aria-label="Conjuros"] .card', { hasText: 'Proyectil mágico' })).toContainText('Subclase · en tu libro de conjuros');

  // Caballero arcano 7 (subclase escrita a mano): lista de mago, Inteligencia y espacios de nivel 1 y 2
  await make('Bren', 'Guerrero', '7', 'Otra (escríbela)', ['int', '14'], 'Caballero arcano');
  await expect(page.getByText('Caballero arcano: conjuros de mago. Lanzas con Inteligencia.')).toBeVisible();
  await expect(page.locator('.spell-counts')).toContainText('Trucos 0 de 2');
  await expect(page.locator('.spell-counts')).toContainText('Conjuros preparados 0 de 5');
  await expect(page.locator('.spell-counts')).toContainText('hasta el nivel 2');
  await expect(page.getByLabel('Buscar conjuro de la lista de Mago')).toBeVisible();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const sp = page.locator('section[aria-label="Conjuros"]');
  await expect(sp).toContainText('Inteligencia');
  await expect(sp).toContainText('Nivel 2');
});

test('rasgos de clase en la hoja: Ataque furtivo, Furia, Segundo aliento, Imposición de manos y crítico del Campeón', async ({ page }) => {
  await page.goto('/#/jugador');
  const make = async (name: string, cls: string, lv: string, weapon?: string, sub?: string) => {
    await page.getByRole('button', { name: 'Nuevo personaje' }).click();
    await page.getByLabel('Nombre del personaje').fill(name);
    await page.getByLabel('Clase', { exact: true }).selectOption({ label: cls });
    await page.getByLabel('Nivel', { exact: true }).fill(lv);
    if (sub) await page.getByLabel(/^Subclase/).selectOption({ label: sub });
    await page.getByRole('button', { name: /Matriz estándar/ }).click();
    if (weapon) {
      await page.getByLabel('Arma para añadir').selectOption({ label: weapon });
      await page.getByRole('button', { name: 'Añadir', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Listo' }).first().click();
  };
  const atk = page.locator('section[aria-label="Ataques"]');

  // pícaro 5: Ataque furtivo 3d6 con el estoque (sutil), una vez
  await make('Sombra', 'Pícaro', '5', 'Estoque (1d8 perforante)');
  await atk.getByRole('button', { name: 'Ataque furtivo +3d6' }).click();
  await atk.locator('.pc-attack', { hasText: 'Estoque' }).getByRole('button', { name: /^Daño/ }).click();
  await expect(page.locator('.plaque-label')).toContainText('(ataque furtivo)');
  await expect(atk.getByRole('button', { name: 'Ataque furtivo +3d6' })).toHaveAttribute('aria-pressed', 'false');

  // bárbaro 9: entrar en Furia gasta un uso y suma +3 hasta que se apaga
  await make('Ruk', 'Bárbaro', '9', 'Hacha a dos manos (1d12 cortante)');
  await atk.getByRole('button', { name: 'Furia +3' }).click();
  await atk.locator('.pc-attack', { hasText: 'Hacha a dos manos' }).getByRole('button', { name: /^Daño/ }).click();
  await expect(page.locator('.plaque-label')).toContainText('(furia)');
  await expect(atk.getByRole('button', { name: 'Furia +3' })).toHaveAttribute('aria-pressed', 'true');

  // guerrero 3 Campeón: Segundo aliento cura solo
  await make('Brakka', 'Guerrero', '3', 'Espada larga (1d8 cortante)', 'Campeón');
  await page.getByLabel('Cantidad de PG').fill('10');
  await page.getByRole('button', { name: 'Daño', exact: true }).click();
  await page.locator('section[aria-label="Rasgos de clase"]').getByRole('button', { name: 'Curarte 1d10+3' }).click();
  await expect(page.locator('.plaque')).toContainText('Recuperas', { timeout: 10000 });
  // crítico con 19
  await page.evaluate(() => { Math.random = () => 0.92; }); // d20 -> 19
  await atk.locator('.pc-attack', { hasText: 'Espada larga' }).getByRole('button', { name: /^Ataque/ }).click();
  await expect(page.locator('.plaque')).toContainText('¡Crítico!', { timeout: 10000 });

  // paladín 2: Imposición de manos (10 PG) cura a uno mismo lo que le falta
  await make('Aldo', 'Paladín', '2');
  await page.getByLabel('Cantidad de PG').fill('4');
  await page.getByRole('button', { name: 'Daño', exact: true }).click();
  const lay = page.locator('section[aria-label="Rasgos de clase"]');
  await lay.getByLabel('PG de Imposición de manos').fill('6');
  await lay.getByRole('button', { name: 'Curarme 4' }).click();
  await expect(lay).toContainText('6 de 10 PG');
});

test('tiradas de conjuros: nivel de espacio, trucos que mejoran, curación y gastar el espacio', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Oren');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Mago' });
  await page.getByLabel('Nivel', { exact: true }).fill('7');
  await page.getByRole('button', { name: /Matriz estándar/ }).click(); // INT 15: +2, ataque +5, CD 13
  for (const q of ['bola de fuego', 'descarga de fuego']) {
    await page.getByLabel(/^Buscar conjuro/).fill(q);
    await page.locator('.ce-spell-results .chip').first().click();
  }
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const sp = page.locator('section[aria-label="Conjuros"]');
  const fireball = sp.locator('.card', { hasText: 'Bola de fuego' });
  await expect(fireball).toContainText('CD 13 Destreza · mitad si supera');
  await expect(fireball.getByRole('button', { name: 'Daño 8d6 fuego' })).toBeVisible();
  await fireball.getByLabel('Nivel de espacio para Bola de fuego').selectOption('4');
  await fireball.getByRole('button', { name: 'Daño 9d6 fuego' }).click();
  await expect(page.locator('.plaque-label')).toContainText('Bola de fuego (nivel 4): daño');
  await fireball.getByRole('button', { name: 'Lanzar (gasta espacio de nivel 4)' }).click();
  await expect(fireball.getByRole('button', { name: 'Lanzar (gasta espacio de nivel 4)' })).toBeDisabled(); // solo tenía uno
  const bolt = sp.locator('.card', { hasText: 'Descarga de fuego' });
  await expect(bolt.getByRole('button', { name: 'Ataque +5' })).toBeVisible();
  await expect(bolt.getByRole('button', { name: 'Daño 2d10 fuego' })).toBeVisible(); // nivel 5+: 2d10
  // el texto completo, en una ventana al pulsar el nombre
  await fireball.getByRole('button', { name: 'Bola de fuego' }).click();
  const dlg = page.getByRole('dialog', { name: 'Bola de fuego' });
  await expect(dlg).toContainText('Nivel 3');
  await expect(dlg.getByRole('button', { name: /Daño \d+d6 fuego/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);

  // clérigo 1: Curar heridas cura solo con «Curarme»
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Ilsa');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Clérigo' });
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByLabel(/^Buscar conjuro/).fill('curar heridas');
  await page.locator('.ce-spell-results .chip', { hasText: /^\+ Curar heridas 1$/ }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  await page.getByLabel('Cantidad de PG').fill('5');
  await page.getByRole('button', { name: 'Daño', exact: true }).click();
  const cure = page.locator('section[aria-label="Conjuros"] .card', { hasText: 'Curar heridas' });
  await expect(cure.getByRole('button', { name: 'Curar 2d8+2' })).toBeVisible();
  await cure.getByRole('button', { name: 'Curarme' }).click();
  await expect(page.locator('.plaque')).toContainText('Recuperas', { timeout: 10000 });
});

test('copia de seguridad de personajes: guardar, borrar y volver a cargar', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Brakka');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Guerrero' });
  await page.getByLabel('Nivel', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Listo' }).first().click();
  await expect(page.getByText('guarda una copia de vez en cuando')).toBeVisible();

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Guardar copia' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^personajes-cronica-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await dl.path();
  await expect(page.getByText(/Última copia:/)).toBeVisible();
  const [one] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar Brakka' }).click()]);
  expect(one.suggestedFilename()).toBe('brakka-cronica.json');

  // se borra y vuelve con la copia
  await page.getByRole('button', { name: 'Editar hoja' }).click();
  await page.getByRole('button', { name: 'Borrar personaje' }).click();
  await page.getByRole('button', { name: '¿Seguro? Borrar personaje' }).click();
  await expect(page.locator('.pc h2', { hasText: 'Brakka' })).toHaveCount(0);
  await page.getByLabel('Copia de personajes').setInputFiles(path!);
  await expect(page.getByRole('status').filter({ hasText: 'Copia cargada: 1 personaje nuevo.' })).toBeVisible();
  await expect(page.locator('.pc').getByRole('heading', { name: 'Brakka' })).toBeVisible();
  await expect(page.locator('.pc')).toContainText('Guerrero 4');
  // otra vez la misma copia: no cambia nada
  await page.getByLabel('Copia de personajes').setInputFiles(path!);
  await expect(page.getByRole('status').filter({ hasText: '1 sin cambios' })).toBeVisible();
});

test('cuenta opcional: sin sesión todo sigue en el dispositivo; el formulario de inicio carga al pedirlo', async ({ page }) => {
  await page.goto('/#/jugador');
  // la cuenta está en la esquina del encabezado
  await page.locator('.app-header').getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Entrar con Google' })).toBeEnabled({ timeout: 15000 }); // Firebase cargado y sin sesión
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeDisabled();
  await page.getByLabel('Correo').fill('jugador@ejemplo.test');
  await expect(page.getByRole('button', { name: 'Crear cuenta' })).toHaveCount(0); // registrarse va aparte
  await page.getByRole('button', { name: 'Crear una con tu correo' }).click();
  await expect(page.getByRole('button', { name: 'Crear cuenta' })).toBeDisabled(); // falta la contraseña
  await page.getByLabel('Contraseña').fill('12345');
  await expect(page.getByRole('button', { name: 'Crear cuenta' })).toBeDisabled(); // menos de 6 caracteres
  await page.getByRole('button', { name: 'Entrar', exact: true }).click(); // vuelve al formulario de entrar
  await expect(page.getByRole('button', { name: 'He olvidado la contraseña' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Cuenta' })).toHaveCount(0);
  await expect(page.locator('.app-header').getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
});

test('cuenta en la pantalla de inicio y en el grupo del máster', async ({ page }) => {
  await page.goto('/#/inicio');
  const box = page.getByRole('region', { name: 'Cuenta' });
  await expect(box.getByRole('button', { name: 'Entrar con Google' })).toBeVisible();
  await expect(box).toContainText('tus criaturas, encuentros y grupo');
  await expect(box.getByRole('button', { name: 'Cancelar' })).toHaveCount(0);
  await page.getByRole('button', { name: /Soy el máster/ }).click();
  // en el modo máster, la cuenta está en la esquina del encabezado
  await expect(page.locator('.app-header').getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
});

test('efectos con salvación: objetivos, salvaciones de los monstruos, daño y estados', async ({ page }) => {
  await page.goto('/#/dm');
  await page.getByRole('button', { name: 'Bestiario', exact: true }).click();
  for (const m of ['Dragón rojo adulto', 'Ogro', 'Aboleth']) {
    await page.getByLabel('Buscar (español o inglés)').fill(m);
    await page.locator('li.beast', { has: page.locator('.beast-name', { hasText: new RegExp('^' + m) }) }).first().getByRole('button', { name: 'Al combate' }).click();
  }
  await page.getByRole('button', { name: 'Combate', exact: true }).click();

  // aliento de fuego del dragón: CD 21 Destreza, mitad si supera; el ogro (DES -1) no puede superarla
  await page.locator('.init-row', { hasText: 'Dragón rojo adulto' }).click();
  await page.locator('.sb-action', { hasText: 'Aliento de fuego' }).getByRole('button', { name: /^Daño/ }).click();
  const fx = page.locator('.targets.effect');
  await expect(fx).toContainText('Salvación de Destreza CD 21 · mitad si supera', { timeout: 10000 });
  await fx.getByRole('button', { name: 'Ogro', exact: true }).click();
  await fx.getByRole('button', { name: 'Tirar salvaciones' }).click();
  await expect(fx.locator('.effect-rows li', { hasText: 'Ogro' })).toContainText('todo el daño');
  await fx.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.locator('.init-row', { hasText: 'Ogro' })).not.toContainText('68/68');

  // dominar mente del aboleth: sin daño, pone Hechizado a quien falla (se puede corregir el resultado)
  await page.locator('.init-row', { hasText: 'Aboleth' }).click();
  await page.locator('.sb-action', { hasText: 'Dominar mente' }).getByRole('button', { name: /^Objetivos/ }).click();
  await fx.getByRole('button', { name: 'Ogro', exact: true }).click();
  await fx.getByRole('button', { name: 'Tirar salvaciones' }).click();
  const row = fx.locator('.effect-rows li', { hasText: 'Ogro' });
  if (await row.getByRole('button', { name: /^Supera/ }).count()) await row.getByRole('button', { name: /^Supera/ }).click();
  await expect(row).toContainText('Hechizado');
  await fx.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.locator('.init-row', { hasText: 'Ogro' })).toContainText('Hechizado');
});

test('conjuro en una clase que no lanza: pide confirmación una vez', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Brakka');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Guerrero' });
  await page.getByLabel(/^Buscar conjuro/).fill('luz');
  await page.locator('.ce-spell-results .chip').first().click();
  const dlg = page.getByRole('dialog', { name: '¿Añadir un conjuro?' });
  await expect(dlg).toContainText('no lanza conjuros');
  await dlg.getByRole('button', { name: 'Cerrar' }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.locator('.chips .chip.on')).toHaveCount(0); // no se añadió
  await page.getByLabel(/^Buscar conjuro/).fill('luz');
  await page.locator('.ce-spell-results .chip').first().click();
  await dlg.getByRole('button', { name: 'Sí, añadirlo' }).click();
  await expect(page.locator('.chips .chip.on')).toHaveCount(1);
  // la segunda ya no pregunta
  await page.getByLabel(/^Buscar conjuro/).fill('mano');
  await page.locator('.ce-spell-results .chip').first().click();
  await expect(dlg).toHaveCount(0);
  await expect(page.locator('.chips .chip.on')).toHaveCount(2);
});

test('subir de nivel en el editor sube también los PG actuales', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Nim');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Pícaro' });
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const hp = page.locator('.pc-stats .stat', { hasText: 'PG' }).locator('.stat-v');
  await expect(hp).toHaveText('10 / 10'); // d8 + CON 14
  await page.getByRole('button', { name: 'Editar hoja' }).click();
  await page.getByLabel('Nivel', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Listo' }).first().click();
  await expect(hp).toHaveText('38 / 38');
});

test('multiclase: añadir una clase en el editor y verla en la hoja', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Auriel');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Paladín' });
  await page.getByLabel('Nivel', { exact: true }).fill('5');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Añadir otra clase (multiclase)' }).click();
  await page.getByLabel('Otra clase').selectOption({ label: 'Brujo' });
  await page.getByLabel('Nivel en ella').fill('3');
  await expect(page.getByText('Nivel total 8')).toBeVisible();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  await expect(page.locator('.pc-head')).toContainText('Paladín 5');
  await expect(page.locator('.pc-head')).toContainText('Brujo 3');
  await expect(page.locator('.pc-stats .stat', { hasText: 'Competencia' })).toContainText('+3');
  await expect(page.locator('.pc-hp-row')).toContainText('5/5 d10 · 3/3 d8');
  const sp = page.locator('section[aria-label="Conjuros"]');
  await expect(sp).toContainText('(Paladín)');
  await expect(sp).toContainText('(Brujo)');
  await expect(sp).toContainText('Magia de pacto (nivel 2)');
  // rasgos de las dos clases
  const traits = page.locator('section[aria-label="Rasgos y dotes"]');
  await expect(traits.locator('.card', { hasText: 'Imposición de manos' })).toBeVisible();
  await expect(traits.locator('.card', { hasText: 'Invocaciones sobrenaturales' }).or(traits.locator('.card', { hasText: 'Brujo 1' })).first()).toBeVisible();
});

test('multiclase: los paneles de acciones de cada clase', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Auriel');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Paladín' });
  await page.getByLabel('Nivel', { exact: true }).fill('5');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Añadir otra clase (multiclase)' }).click();
  await page.getByLabel('Otra clase').selectOption({ label: 'Brujo' });
  await page.getByLabel('Nivel en ella').fill('3');
  await page.getByLabel('Subclase', { exact: true }).fill('Patrón infernal');
  await page.getByRole('button', { name: 'Listo' }).first().click();
  await expect(page.getByRole('region', { name: 'Canalización divina' })).toBeVisible();
  await expect(page.locator('.card', { hasText: 'Bendición del Oscuro' }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Rasgos de clase' })).toContainText('Imposición de manos');

  // guerrero con bárbaro: Segundo aliento y Furia en Ataques
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Grosh');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Guerrero' });
  await page.getByLabel('Nivel', { exact: true }).fill('3');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Añadir otra clase (multiclase)' }).click();
  await page.getByLabel('Otra clase').selectOption({ label: 'Bárbaro' });
  await page.getByLabel('Nivel en ella').fill('2');
  await page.getByRole('button', { name: 'Listo' }).first().click();
  await expect(page.getByRole('region', { name: 'Rasgos de clase' })).toContainText('Segundo aliento');
  await expect(page.getByRole('button', { name: /^Furia \+2/ })).toBeVisible();
  await expect(page.locator('.pc-stats .stat', { hasText: 'CA' })).toContainText('Defensa sin armadura');
});

test('Furia: estado guardado, resistencias, ventaja en Fuerza y daño recibido a la mitad', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Grosh');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Bárbaro' });
  await page.getByLabel('Nivel', { exact: true }).fill('5');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  await page.getByRole('button', { name: /^Furia \+2/ }).click();
  await expect(page.locator('.pc-resist')).toContainText('cortante (Furia)');
  await expect(page.locator('.pc-abil', { hasText: 'FUE' }).getByRole('button', { name: /^Salv/ })).toContainText('V');
  // sigue en Furia tras recargar
  await page.reload();
  await expect(page.locator('.pc-resist')).toContainText('perforante (Furia)');
  const hp = page.locator('.pc-stats .stat', { hasText: 'PG' }).locator('.stat-v');
  const before = parseInt((await hp.textContent())!.split('/')[0], 10);
  await page.getByLabel('Tipo de daño recibido').selectOption('cortante');
  await page.getByLabel('Cantidad de PG').fill('10');
  await page.getByRole('button', { name: 'Daño (mitad)' }).click();
  await expect(hp).toContainText(String(before - 5) + ' /');
  await page.getByRole('button', { name: /^Furia \+2/ }).click();
  await expect(page.locator('.pc-resist')).toHaveCount(0);
});

test('estados del jugador en sus tiradas: envenenado da desventaja en ataques y pruebas', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Brakka');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Guerrero' });
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const rest = page.getByRole('region', { name: 'Estados y descansos' });
  await rest.locator('summary').first().click();
  await rest.getByRole('button', { name: 'Envenenado' }).click();
  await page.locator('.pc-abil', { hasText: 'FUE' }).getByRole('button', { name: /^Prueba/ }).click();
  await expect(page.locator('.plaque')).toContainText('desventaja: envenenado', { timeout: 15000 });
});

test('visita guiada: se abre desde el «?», avanza, señala y se puede saltar', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Ayuda' }).click();
  await page.getByRole('menuitem', { name: 'Repetir la visita guiada' }).click();
  const tour = page.getByRole('dialog', { name: 'Visita guiada' });
  await expect(tour).toContainText('Paso 1 de 8');
  await expect(tour).toContainText('Tus personajes');
  await tour.getByRole('button', { name: 'Siguiente' }).click();
  await expect(tour).toContainText('Paso 2 de 8');
  await tour.getByRole('button', { name: 'Saltar visita' }).click();
  await expect(tour).toHaveCount(0);
  // máster: también con los atajos de teclado en el mismo menú
  await page.goto('/#/dm');
  await page.getByRole('button', { name: 'Ayuda' }).click();
  await page.getByRole('menuitem', { name: 'Repetir la visita guiada' }).click();
  await expect(page.getByRole('dialog', { name: 'Visita guiada' })).toContainText('Paso 1 de 8');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Visita guiada' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ayuda' }).click();
  await page.getByRole('menuitem', { name: 'Atajos de teclado' }).click();
  await expect(page.getByRole('heading', { name: 'Atajos de teclado' })).toBeVisible();
});

test('características: compra de puntos, tirar 4d6 y repartir; conjuros hasta el nivel que se puede lanzar', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Elara');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Mago' });
  await page.getByLabel('Nivel', { exact: true }).fill('3');
  // compra de puntos: todo a 8 y 27 puntos para gastar
  await page.getByRole('button', { name: 'Compra de puntos' }).click();
  await expect(page.getByText('Puntos: 0 de 27 · te quedan 27')).toBeVisible();
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Subir Inteligencia' }).click();
  await expect(page.getByText('Puntos: 9 de 27 · te quedan 18')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Subir Inteligencia' })).toBeDisabled(); // máximo 15
  // tirar 4d6 seis veces: se reparten solas (y se pueden intercambiar)
  await page.getByRole('button', { name: 'Tirar 4d6' }).click();
  for (let i = 1; i <= 6; i++) {
    await page.getByRole('button', { name: 'Tirar 4d6 (' + i + ' de 6)' }).click();
    await expect(page.locator('.plaque-label')).toContainText('característica ' + i + ' de 6', { timeout: 15000 });
    await expect(page.locator('.plaque')).toContainText('se descarta');
  }
  await expect(page.getByRole('button', { name: 'Seis tiradas hechas' })).toBeDisabled();
  await expect(page.locator('select#ce-ab-int')).toBeVisible(); // ya se reparten con desplegables
  // conjuros: un mago 3 solo ve los de su lista hasta nivel 2, y su cuenta
  await expect(page.locator('.spell-counts')).toContainText('Trucos 0 de 3');
  await expect(page.locator('.spell-counts')).toContainText('Puedes elegir conjuros hasta el nivel 2');
  await page.getByLabel(/^Buscar conjuro/).fill('bola de fuego');
  await expect(page.locator('.ce-spell-results .chip', { hasText: 'Bola de fuego' })).toHaveCount(0);
  await page.getByLabel(/^Buscar conjuro/).fill('proyectil');
  await expect(page.locator('.ce-spell-results .chip', { hasText: 'Proyectil mágico' })).toHaveCount(1);
});

test('subir de nivel: PG tirados, mejora de característica, conjuros nuevos, multiclase y deshacer', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Brakka');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Guerrero' });
  await page.getByLabel('Nivel', { exact: true }).fill('3');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const hp = page.locator('.pc-stats .stat', { hasText: 'PG' }).locator('.stat-v');
  const hpBefore = parseInt((await hp.textContent())!.split('/')[1], 10);
  await page.getByRole('button', { name: 'Subir de nivel' }).click();
  const dlg = page.getByRole('dialog', { name: 'Subir a nivel 4' });
  await expect(dlg).toContainText('Guerrero 3 → 4');
  await expect(dlg).toContainText('Mejora de característica o dote');
  await dlg.getByRole('button', { name: /^Tirar 1d10/ }).click();
  await expect(dlg.getByText(/^Tirada: \d+/)).toBeVisible({ timeout: 15000 });
  await dlg.getByLabel('Característica que sube').selectOption('str');
  await dlg.getByRole('button', { name: 'Confirmar: subir a nivel 4' }).click();
  await expect(page.locator('.pc-head')).toContainText('Guerrero 4');
  await expect(page.locator('.pc-abil', { hasText: 'FUE' })).toContainText('17');
  const hpAfter = parseInt((await hp.textContent())!.split('/')[1], 10);
  expect(hpAfter).toBeGreaterThan(hpBefore);
  // deshacer la subida
  await page.getByRole('button', { name: 'Deshacer la subida' }).click();
  await expect(page.locator('.pc-head')).toContainText('Guerrero 3');
  // multiclase: a mago 1, con sus trucos nuevos
  await page.getByRole('button', { name: 'Subir de nivel' }).click();
  await dlg.getByLabel('O multiclasear en otra clase').selectOption({ label: 'Mago (nivel 1)' });
  await expect(dlg).toContainText('Requisito de multiclase');
  await expect(dlg).toContainText('Ganas 3 trucos');
  await dlg.locator('.lvl-spells .chip').first().click();
  await dlg.getByRole('button', { name: 'Confirmar: subir a nivel 4' }).click();
  await expect(page.locator('.pc-head')).toContainText('Guerrero 3 (Campeón) / Mago 1');
});

test('subir de nivel: elecciones de clase o subclase y cambiar un conjuro', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Ilsa');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Clérigo' });
  await page.getByLabel('Nivel', { exact: true }).fill('6');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByLabel(/^Buscar conjuro/).fill('escudo de fe');
  await page.locator('.ce-spell-results .chip', { hasText: /^\+ Escudo de fe 1$/ }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  await page.getByRole('button', { name: 'Subir de nivel' }).click();
  const dlg = page.getByRole('dialog', { name: 'Subir a nivel 7' });
  // Golpes benditos (clérigo 7): se elige aquí
  await expect(dlg).toContainText('Golpes benditos: 1 más');
  await dlg.getByLabel('Golpes benditos').selectOption('Golpe divino');
  // el clérigo cambia un truco al subir; sus conjuros, tras un descanso largo
  await expect(dlg.getByLabel('Conjuro que cambias')).toHaveCount(0);
  await expect(dlg).toContainText('tras un descanso largo');
  await dlg.getByRole('button', { name: 'Confirmar: subir a nivel 7' }).click();
  await expect(page.locator('.pc-head')).toContainText('Clérigo 7');
  // descanso largo: quitar Escudo de fe y preparar otro
  const rest = page.getByRole('region', { name: 'Estados y descansos' });
  await rest.getByRole('button', { name: 'Descanso largo' }).click();
  await rest.getByRole('button', { name: '¿Seguro? Descanso largo' }).click();
  const rd = page.getByRole('dialog', { name: 'Conjuros tras el descanso largo' });
  await rd.getByRole('button', { name: /^Escudo de fe/ }).click();
  const added = (await rd.locator('.swap-add .chip').first().textContent())!.replace(/^\+ /, '').replace(/ \d$/, '');
  await rd.locator('.swap-add .chip').first().click();
  await rd.getByRole('button', { name: 'Guardar cambios' }).click();
  const sp = page.locator('section[aria-label="Conjuros"]');
  await expect(sp.locator('.card', { hasText: 'Escudo de fe' })).toHaveCount(0);
  await expect(sp).toContainText(added);
  await expect(page.getByRole('button', { name: /^Golpe divino/ })).toBeVisible();
});

test('escudo en la CA, castigos desde el arma e invocaciones del brujo', async ({ page }) => {
  await page.goto('/#/jugador');
  const make = async (name: string, cls: string, lv: string, sub: string) => {
    await page.getByRole('button', { name: 'Nuevo personaje' }).click();
    await page.getByLabel('Nombre del personaje').fill(name);
    await page.getByLabel('Clase', { exact: true }).selectOption({ label: cls });
    await page.getByLabel('Nivel', { exact: true }).fill(lv);
    await page.getByLabel(/^Subclase/).selectOption({ label: sub });
    await page.getByRole('button', { name: /Matriz estándar/ }).click();
  };

  // paladín 5 con espada larga: escudo en mitad del combate y Castigo divino en el golpe
  await make('Aldo', 'Paladín', '5', 'Juramento de devoción');
  await page.getByLabel('Arma para añadir').selectOption({ label: 'Espada larga (1d8 cortante)' });
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const ac = page.locator('.pc-stats .stat', { hasText: 'CA' }).first();
  const acBefore = Number(await ac.locator('.stat-v').textContent());
  await ac.getByRole('button', { name: 'Escudo +2' }).click();
  await expect(ac.locator('.stat-v')).toHaveText(String(acBefore + 2));
  await ac.getByRole('button', { name: 'Escudo +2' }).click();
  await expect(ac.locator('.stat-v')).toHaveText(String(acBefore));

  const atk = page.locator('section[aria-label="Ataques"]');
  // Castigo del paladín: gratis una vez; luego con espacios de nivel 1 o 2
  const pick = atk.getByLabel('Espacio del castigo divino');
  await expect(pick.locator('option')).toHaveText(['Gratis · 2d8', 'Nivel 1 · 2d8', 'Nivel 2 · 3d8']);
  const sword = atk.locator('.pc-attack', { hasText: 'Espada larga' });
  await sword.getByRole('button', { name: '+ Divino 2d8' }).click();
  await expect(page.locator('.plaque-label')).toContainText('(castigo divino)');
  await expect(pick.locator('option')).toHaveText(['Nivel 1 · 2d8', 'Nivel 2 · 3d8']);
  await pick.selectOption({ label: 'Nivel 2 · 3d8' });
  await sword.getByRole('button', { name: '+ Divino 3d8' }).click();
  await expect(page.locator('.plaque-label')).toContainText('(castigo divino)');

  // brujo 5: invocaciones con requisitos y sus efectos
  await make('Nera', 'Brujo', '5', 'Patrón infernal');
  const inv = page.locator('details.picker', { hasText: 'Invocaciones arcanas' });
  await inv.locator(':scope > summary').click();
  await expect(inv.getByRole('button', { name: 'Hoja sedienta', exact: true })).toHaveCount(0);
  await inv.getByRole('button', { name: 'Pacto de la hoja', exact: true }).click();
  await expect(inv.getByRole('button', { name: 'Hoja sedienta', exact: true })).toBeVisible();
  await expect(inv.getByRole('button', { name: 'Hoja devoradora', exact: true })).toHaveCount(0); // nivel 12
  for (const n of ['Ráfaga agónica', 'Armadura de sombras', 'Castigo arcano']) await inv.getByRole('button', { name: n, exact: true }).click();
  await expect(inv.locator(':scope > summary')).toContainText('(4 de 5)');
  await page.getByLabel('Arma para añadir').selectOption({ label: 'Espada larga (1d8 cortante)' });
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await page.getByLabel(/^Buscar conjuro/).fill('descarga sobrenatural');
  await page.locator('.ce-spell-results .chip').first().click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  await expect(page.locator('.pc-stats .stat', { hasText: 'CA' }).first()).toContainText('Armadura de sombras');
  const blast = page.locator('section[aria-label="Conjuros"] .card', { hasText: 'Descarga sobrenatural' });
  await expect(blast.getByRole('button', { name: /^Daño 1d10\+\d fuerza/ })).toBeVisible();
  await expect(page.locator('section[aria-label="Ataques"]').getByRole('button', { name: '+ Arcano 4d8' })).toBeVisible();
  await expect(page.locator('.pc-features .card', { hasText: 'Ráfaga agónica' }).first()).toBeVisible();
});

test('rasgos con usos (Astucia mágica recupera espacios de pacto, Afinidad con la piedra) y pestañas de conjuros', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Brom');
  await page.getByLabel('Especie', { exact: true }).selectOption({ label: 'Enano' });
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Paladín' });
  await page.getByLabel('Nivel', { exact: true }).fill('3');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Añadir otra clase (multiclase)' }).click();
  await page.getByLabel('Otra clase').selectOption({ label: 'Brujo' });
  await page.getByLabel('Nivel en ella').fill('2');
  await page.getByLabel('Arma para añadir').selectOption({ label: 'Espada larga (1d8 cortante)' });
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  for (const q of ['descarga sobrenatural', 'maleficio', 'bendición']) {
    await page.getByLabel(/^Buscar conjuro/).fill(q);
    await page.locator('.ce-spell-results .chip').first().click();
  }
  await page.getByRole('button', { name: 'Listo' }).first().click();

  const uses = page.locator('section[aria-label="Rasgos con usos"]');
  await expect(uses.locator('.card', { hasText: 'Afinidad con la piedra' })).toBeVisible();
  const cunning = uses.locator('.card', { hasText: 'Astucia mágica' });
  await expect(cunning.getByRole('button', { name: 'Usar (no has gastado espacios de pacto)' })).toBeDisabled();
  // gasta los dos espacios de pacto y la Astucia mágica recupera uno (la mitad, redondeando arriba)
  const sp = page.locator('section[aria-label="Conjuros"]');
  const pact = sp.getByRole('group', { name: /^Espacios de pacto/ });
  for (let i = 0; i < 2; i++) await pact.getByRole('button', { name: 'Gastar uno' }).first().click();
  await expect(pact).toHaveAttribute('aria-label', 'Espacios de pacto: 0 de 2 disponibles');
  await cunning.getByRole('button', { name: 'Usar: recupera 1 espacio de pacto' }).click();
  await expect(cunning.getByRole('button', { name: /^Usar/ })).toBeDisabled();
  await expect(pact).toHaveAttribute('aria-label', 'Espacios de pacto: 1 de 2 disponibles');
  // los rasgos con usos no se repiten en «Rasgos y dotes»
  await expect(page.locator('section[aria-label="Rasgos y dotes"] .card', { hasText: 'Astucia mágica' })).toHaveCount(0);

  // Maleficio: etiqueta que se queda activa y suma su daño a cada golpe
  const sword = page.locator('section[aria-label="Ataques"] .pc-attack', { hasText: 'Espada larga' });
  const hexChip = page.locator('section[aria-label="Ataques"]').getByRole('button', { name: 'Maleficio +1d6' });
  await hexChip.click();
  for (let i = 0; i < 2; i++) {
    await sword.getByRole('button', { name: /^Daño 1d8/ }).click();
    await expect(page.locator('.plaque-label')).toContainText('maleficio');
  }
  await expect(hexChip).toHaveAttribute('aria-pressed', 'true'); // dura: no se apaga al tirar
  await hexChip.click();
  // pestañas: por clase y por nivel
  await sp.getByRole('tab', { name: 'Brujo' }).click();
  await expect(sp.locator('.card', { hasText: 'Maleficio' })).toBeVisible();
  await expect(sp.locator('.card', { hasText: 'Bendición' })).toHaveCount(0);
  await sp.getByRole('tab', { name: /^Trucos/ }).click();
  await expect(sp.locator('.card', { hasText: 'Descarga sobrenatural' })).toBeVisible();
  await expect(sp.locator('.card', { hasText: 'Maleficio' })).toHaveCount(0);
  await sp.getByRole('tab', { name: 'Todas las clases' }).click();
  await sp.getByRole('tab', { name: /^Todos/ }).click();
  await expect(sp.locator('.card', { hasText: 'Bendición' })).toBeVisible();
});

test('paladín y brujo: los dos castigos a la vez desde el arma', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Vael');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Paladín' });
  await page.getByLabel('Nivel', { exact: true }).fill('5');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Añadir otra clase (multiclase)' }).click();
  await page.getByLabel('Otra clase').selectOption({ label: 'Brujo' });
  await page.getByLabel('Nivel en ella').fill('5');
  const inv = page.locator('details.picker', { hasText: 'Invocaciones arcanas' });
  await inv.locator(':scope > summary').click();
  for (const n of ['Pacto de la hoja', 'Castigo arcano']) await inv.getByRole('button', { name: n, exact: true }).click();
  await page.getByLabel('Arma para añadir').selectOption({ label: 'Espada larga (1d8 cortante)' });
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const sword = page.locator('section[aria-label="Ataques"] .pc-attack', { hasText: 'Espada larga' });
  await sword.getByRole('button', { name: '+ Ambos castigos' }).click();
  await expect(page.locator('.plaque-label')).toContainText('(castigo divino, castigo arcano)');
});

test('en la hoja del jugador la ventaja de la mesa de dados se queda puesta', async ({ page }) => {
  test.skip(test.info().project.name !== 'escritorio');
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Edda');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Paladín' });
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByLabel('Arma para añadir').selectOption({ label: 'Espada larga (1d8 cortante)' });
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const adv = page.getByRole('button', { name: 'Ventaja', exact: true });
  await adv.click();
  const atk = page.locator('section[aria-label="Ataques"] .pc-attack', { hasText: 'Espada larga' }).getByRole('button', { name: /^Ataque/ });
  for (let i = 0; i < 2; i++) {
    await atk.click();
    await expect(page.locator('.plaque-label')).toContainText('ataque');
    await expect(adv).toHaveAttribute('aria-pressed', 'true');
  }
});
