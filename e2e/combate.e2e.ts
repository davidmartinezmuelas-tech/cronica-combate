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
  await expect(sheet.locator('summary', { hasText: 'Segundo aliento' })).toBeVisible();
  await expect(sheet.locator('summary', { hasText: 'Crítico mejorado' })).toBeVisible();

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
  await expect(sheet.locator('summary', { hasText: 'Castigo Divino' })).toBeVisible();
  await expect(sheet.locator('summary', { hasText: 'Protección' })).toContainText('Estilo de combate');
  // con otra subclase no salen los rasgos de la del SRD
  await expect(sheet.locator('summary', { hasText: 'Juramento de devoción' })).toHaveCount(0);
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
  await expect(sheet.locator('summary', { hasText: 'Luz guía' })).toContainText('Juramento del faro 3');
  await expect(sheet.locator('summary', { hasText: 'Aura del faro' })).toHaveCount(0); // es de nivel 7
  await expect(sheet.locator('summary', { hasText: 'Vigía nocturno' })).toContainText('Dote de origen');
  await expect(sheet.locator('summary', { hasText: 'Rayo de faro' })).toBeVisible();
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
  await expect(sheet.locator('.pc-features summary', { hasText: 'Beta' }).first()).toBeVisible();
  await expect(sheet.locator('.pc-skill', { hasText: 'Historia' }).locator('.dot')).toHaveClass(/on/);

  // las maniobras se usan desde la hoja: cada tirada gasta un dado de supremacía
  const man = sheet.locator('section[aria-label="Maniobras"]');
  await expect(man).toContainText('Dados de supremacía: 4 de 4 (d8)');
  await expect(man.locator('summary', { hasText: 'Alfa' })).toContainText('CD 10 Fuerza');
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
  await expect(sheet.locator('summary', { hasText: 'Manos ardientes' })).toContainText('Subclase · siempre preparado');
  await page.getByRole('button', { name: 'Editar hoja' }).click();
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Explorador' });
  await page.getByLabel('Subclase (desde el nivel 3)').selectOption({ label: 'Cazador' });
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const prey = sheet.getByLabel('Presa del cazador');
  await expect(prey.locator('option')).toHaveCount(3);
  await prey.selectOption({ index: 1 });
  await expect(sheet.locator('.pc-features summary').filter({ hasText: 'Presa del cazador' }).first()).toBeVisible();
});
