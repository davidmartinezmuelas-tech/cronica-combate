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

/** Abre Ajustes (encabezado) y devuelve su ventana. */
async function settings(page: Page) {
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  return page.getByRole('dialog', { name: 'Ajustes' });
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
  await page.waitForTimeout(1500);
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
  await page.getByRole('button', { name: 'Encuentros preparados' }).click();
  await page.getByRole('button', { name: 'Emboscada' }).click(); // la etiqueta del encuentro se despliega
  await expect(page.locator('.enc-items')).toContainText('3 × Guerrero goblin');
  await page.getByRole('button', { name: 'Cargar' }).click();
  await expect(page.locator('.init-row')).toHaveCount(3);
});

test('guion de la sesión: se sube un texto y el nombre de un encuentro lleva al combate con él cargado', async ({ page }) => {
  await open(page);
  await addMonsters(page, 'guerrero goblin', 'Guerrero goblin', 3);
  await page.getByRole('button', { name: 'Combate', exact: true }).click();
  await page.getByLabel('Guardar los monstruos actuales como').fill('Emboscada del puente');
  await page.getByRole('button', { name: 'Guardar encuentro' }).click();
  await page.getByRole('button', { name: 'Vaciar encuentro' }).click();
  await page.getByRole('button', { name: '¿Seguro? Pulsa otra vez' }).click();
  await expect(page.locator('.init-row')).toHaveCount(0);

  await page.getByRole('button', { name: 'Guion', exact: true }).click();
  await page.getByLabel('Subir guion (.txt o .md)').setInputFiles({ name: 'sesion1.txt', mimeType: 'text/plain', buffer: Buffer.from(['Los jugadores salen de la posada.', 'En el camino, la Emboscada del puente.', 'Fin.'].join('\n'), 'utf8') });
  await expect(page.getByRole('button', { name: 'sesion1' })).toBeVisible();
  await expect(page.getByText('Los jugadores salen de la posada.')).toBeVisible();
  // sobrevive a una recarga
  await page.waitForTimeout(1500);
  await page.reload();
  await page.getByRole('button', { name: 'Guion', exact: true }).click();
  await page.getByRole('button', { name: 'sesion1' }).click();
  await page.locator('.script-combat-btn', { hasText: 'Emboscada del puente' }).click(); // la subcarpeta del guion en la lista de la izquierda
  await expect(page.locator('.init-row')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Combate', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('guion de la sesión: las tiradas del texto se tiran en la mesa como los ataques', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Guion', exact: true }).click();
  await page.getByLabel('Subir guion (.txt o .md)').setInputFiles({ name: 'trampa.md', mimeType: 'text/markdown', buffer: Buffer.from(['La trampa del pasillo hace 2d6 de fuego.', '', 'Oír el mecanismo: 1d20+3 de Percepción.'].join('\n'), 'utf8') });
  await page.getByRole('button', { name: '2d6 de fuego', exact: true }).click();
  await expect(page.locator('.plaque-label')).toHaveText('Guion · 2d6 de fuego');
  await page.getByRole('button', { name: '1d20+3', exact: true }).click();
  await expect(page.locator('.plaque-label')).toHaveText('Guion · 1d20+3');
});

