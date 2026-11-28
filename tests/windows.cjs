const assert = require('node:assert/strict');
const { mkdtemp, rm, mkdir, readFile } = require('node:fs/promises');
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
      executablePath: process.env.FLIGHTDECK_TEST_EXE || requireWindows('electron'),
      args: [...(process.env.FLIGHTDECK_TEST_EXE?[]:['.']), '--user-data-dir=' + profile],
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
    await page.locator('#dialog [data-action=close]').first().click();
    await page.locator('#dialog').waitFor({ state: 'hidden' });

    await page.locator('#sidebarPages [data-page=pilot]').click();
    assert.equal(await page.locator('.pilot-profile-actions #cloudLogout').isVisible(), true);
    await page.locator('[data-action=profile-name]').click();
    await page.locator('#profileNameForm input').fill('Тестовый пилот');
    await page.locator('#profileNameForm button[type=submit]').click();
    assert.equal(await page.locator('.pilot-name h2').textContent(), 'Тестовый пилот');

    await page.locator('[data-action=new]').click();
    const tabs = page.locator('[data-step-indicator]');
    const activeStep = () => page.locator('[data-flight-step]:visible').getAttribute('id');
    const wizardSize = () => page.locator('#dialog').evaluate(el => [el.offsetWidth, el.offsetHeight]);
    const initialWizardSize = await wizardSize();
    for (const tab of [1, 2]) {
      await tabs.nth(tab).click();
      assert.equal(await activeStep(), 'planner-route');
    }
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
      assert.deepEqual(await wizardSize(), initialWizardSize);
      assert.equal(await seatMap.locator('.seat-legend').count(), 1);
      const drawn = await seatMap.locator('.seat-section').evaluateAll(sections => Object.fromEntries(sections.map(section =>
        [section.dataset.cabin, section.querySelectorAll('.cabin-seat').length])));
      assert.deepEqual(drawn, classes);
      const geometry = await seatMap.locator('.seat-row').evaluateAll(rows => rows.every(row => {
        const bounds = row.getBoundingClientRect();
        const left = row.querySelector('[data-bank=left]').getBoundingClientRect();
        const right = row.querySelector('[data-bank=right]').getBoundingClientRect();
        const center = row.querySelector('[data-bank=center]')?.getBoundingClientRect();
        return Math.abs(left.left - bounds.left) < 1 && Math.abs(right.right - bounds.right) < 1 &&
          (center ? Math.abs(center.left + center.right - bounds.left - bounds.right) < 2 &&
            left.right < center.left && center.right < right.left : left.right < right.left);
      }));
      assert.equal(geometry, true, model + ' seat banks must align with windows and aisles');
      const squareSeats = await seatMap.locator('.cabin-seat').evaluateAll(seats => seats.every(seat => {
        const { width, height } = seat.getBoundingClientRect();
        return width > 0 && Math.abs(width - height) < 0.1;
      }));
      assert.equal(squareSeats, true, model + ' seats must remain square');
      assert.equal(await page.locator('[data-planner-clock]:visible').count(), 1);
      assert.ok(await page.locator('#editForm [name=pax]').evaluate(field => Number(field.value) > 0 && Number(field.value) <= Number(field.max)));
      const positions = await page.locator('.planner-loading-grid > *').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().left));
      assert.ok(positions[0] < positions[1]);
      const sideGutter = await seatMap.evaluate(panel =>
        (panel.getBoundingClientRect().width - panel.querySelector('.seat-figure').getBoundingClientRect().width) / 2);
      assert.ok(sideGutter <= 15);
      const passengerField = page.locator('#editForm [name=pax]');
      const capacity = Object.values(classes).reduce((sum, count) => sum + count, 0);
      for (const count of [0, 1, Math.floor(capacity / 2), capacity - 1, capacity, capacity + 1, 0]) {
        await passengerField.fill(String(count));
        const occupied = Math.min(count, capacity);
        const percent = Math.round(occupied / capacity * 100);
        assert.equal(await seatMap.locator('.seat-occupied').count(), occupied);
        assert.equal(await seatMap.locator('.cabin-seat:not(.seat-occupied)').count(), capacity - occupied);
        assert.equal(await page.locator('#plannerLoadTrack').getAttribute('aria-valuenow'), String(percent));
        assert.match(await page.locator('#plannerLoad').textContent(), new RegExp('^' + occupied + ' / ' + capacity));
        assert.equal(await passengerField.evaluate(field => field.validity.rangeOverflow), count > capacity);
        const counters = await seatMap.locator('[data-cabin-count]').evaluateAll(labels => Object.fromEntries(labels.map(label => [
          label.dataset.cabinCount, label.textContent
        ])));
        const occupiedByClass = await seatMap.locator('.seat-section').evaluateAll(sections => Object.fromEntries(sections.map(section =>
          [section.dataset.cabin, section.querySelectorAll('.seat-occupied').length])));
        assert.deepEqual(counters, Object.fromEntries(Object.entries(classes).map(([kind, total]) =>
          [kind, occupiedByClass[kind] + ' / ' + total])));
      }
      await passengerField.fill('');
      await page.locator('#plannerBack').click();
    }
    await tabs.nth(1).click();
    assert.equal(await activeStep(), 'planner-loading');
    await page.locator('#editForm [name=pax]').fill('42');
    await page.locator('#editForm [name=baggageKg]').fill('');
    await tabs.nth(0).click();
    await tabs.nth(2).click();
    assert.equal(await activeStep(), 'planner-loading');
    assert.equal(await page.locator('#editForm [name=baggageKg]').evaluate(field => field === document.activeElement), true);
    await page.locator('#editForm [name=baggageKg]').fill('735');
    await page.locator('#editForm [name=cargoKg]').fill('215');
    assert.equal(await page.locator('#plannerLoadTrack').getAttribute('aria-valuenow'), '10');
    assert.equal(await page.locator('#plannerLoadTrack').evaluate(el => getComputedStyle(el, '::after').content), 'none');
    await tabs.nth(2).click();
    assert.equal(await activeStep(), 'planner-review');
    assert.deepEqual(await wizardSize(), initialWizardSize);
    assert.equal(await page.locator('[data-planner-clock]:visible').count(), 0);
    assert.match(await page.locator('#plannerSummary').textContent(), /42 \/ 402/);
    await tabs.nth(0).click();
    assert.equal(await activeStep(), 'planner-route');
    await tabs.nth(2).click();
    assert.equal(await activeStep(), 'planner-review');
    await tabs.nth(1).click();
    assert.equal(await activeStep(), 'planner-loading');
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
      window.flightDeckUpdateAvailable('0.5.0', '<ul><li>Первое &amp; второе</li></ul>');
      openApplicationUpdate();
    });
    assert.equal(await page.locator('#releaseNotes li').textContent(), 'Первое & второе');
    await page.locator('#closeUpdate').click();

    await mkdir(resolve(__dirname, 'ui-artifacts'), {recursive:true});
    await page.evaluate(() => {
      const f=data.flights[0];
      Object.assign(f,{status:'Вылетел',date:'2026-11-27',std:'23:00',sta:'01:00',staDate:'2026-11-28',atd:'23:45',atdDate:'2026-11-27'});
      page='home'; render();
    });
    assert.equal(await page.locator('.flight-route-summary .day-offset').first().textContent(), '+1');
    assert.match(await page.locator('.flight-route-summary').textContent(), /01:45/);
    for(const theme of ['morning','day','evening','night']){
      await page.evaluate(theme=>{
        updateDaylight=()=>{document.body.dataset.daylight=theme;};
        updateDaylight();
      },theme);
      await page.waitForTimeout(2600);
      assert.equal(await page.evaluate(()=>document.body.dataset.daylight),theme);
      await page.screenshot({path:resolve(__dirname,'ui-artifacts/home-'+theme+'.png')});
      const colors=await page.locator('.dashboard-card').evaluateAll(cards=>cards.map(card=>getComputedStyle(card).getPropertyValue('--section-rgb').trim()));
      assert.equal(new Set(colors).size,1);
    }
    await page.addScriptTag({content:await readFile(resolve(__dirname,'layout-check.js'),'utf8')});
    const layoutWindow=await app.browserWindow(page);
    const originalLayoutSize=await layoutWindow.evaluate(window=>window.getContentSize());
    for(const size of [[1100,760],[1400,900]]) {
      await layoutWindow.evaluate((window,size)=>window.setContentSize(...size),size);
      for(const theme of ['morning','day','evening','night']) {
        console.log(await page.evaluate(theme=>verifyFlightLayout(theme),theme));
        await page.screenshot({path:resolve(__dirname,'ui-artifacts/layout-'+theme+'-'+size[0]+'.png')});
        await page.evaluate(()=>restoreFlightLayoutFixture());
      }
    }
    await layoutWindow.evaluate((window,size)=>window.setContentSize(...size),originalLayoutSize);
    await page.locator('.flight-open').click();
    await page.waitForTimeout(400);
    await page.screenshot({path:resolve(__dirname,'ui-artifacts/card.png')});
    await page.locator('[data-action=edit]').click();
    assert.equal(await page.locator('#editForm [name=pax]').count(),0);
    assert.equal(await page.locator('#editForm [name=std]').count(),0);
    await page.locator('#editForm [name=atdLocal]').fill('03:45');
    assert.equal(await page.locator('#editForm [name=atd]').inputValue(),'00:45');
    assert.equal(await page.locator('#editForm [name=atdDate]').inputValue(),'28.11.2026');
    await page.screenshot({path:resolve(__dirname,'ui-artifacts/editor.png')});
    await page.locator('#plannerSave').click();
    await page.locator('#dialog').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>data.flights[0].std),'23:00');
    assert.equal(await page.evaluate(()=>data.flights[0].pax),42);

    for(const key of ['fuel','bags','board','close']){
      await page.evaluate(key=>editStage(key),key);
      await page.locator('#stageForm [name=localDate]').fill('28.11.2026');
      await page.locator('#stageForm [name=localTime]').fill('02:30');
      assert.equal(await page.locator('#stageForm [name=date]').inputValue(),'27.11.2026');
      assert.equal(await page.locator('#stageForm [name=time]').inputValue(),'23:30');
      await page.screenshot({path:resolve(__dirname,'ui-artifacts/stage-'+key+'.png')});
      await page.locator('#stageForm button[type=submit],#stageForm button:not([type])').first().click();
      await page.locator('#dialog').waitFor({state:'hidden'});
      assert.equal(await page.evaluate(key=>data.flights[0].stages[key],key),'2026-11-27T23:30:00Z');
    }
    await page.evaluate(()=>{
      data.airports[0].hubLevel=2; data.airports[1].hubLevel=1;
      editFlight();
    });
    assert.deepEqual(await page.locator('#icaoChoices option').evaluateAll(options=>options.map(o=>o.value)),['USPP','UUEE']);
    const order=await page.locator('#editForm input').evaluateAll(inputs=>inputs.map(i=>i.name));
    assert.ok(order.indexOf('localDeparture')<order.indexOf('std'));
    await page.locator('#dialog [data-action=close]').first().click();
    await page.locator('[data-action=settings]').click();
    assert.equal(await page.locator('#settingsTitle').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.body.dataset.inputMode),'keyboard');
    assert.notEqual(await page.locator('#dialog :focus').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
    await page.locator('#dialog [data-action=close]').first().click();
    assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).userSelect),'none');
    await page.evaluate(()=>editFlight(data.flights[0]));
    assert.equal(await page.locator('#editForm textarea').evaluate(el=>getComputedStyle(el).userSelect),'text');
    await page.locator('#dialog [data-action=close]').first().click();
    for(const kind of ['flights','airports']){
      const before=await page.evaluate(()=>JSON.stringify(cloudSnapshot()));
      await page.evaluate(kind=>confirmCollectionClear(kind),kind);
      assert.equal(await page.locator('#confirmCollectionClear').isDisabled(),true);
      assert.equal(await page.locator('#clearConsent').isChecked(),false);
      await page.screenshot({path:resolve(__dirname,'ui-artifacts/clear-'+kind+'.png')});
      await page.locator('#dialog [data-action=close]').first().click();
      assert.equal(await page.evaluate(()=>JSON.stringify(cloudSnapshot())),before);
    }
    const beforeClear=await page.evaluate(()=>JSON.parse(JSON.stringify(data)));
    await page.evaluate(()=>{
      window.originalClearCollection=clearCloudCollection;
      clearCloudCollection=async kind=>{
        if(kind==='flights')data.flights=[];
        else {data.airportHistory=archiveFlightAirports(cloudSnapshot());data.airports=[];}
      };
    });
    for(const kind of ['flights','airports']){
      await page.evaluate(({fixture,kind})=>{data=structuredClone(fixture);confirmCollectionClear(kind);},{fixture:beforeClear,kind});
      await page.locator('#clearConsent').check();
      assert.equal(await page.locator('#confirmCollectionClear').isDisabled(),false);
      await page.locator('#confirmCollectionClear').click();
      await page.locator('#dialog').waitFor({state:'hidden'});
      const cleared=await page.evaluate(()=>JSON.parse(JSON.stringify(data)));
      assert.equal(cleared[kind].length,0);
      assert.deepEqual(cleared[kind==='flights'?'airports':'flights'],beforeClear[kind==='flights'?'airports':'flights']);
      assert.deepEqual(cleared.preferences,beforeClear.preferences);
    }
    await page.evaluate(fixture=>{clearCloudCollection=window.originalClearCollection;data=fixture;},beforeClear);
    await page.evaluate(()=>{
      page='fleet';render();
    });
    await page.screenshot({path:resolve(__dirname,'ui-artifacts/fleet.png')});
    await page.evaluate(()=>{page='pilot';render();});
    assert.equal(await page.locator('.achievement-mark svg').count(),7);
    await page.screenshot({path:resolve(__dirname,'ui-artifacts/achievements.png')});
    await page.evaluate(()=>{
      const base=data.flights[0];
      data.flights=['Выполнен','Выполнен','Вылетел','Подготовка','Запланирован','Задержан','Отменен','Уход на запасной'].map((status,index)=>({
        ...base,id:'color-'+index,status,date:'2026-11-27',std:'09:00',sta:'11:00',staDate:'2026-11-27',
        atd:['Выполнен','Вылетел','Уход на запасной'].includes(status)?'09:05':'',atdDate:'2026-11-27',
        ata:status==='Выполнен'?(index===0?'10:55':'11:30'):'',ataDate:'2026-11-27',
        diversionAirport:status==='Уход на запасной'?'UUWW':'',continuation:undefined
      }));
      page='journal';render();
    });
    const fills=await page.locator('.flight-board tbody tr').evaluateAll(rows=>rows.map(row=>({
      image:getComputedStyle(row).backgroundImage,
      color:getComputedStyle(row).backgroundColor
    })));
    assert.ok(fills.length>=8);
    assert.ok(fills.every(fill=>fill.image.includes('linear-gradient')&&fill.color==='rgba(0, 0, 0, 0)'));
    await page.screenshot({path:resolve(__dirname,'ui-artifacts/journal-statuses.png')});
    await page.evaluate(()=>{page='airports';airportCountryFilter='RU';render();});
    assert.equal(await page.locator('.airport-list button').first().getAttribute('data-airport'),'USPP');
    await page.screenshot({path:resolve(__dirname,'ui-artifacts/airport-hubs.png')});
    await page.evaluate(()=>openAirportCard('USPP'));
    await page.locator('#airportCardForm [name=hubLevel]').selectOption('0');
    await page.locator('#airportCardForm button[type=submit]').click();
    assert.equal(await page.evaluate(()=>airport('USPP').hubLevel),0);
    assert.equal(await page.locator('.airport-list button').first().getAttribute('data-airport'),'UUEE');
    assert.equal(await page.locator('.airport-list .hub-badge').count(),1);
    if(process.env.FLIGHTDECK_EXPECT_MAPS==='1'){
      assert.equal(await page.evaluate(()=>!!tilesKey),true);
      await page.route('https://tiles.api-maps.yandex.ru/**',route=>route.continue());
      for(const section of ['pilot','airports']){
        await page.evaluate(section=>{
          data.flights=[{...data.flights[0],status:'Выполнен',atd:'09:00',ata:'11:00',diversionAirport:'',continuation:undefined}];
          page=section;airportCode='UUEE';airportCountryFilter='RU';render();
        },section);
        await page.waitForFunction(()=>document.querySelector('#onlineMap.loaded .tile-map-pictures img')?.naturalWidth>0,{},{timeout:30000});
        assert.match(await page.locator('.tile-map-pictures').evaluate(el=>getComputedStyle(el).filter),/invert/);
        assert.equal(await page.locator('.tile-map-credit').evaluate(el=>getComputedStyle(el).filter),'none');
        await page.locator('[data-tile-airport=UUEE]').click();
        if(section==='airports'){
          await page.locator('#airportCardForm').waitFor();
          await page.locator('#dialog [data-action=close]').first().click();
        }
      }
      console.log('PASS: live dark basemaps in the installed Windows application');
    }

    const nativeWindow = await app.browserWindow(page);
    const initialSize = await nativeWindow.evaluate(window => window.getContentSize());
    const workArea = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workAreaSize);
    assert.deepEqual(initialSize, [Math.min(1400, workArea.width), Math.min(900, workArea.height)]);
    assert.equal(await nativeWindow.evaluate(window => window.isResizable()), false);
    assert.equal(await nativeWindow.evaluate(window => window.isMaximizable()), false);
    await page.locator('[data-window-action=fullscreen]').click();
    await waitFor(() => nativeWindow.evaluate(window => window.isFullScreen()));
    await page.locator('[data-window-action=fullscreen]').click();
    await waitFor(() => nativeWindow.evaluate((window, size) =>
      !window.isFullScreen() && window.getContentSize().every((dimension, index) => dimension === size[index]), initialSize));
    assert.equal(await nativeWindow.evaluate(window => window.isResizable()), false);
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
