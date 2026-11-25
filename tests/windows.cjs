const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const { createRequire } = require('node:module');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const windows = resolve(__dirname, '../FlightDeck-Windows');
const requireWindows = createRequire(join(windows, 'package.json'));
const { _electron: electron } = requireWindows('playwright-core');

async function testApplication() {
  const profile = await mkdtemp(join(tmpdir(), 'flightdeck-test-'));
  let app;
  try {
    app = await electron.launch({
      cwd: windows,
      executablePath: requireWindows('electron'),
      args: ['.', '--user-data-dir=' + profile],
      timeout: 30000
    });
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.waitForSelector('#splash[aria-hidden="true"]', { state: 'attached' });
    assert.equal(await page.locator('#accessGate').isVisible(), true);
    assert.equal(await page.locator('#openDemo').count(), 0);

    await page.evaluate(() => {
      window.flightDeckSystemLanguages = ['ru'];
      applyLanguage();
      cloudSession = { user: { id: 'test-account', email: 'test@example.test' }, expiresAt: Date.now() + 3600000 };
      data.airports = [
        { icao: 'UUEE', name: 'Шереметьево', iata: 'SVO', timezone: 'Europe/Moscow' },
        { icao: 'USPP', name: 'Большое Савино', iata: 'PEE', timezone: 'Asia/Yekaterinburg' }
      ];
      render();
    });
    await page.locator('[data-action=settings]').click();
    assert.equal(await page.locator('#dialog input').count(), 0);
    assert.equal(await page.locator('#dialog fieldset').filter({ has: page.locator('[data-action=update]') }).locator('legend').textContent(), 'Обновления');
    await page.locator('#dialog [data-action=close]').click();
    await page.locator('#dialog').waitFor({ state: 'hidden' });

    await page.locator('#sidebarPages [data-page=pilot]').click();
    assert.equal(await page.locator('.pilot-profile-actions #cloudLogout').isVisible(), true);
    await page.locator('[data-action=profile-name]').click();
    await page.locator('#profileNameForm input').fill('Тестовый пилот');
    await page.locator('#profileNameForm button[type=submit]').click();
    assert.equal(await page.locator('.pilot-name h2').textContent(), 'Тестовый пилот');

    await page.locator('[data-action=new]').click();
    for (const [name, value] of Object.entries({ flightCode: 'afl', number: '002s', date: '23.11.2026', dep: 'UUEE', arr: 'USPP', std: '2335', localArrival: '0615' })) {
      await page.locator('#editForm [name=' + name + ']').fill(value);
    }
    assert.equal(await page.locator('#editForm [name=number]').inputValue(), '002S');
    assert.equal(await page.locator('#editForm [name=airline]').inputValue(), 'Аэрофлот');
    assert.equal(await page.locator('#editForm [name=std]').inputValue(), '23:35');
    assert.equal(await page.locator('#editForm [name=localDeparture]').inputValue(), '02:35');
    assert.equal(await page.locator('#editForm [name=sta]').inputValue(), '01:15');
    assert.equal(await page.locator('#editForm [name=staDate]').inputValue(), '24.11.2026');
    assert.equal(await page.locator('[data-planner-clock]:visible').count(), 1);
    assert.match(await page.locator('[data-utc-time]:visible').textContent(), /^\d{2}:\d{2}:\d{2} UTC$/);
    assert.match(await page.locator('[data-utc-date]:visible').textContent(), /^\d{2}\.\d{2}\.\d{4}$/);
    const identity = await page.locator('.planner-route-header > *').evaluateAll(elements =>
      elements.map(el => ({ x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth })));
    assert.equal(identity[0].y, identity[1].y);
    assert.ok(identity[0].x < identity[1].x && Math.abs(identity[0].width - identity[1].width) <= 1);
    assert.equal(await page.locator('#editForm [name=note]').count(), 0);
    for (const [tail, model, classes] of [
      ['RA-73709', 'Airbus A321-211', { business: 16, economy: 167 }],
      ['RA-73155', 'Airbus A350-900', { business: 28, comfort: 24, economy: 264 }],
      ['RA-73132', 'Boeing 777-300ER', { business: 30, comfort: 48, economy: 324 }]
    ]) {
      await page.locator('#editForm [name=tail]').selectOption(tail);
      await page.locator('#plannerNext').click();
      const seatMap = page.locator('#plannerSeatMap');
      assert.equal(await seatMap.locator('.seat-model').textContent(), model);
      const drawn = await seatMap.locator('.seat-section').evaluateAll(sections => Object.fromEntries(sections.map(section =>
        [section.dataset.cabin, section.querySelectorAll('i:not(.seat-gap)').length])));
      assert.deepEqual(drawn, classes);
      assert.equal(await page.locator('[data-planner-clock]:visible').count(), 1);
      assert.ok(await page.locator('#editForm [name=pax]').evaluate(field => Number(field.value) > 0 && Number(field.value) <= Number(field.max)));
      const positions = await page.locator('.planner-loading-grid > *').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().left));
      assert.ok(positions[0] < positions[1]);
      await page.locator('#plannerBack').click();
    }
    await page.locator('#plannerNext').click();
    await page.locator('#editForm [name=pax]').fill('42');
    await page.locator('#editForm [name=baggageKg]').fill('735');
    await page.locator('#editForm [name=cargoKg]').fill('215');
    assert.equal(await page.locator('#plannerLoadTrack').getAttribute('aria-valuenow'), '10');
    assert.equal(await page.locator('#plannerLoadTrack').evaluate(el => getComputedStyle(el, '::after').content), 'none');
    await page.locator('#plannerNext').click();
    assert.equal(await page.locator('[data-planner-clock]:visible').count(), 0);
    assert.match(await page.locator('#plannerSummary').textContent(), /42 \/ 402/);
    await page.locator('#plannerBack').click();
    assert.equal(await page.locator('#editForm [name=baggageKg]').inputValue(), '735');
    assert.equal(await page.locator('#editForm [name=cargoKg]').inputValue(), '215');
    await page.locator('#plannerNext').click();
    await page.locator('#plannerSave').click();
    await page.locator('#dialog').waitFor({ state: 'hidden' });
    await page.locator('[data-action=edit]').click();
    assert.equal(await page.locator('#editForm [name=note]').count(), 1);
    await page.locator('#editForm [name=note]').fill('Примечание после сохранения');
    await page.locator('#plannerSave').click();
    await page.locator('#dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => data.flights[0].note), 'Примечание после сохранения');
    await page.locator('#sidebarPages [data-page=journal]').click();
    assert.match(await page.locator('.flight-board tbody').textContent(), /AFL 002S/);
    assert.equal(await page.evaluate(() => data.flights[0].pax), 42);
    assert.equal(await page.evaluate(() => (flightTimes(data.flights[0]).scheduledArrival - flightTimes(data.flights[0]).scheduledDeparture) / 60000), 100);

    await page.evaluate(() => {
      window.flightDeckUpdateAvailable('0.4.6', '<ul><li>Первое &amp; второе</li></ul>');
      openApplicationUpdate();
    });
    assert.equal(await page.locator('#releaseNotes li').textContent(), 'Первое & второе');
    await page.locator('#closeUpdate').click();

    const nativeWindow = await app.browserWindow(page);
    await page.locator('[data-window-action=fullscreen]').click();
    await waitFor(() => nativeWindow.evaluate(window => window.isFullScreen()));
    await page.locator('[data-window-action=fullscreen]').click();
    await waitFor(() => nativeWindow.evaluate(window => !window.isFullScreen()));
    await page.locator('[data-window-action=minimize]').click();
    await waitFor(() => nativeWindow.evaluate(window => window.isMinimized()));
    await nativeWindow.evaluate(window => { window.restore(); window.focus(); });
    assert.deepEqual(errors, []);
    const closed = app.waitForEvent('close', { timeout: 10000 });
    await page.locator('[data-window-action=close]').click({ noWaitAfter: true });
    await closed;
    app = undefined;
    console.log('PASS: Windows startup, settings, profile, flight planning, journal, release notes, and native window actions');
  } finally {
    await app?.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 5 });
  }
}

async function waitFor(condition) {
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('Expected native window state was not reached');
}

testApplication().catch(error => { console.error(error); process.exitCode = 1; });