test('guion de la sesión: «Cargar combates del guion» crea la criatura y el encuentro desde los bloques, y no duplica al repetir', async ({ page }) => {
  const F = '```';
  const md = [
    '## Combate 1', 'Los lobos atacan.', '', F + 'encuentro', 'formato: 1', 'nombre: Ronda de lobos', 'guarida: sí', '- 2 x Lobo del foso', '- 1 x Guerrero goblin', F, '', '## Fichas de combate', '',
    F + 'criatura', 'formato: 1', 'nombre: Lobo del foso', 'tamaño: Mediano', 'tipo: bestia', 'CA: 13', 'PG: 11 (2d8+2)', 'velocidad: 40 pies', 'características: FUE 12, DES 15, CON 12, INT 3, SAB 12, CAR 6',
    'CR: 1/4', 'XP: 50', 'competencia: +2', 'guarida: sí', '', 'acciones:', '- **Mordisco.** Ataque: +4. Impacto: 7 (2d4 + 2) de daño perforante. [atq +4; daño 2d4+2 perforante]', '',
    'acciones de guarida:', '- **Aullido.** Todos aúllan. [cd 11 SAB]', F,
  ].join('\n');
  await open(page);
  await page.getByRole('button', { name: 'Guion', exact: true }).click();
  await page.getByLabel('Subir guion (.txt o .md)').setInputFiles({ name: 'combate.md', mimeType: 'text/markdown', buffer: Buffer.from(md, 'utf8') });
  await page.getByRole('button', { name: 'Cargar combates del guion' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('Lobo del foso');
  await expect(dlg).toContainText('Ronda de lobos');
  await expect(dlg).toContainText('2 × Lobo del foso, 1 × Guerrero goblin');
  await dlg.getByRole('button', { name: 'Cargar', exact: true }).click();
  // los combates del guion salen como subcarpeta del guion en la lista de la izquierda; la criatura está en el bestiario con su guarida
  await page.locator('.script-combat-btn', { hasText: 'Ronda de lobos' }).click();
  await expect(page.locator('.init-row')).toHaveCount(4); // 2 lobos + goblin + tarjeta de guarida
  await page.getByRole('button', { name: 'Bestiario', exact: true }).click();
  await page.getByLabel('Buscar (español o inglés)').fill('lobo del foso');
  await page.locator('.beast', { hasText: 'Lobo del foso' }).first().click();
  await expect(page.getByText('Acciones de guarida')).toBeVisible();
  // repetir: actualiza, no duplica
  await page.getByRole('button', { name: 'Guion', exact: true }).click();
  await page.getByRole('button', { name: 'Cargar combates del guion' }).click();
  await expect(page.getByRole('dialog')).toContainText('Sobrescribe la ficha');
  await page.getByRole('dialog').getByRole('button', { name: 'Cargar', exact: true }).click();
  await page.getByRole('button', { name: 'Bestiario', exact: true }).click();
  await expect(page.locator('.beast', { hasText: 'Lobo del foso' })).toHaveCount(1);
});

test('guion de la sesión: un archivo que no es de texto se rechaza', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Guion', exact: true }).click();
  await page.getByLabel('Subir guion (.txt o .md)').setInputFiles({ name: 'sesion.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('x') });
  await expect(page.getByRole('alert')).toContainText('archivos de texto');
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

  // la preferencia está en Ajustes
  const dlg = await settings(page);
  await expect(dlg.getByLabel(/^Dados 3D/)).toBeChecked();
  await dlg.getByLabel(/^Dados 3D/).uncheck();
  await page.keyboard.press('Escape');
  await expect(page.locator('canvas.felt-3d')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tirar d20' }).click();
  await expect(page.locator('.die-spot')).toHaveCount(1);
  await page.waitForTimeout(600); // guardado automático
  await page.reload();
  await expect((await settings(page)).getByLabel(/^Dados 3D/)).not.toBeChecked(); // la preferencia se guarda
});

test('con «reducir movimiento» empiezan los dados 2D, pero se pueden activar los 3D', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await open(page);
  await expect(page.locator('canvas.felt-3d')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tirar d20' }).click();
  await expect(page.locator('.plaque-in')).toBeVisible();
  const dlg = await settings(page);
  const toggle = dlg.getByLabel(/^Dados 3D/);
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.keyboard.press('Escape');
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
  await expect(page.locator('.rule-entry.on .rule-title')).toContainText('Ataques de oportunidad');
  const search = page.getByLabel('Buscar (español o inglés)');
  await search.fill('prone');
  await page.locator('.rule-item').first().click();
  await expect(page.locator('.rule-entry.on .rule-title')).toContainText('Derribado');
  await page.locator('.rule-entry.on .rule-link', { hasText: 'Velocidad' }).first().click();
  await expect(page.locator('.rule-entry.on .rule-title')).toContainText('Velocidad');
  await page.getByRole('button', { name: '← Atrás' }).click();
  await expect(page.locator('.rule-entry.on .rule-title')).toContainText('Derribado');
  await search.fill('bola de fuego');
  await page.locator('.rule-item').first().click();
  await expect(page.locator('.rule-entry.on')).toContainText('Conjuro de nivel 3 de evocación');

  // desde el combate: el estado «Apresado» abre su regla (el SRD traducido lo llamaba «Restringido»)
  await addMonsters(page, 'guerrero goblin', 'Guerrero goblin', 1);
  await page.getByRole('button', { name: 'Combate', exact: true }).click();
  await page.locator('.init-row', { hasText: 'Guerrero goblin' }).click();
  await page.locator('.combatant-card summary', { hasText: 'Estados' }).click(); // los estados van en un desplegable
  await page.getByRole('button', { name: 'Apresado', exact: true }).click();
  await expect(page.locator('.combatant-card summary', { hasText: 'Estados' })).toContainText('Apresado');
  await page.getByTitle('Ver la regla completa de Apresado').click();
  await expect(page.locator('.rule-entry.on .rule-title')).toContainText('Apresado');
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
  await settings(page);
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
  await expect(page.locator('.rule-entry.on .rule-title')).toContainText('Derribado');

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
  await expect(sheet.locator('.stat-hp .stat-v')).toHaveText('28');
  await expect(sheet.locator('.stat-hp .stat-max')).toHaveText('28');
  await sheet.getByRole('button', { name: 'Ataque +4' }).click();
  await expect(page.locator('.plaque-label')).toContainText('Brakka · Espada larga: ataque', { timeout: 15000 });
  await expect(sheet.getByRole('button', { name: /Daño 1d8\+2 cortante/ })).toBeVisible();
  const traits = sheet.locator('section[aria-label="Rasgos y dotes"]');
  await expect(traits.locator('.card', { hasText: 'Segundo aliento' })).toBeVisible();
  await expect(traits.locator('.card', { hasText: 'Crítico mejorado' })).toBeVisible();

  // PG: daño y curación
  await sheet.getByLabel('Cantidad de PG').fill('7');
  await sheet.getByRole('button', { name: 'Daño', exact: true }).click();
  await expect(sheet.locator('.stat-hp .stat-v')).toHaveText('21');
  await expect(sheet.locator('.stat-hp .stat-max')).toHaveText('28');

  // se guarda en el dispositivo
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.locator('.pc').getByRole('heading', { name: 'Brakka' })).toBeVisible();
  await expect(page.locator('.pc .stat-hp .stat-v')).toHaveText('21');
  await expect(page.locator('.pc .stat-hp .stat-max')).toHaveText('28');
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
  await page.getByRole('button', { name: 'Añadir conjuro' }).click();
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
  await expect(sheet.getByRole('group', { name: 'Estilo de combate' })).toContainText('Protección');
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
  await page.getByRole('button', { name: 'Añadir conjuro' }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const sheet = page.locator('.pc');
  await expect(sheet).toContainText('Paladín 3 (Juramento del faro) · Farero');
  await expect(sheet.getByRole('group', { name: 'Juramento del faro' }).locator('.card', { hasText: 'Luz guía' })).toContainText('3');
  await expect(sheet.locator('.card', { hasText: 'Aura del faro' })).toHaveCount(0); // es de nivel 7
  await expect(sheet.getByRole('group', { name: 'Dote de origen' })).toContainText('Vigía nocturno');
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
  await expect(page.getByText('Siempre preparados, sin contar', { exact: false })).toContainText('Manos ardientes');
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const burning = sheet.locator('.card', { hasText: 'Manos ardientes' });
  await burning.getByRole('button', { name: /^Manos ardientes/ }).click();
  await expect(burning).toContainText('Subclase · siempre preparado');
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
  await expect(page.locator('.stat-tmp')).toContainText('17');
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
  for (const f of ['Atacante salvaje', 'Combate con dos armas', 'Afortunado', 'Resistente', 'Matón de taberna']) { await page.locator('.chip', { hasText: f }).first().click(); await page.getByRole('button', { name: 'Elegir dote' }).click(); }
  await page.getByRole('button', { name: 'Listo' }).first().click();

  const atk = page.locator('section[aria-label="Ataques"]');
  const short = atk.locator('.pc-attack', { hasText: 'Espada corta' });
  await expect(short.getByRole('button', { name: /^Acción adicional 1d6\+\d perforante$/ })).toBeVisible();
  await atk.getByRole('button', { name: 'Atacante salvaje' }).click();
  await short.getByRole('button', { name: /^Daño / }).click();
  await expect(page.locator('.plaque-tags')).toContainText('Atacante salvaje');
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
  for (const f of ['Perforador', 'Don del ataque imparable', 'Duelo']) { await page.locator('.chip', { hasText: f }).first().click(); await page.getByRole('button', { name: 'Elegir dote' }).click(); }
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
  const missile = page.locator('section[aria-label="Conjuros"] .card', { hasText: 'Proyectil mágico' });
  await expect(missile).toContainText('libro');
  await missile.getByRole('button', { name: /^Proyectil mágico/ }).click();
  await expect(missile).toContainText('Subclase · en tu libro de conjuros');

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
  await expect(page.locator('.plaque-rows')).toContainText('Ataque furtivo');
  await expect(atk.getByRole('button', { name: 'Ataque furtivo +3d6' })).toHaveAttribute('aria-pressed', 'false');

  // bárbaro 9: entrar en Furia gasta un uso y suma +3 hasta que se apaga
  await make('Ruk', 'Bárbaro', '9', 'Hacha a dos manos (1d12 cortante)');
  await atk.getByRole('button', { name: 'Furia +3' }).click();
  await atk.locator('.pc-attack', { hasText: 'Hacha a dos manos' }).getByRole('button', { name: /^Daño/ }).click();
  await expect(page.locator('.plaque-rows')).toContainText('Furia');
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
    await page.getByRole('button', { name: 'Añadir conjuro' }).click();
  }
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const sp = page.locator('section[aria-label="Conjuros"]');
  const fireball = sp.locator('.card', { hasText: 'Bola de fuego' });
  // los conjuros van plegados: se despliegan al pulsarlos
  await fireball.getByRole('button', { name: /^Bola de fuego/ }).click();
  await expect(fireball).toContainText('CD 13 Destreza · mitad si supera');
  await expect(fireball.getByRole('button', { name: 'Daño 8d6 fuego' })).toBeVisible();
  await fireball.getByLabel('Nivel de espacio para Bola de fuego').selectOption('4');
  await fireball.getByRole('button', { name: 'Daño 9d6 fuego' }).click();
  await expect(page.locator('.plaque-label')).toContainText('Bola de fuego (nivel 4): daño');
  await fireball.getByRole('button', { name: 'Lanzar (gasta espacio de nivel 4)' }).click();
  await expect(fireball.getByRole('button', { name: 'Lanzar (gasta espacio de nivel 4)' })).toBeDisabled(); // solo tenía uno
  const bolt = sp.locator('.card', { hasText: 'Descarga de fuego' });
  await bolt.getByRole('button', { name: /^Descarga de fuego/ }).click();
  await expect(bolt.getByRole('button', { name: 'Ataque +5' })).toBeVisible();
  await expect(bolt.getByRole('button', { name: 'Daño 2d10 fuego' })).toBeVisible(); // nivel 5+: 2d10
  // uno abierto a la vez: abrir la Descarga plegó la Bola de fuego
  await expect(fireball.getByRole('button', { name: 'Ver texto' })).toHaveCount(0);
  await fireball.getByRole('button', { name: /^Bola de fuego/ }).click();
  await expect(bolt.getByRole('button', { name: 'Ver texto' })).toHaveCount(0);
  // el texto completo, en una ventana con «Ver texto»
  await fireball.getByRole('button', { name: 'Ver texto' }).click();
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
  await page.getByRole('button', { name: 'Añadir conjuro' }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  await page.getByLabel('Cantidad de PG').fill('5');
  await page.getByRole('button', { name: 'Daño', exact: true }).click();
  const cure = page.locator('section[aria-label="Conjuros"] .card', { hasText: 'Curar heridas' });
  await cure.getByRole('button', { name: /^Curar heridas/ }).click();
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
  // la cuenta está en Ajustes
  await (await settings(page)).getByRole('region', { name: 'Cuenta' }).getByRole('button', { name: 'Iniciar sesión' }).click();
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
  await expect(page.getByRole('dialog', { name: 'Ajustes' })).toHaveCount(0);
  await expect(page.locator('.app-header').getByRole('button', { name: 'Ajustes', exact: true })).toBeVisible();
});

test('cuenta en la pantalla de inicio y en el grupo del máster', async ({ page }) => {
  await page.goto('/#/inicio');
  const box = page.getByRole('region', { name: 'Cuenta' });
  await expect(box.getByRole('button', { name: 'Entrar con Google' })).toBeVisible();
  await expect(box).toContainText('tus criaturas, encuentros y grupo');
  await expect(box.getByRole('button', { name: 'Cancelar' })).toHaveCount(0);
  await page.getByRole('button', { name: /Soy el máster/ }).click();
  // en el modo máster, la cuenta está en Ajustes
  await expect((await settings(page)).getByRole('region', { name: 'Cuenta' }).getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
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
  await page.getByRole('button', { name: 'Añadir conjuro' }).click();
  const dlg = page.getByRole('dialog', { name: '¿Añadir un conjuro?' });
  await expect(dlg).toContainText('no lanza conjuros');
  await dlg.getByRole('button', { name: 'Cerrar' }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.locator('.chips .chip.on')).toHaveCount(0); // no se añadió
  await page.getByLabel(/^Buscar conjuro/).fill('luz');
  await page.locator('.ce-spell-results .chip').first().click();
  await page.getByRole('button', { name: 'Añadir conjuro' }).click();
  await dlg.getByRole('button', { name: 'Sí, añadirlo' }).click();
  await expect(page.locator('.chips .chip.on')).toHaveCount(1);
  // la segunda ya no pregunta
  await page.getByLabel(/^Buscar conjuro/).fill('mano');
  await page.locator('.ce-spell-results .chip').first().click();
  await page.getByRole('button', { name: 'Añadir conjuro' }).click();
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
  const hp = page.locator('.pc-stats .stat-hp .stat-v');
  const hpMax = page.locator('.pc-stats .stat-hp .stat-max');
  await expect(hp).toHaveText('10'); // d8 + CON 14
  await expect(hpMax).toHaveText('10');
  await page.getByRole('button', { name: 'Editar hoja' }).click();
  await page.getByLabel('Nivel', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Listo' }).first().click();
  await expect(hp).toHaveText('38');
  await expect(hpMax).toHaveText('38');
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
  await expect(page.locator('.pc-pb')).toContainText('+3');
  await expect(page.locator('.pc-stats')).toContainText('5d10 + 3d8');
  const sp = page.locator('section[aria-label="Conjuros"]');
  // paladín y brujo lanzan con Carisma: una sola línea de CD y ataque de conjuro
  await expect(sp.getByRole('button', { name: /^Ataque de conjuro/ })).toHaveCount(1);
  await expect(sp).toContainText('Carisma');
  await expect(sp).not.toContainText('(Paladín)');
  await expect(sp).toContainText('Magia de pacto (nivel 2)');
  // rasgos de las dos clases
  const traits = page.locator('section[aria-label="Rasgos y dotes"]');
  await expect(traits.locator('.card', { hasText: 'Imposición de manos' })).toBeVisible();
  await expect(traits.getByRole('group', { name: 'Brujo' })).toBeVisible();
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
  await expect(page.locator('.pc-stats .stat-ac')).toHaveAttribute('title', /Defensa sin armadura/);
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
  const hp = page.locator('.pc-stats .stat-hp .stat-v');
  const before = parseInt((await hp.textContent())!, 10);
  await page.getByLabel('Tipo de daño recibido').selectOption('cortante');
  await page.getByLabel('Cantidad de PG').fill('10');
  await page.getByRole('button', { name: 'Daño (mitad)' }).click();
  await expect(hp).toHaveText(String(before - 5));
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

test('visita guiada: se abre desde Ajustes, avanza, señala y se puede saltar', async ({ page }) => {
  await page.goto('/#/jugador');
  await (await settings(page)).getByRole('button', { name: 'Repetir la visita guiada' }).click();
  const tour = page.getByRole('dialog', { name: 'Visita guiada' });
  await expect(tour).toContainText('Paso 1 de 8');
  await expect(tour).toContainText('Tus personajes');
  await tour.getByRole('button', { name: 'Siguiente' }).click();
  await expect(tour).toContainText('Paso 2 de 8');
  await tour.getByRole('button', { name: 'Saltar visita' }).click();
  await expect(tour).toHaveCount(0);
  // máster: también con los atajos de teclado en el mismo menú
  await page.goto('/#/dm');
  await (await settings(page)).getByRole('button', { name: 'Repetir la visita guiada' }).click();
  await expect(page.getByRole('dialog', { name: 'Visita guiada' })).toContainText('Paso 1 de 8');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Visita guiada' })).toHaveCount(0);
  await (await settings(page)).getByRole('button', { name: 'Atajos de teclado' }).click();
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
  await expect(page.locator('.spell-counts')).toContainText('hasta el nivel 2');
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
  const hp = page.locator('.pc-stats .stat-hp .stat-max');
  const hpBefore = parseInt((await hp.textContent())!, 10);
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
  const hpAfter = parseInt((await hp.textContent())!, 10);
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
  await page.getByRole('button', { name: 'Añadir conjuro' }).click();
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
  await ac.getByRole('checkbox', { name: 'Escudo +2' }).click();
  await expect(ac.locator('.stat-v')).toHaveText(String(acBefore + 2));
  await ac.getByRole('checkbox', { name: 'Escudo +2' }).click();
  await expect(ac.locator('.stat-v')).toHaveText(String(acBefore));

  const atk = page.locator('section[aria-label="Ataques"]');
  // Castigo del paladín: gratis una vez; luego con espacios de nivel 1 o 2
  const pick = atk.getByLabel('Espacio del castigo');
  await expect(pick.locator('option')).toHaveText(['Gratis · 2d8', 'Nivel 1 · 2d8', 'Nivel 2 · 3d8']);
  const sword = atk.locator('.pc-attack', { hasText: 'Espada larga' });
  // el castigo se deja puesto en el arma y entra en su siguiente daño (y luego se quita)
  const smiteChip = sword.getByRole('button', { name: 'Divino +2d8' });
  await smiteChip.click();
  await expect(smiteChip).toHaveAttribute('aria-pressed', 'true');
  await sword.getByRole('button', { name: /^Daño/ }).click();
  await expect(page.locator('.plaque-rows')).toContainText('Castigo Divino');
  await expect(smiteChip).toHaveAttribute('aria-pressed', 'false');
  await expect(pick.locator('option')).toHaveText(['Nivel 1 · 2d8', 'Nivel 2 · 3d8']);
  await pick.selectOption({ label: 'Nivel 2 · 3d8' });
  await sword.getByRole('button', { name: 'Divino +3d8' }).click();
  await sword.getByRole('button', { name: /^Daño/ }).click();
  await expect(page.locator('.plaque-rows')).toContainText('Castigo Divino');

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
  await page.getByRole('button', { name: 'Añadir conjuro' }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  await expect(page.locator('.pc-stats .stat-ac')).toHaveAttribute('title', /Armadura de sombras/);
  const blast = page.locator('section[aria-label="Conjuros"] .card', { hasText: 'Descarga sobrenatural' });
  await blast.getByRole('button', { name: /^Descarga sobrenatural/ }).click();
  await expect(blast.getByRole('button', { name: /^Daño 1d10\+\d fuerza/ })).toBeVisible();
  await expect(page.locator('section[aria-label="Ataques"]').getByRole('button', { name: 'Arcano +4d8' })).toBeVisible();
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
    await page.getByRole('button', { name: 'Añadir conjuro' }).click();
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
    await expect(page.locator('.plaque-rows')).toContainText('Maleficio');
  }
  await expect(hexChip).toHaveAttribute('aria-pressed', 'true'); // dura: no se apaga al tirar
  await hexChip.click();
  // pestañas por clase; dentro, un bloque por nivel
  await sp.getByRole('tab', { name: 'Brujo' }).click();
  await expect(sp.locator('.card', { hasText: 'Maleficio' })).toBeVisible();
  await expect(sp.locator('.card', { hasText: 'Bendición' })).toHaveCount(0);
  await expect(sp.getByRole('group', { name: 'Trucos' })).toContainText('Descarga sobrenatural');
  await expect(sp.getByRole('group', { name: 'Trucos' })).not.toContainText('Maleficio');
  await sp.getByRole('tab', { name: 'Todas las clases' }).click();
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
  // los dos castigos puestos a la vez: entran en el mismo daño
  await sword.getByRole('button', { name: /^Divino \+/ }).click();
  await sword.getByRole('button', { name: /^Arcano \+/ }).click();
  await sword.getByRole('button', { name: /^Daño/ }).click();
  await expect(page.locator('.plaque-rows')).toHaveText(/Castigo Divino.*Castigo arcano/);
  // una fila por fuente: el arma, el castigo divino y el arcano
  const rows = page.locator('.plaque-rows li');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Espada larga');
  await expect(rows.nth(1)).toContainText('Castigo Divino');
  await expect(rows.nth(2)).toContainText('Castigo arcano');
  await page.locator('.plaque-more summary').click();
  await expect(page.locator('.plaque-more .plaque-detail')).toBeVisible();
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

test('multiclase: cada clase prepara sus conjuros, hasta su nivel, y se eligen por pestañas', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Sera');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Paladín' });
  await page.getByLabel('Nivel', { exact: true }).fill('3');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Añadir otra clase (multiclase)' }).click();
  await page.getByLabel('Otra clase').selectOption({ label: 'Brujo' });
  await page.getByLabel('Nivel en ella').fill('5');
  const counts = page.locator('.spell-counts');
  const pal = counts.locator('.spell-count-row', { hasText: 'Paladín 3' });
  const war = counts.locator('.spell-count-row', { hasText: 'Brujo 5' });
  await expect(pal).toContainText('Conjuros preparados 0 de 4');
  await expect(pal).toContainText('hasta el nivel 1');
  await expect(war).toContainText('Trucos 0 de 3');
  await expect(war).toContainText('Conjuros preparados 0 de 6');
  await expect(war).toContainText('hasta el nivel 3');
  // Aura de vitalidad es de nivel 3 de paladín: un paladín 3 no la puede preparar
  await page.getByLabel(/^Buscar conjuro/).fill('aura de vitalidad');
  await expect(page.locator('.ce-spell-results .chip')).toHaveCount(0);
  // Castigo divino (siempre preparado por Castigo del paladín) no cuenta; Bendición cuenta para el paladín
  for (const q of ['castigo divino', 'bendición']) {
    await page.getByLabel(/^Buscar conjuro/).fill(q);
    await page.locator('.ce-spell-results .chip').first().click();
    await page.getByRole('button', { name: 'Añadir conjuro' }).click();
  }
  await expect(pal).toContainText('Conjuros preparados 1 de 4');
  // por pestañas: brujo, trucos
  await page.getByRole('tab', { name: 'Brujo' }).click();
  await page.getByRole('tab', { name: 'Trucos' }).click();
  await page.locator('.ce-spell-results .chip', { hasText: 'Descarga sobrenatural' }).click();
  await page.getByRole('button', { name: 'Añadir conjuro' }).click();
  await expect(war).toContainText('Trucos 1 de 3');
  // los elegidos siguen las pestañas
  const chosen = page.locator('.ce-chosen');
  await expect(chosen.locator('.chip')).toHaveText(['Descarga sobrenatural ✕']);
  await page.getByRole('tab', { name: 'Paladín' }).click();
  await expect(chosen.locator('.chip', { hasText: 'Bendición' })).toBeVisible();
  await expect(chosen.locator('.chip', { hasText: 'Castigo Divino' })).toContainText('ya preparado');
  await expect(chosen.locator('.chip', { hasText: 'Descarga sobrenatural' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Brujo' }).click();
  await page.getByRole('tab', { name: 'Nivel 3' }).click();
  await page.locator('.ce-spell-results .chip', { hasText: 'Disipar magia' }).click();
  await page.getByRole('button', { name: 'Añadir conjuro' }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  // en la hoja: Disipar magia es del brujo (el paladín 3 no llega a nivel 3) y Castigo divino, siempre preparado
  const sheetSp = page.locator('section[aria-label="Conjuros"]');
  await sheetSp.getByRole('tab', { name: 'Paladín' }).click();
  await expect(sheetSp.locator('.card', { hasText: 'Disipar magia' })).toHaveCount(0);
  const smiteRow = sheetSp.locator('.card', { hasText: 'Castigo Divino' });
  await smiteRow.getByRole('button', { name: /^Castigo Divino/ }).click();
  await expect(smiteRow).toContainText('Paladín · siempre preparado');
  await expect(sheetSp.getByRole('group', { name: 'Conjuros de nivel 3' })).toHaveCount(0);
  await sheetSp.getByRole('tab', { name: 'Brujo' }).click();
  await expect(sheetSp.locator('.card', { hasText: 'Disipar magia' })).toBeVisible();
  await page.getByRole('button', { name: 'Editar hoja' }).click();
  await page.getByRole('tab', { name: 'Nivel 3' }).click();
  await expect(page.locator('.ce-spell-results .chip', { hasText: /Contrahechizo/ })).toBeVisible();
});

test('conjuros de golpe: Favor divino se queda activo y los castigos se eligen junto al arma', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Ilda');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Paladín' });
  await page.getByLabel('Nivel', { exact: true }).fill('5');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByLabel('Arma para añadir').selectOption({ label: 'Espada larga (1d8 cortante)' });
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  for (const q of ['favor divino', 'castigo abrasador', 'arma mágica']) {
    await page.getByLabel(/^Buscar conjuro/).fill(q);
    await page.locator('.ce-spell-results .chip').first().click();
    await page.getByRole('button', { name: 'Añadir conjuro' }).click();
  }
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const atk = page.locator('section[aria-label="Ataques"]');
  const sword = atk.locator('.pc-attack', { hasText: 'Espada larga' });
  // Favor divino: etiqueta que se queda activa y suma 1d4 radiante en cada golpe
  const favor = atk.getByRole('button', { name: 'Favor divino +1d4' });
  await favor.click();
  await sword.getByRole('button', { name: /^Daño 1d8/ }).click();
  await expect(page.locator('.plaque-rows')).toContainText('Favor divino');
  await expect(favor).toHaveAttribute('aria-pressed', 'true');
  // Arma mágica: +1 al ataque mientras dura
  const atkBtn = sword.getByRole('button', { name: /^Ataque/ });
  const before = Number((await atkBtn.textContent())!.replace(/[^\d-]/g, ''));
  await atk.getByRole('button', { name: 'Arma mágica +1' }).click();
  await expect(atkBtn).toHaveText('Ataque +' + (before + 1));
  // castigos: se elige cuál y con qué espacio
  await atk.getByLabel('Castigo', { exact: true }).selectOption({ label: 'Castigo abrasador' });
  await sword.getByRole('button', { name: 'Abrasador +1d6' }).click();
  await sword.getByRole('button', { name: /^Daño/ }).click();
  await expect(page.locator('.plaque-rows')).toContainText('Castigo abrasador');
  await atk.getByLabel('Castigo', { exact: true }).selectOption({ label: 'Castigo Divino' });
  await expect(sword.getByRole('button', { name: 'Divino +2d8' })).toBeVisible();
});

test('subir de nivel con PG fijados a mano, habilidades por característica y concentración', async ({ page }) => {
  test.slow(); // varios pasos con tiradas y ventanas
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Tamsin');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Explorador' });
  await page.getByLabel('Nivel', { exact: true }).fill('2');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  for (const q of ['marca del cazador', 'detectar magia']) {
    await page.getByLabel(/^Buscar conjuro/).fill(q);
    await page.locator('.ce-spell-results .chip').first().click();
    await page.getByRole('button', { name: 'Añadir conjuro' }).click();
  }
  await page.getByLabel('Arma para añadir').selectOption({ label: 'Espada larga (1d8 cortante)' });
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  // PG máximos fijados a mano (como al importar la hoja en PDF)
  await page.locator('#ov-hpMax').fill('30');
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const hpStat = page.locator('.pc-stats .stat', { hasText: 'PG' }).first();
  await expect(hpStat.locator('.stat-max')).toHaveText('30');

  // habilidades dentro de su característica
  const str = page.locator('.pc-abil', { hasText: 'FUE' });
  await expect(str.locator('.pc-skill', { hasText: 'Atletismo' })).toBeVisible();
  await expect(str.getByRole('button', { name: /^Salvación de Fuerza/ })).toBeVisible();
  await expect(page.locator('.pc-abil', { hasText: 'DES' }).locator('.pc-skill', { hasText: 'Sigilo' })).toBeVisible();

  // subir de nivel: el máximo fijado a mano sube lo que se gana
  await page.getByRole('button', { name: 'Subir de nivel' }).click();
  await page.getByRole('button', { name: /^Confirmar: subir a nivel 3/ }).click();
  await expect(hpStat.locator('.stat-max')).not.toHaveText('30');
  const max = Number((await hpStat.locator('.stat-max').textContent())!.replace(/\D/g, ''));
  expect(max).toBeGreaterThan(30);

  // concentración: Marca del cazador desde Ataques, daño y salvación
  await page.locator('section[aria-label="Ataques"]').getByRole('button', { name: /^Marca del cazador/ }).click();
  await expect(page.locator('.pc-conc')).toHaveText('Concentración: Marca del cazador ✕');
  await page.getByLabel('Cantidad de PG').fill('6');
  await page.getByRole('button', { name: 'Daño', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Salvación de concentración' });
  await expect(dlg).toContainText('CD 10');
  await dlg.getByRole('button', { name: /^Tirar salvación/ }).click();
  await expect(page.locator('.plaque-note')).toContainText('concentración en Marca del cazador', { timeout: 15000 });
  await expect(dlg).toHaveCount(0);
  // (la tirada puede salir bien o mal): se apaga la marca si sigue activa, y sin concentración no hay indicador
  const mark = page.locator('section[aria-label="Ataques"]').getByRole('button', { name: /^Marca del cazador/ });
  if ((await mark.getAttribute('aria-pressed')) === 'true') await mark.click();
  await expect(page.locator('.pc-conc')).toHaveCount(0);
  // lanzar un conjuro de concentración la empieza; activar la marca la cambia
  const detect = page.locator('section[aria-label="Conjuros"] .card', { hasText: 'Detectar magia' });
  await detect.getByRole('button', { name: /^Detectar magia/ }).click();
  await detect.getByRole('button', { name: /^Lanzar/ }).click();
  await expect(page.locator('.pc-conc')).toHaveText('Concentración: Detectar magia ✕');
  await mark.click();
  await expect(page.locator('.pc-conc')).toHaveText('Concentración: Marca del cazador ✕');
});

test('subir de nivel: la vista previa de PG cuenta la Dureza enana y coincide con la hoja', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Dorn');
  await page.getByLabel('Especie', { exact: true }).selectOption({ label: 'Enano' });
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Guerrero' });
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const hpStat = page.locator('.pc-stats .stat', { hasText: 'PG' }).first();
  const maxNow = Number((await hpStat.locator('.stat-max').textContent())!.replace(/\D/g, ''));
  await page.getByRole('button', { name: 'Subir de nivel' }).click();
  const dlg = page.getByRole('dialog', { name: 'Subir a nivel 2' });
  const m = /PG máximos: (\d+) → (\d+)/.exec((await dlg.textContent()) || '');
  expect(Number(m![1])).toBe(maxNow);
  // guerrero d10: media 6 + Constitución + 1 de la Dureza enana
  const con = Number((await page.locator('.pc-abil').filter({ has: page.locator('.pc-abil-s', { hasText: /^CON$/ }) }).locator('.pc-abil-mod b').textContent())!.replace('−', '-'));
  expect(Number(m![2]) - maxNow).toBe(6 + con + 1);
  await dlg.getByRole('button', { name: /^Confirmar: subir a nivel 2/ }).click();
  await expect(hpStat.locator('.stat-max')).toContainText(m![2]);
});

test('salvaciones contra la muerte: los círculos se marcan y desmarcan a mano', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Bruna');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const box = page.locator('.stat-death');
  // un golpe estando en el suelo: marcar un fallo; con crítico, el segundo
  await box.getByRole('button', { name: 'Fallos: 1' }).click();
  await expect(box.locator('.pip.bad')).toHaveCount(1);
  await box.getByRole('button', { name: 'Fallos: 2' }).click();
  await expect(box.locator('.pip.bad')).toHaveCount(2);
  // pulsar el último marcado lo quita
  await box.getByRole('button', { name: 'Fallos: 2' }).click();
  await expect(box.locator('.pip.bad')).toHaveCount(1);
  await box.getByRole('button', { name: 'Éxitos: 3' }).click();
  await expect(box.locator('.pip.ok')).toHaveCount(3);
});

test('PX: muestra los del siguiente nivel y resalta «Subir de nivel» al alcanzarlos', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Tomás');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const lv = page.locator('.stat-lv');
  await expect(lv).toContainText('sig.: 300');
  await expect(page.getByRole('button', { name: 'Subir de nivel', exact: true })).toBeVisible();
  await page.getByLabel('Puntos de experiencia').fill('300');
  await expect(page.getByRole('button', { name: '¡Subir de nivel!' })).toBeVisible();
});

test('Ajustes en la cabecera: cuenta, copia, modo, preferencias, ayuda y acerca de; y el botón de apoyo', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Bestiario', exact: true }).click();
  await expect(page.locator('.app-header').getByRole('link', { name: 'Apoyar el proyecto en Ko-fi' })).toHaveAttribute('href', 'https://ko-fi.com/zmuelas');
  const dlg = await settings(page);
  for (const sec of ['Cuenta', 'Copia de seguridad', 'Modo', 'Preferencias', 'Ayuda', 'Acerca de']) await expect(dlg.getByRole('region', { name: sec })).toBeVisible();
  await expect(dlg.getByRole('button', { name: 'Atajos de teclado' })).toBeVisible();
  await expect(dlg.getByRole('button', { name: 'Descargar copia' })).toBeVisible();
  await expect(dlg.getByRole('button', { name: 'Cargar copia…' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  // en Grupo ya no está: solo un aviso de dónde encontrarla
  await page.getByRole('button', { name: 'Grupo', exact: true }).click();
  await expect(page.locator('.group-panel').getByRole('button', { name: 'Descargar copia' })).toHaveCount(0);
});

test('recarga: la etiqueta tira el d6 cuando la habilidad está gastada', async ({ page }) => {
  await open(page);
  await addMonsters(page, 'ankheg', 'Ankheg', 1);
  await page.getByRole('button', { name: 'Combate', exact: true }).click();
  await page.locator('.init-row', { hasText: 'Ankheg' }).first().click();
  const tag = page.locator('.statblock').getByRole('button', { name: 'Recarga 6' });
  await expect(tag).toBeDisabled();
  await page.locator('.statblock').getByRole('button', { name: 'Disponible' }).click();
  await expect(tag).toBeEnabled();
  await tag.click();
  await expect(page.locator('.plaque-label')).toContainText('Recarga · Ankheg', { timeout: 15000 });
});

test('botón para apoyar el proyecto en la cabecera de los dos modos', async ({ page }) => {
  for (const url of ['/#/dm', '/#/jugador']) {
    await page.goto(url);
    const link = page.getByRole('link', { name: 'Apoyar el proyecto en Ko-fi' });
    await expect(link).toHaveAttribute('href', 'https://ko-fi.com/zmuelas');
    await expect(link).toHaveAttribute('target', '_blank');
  }
});

test('pie: privacidad y aviso legal (también con #/privacidad) y enlace de sugerencias', async ({ page }) => {
  await page.goto('/#/inicio');
  await page.getByRole('button', { name: 'Privacidad y aviso legal' }).click();
  const dlg = page.getByRole('dialog', { name: 'Privacidad y aviso legal' });
  await expect(dlg).toContainText('hola@cronicadecombate.com');
  await expect(dlg).toContainText('Borrar mi cuenta');
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Enviar sugerencia o fallo' })).toHaveAttribute('href', /^mailto:hola@cronicadecombate\.com\?subject=/);
  await page.goto('/#/privacidad');
  await expect(page.getByRole('dialog', { name: 'Privacidad y aviso legal' })).toBeVisible();
});

test('móvil: la hoja del jugador en pestañas, barra con PG y CA, y características en orden', async ({ page }) => {
  test.skip(test.info().project.name !== 'escritorio');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Mira');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Paladín' });
  await page.getByLabel('Nivel', { exact: true }).fill('5');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  // en el editor no hay pestañas
  await expect(page.locator('.pc-tabbar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const bar = page.locator('.pc-tabbar');
  await expect(bar.getByRole('button')).toHaveText(['Combate', 'Tiradas', 'Conjuros', 'Rasgos', 'Sala']);
  // combate: ataques a la vista, características no
  await expect(page.locator('section[aria-label="Ataques"]')).toBeVisible();
  await expect(page.locator('section[aria-label="Características"]')).toBeHidden();
  // al bajar, la barra de arriba con PG y CA
  await expect(page.locator('.pc-mini')).toHaveCount(0);
  await page.locator('section[aria-label="Estados y descansos"]').scrollIntoViewIfNeeded();
  await expect(page.locator('.pc-mini')).toContainText('PG');
  // tiradas: las seis características seguidas y después inspiración y competencias
  await bar.getByRole('button', { name: 'Tiradas' }).click();
  await expect(page.locator('section[aria-label="Ataques"]')).toBeHidden();
  const y = async (sel: string) => (await page.locator(sel).first().boundingBox())!.y;
  expect(await y('.pc-abil[data-abil=cha]')).toBeLessThan(await y('.pc-extra'));
  expect(await y('.pc-abil[data-abil=int]')).toBeGreaterThan(await y('.pc-abil[data-abil=con]'));
  await bar.getByRole('button', { name: 'Conjuros' }).click();
  await expect(page.locator('section[aria-label="Conjuros"]')).toBeVisible();
  await bar.getByRole('button', { name: 'Rasgos' }).click();
  await expect(page.locator('section[aria-label="Rasgos y dotes"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar copia' })).toBeVisible();
  await bar.getByRole('button', { name: 'Sala' }).click();
  await expect(page.getByRole('button', { name: 'Entrar en una sala' })).toBeVisible();
  await expect(page.locator('section[aria-label="Rasgos y dotes"]')).toBeHidden();
  await bar.getByRole('button', { name: 'Combate' }).click();
  await expect(page.locator('section[aria-label="Ataques"]')).toBeVisible();
});

test('conjuros siempre preparados de clase y aviso si la subclase de la biblioteca no está en el dispositivo', async ({ page }) => {
  await page.goto('/#/jugador');
  // explorador 1: Marca del cazador sin elegirla (Enemigo predilecto)
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Vera');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Explorador' });
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await expect(page.getByText('Siempre preparados, sin contar', { exact: false })).toContainText('Marca del cazador');
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const mark = page.locator('section[aria-label="Conjuros"] .card', { hasText: 'Marca del cazador' });
  await expect(mark).toContainText('siempre');
  await expect(page.locator('section[aria-label="Ataques"]').getByRole('button', { name: /^Marca del cazador/ })).toBeVisible();

  // paladín 3 con una subclase que no está en la biblioteca de este dispositivo: aviso
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Harin');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Paladín' });
  await page.getByLabel('Nivel', { exact: true }).fill('3');
  await page.getByLabel(/^Subclase/).selectOption({ label: 'Otra (escríbela)' });
  await page.getByLabel('Nombre de la subclase').fill('Juramento de venganza');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  await expect(page.locator('section[aria-label="Rasgos y dotes"]')).toContainText('«Juramento de venganza» no está en la biblioteca de este dispositivo');
});

test('la copia de personajes puede llevar la biblioteca (subclase propia con sus conjuros) y se recupera al cargarla', async ({ page }) => {
  await page.goto('/#/jugador');
  // biblioteca inventada: una subclase de paladín con sus conjuros siempre preparados
  const lib = { app: 'cronica-combate', tipo: 'biblioteca', v: 1, source: 'Prueba', feats: [], backgrounds: [], spells: [], subclasses: [
    { id: 'sub-prueba', n: 'Juramento de prueba', cls: 'paladin', d: '', f: [{ lv: 3, n: 'Conjuros del juramento de prueba', d: 'Siempre tienes preparados estos conjuros. Nivel de paladín Conjuros 3 Marca del cazador, Perdición' }] },
  ] };
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByLabel('Archivo de biblioteca').setInputFiles({ name: 'lib.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(lib)) });
  await expect(page.getByText('Biblioteca cargada')).toBeVisible();
  await page.getByRole('button', { name: 'Mi personaje', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Harin');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Paladín' });
  await page.getByLabel('Nivel', { exact: true }).fill('3');
  await page.getByLabel(/^Subclase/).selectOption({ label: 'Juramento de prueba' });
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const spells = page.locator('section[aria-label="Conjuros"]');
  await expect(spells).toContainText('Marca del cazador');
  await expect(page.locator('section[aria-label="Ataques"]').getByRole('button', { name: /^Marca del cazador/ })).toBeVisible();

  // copia con la biblioteca
  await expect(page.getByLabel(/Incluir mi biblioteca/)).toBeChecked();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Guardar copia' }).click();
  const copy = Buffer.concat(await (await (await download).createReadStream()).toArray()).toString('utf8');
  expect(JSON.parse(copy).biblioteca.subclasses).toHaveLength(1);

  // sin la biblioteca: aviso y sin sus conjuros
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByRole('button', { name: 'Vaciar' }).click();
  await page.getByRole('button', { name: '¿Seguro? Vaciar' }).click();
  await page.getByRole('button', { name: 'Mi personaje', exact: true }).click();
  await expect(page.locator('section[aria-label="Rasgos y dotes"]')).toContainText('«Juramento de prueba» no está en la biblioteca de este dispositivo');
  await expect(page.locator('section[aria-label="Ataques"]').getByRole('button', { name: /^Marca del cazador/ })).toHaveCount(0);

  // al cargar la copia vuelve la biblioteca
  await page.getByLabel('Copia de personajes').setInputFiles({ name: 'copia.json', mimeType: 'application/json', buffer: Buffer.from(copy) });
  await expect(page.getByText('Biblioteca cargada')).toBeVisible();
  await expect(page.locator('section[aria-label="Ataques"]').getByRole('button', { name: /^Marca del cazador/ })).toBeVisible();
});

test('lanzar conjuros sobre ti: CA, PG máximos, PG temporales, Bendición y concentración', async ({ page }) => {
  test.slow();
  await page.goto('/#/jugador');
  const make = async (name: string, cls: string, lv: string, spells: string[]) => {
    await page.getByRole('button', { name: 'Nuevo personaje' }).click();
    await page.getByLabel('Nombre del personaje').fill(name);
    await page.getByLabel('Clase', { exact: true }).selectOption({ label: cls });
    await page.getByLabel('Nivel', { exact: true }).fill(lv);
    await page.getByRole('button', { name: /Matriz estándar/ }).click();
    for (const q of spells) { await page.getByLabel(/^Buscar conjuro/).fill(q); await page.locator('.ce-spell-results .chip', { hasText: new RegExp('^. ' + q, 'i') }).first().click(); await page.getByRole('button', { name: 'Añadir conjuro' }).click(); }
    await page.getByRole('button', { name: 'Listo' }).first().click();
  };
  const sp = page.locator('section[aria-label="Conjuros"]');
  const open = async (n: string) => { const row = sp.locator('.card', { hasText: n }).first(); await row.getByRole('button', { name: new RegExp('^' + n) }).click(); return row; };
  const ac = async () => Number(await page.locator('.stat-ac .stat-v').textContent());
  const active = page.getByLabel('Conjuros activos');

  // clérigo 3: Escudo de fe (+2 CA, concentración), Bendición la cambia, Auxilio sube los PG
  await make('Ilsa', 'Clérigo', '3', ['escudo de fe', 'bendición', 'auxilio']);
  const ac0 = await ac();
  await (await open('Escudo de fe')).getByRole('button', { name: /^Lanzar sobre mí/ }).click();
  await expect(page.locator('.stat-ac .stat-v')).toHaveText(String(ac0 + 2));
  await expect(active).toContainText('Escudo de fe');
  await expect(page.locator('.pc-conc')).toContainText('Escudo de fe');
  // otro conjuro de concentración: el escudo se acaba solo
  await (await open('Bendición')).getByRole('button', { name: /^Lanzar sobre mí/ }).click();
  await expect(page.locator('.stat-ac .stat-v')).toHaveText(String(ac0));
  await expect(active).toContainText('Bendición');
  await expect(active).not.toContainText('Escudo de fe');
  const hpMax0 = Number(await page.locator('.stat-hp .stat-max').textContent());
  await (await open('Auxilio')).getByRole('button', { name: /^Lanzar sobre mí/ }).click();
  await expect(page.locator('.stat-hp .stat-max')).toHaveText(String(hpMax0 + 5));
  await page.getByRole('button', { name: 'Terminar Auxilio' }).click();
  await expect(page.locator('.stat-hp .stat-max')).toHaveText(String(hpMax0));

  // mago 1: Armadura de mago (13 + Des), Escudo (+5) y Falsa vida (PG temporales)
  await make('Oren', 'Mago', '3', ['armadura de mago', 'escudo', 'falsa vida']);
  const dex = Number((await page.locator('.pc-abil[data-abil=dex] .pc-abil-mod b').textContent())!.replace('−', '-'));
  await (await open('Armadura de mago')).getByRole('button', { name: /^Lanzar sobre mí/ }).click();
  await expect(page.locator('.stat-ac .stat-v')).toHaveText(String(13 + dex));
  await (await open('Escudo')).getByRole('button', { name: /^Lanzar \(gasta/ }).click();
  await expect(page.locator('.stat-ac .stat-v')).toHaveText(String(18 + dex));
  await page.getByRole('button', { name: 'Terminar Escudo' }).click();
  await (await open('Falsa vida')).getByRole('button', { name: /^Lanzar \(gasta/ }).click();
  await expect(page.locator('.stat-hp .stat-tmp')).toBeVisible({ timeout: 15000 }); // PG temporales tirados
  // descanso largo: se acaban los efectos
  await page.getByRole('button', { name: 'Descanso largo' }).click();
  await page.getByRole('button', { name: '¿Seguro? Descanso largo' }).click();
  const swap = page.getByRole('dialog').getByRole('button', { name: /Cerrar|Listo|Hecho/ }).first();
  if (await swap.count()) await swap.click();
  await expect(active).toHaveCount(0);
  await expect(page.locator('.stat-ac .stat-v')).toHaveText(String(10 + dex));
});

test('conjuros de rasgos: invocaciones del brujo, legado de la especie e Iniciado en la magia, sin gastar espacio', async ({ page }) => {
  test.slow();
  await page.goto('/#/jugador');
  const sp = page.locator('section[aria-label="Conjuros"]');
  const row = (n: string) => sp.locator('.card', { hasText: n }).first();
  const open = async (n: string) => { await row(n).getByRole('button', { name: new RegExp('^' + n) }).click(); return row(n); };

  // brujo 5 con Vigor infernal: Falsa vida a voluntad, con los PG temporales al máximo (2d4+4 = 12)
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Nera');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Brujo' });
  await page.getByLabel('Nivel', { exact: true }).fill('5');
  const inv = page.locator('details.picker', { hasText: 'Invocaciones arcanas' });
  await inv.locator(':scope > summary').click();
  await inv.getByRole('button', { name: 'Vigor infernal', exact: true }).click();
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  await expect(row('Falsa vida')).toContainText('a voluntad');
  await (await open('Falsa vida')).getByRole('button', { name: 'Lanzar (a voluntad)' }).click();
  await expect(page.locator('.stat-hp .stat-tmp')).toHaveText('12');

  // tiflin infernal 5 (guerrero, sin conjuros de clase): Descarga de fuego, y Oscuridad una vez sin espacio
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Kael');
  await page.getByLabel('Especie', { exact: true }).selectOption({ label: 'Tiflin, infernal' });
  await page.getByLabel('Nivel', { exact: true }).fill('5');
  await expect(page.getByLabel('Característica para tus conjuros de especie')).toHaveValue(''); // sin elegir: la más alta
  await page.getByLabel('Característica para tus conjuros de especie').selectOption({ label: 'Carisma' });
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  for (const n of ['Taumaturgia', 'Descarga de fuego', 'Reprensión infernal', 'Oscuridad']) await expect(sp).toContainText(n);
  const dark = await open('Oscuridad');
  await dark.getByRole('button', { name: 'Lanzar sin espacio' }).click();
  await expect(dark).toContainText('0 de 1 sin espacio');
  await expect(dark.getByRole('button', { name: 'Lanzar sin espacio' })).toBeDisabled();

  // acólito (Iniciado en la magia de clérigo): se eligen los conjuros en el editor
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Tobías');
  await page.getByLabel('Trasfondo', { exact: true }).selectOption({ label: 'Acólito' });
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await expect(page.getByLabel('Lista de conjuros')).toBeDisabled();
  await page.getByLabel('Truco', { exact: true }).selectOption({ label: 'Luz' });
  await page.getByLabel(/^Conjuro de nivel 1/).selectOption({ label: 'Bendición' });
  await page.getByRole('button', { name: 'Listo' }).first().click();
  await expect(sp).toContainText('Luz');
  await (await open('Bendición')).getByRole('button', { name: 'Lanzar sin espacio' }).click();
  await expect(page.getByLabel('Conjuros activos')).toContainText('Bendición');
});

test('Pacto del tomo: tres trucos y dos rituales de cualquier lista, como conjuros de brujo', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Selene');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Brujo' });
  await page.getByLabel('Nivel', { exact: true }).fill('3');
  const inv = page.locator('details.picker', { hasText: 'Invocaciones arcanas' });
  await inv.locator(':scope > summary').click();
  await inv.getByRole('button', { name: 'Pacto del tomo', exact: true }).click();
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByLabel('Truco', { exact: true }).selectOption({ label: 'Guía' });
  await page.getByLabel('Segundo truco').selectOption({ label: 'Descarga de fuego' });
  await page.getByLabel('Tercer truco').selectOption({ label: 'Luz' });
  await page.getByLabel('Ritual de nivel 1', { exact: true }).selectOption({ label: 'Detectar magia' });
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const sp = page.locator('section[aria-label="Conjuros"]');
  for (const n of ['Guía', 'Descarga de fuego', 'Luz', 'Detectar magia']) await expect(sp).toContainText(n);
  const row = sp.locator('.card', { hasText: 'Detectar magia' }).first();
  await expect(row).toContainText('ritual');
  await row.getByRole('button', { name: /^Detectar magia/ }).click();
  await row.getByRole('button', { name: /^Lanzar como ritual/ }).click();
  await expect(page.locator('.pc-conc')).toContainText('Detectar magia');
});

test('a 0 PG cada golpe es un fallo de salvación contra la muerte (el crítico, dos) y el daño masivo mata', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Rurik');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const max = Number(await page.locator('.stat-hp .stat-max').textContent());
  const hit = async (n: number) => { await page.getByLabel('Cantidad de PG').fill(String(n)); await page.getByRole('button', { name: 'Daño', exact: true }).click(); };
  const fails = page.locator('.stat-death .pip.bad');
  await hit(max); // a 0 PG
  await expect(page.locator('.stat-hp .stat-v')).toHaveText('0');
  await expect(fails).toHaveCount(0);
  await hit(1);
  await expect(fails).toHaveCount(1);
  await expect(page.locator('.pc-death-hit')).toContainText('un fallo de salvación contra la muerte (1/3)');
  await expect(page.locator('section[aria-label="Estados y descansos"] .picker-sum')).toContainText('Inconsciente'); // al caer a 0 PG
  await page.getByRole('button', { name: 'Crítico o cuerpo a cuerpo a 5 pies: otro fallo' }).click();
  await expect(fails).toHaveCount(2);
  // curarse: vuelve en sí (sin Inconsciente), los contadores a cero y sigue Derribado
  await page.getByLabel('Cantidad de PG').fill('3');
  await page.getByRole('button', { name: 'Curación', exact: true }).click();
  await expect(fails).toHaveCount(0);
  await expect(page.locator('section[aria-label="Estados y descansos"] .picker-sum')).not.toContainText('Inconsciente');
  await expect(page.locator('section[aria-label="Estados y descansos"] .picker-sum')).toContainText('Derribado');
  // otro personaje: el daño que sobra llega a sus PG máximos
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Bran');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const max2 = Number(await page.locator('.stat-hp .stat-max').textContent());
  await hit(max2 * 2);
  await expect(fails).toHaveCount(3);
  await expect(page.locator('.pc-death-hit')).toContainText('Daño masivo');
});

