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

test('con «reducir movimiento» se usan los dados 2D sin animación', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await open(page);
  await expect(page.locator('canvas.felt-3d')).toHaveCount(0);
  await expect(page.getByLabel(/^Dados 3D/)).toBeDisabled();
  await page.getByRole('button', { name: 'Tirar d20' }).click();
  await expect(page.locator('.plaque-in')).toBeVisible();
  await ctx.close();
});
