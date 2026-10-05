import { expect, test, type Page } from '@playwright/test';

/** Abre la app con datos limpios y espera a que cargue el bestiario. */
async function open(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    indexedDB.deleteDatabase('cronica-combate');
    localStorage.clear();
  });
  await page.reload();
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

test('herramientas del DM: daño alternativo, CD del conjuro y encuentros guardados', async ({ page }) => {
  await open(page);
  await addMonsters(page, 'guerrero goblin', 'Guerrero goblin', 3);
  await page.getByRole('button', { name: 'Combate', exact: true }).click();
  await page.locator('.init-row', { hasText: 'Guerrero goblin 1' }).click();

  await page.getByRole('button', { name: /^Daño con ventaja: 1d6 \+ 2 cortante \+ 1d4 cortante/ }).first().click();
  await expect(page.locator('.plaque-label')).toHaveText('Guerrero goblin 1 · Cimitarra: daño con ventaja');

  await page.getByLabel('CD del conjuro del jugador').fill('40');
  await page.getByRole('button', { name: /Salvación de Sabiduría/ }).click();
  await expect(page.locator('.plaque-note')).toContainText('Falla la CD 40.');

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
  await page.getByRole('button', { name: 'Apresado', exact: true }).click();
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
  await expect(sheet.locator('.pc-sheet-grid')).toContainText('Paladín 3');
  await expect(sheet.locator('.pc-sheet-grid')).toContainText('35');
  await expect(sheet.locator('.pc-sheet-grid')).toContainText('ácido');
  await expect(sheet.locator('.pc-sheet-grid div', { hasText: 'Percepción pasiva' })).toContainText('11');
  await expect(sheet.locator('.pc-sheet-grid div', { hasText: /^CA/ })).toContainText('—');
  await expect(page.getByLabel('Notas')).toHaveValue('Odia a los kobolds\n\nEspecie: Dragonborn · Subclase: Oath of Devotion · Velocidad: 30 pies');

  // se puede volver a leer, y no se cambia nada si se cancela
  await page.getByRole('button', { name: 'Leer datos de la hoja' }).click();
  await expect(dialog.getByLabel('Añadir resistencias')).toBeDisabled();
  await dialog.getByRole('button', { name: 'No copiar nada' }).click();
  await expect(sheet.locator('.pc-sheet-grid')).toContainText('35');
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
  await page.waitForTimeout(600);
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