test('subir de nivel: estilo de combate, pericia, límite de conjuros nuevos y lo que falta', async ({ page }) => {
  await page.goto('/#/jugador');
  const make = async (name: string, cls: string, lv: string, skills = 0) => {
    await page.getByRole('button', { name: 'Nuevo personaje' }).click();
    await page.getByLabel('Nombre del personaje').fill(name);
    await page.getByLabel('Clase', { exact: true }).selectOption({ label: cls });
    await page.getByLabel('Nivel', { exact: true }).fill(lv);
    await page.getByRole('button', { name: /Matriz estándar/ }).click();
    for (let i = 0; i < skills; i++) await page.locator('.ce-skill input').nth(i).check();
    await page.getByRole('button', { name: 'Listo' }).first().click();
    await page.getByRole('button', { name: 'Subir de nivel' }).click();
  };
  // paladín 1 → 2: Estilo de combate (Defensa: +1 a la CA con armadura)
  await make('Aldo', 'Paladín', '1');
  let dlg = page.getByRole('dialog', { name: 'Subir a nivel 2' });
  await expect(dlg.getByLabel('Resumen de la subida')).toContainText('Falta: estilo de combate');
  await dlg.getByLabel('Estilo de combate').selectOption({ label: 'Defensa' });
  await expect(dlg.getByLabel('Resumen de la subida')).not.toContainText('estilo de combate');
  await dlg.getByRole('button', { name: 'Confirmar: subir a nivel 2' }).click();
  await expect(page.locator('section[aria-label="Rasgos y dotes"]')).toContainText('Defensa');
  // pícaro 5 → 6: Pericia en dos habilidades (no más)
  await make('Vex', 'Pícaro', '5', 3);
  dlg = page.getByRole('dialog', { name: 'Subir a nivel 6' });
  const exp = dlg.getByRole('group', { name: 'Pericia' }).getByRole('button');
  await exp.nth(0).click();
  await exp.nth(1).click();
  await expect(exp.nth(2)).toBeDisabled();
  await dlg.getByRole('button', { name: 'Confirmar: subir a nivel 6' }).click();
  // mago 3 → 4: un truco más (el resto se bloquea) y su texto al pulsarlo
  await make('Oren', 'Mago', '3');
  dlg = page.getByRole('dialog', { name: 'Subir a nivel 4' });
  const chips = dlg.locator('.lvl-spells .chip');
  await chips.first().click();
  await expect(chips.nth(1)).toBeDisabled();
  await expect(dlg.locator('.lvl-peek')).toBeVisible();
  await expect(dlg.getByLabel('Resumen de la subida')).toContainText('conjuros (0 de 1)');
});

test('probar con un ejemplo: encuentro de muestra para el máster y personaje de muestra para el jugador', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Probar con un ejemplo' }).click();
  // todo listo: monstruos y jugadores con iniciativa, se puede empezar
  await expect(page.getByText('Hecho. Se ordenan solos por número.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('2 jugadores listos.')).toBeVisible();
  await page.getByTitle('Empezar combate (N)').click();
  await expect(activeName(page)).toContainText(/Tarek|Jefe goblin|Guerrero goblin|Brenna/);
  await expect(page.getByText('Brenna').first()).toBeVisible();
  await expect(page.getByText('Guerrero goblin 3').first()).toBeVisible();

  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Probar con un ejemplo' }).click();
  await expect(page.getByRole('tab', { name: 'Brenna (ejemplo)' })).toBeVisible();
  await expect(page.getByText('Clérigo 3').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Llama sagrada/ }).first()).toBeVisible();
});

test('trasfondo: el +2/+1 se suma solo, se mantiene al cambiar el reparto y se quita al cambiar de trasfondo', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Ivo');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Clérigo' });
  await page.getByLabel('Trasfondo', { exact: true }).selectOption({ label: 'Acólito' });
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  const wis = page.locator('#ce-ab-wis');
  const base = Number(await wis.inputValue());
  await page.getByLabel('+2 a').selectOption({ label: 'Sabiduría' });
  await page.getByLabel('+1 a').selectOption({ label: 'Carisma' });
  await expect(page.locator('.abil-edit', { has: wis })).toContainText('+2 = ' + (base + 2));
  // al cambiar el reparto, la base cambia y el +2 sigue
  await wis.selectOption('8');
  await expect(page.locator('.abil-edit', { has: wis })).toContainText('+2 = 10');
  // +1 a las tres
  await page.getByRole('button', { name: '+1 a las tres' }).click();
  await expect(page.locator('.abil-edit', { has: wis })).toContainText('+1 = 9');
  // otro trasfondo: el aumento se quita
  await page.getByLabel('Trasfondo', { exact: true }).selectOption({ label: 'Soldado' });
  await expect(page.locator('.abil-edit', { has: wis })).not.toContainText('+1 =');
  await expect(wis).toHaveValue('8');
});

test('generador de encuentros sin grupo guardado: jugadores y nivel escritos ahí mismo', async ({ page }) => {
  await open(page);
  const gen = page.getByRole('region', { name: 'Generador de encuentro' });
  await gen.getByLabel('Jugadores').fill('5');
  await gen.getByLabel('de nivel').fill('7');
  await expect(gen).toContainText('PX de monstruos');
  await gen.getByRole('button', { name: 'Proponer' }).click();
  await expect(gen.getByRole('button', { name: 'Añadir al encuentro' })).toBeVisible({ timeout: 15000 });
});

test('editor: lo que falta arriba y el equipo inicial de la clase se pone solo', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  const falta = page.locator('.lvl-pending');
  await expect(falta).toContainText('nombre');
  await page.getByLabel('Nombre del personaje').fill('Ivo');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Clérigo' });
  await expect(falta).toContainText('equipo inicial');
  await expect(falta).toContainText('conjuros');
  await page.getByRole('button', { name: /^A Camisote de malla, Escudo, Maza/ }).click();
  await expect(page.getByText('Puesta la opción A')).toBeVisible();
  await expect(falta).not.toContainText('equipo inicial');
  await page.getByRole('button', { name: 'Listo' }).first().click();
  // CA 13 + Des (+0) + escudo 2, la maza en los ataques y el resto en las notas
  await expect(page.locator('.stat').filter({ hasText: 'CA' }).first()).toContainText('15');
  await expect(page.getByText('Maza').first()).toBeVisible();
  await expect(page.locator('#pc-notes')).toHaveValue(/Equipo inicial \(A\): .*Símbolo sagrado.*7 po/);
});

test.describe('asistente para crear personaje', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test('paso a paso: quién eres, trasfondo, características, habilidades, equipo, conjuros y repaso', async ({ page }) => {
    await page.goto('/#/jugador');
    await page.getByRole('button', { name: 'Nuevo personaje' }).click();
    const steps = page.getByRole('navigation', { name: 'Pasos para crear el personaje' });
    await expect(steps).toBeVisible();
    // paso 1: no se ven las demás secciones
    await expect(page.getByLabel('Trasfondo', { exact: true })).toBeHidden();
    await page.getByLabel('Nombre del personaje').fill('Mira');
    await page.getByLabel('Especie', { exact: true }).selectOption({ label: 'Humano' });
    await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Clérigo' });
    await page.getByRole('button', { name: 'Siguiente' }).click();
    // paso 2: trasfondo
    await page.getByLabel('Trasfondo', { exact: true }).selectOption({ label: 'Acólito' });
    await page.getByRole('button', { name: 'Siguiente' }).click();
    // paso 3: características con el aumento del trasfondo
    await page.getByRole('button', { name: /Matriz estándar/ }).click();
    await page.getByLabel('+2 a').selectOption({ label: 'Sabiduría' });
    await page.getByLabel('+1 a').selectOption({ label: 'Carisma' });
    await page.getByRole('button', { name: 'Siguiente' }).click();
    // paso 4: habilidades
    await page.locator('.ce-skill', { hasText: 'Historia' }).locator('input').first().check();
    await page.locator('.ce-skill', { hasText: 'Medicina' }).locator('input').first().check();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    // paso 5: equipo inicial
    await page.getByRole('button', { name: /^A Camisote de malla/ }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    // paso 6: conjuros y dotes (se ve la sección de conjuros)
    await expect(page.getByRole('group', { name: 'Conjuros' }).or(page.locator('fieldset', { hasText: 'Buscar conjuro' })).first()).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    // repaso
    await expect(page.locator('.ce-review')).toContainText('Mira');
    await expect(page.locator('.ce-review')).toContainText('CA');
    await expect(page.locator('.lvl-pending')).toContainText('conjuros');
    // se puede cambiar cualquier número, pero avisa de lo que no cuadra
    const ca = page.locator('.ce-review').getByRole('spinbutton', { name: 'CA', exact: true });
    const real = Number(await ca.inputValue());
    await ca.fill(String(real + 3));
    await expect(page.locator('.ce-review-warn')).toContainText('con Camisote de malla y escudo te sale ' + real);
    await page.locator('.ce-review').getByRole('spinbutton', { name: 'PG máx.', exact: true }).fill('99');
    await expect(page.locator('.ce-review-warn')).toContainText('no es posible');
    await page.locator('.ce-review').getByRole('spinbutton', { name: 'Sab', exact: true }).fill('22');
    await expect(page.locator('.ce-review-warn')).toContainText('no puede pasar de 20');
    await ca.fill(String(real));
    await expect(page.locator('.ce-review-warn')).not.toContainText('CA ');
    await page.getByRole('button', { name: 'Crear personaje' }).click();
    await expect(page.getByRole('heading', { name: 'Mira' })).toBeVisible();
    // «Editar hoja» ya no usa el asistente
    await page.getByRole('button', { name: 'Editar hoja' }).click();
    await expect(steps).toHaveCount(0);
  });
});

test('subclase propia: se escribe en «Mis creaciones», se elige en el personaje y sus rasgos salen con sus usos y al subir de nivel', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByRole('button', { name: 'Crear subclase' }).click();
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Guerrero' });
  await page.getByLabel('Nombre de la subclase').fill('Orden del Halcón');
  await page.getByRole('button', { name: '+ Rasgo de nivel 3' }).click();
  await page.getByLabel('Rasgo', { exact: true }).fill('Picado');
  await page.getByLabel('Qué hace').fill('Te lanzas en picado: +2d6 al daño del siguiente ataque.');
  await page.getByLabel('Usos').selectOption({ label: 'Tu bono de competencia' });
  await page.getByRole('button', { name: '+ Rasgo de nivel 7' }).click();
  await page.getByLabel('Rasgo', { exact: true }).nth(1).fill('Vista de halcón');
  await page.getByRole('button', { name: 'Guardar subclase' }).click();
  await expect(page.getByText('subclase de Guerrero · 2 rasgos')).toBeVisible();

  await page.getByRole('button', { name: 'Mi personaje' }).click();
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Kael');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Guerrero' });
  await page.getByLabel('Nivel', { exact: true }).fill('6');
  await page.locator('#ce-subsel').selectOption({ label: 'Orden del Halcón (propia)' });
  await page.getByRole('button', { name: 'Listo' }).first().click();
  // su rasgo de nivel 3, con 3 usos (bono de competencia a nivel 6)
  await expect(page.getByText('Picado').first()).toBeVisible();
  await expect(page.getByRole('group', { name: /Picado: 3 de 3 disponibles/ })).toBeVisible();
  await expect(page.getByText('Vista de halcón')).toHaveCount(0);
  // al subir a 7, la subida de nivel lo enseña
  await page.getByRole('button', { name: 'Subir de nivel' }).click();
  await expect(page.locator('.lvl')).toContainText('Vista de halcón');
});

test('subclase propia con efectos: ataque, salvación, curación, daño extra al golpear y bonificador fijo funcionan en la hoja', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByRole('button', { name: 'Crear subclase' }).click();
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Guerrero' });
  await page.getByLabel('Nombre de la subclase').fill('Garra Roja');
  const feat = async (i: number, name: string, kind: string) => {
    await page.getByRole('button', { name: '+ Rasgo de nivel 3' }).click();
    await page.getByLabel('Rasgo', { exact: true }).nth(i).fill(name);
    await page.getByLabel('Efecto en la hoja').nth(i).selectOption({ label: kind });
  };
  await feat(0, 'Zarpazo', 'Tirada de ataque');
  await page.locator('#hb0ab').selectOption({ label: 'Destreza' });
  await page.locator('#hb0dmg').fill('1d8');
  await page.locator('#hb0ty').selectOption('cortante');
  await feat(1, 'Rugido', 'Salvación con tu CD');
  await page.locator('#hb1ab').selectOption({ label: 'Constitución' });
  await page.locator('#hb1sv').selectOption({ label: 'Sabiduría' });
  await page.locator('#hb1dmg').fill('2d6');
  await page.locator('#hb1ty').selectOption('trueno');
  await page.locator('#hb1co').selectOption('Asustado');
  await page.getByLabel('Usos').nth(1).selectOption({ label: 'Un número fijo' });
  await feat(2, 'Sangre caliente', 'Curación');
  await page.locator('#hb2dmg').fill('1d10');
  await feat(3, 'Garra ardiente', 'Daño extra al golpear');
  await page.locator('#hb3dmg').fill('1d4');
  await page.locator('#hb3ty').selectOption('fuego');
  await feat(4, 'Piel de escamas', 'Bonificador fijo');
  await page.locator('#hb4ac').fill('1');
  await page.locator('#hb4re').selectOption('fuego');
  await page.getByRole('button', { name: 'Guardar subclase' }).click();

  await page.getByRole('button', { name: 'Mi personaje' }).click();
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Rhea');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Guerrero' });
  await page.getByLabel('Nivel', { exact: true }).fill('3');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.locator('#ce-subsel').selectOption({ label: 'Garra Roja (propia)' });
  await page.getByRole('button', { name: 'Listo' }).first().click();

  const panel = page.getByRole('region', { name: 'Rasgos con usos' });
  // la CA lleva el +1 (sin armadura: 10 + Des + 1) y la resistencia al fuego
  const dex = Number((await page.locator('[data-abil=dex] .pc-abil-mod b').first().innerText()).replace('−', '-'));
  await expect(page.locator('.stat').filter({ hasText: 'CA' }).first()).toContainText(String(10 + dex + 1));
  // ataque con Destreza y competencia (+2) y su daño
  await expect(panel.getByRole('button', { name: 'Ataque ' + (dex + 2 >= 0 ? '+' : '') + (dex + 2) })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Daño 1d8 cortante' })).toBeVisible();
  // salvación: CD 8 + 2 + Con, con su estado; gasta su uso
  await expect(panel).toContainText(/CD \d+ Sabiduría · mitad si supera · Asustado/);
  await panel.getByRole('button', { name: 'Daño 2d6 trueno' }).click();
  await expect(panel.getByRole('button', { name: 'Daño 2d6 trueno' })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Curar 1d10' })).toBeVisible();
  // el daño extra sale como etiqueta en los ataques
  await expect(page.getByRole('button', { name: /Garra ardiente/ }).first()).toBeVisible();
});

test('conjuro propio: su ficha, en la lista de su clase, siempre preparado por una subclase propia y con sus tiradas al lanzarlo', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByRole('button', { name: 'Crear conjuro' }).click();
  await page.getByLabel('Nombre del conjuro').fill('Lanza de escarcha');
  await page.getByRole('button', { name: 'Clérigo', exact: true }).click();
  await page.getByLabel('Tirada', { exact: true }).selectOption({ label: 'Salvación del objetivo' });
  await page.getByLabel('Salvación de').selectOption({ label: 'Constitución' });
  await page.getByLabel('Estado si falla').selectOption('Apresado');
  await page.getByLabel('Mitad de daño si la supera').check();
  await page.getByLabel('Daño', { exact: true }).fill('3d8');
  await page.getByLabel('Tipo de daño').selectOption('frío');
  await page.locator('#hs-up').fill('1d8');
  await page.getByRole('button', { name: 'Guardar conjuro' }).click();
  await expect(page.getByText('nivel 1 · Evocación · Clérigo')).toBeVisible();

  // subclase propia de clérigo que lo deja siempre preparado desde el nivel 3
  await page.getByRole('button', { name: 'Crear subclase' }).click();
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Clérigo' });
  await page.getByLabel('Nombre de la subclase').fill('Dominio del Invierno');
  await page.getByRole('button', { name: '+ Rasgo de nivel 3' }).click();
  await page.getByLabel('Rasgo', { exact: true }).fill('Conjuros del invierno');
  await page.getByLabel('Conjuros siempre preparados (opcional)').fill('lanza de esc');
  await page.getByRole('button', { name: /\+ Lanza de escarcha/ }).click();
  await page.getByRole('button', { name: 'Guardar subclase' }).click();

  await page.getByRole('button', { name: 'Mi personaje' }).click();
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Inga');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Clérigo' });
  await page.getByLabel('Nivel', { exact: true }).fill('3');
  await page.locator('#ce-subsel').selectOption({ label: 'Dominio del Invierno (propia)' });
  await page.getByRole('button', { name: 'Listo' }).first().click();
  // siempre preparado y con sus tiradas
  const sp = page.locator('.pc-block-sp', { hasText: 'Lanza de escarcha' });
  await expect(sp).toContainText('siempre');
  await sp.getByText('Lanza de escarcha').click();
  const card = page.locator('.pc-block-sp li, .pc-block-sp details').filter({ hasText: 'Lanza de escarcha' }).first();
  await expect(card).toContainText(/CD \d+ Constitución/);
  await expect(card.getByRole('button', { name: /^Daño 3d8 frío/ })).toBeVisible();
  // con un espacio de nivel 2: un dado más
  await card.getByLabel('Nivel de espacio para Lanza de escarcha').selectOption('2');
  await expect(card.getByRole('button', { name: /^Daño 4d8 frío/ })).toBeVisible();
});

test('rasgo propio del personaje con efecto, y conjuro propio con efecto sobre ti (CA y concentración)', async ({ page }) => {
  // conjuro propio solo sobre ti: +3 a la CA, de concentración
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByRole('button', { name: 'Crear conjuro' }).click();
  await page.getByLabel('Nombre del conjuro').fill('Coraza de hielo');
  await page.getByRole('button', { name: 'Mago', exact: true }).click();
  await page.getByLabel('Concentración').check();
  await page.getByLabel('Sobre quién').selectOption({ label: 'Solo sobre ti' });
  await page.locator('#hs-ac').fill('3');
  await page.getByRole('button', { name: 'Guardar conjuro' }).click();

  await page.getByRole('button', { name: 'Mi personaje' }).click();
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Nim');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Mago' });
  await page.getByLabel('Buscar conjuro').fill('Coraza de hielo');
  await page.getByRole('button', { name: /\+ Coraza de hielo/ }).click();
  await page.getByRole('button', { name: 'Añadir conjuro' }).click();
  // rasgo propio: +1 a la CA
  await page.getByRole('button', { name: '+ Dote o rasgo propio' }).click();
  await page.locator('#cf-n').fill('Piel de piedra');
  await page.getByLabel('Efecto en la hoja').selectOption({ label: 'Bonificador fijo' });
  await page.locator('#cfac').fill('1');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();

  const ca = page.locator('.stat').filter({ hasText: 'CA' }).first();
  const dex = Number((await page.locator('[data-abil=dex] .pc-abil-mod b').first().innerText()).replace('−', '-'));
  await expect(ca).toContainText(String(10 + dex + 1));
  // lanzarlo: +3 mientras dura y se concentra
  await page.locator('.pc-block-sp').getByText('Coraza de hielo').click();
  await page.getByRole('button', { name: /^Lanzar \(gasta espacio de nivel 1\)/ }).click();
  await expect(ca).toContainText(String(10 + dex + 4));
  await expect(page.locator('.pc-active')).toContainText('Coraza de hielo');
});

test('reacción: ataque de oportunidad con sus armas, dotes de reacción y la reacción gastada', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Bram');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Guerrero' });
  await page.getByLabel('Arma para añadir').selectOption({ label: 'Daga (1d4 perforante)' });
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await page.getByRole('button', { name: '+ Dote o rasgo propio' }).click();
  await page.locator('#cf-n').fill('Centinela');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const re = page.getByRole('region', { name: 'Reacción' });
  await expect(re).toContainText('Ataque de oportunidad');
  await expect(re).toContainText('Centinela');
  await expect(re).toContainText('velocidad pasa a 0');
  await re.getByRole('button', { name: /^Daga [+−]/ }).click();
  await expect(re).toContainText('usada');
  await expect(re.getByRole('button', { name: 'Usar la reacción' })).toBeDisabled();
});

test('dotes que cambian la magia: Adepto elemental, metamagia del hechicero y dotes que dan conjuros', async ({ page }) => {
  await page.goto('/#/jugador');
  // hechicero 2 con Adepto elemental (escrita como rasgo propio) y Tocado por las hadas
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Vex');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Hechicero' });
  await page.getByLabel('Nivel', { exact: true }).fill('2');
  for (const n of ['Adepto elemental', 'Tocado por las hadas']) {
    await page.getByRole('button', { name: '+ Dote o rasgo propio' }).click();
    await page.locator('#cf-n').fill(n);
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  }
  // la dote pide su conjuro de Adivinación o Encantamiento
  await page.getByLabel('Conjuro de nivel 1 de Adivinación o Encantamiento').selectOption({ label: 'Orden imperiosa' });
  await page.getByRole('button', { name: 'Listo' }).first().click();
  // conjuros de la dote en la hoja
  const sp = page.locator('section[aria-label="Conjuros"]');
  await expect(sp).toContainText('Paso brumoso');
  await expect(sp).toContainText('Orden imperiosa');
  // Adepto elemental: elegir el elemento
  await page.getByLabel('Elemento de Adepto elemental').selectOption('fuego');
  await expect(page.getByRole('region', { name: 'Dotes', exact: true })).toContainText('fuego: los 1 cuentan como 2');
  // metamagia: elegir 2 opciones y usar una (gasta 1 punto de hechicería)
  const mm = page.getByRole('region', { name: 'Metamagia' });
  await mm.getByRole('button', { name: 'Conjuro sutil' }).click();
  await mm.getByRole('button', { name: 'Conjuro distante' }).click();
  await expect(mm).toContainText('Puntos de hechicería 2/2');
  await mm.getByRole('button', { name: 'Usar (gasta 1)' }).first().click();
  await expect(mm).toContainText('Puntos de hechicería 1/2');
});

test('trucos que atacan con el arma: Impacto certero y Shillelagh salen en Ataques con la característica de conjuros', async ({ page }) => {
  await page.goto('/#/jugador');
  // brujo 5 con daga e Impacto certero: Carisma al ataque y al daño, radiante y +1d6
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Sera');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Brujo' });
  await page.getByLabel('Nivel', { exact: true }).fill('5');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByLabel('Arma para añadir').selectOption({ label: 'Daga (1d4 perforante)' });
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  for (const q of ['Impacto certero', 'Descarga sobrenatural']) {
    await page.getByLabel('Buscar conjuro').fill(q);
    await page.locator('.ce-spell-results .chip').first().click();
    await page.getByRole('button', { name: 'Añadir conjuro' }).click();
  }
  await page.getByRole('button', { name: 'Listo' }).first().click();
  // los trucos de ataque también salen en Ataques (Descarga sobrenatural: 2 rayos a nivel 5)
  const eb = page.locator('section[aria-label="Ataques"] .pc-attack', { hasText: 'Descarga sobrenatural' });
  await expect(eb.getByRole('button', { name: /^Ataque [+−]\d+ ×2$/ })).toBeVisible();
  await expect(eb.getByRole('button', { name: 'Daño 2 × 1d10 fuerza' })).toBeVisible();
  const cha = Number((await page.locator('[data-abil=cha] .pc-abil-mod b').first().innerText()).replace('−', '-'));
  const row = page.locator('.pc-cantrip-atk', { hasText: 'Impacto certero' });
  await expect(row.getByRole('button', { name: 'Ataque ' + (cha + 3 >= 0 ? '+' : '−') + Math.abs(cha + 3) })).toBeVisible();
  await expect(row.getByRole('button', { name: /^Daño 1d4[+−]\d+ radiante \+ 1d6 radiante/ })).toBeVisible();
});

test('dotes: la mejora de característica se elige al tomar la dote y se deshace al quitarla', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Lug');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Guerrero' });
  await page.getByLabel('Nivel', { exact: true }).fill('4');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  const open = async () => {
    const pk = page.locator('details.picker', { hasText: 'Dotes generales' });
    if (!(await pk.evaluate((e) => (e as HTMLDetailsElement).open))) await pk.locator('summary').click();
    await page.getByRole('button', { name: 'Luchador', exact: true }).click();
  };
  await open();
  const sel = page.getByLabel('Mejora de característica');
  const before = await sel.locator('option', { hasText: 'Destreza' }).textContent();
  await sel.selectOption({ label: before! });
  await page.getByRole('button', { name: 'Elegir dote' }).click();
  // con la dote puesta, Destreza ya es una más
  await page.getByRole('button', { name: 'Luchador', exact: true }).click();
  await expect(page.getByText('Al quitarla, se deshace la mejora de característica')).toBeVisible();
  await page.getByRole('button', { name: 'Quitar dote' }).click();
  await open();
  await expect(page.getByLabel('Mejora de característica').locator('option', { hasText: 'Destreza' })).toHaveText(before!);
});

test('rasgos con acción adicional o reacción sin otra tarjeta salen en la hoja: Acción astuta y Esquiva asombrosa', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Nim');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Pícaro' });
  await page.getByLabel('Nivel', { exact: true }).fill('5');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  await expect(page.getByRole('region', { name: 'Acción adicional' })).toContainText('Acción astuta');
  const re = page.getByRole('region', { name: 'Reacción' });
  await expect(re).toContainText('Esquiva asombrosa');
  await re.getByRole('button', { name: 'Usar la reacción' }).first().click();
  await expect(re).toContainText('usada');
});

test('rasgos con número: Furia implacable sube la CD, Caída lenta y Hechicería encarnada', async ({ page }) => {
  await page.goto('/#/jugador');
  const make = async (name: string, cls: string, lv: string) => {
    await page.getByRole('button', { name: 'Nuevo personaje' }).click();
    await page.getByLabel('Nombre del personaje').fill(name);
    await page.getByLabel('Clase', { exact: true }).selectOption({ label: cls });
    await page.getByLabel('Nivel', { exact: true }).fill(lv);
    await page.getByRole('button', { name: /Matriz estándar/ }).click();
  };
  // bárbaro 11: Furia implacable con CD 10, y 15 tras usarla
  await make('Gron', 'Bárbaro', '11');
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const card = page.locator('.card', { hasText: 'Furia implacable' }).first();
  await expect(card).toContainText('CD 10');
  await card.getByRole('button', { name: /^Salvación CON/ }).click();
  await expect(card).toContainText('CD 15');
  // monje 4: Caída lenta reduce 20
  await make('Lin', 'Monje', '4');
  await page.getByRole('button', { name: 'Listo' }).first().click();
  await expect(page.getByRole('region', { name: 'Reacción' })).toContainText('−20 al daño de caída');
  // hechicero 7: gasta 2 puntos de hechicería sin usos de Hechicería innata
  await make('Vel', 'Hechicero', '7');
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const mm = page.getByRole('region', { name: 'Metamagia' });
  await expect(mm).toContainText('Puntos de hechicería 7/7');
  await mm.getByRole('button', { name: /Hechicería innata sin usos/ }).click();
  await expect(mm).toContainText('Puntos de hechicería 5/7');
});

test('objetos mágicos: un ejemplo cambia la CA al ponerlo y sintonizarlo, la sintonía tiene tope y la poción gasta su carga', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Orla');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Guerrero' });
  await page.getByLabel('Nivel', { exact: true }).fill('3');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const ac = async () => Number(await page.locator('.stat-ac .stat-v').textContent());
  const base = await ac();
  const panel = page.getByRole('region', { name: 'Objetos mágicos' });
  const add = async (name: string) => {
    await panel.getByLabel('Objeto de ejemplo').selectOption({ label: name });
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  };
  // Anillo de protección: +1 CA, pero solo con la sintonía
  await add('Anillo de protección');
  expect(await ac()).toBe(base);
  await panel.getByLabel('Sintonizado: Anillo de protección').check();
  await expect.poll(ac).toBe(base + 1);
  await panel.getByLabel('Puesto: Anillo de protección').uncheck();
  await expect.poll(ac).toBe(base);
  await panel.getByLabel('Puesto: Anillo de protección').check();
  // tope de tres sintonizados
  await add('Capa de protección');
  await panel.getByLabel('Sintonizado: Capa de protección').check();
  await add('Diadema de intelecto');
  await panel.getByLabel('Sintonizado: Diadema de intelecto').check();
  await add('Amuleto de salud');
  await expect(panel).toContainText('Sintonía 3/3');
  await expect(panel.getByLabel('Sintonizado: Amuleto de salud')).toBeDisabled();
  await expect.poll(ac).toBe(base + 2);
  // poción de curación: gasta su única carga
  await add('Poción de curación');
  await panel.getByRole('button', { name: /Usar: tirar 2d4\+2/ }).click();
  await expect(panel.getByRole('button', { name: /Usar: tirar 2d4\+2/ })).toBeDisabled();
});

test('objetos mágicos: el arma ligada suma ataque y daño y el objeto con cargas lanza un conjuro', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Kael');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Hechicero' });
  await page.getByLabel('Nivel', { exact: true }).fill('5');
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const panel = page.getByRole('region', { name: 'Objetos mágicos' });
  // objeto propio: bastón con 10 cargas que lanza Bola de fuego (3 cargas)
  await panel.getByRole('button', { name: '+ Objeto' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Bastón de fuego');
  await page.getByLabel('Cargas', { exact: true }).fill('10');
  await page.getByRole('button', { name: '+ Conjuro' }).click();
  await page.getByLabel('Conjuro', { exact: true }).selectOption({ label: 'Bola de fuego' });
  await page.getByLabel('Cargas por lanzamiento').fill('3');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(panel).toContainText('Bastón de fuego');
  await page.getByRole('button', { name: /Bola de fuego/ }).first().click();
  await expect(page.getByRole('button', { name: 'Lanzar (3 cargas)' })).toBeVisible();
  // el efecto de arma pide el arma de la hoja
  await panel.getByLabel('Objeto de ejemplo').selectOption({ label: 'Arma +1' });
  await expect(page.getByLabel('Arma de tu hoja')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
});

test('biblioteca: los objetos importados salen en los ejemplos del panel de objetos mágicos', async ({ page }) => {
  const lib = {
    app: 'cronica-combate', tipo: 'biblioteca', v: 1, source: 'Pruebas', feats: [], backgrounds: [], spells: [], subclasses: [],
    items: [{ id: 'lib-it-prueba', n: 'Brazal de prueba', kind: 'wondrous', rarity: 'raro', attune: true, d: 'Texto de prueba.', mods: [{ k: 'ac', v: 1 }] }],
  };
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByLabel('Archivo de biblioteca').setInputFiles({ name: 'biblioteca.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(lib)) });
  await expect(page.getByRole('status').filter({ hasText: '1 objetos' })).toBeVisible();
  await page.getByRole('button', { name: 'Mi personaje', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Ira');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Guerrero' });
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const panel = page.getByRole('region', { name: 'Objetos mágicos' });
  await panel.getByLabel('Objeto de ejemplo').selectOption({ label: 'Brazal de prueba' });
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(panel).toContainText('Brazal de prueba');
});

test('biblioteca: traducir los objetos con el traductor del navegador (simulado)', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { Translator: unknown }).Translator = { availability: async () => 'available', create: async () => ({ translate: async (t: string) => 'ES ' + t }) };
  });
  const lib = {
    app: 'cronica-combate', tipo: 'biblioteca', v: 1, source: 'Pruebas', feats: [], backgrounds: [], spells: [], subclasses: [],
    items: [{ id: 'lib-it-t', n: 'Brazal de prueba', kind: 'wondrous', rarity: 'raro', attune: false, d: 'Test text.', mods: [] }],
  };
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByLabel('Archivo de biblioteca').setInputFiles({ name: 'biblioteca.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(lib)) });
  await page.getByRole('button', { name: 'Traducir objetos al español' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Traducidos 1 objetos' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Traducir objetos al español' })).toHaveCount(0);
});

test('objetos mágicos: el formulario de «+ Objeto» también deja partir de un ejemplo, varias veces seguidas', async ({ page }) => {
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Ira');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Guerrero' });
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const panel = page.getByRole('region', { name: 'Objetos mágicos' });
  for (const n of ['Anillo de protección', 'Capa de protección', 'Anillo de resistencia']) {
    await panel.getByRole('button', { name: '+ Objeto' }).click();
    await page.getByLabel('Partir de un objeto').selectOption({ label: n });
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(n);
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(panel.getByRole('button', { name: n, exact: true })).toBeVisible();
  }
  await expect(panel.getByLabel('Objeto de ejemplo')).toBeVisible();
});

test('objetos mágicos: al elegir uno de la biblioteca se leen sus conjuros con cargas y se elige la variante', async ({ page }) => {
  const lib = {
    app: 'cronica-combate', tipo: 'biblioteca', v: 1, source: 'Pruebas', feats: [], backgrounds: [], spells: [], subclasses: [],
    items: [
      { id: 'lib-it-b', n: 'Bastón de prueba', kind: 'staff', rarity: 'raro', attune: true, d: 'Conjuro Coste en cargas Bola de fuego 3 Manos ardientes 1 Recuperar cargas.', mods: [], charges: { max: 10, per: 'lr' }, es: true },
      { id: 'lib-it-g', n: 'Cinturón de fuerza de gigante', kind: 'wondrous', rarity: 'varía', attune: true, d: 'Tu Fuerza cambia.', mods: [], es: true,
        pick: { label: 'Tipo de gigante', base: 'Cinturón de fuerza de gigante', opts: [{ n: 'colinas', rarity: 'raro', mods: [{ k: 'abilSet', abil: 'str', v: 21 }] }, { n: 'nubes', rarity: 'legendario', mods: [{ k: 'abilSet', abil: 'str', v: 27 }] }] } },
    ],
  };
  await page.goto('/#/jugador');
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByLabel('Archivo de biblioteca').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(lib)) });
  await page.getByRole('button', { name: 'Mi personaje', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo personaje' }).click();
  await page.getByLabel('Nombre del personaje').fill('Ira');
  await page.getByLabel('Clase', { exact: true }).selectOption({ label: 'Guerrero' });
  await page.getByRole('button', { name: /Matriz estándar/ }).click();
  await page.getByRole('button', { name: 'Listo' }).first().click();
  const panel = page.getByRole('region', { name: 'Objetos mágicos' });
  // bastón: los conjuros salen solos, con su coste
  await panel.getByLabel('Objeto de ejemplo').selectOption({ label: 'Bastón de prueba' });
  await expect(page.getByLabel('Conjuro', { exact: true }).first()).toHaveValue(/Fireball|Bola|sp-/);
  await expect(page.getByLabel('Cargas por lanzamiento').first()).toHaveValue('3');
  await expect(page.getByLabel('Cargas por lanzamiento')).toHaveCount(2);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  // cinturón: hay que elegir el tipo antes de guardar
  await panel.getByLabel('Objeto de ejemplo').selectOption({ label: 'Cinturón de fuerza de gigante' });
  await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toBeDisabled();
  await page.getByLabel(/Tipo de gigante/).selectOption({ label: 'nubes · legendario' });
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Cinturón de fuerza de gigante (nubes)');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await panel.getByLabel('Sintonizado: Cinturón de fuerza de gigante (nubes)').check();
  await expect(page.getByText('27', { exact: true }).first()).toBeVisible();
});

test('libro de reglas: marcapáginas por capítulo, atajos nuevos y la búsqueda lleva a la página de la regla', async ({ page }) => {
  await open(page);
  await page.keyboard.press('r');
  // el libro tiene todos los capítulos y los conjuros van los últimos
  const titles = page.locator('.rule-chapter-title');
  await expect(titles.first()).toHaveText('Reglas rápidas');
  await expect(titles.last()).toHaveText('Conjuros');
  // un marcapáginas abre la lista de su capítulo
  await page.locator('.rule-mark', { hasText: 'Reglas rápidas' }).click();
  await expect(page.locator('.rule-mark-wrap.open .rule-item', { hasText: 'Empujar' })).toBeVisible();
  // «ataque desarmado» (otro nombre del Golpe sin armas) y «empujar» se encuentran y llevan a su página
  const search = page.getByLabel('Buscar (español o inglés)');
  await search.fill('ataque desarmado');
  await page.locator('.rule-item', { hasText: 'Golpe sin armas' }).first().click();
  await expect(page.locator('.rule-entry.on .rule-title')).toContainText('Golpe sin armas');
  await expect(page.locator('.rule-entry.on')).toBeInViewport();
  await search.fill('zona de la verdad');
  await page.locator('.rule-item').first().click();
  await expect(page.locator('.rule-entry.on')).toContainText('Conjuro de nivel 2');
  await expect(page.locator('.rule-entry.on')).toBeInViewport();
});
