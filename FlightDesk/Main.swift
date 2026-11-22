import AppKit
import WebKit
import Security
import UniformTypeIdentifiers

final class WindowDragHandle: NSView {
    override func mouseDown(with event: NSEvent) {
        if event.clickCount == 2 { window?.zoom(nil) }
        else { window?.performDrag(with: event) }
    }
}

final class FlightDesk: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKScriptMessageHandlerWithReply {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var googleOAuth: GoogleOAuth?
    private let appUpdater = AppUpdater()
    private let testing = CommandLine.arguments.contains("--self-test")
    private var stateURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("FlightDesk/state.json")
    }

    private func configureApplicationMenu() {
        let preference = UserDefaults.standard.string(forKey: "flightdeck.language") ?? "system"
        let systemLanguage = Locale.preferredLanguages.compactMap {
            Locale(identifier: $0).language.languageCode?.identifier
        }.first { $0 == "ru" || $0 == "en" } ?? "en"
        let language = ["ru", "en"].contains(preference) ? preference : systemLanguage
        let menu = NSMenu()
        let applicationItem = NSMenuItem()
        let applicationMenu = NSMenu(title: "FlightDeck")
        let quit = NSMenuItem(title: language == "ru" ? "Завершить FlightDeck" : "Quit FlightDeck",
                              action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        quit.keyEquivalentModifierMask = [.command]
        quit.target = NSApp
        applicationMenu.addItem(quit)
        applicationItem.submenu = applicationMenu
        menu.addItem(applicationItem)
        NSApp.mainMenu = menu
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        configureApplicationMenu()
        let configuration = WKWebViewConfiguration()
        if testing { configuration.websiteDataStore = .nonPersistent() }
        let controller = configuration.userContentController
        controller.add(self, name: "exportBackup")
        controller.add(self, name: "googleSignIn")
        controller.add(self, name: "completeOnboarding")
        if !testing {
            controller.add(self, name: "updateApplication")
            controller.addScriptMessageHandler(self, contentWorld: .page, name: "sessionStore")
        }
        let completed = testing || UserDefaults.standard.bool(forKey: "flightdeck.onboarding.v1")
        controller.addUserScript(WKUserScript(source: "window.flightDeckTourCompleted = \(completed);",
            injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let languages = Locale.preferredLanguages
        let language = testing ? "ru" : (UserDefaults.standard.string(forKey: "flightdeck.language") ?? "system")
        if let encoded = try? JSONEncoder().encode(["languages": languages, "preference": [language]]),
           let json = String(data: encoded, encoding: .utf8) {
            controller.addUserScript(WKUserScript(source: """
                { const settings = \(json);
                  window.flightDeckSystemLanguages = settings.languages;
                  window.flightDeckLanguage = settings.preference[0]; }
                """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        if !testing { controller.add(self, name: "saveLanguage") }
        controller.add(self, name: "closeWindow")
        controller.add(self, name: "toggleFullscreen")
        if !testing {
            if let key = UserDefaults.standard.string(forKey: "yandexMapsJavaScriptKey"),
               let encoded = try? JSONEncoder().encode(key),
               let json = String(data: encoded, encoding: .utf8) {
                controller.addUserScript(WKUserScript(source: "window.flightDeckMapsKey = " + json,
                    injectionTime: .atDocumentStart, forMainFrameOnly: true))
            }
        }
        if !testing {
            controller.add(self, name: "saveState")
            if let raw = try? Data(contentsOf: stateURL),
               let json = try? JSONSerialization.jsonObject(with: raw),
               let clean = try? JSONSerialization.data(withJSONObject: json),
               let text = String(data: clean, encoding: .utf8) {
                controller.addUserScript(WKUserScript(source: "window.flightDeskState = " + text,
                    injectionTime: .atDocumentStart, forMainFrameOnly: true))
            }
        }
        webView = WKWebView(frame: .zero, configuration: configuration)
        appUpdater.status = { [weak self] state in
            guard let data = try? JSONEncoder().encode(state), let json = String(data: data, encoding: .utf8) else { return }
            self?.webView.evaluateJavaScript("window.flightDeckUpdateStatus?.(\(json))")
        }
        appUpdater.available = { [weak self] version, notes in
            guard let data = try? JSONEncoder().encode([version, notes]),
                  let json = String(data: data, encoding: .utf8) else { return }
            self?.webView.evaluateJavaScript("window.flightDeckUpdateAvailable?.(...\(json))")
        }
        webView.navigationDelegate = self
        webView.uiDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1400, height: 810),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                          backing: .buffered, defer: false)
        window.title = "FlightDeck"
        window.appearance = NSAppearance(named: .darkAqua)
        window.backgroundColor = NSColor(srgbRed: 9.0 / 255, green: 13.0 / 255, blue: 22.0 / 255, alpha: 1)
        window.contentMinSize = NSSize(width: 1100, height: 640)
        window.collectionBehavior.insert(.fullScreenPrimary)
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        for kind in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] {
            window.standardWindowButton(kind)?.isHidden = true
        }
        window.contentView = webView
        let dragHandle = WindowDragHandle(frame: .zero)
        dragHandle.translatesAutoresizingMaskIntoConstraints = false
        webView.addSubview(dragHandle)
        NSLayoutConstraint.activate([
            dragHandle.leadingAnchor.constraint(equalTo: webView.leadingAnchor, constant: 106),
            dragHandle.trailingAnchor.constraint(equalTo: webView.trailingAnchor, constant: -220),
            dragHandle.topAnchor.constraint(equalTo: webView.topAnchor),
            dragHandle.heightAnchor.constraint(equalToConstant: 50)
        ])
        window.center()
        if !testing {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        }
        guard let html = Bundle.main.url(forResource: "FlightDesk", withExtension: "html") else { exit(1) }
        webView.loadFileURL(html, allowingReadAccessTo: html.deletingLastPathComponent())
        if testing { DispatchQueue.main.asyncAfter(deadline: .now() + 20) { exit(2) } }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.name == "sessionStore", message.frameInfo.isMainFrame,
              message.frameInfo.request.url?.standardizedFileURL == Bundle.main.url(forResource: "FlightDesk", withExtension: "html")?.standardizedFileURL,
              let request = message.body as? [String: String], let operation = request["operation"] else {
            replyHandler(nil, "Invalid session storage request")
            return
        }
        let key: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                  kSecAttrService as String: "local.flightdesk.app",
                                  kSecAttrAccount as String: "supabase-session"]
        var status: OSStatus
        switch operation {
        case "read":
            var query = key
            query[kSecReturnData as String] = true
            var item: CFTypeRef?
            status = SecItemCopyMatching(query as CFDictionary, &item)
            if status == errSecItemNotFound { replyHandler(NSNull(), nil); return }
            if status == errSecSuccess, let bytes = item as? Data, let value = String(data: bytes, encoding: .utf8) {
                replyHandler(value, nil)
                return
            }
        case "write":
            guard let value = request["value"], value.utf8.count <= 65_536 else {
                replyHandler(nil, "Invalid session data")
                return
            }
            let fields = [kSecValueData as String: Data(value.utf8)]
            status = SecItemUpdate(key as CFDictionary, fields as CFDictionary)
            if status == errSecItemNotFound { status = SecItemAdd(key.merging(fields) { _, new in new } as CFDictionary, nil) }
        case "clear":
            status = SecItemDelete(key as CFDictionary)
            if status == errSecItemNotFound { status = errSecSuccess }
        default:
            replyHandler(nil, "Invalid session storage operation")
            return
        }
        if status == errSecSuccess && operation != "read" { replyHandler(NSNull(), nil) }
        else { replyHandler(nil, "Keychain is unavailable") }
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let text = message.body as? String else { return }
        if message.name == "updateApplication" {
            if text == "check" { appUpdater.check() }
            if text == "install" { appUpdater.install() }
            return
        }
        if message.name == "closeWindow" { window.close(); return }
        if message.name == "toggleFullscreen" { window.toggleFullScreen(nil); return }
        if message.name == "googleSignIn" {
            if googleOAuth != nil { return }
            let auth = GoogleOAuth(anchor: { self.window })
            googleOAuth = auth
            Task { @MainActor in
                var result: [String: String]
                do {
                    let response = try await auth.authorize()
                    result = ["code": response.code, "verifier": response.verifier]
                } catch { result = ["error": "oauth_failed"] }
                googleOAuth = nil
                if let data = try? JSONEncoder().encode(result), let json = String(data: data, encoding: .utf8) {
                    _ = try? await webView.evaluateJavaScript("window.flightDeckGoogleResult?.(\(json))")
                }
            }
            return
        }
        if message.name == "completeOnboarding" {
            UserDefaults.standard.set(true, forKey: "flightdeck.onboarding.v1")
            return
        }
        if message.name == "saveLanguage" {
            if ["system", "ru", "en"].contains(text) {
                UserDefaults.standard.set(text, forKey: "flightdeck.language")
                configureApplicationMenu()
            }
            return
        }
        if message.name == "saveState" {
            do {
                try FileManager.default.createDirectory(at: stateURL.deletingLastPathComponent(), withIntermediateDirectories: true)
                try Data(text.utf8).write(to: stateURL, options: .atomic)
            } catch {
                webView.evaluateJavaScript("notice(tr('Не удалось записать данные на диск. Сохрани резервную копию.'))")
            }
        } else if message.name == "exportBackup" {
            let panel = NSSavePanel()
            panel.nameFieldStringValue = "flightdesk-backup.json"
            panel.allowedContentTypes = [.json]
            panel.beginSheetModal(for: window) { result in
                guard result == .OK, let url = panel.url else { return }
                do { try Data(text.utf8).write(to: url, options: .atomic) }
                catch {
                    self.webView.evaluateJavaScript("notice(tr('Не удалось сохранить резервную копию.'))")
                }
            }
        }
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        guard frame.isMainFrame, let bundled = Bundle.main.url(forResource: "FlightDesk", withExtension: "html"),
              frame.request.url?.standardizedFileURL == bundled.standardizedFileURL else {
            completionHandler(nil)
            return
        }
        let panel = NSOpenPanel()
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.allowedContentTypes = [.jpeg, .png, .webP, .json]
        panel.beginSheetModal(for: window) { response in
            completionHandler(response == .OK ? panel.urls : nil)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.navigationType == .linkActivated, action.sourceFrame.isMainFrame,
           let url = action.request.url,
           action.sourceFrame.request.url == Bundle.main.url(forResource: "FlightDesk", withExtension: "html"),
           (url.scheme == "mailto" && !url.path.isEmpty ||
            url.scheme == "https" && url.host == "mail.google.com") {
            if !NSWorkspace.shared.open(url) {
                webView.evaluateJavaScript("notice(tr('Открой ссылку Gmail в форме обратной связи.'))")
            }
            decisionHandler(.cancel)
            return
        }
        if action.navigationType == .linkActivated, action.sourceFrame.isMainFrame,
           let url = action.request.url, url.scheme == "https",
           (url.host == "yandex.ru" && url.path.hasPrefix("/maps") ||
            url.host == "commons.wikimedia.org" && url.path.hasPrefix("/wiki/File:") ||
            url.host == "nbc.aero" && url.path.hasPrefix("/media/gallery/")) {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard testing else { return }
        var fixture = "null"
        if let path = ProcessInfo.processInfo.environment["FLIGHTDECK_SELF_TEST_FIXTURE"],
           let raw = try? Data(contentsOf: URL(fileURLWithPath: path)),
           let json = try? JSONSerialization.jsonObject(with: raw),
           let encoded = try? JSONSerialization.data(withJSONObject: json),
           let serialized = String(data: encoded, encoding: .utf8) {
            fixture = serialized
        }
        webView.evaluateJavaScript("""
        (() => {
          const check = (condition, name) => { if (!condition) throw Error(name); };
          check(data.airports.length === 0 && data.flights.length === 0 && preferences().profileName === '', 'empty installation');
          check(!byId('accessGate').hidden && document.querySelector('.shell').hidden, 'initial authorization gate');
          byId('openDemo').click();
          check(data.flights.length > 0 && data.airports.length > 0 && fleet.every(a=>a.tail.startsWith('DEMO')), 'fictional workspace');
          check(document.querySelector('[data-next-flight]'), 'quick status button');
          const current = workingFlight(summaryFlights());
          const previousStatus = current.status;
          const preparationBefore = JSON.stringify(current.stages);
          document.querySelector('[data-next-flight]').click();
          check(current.status === nextStatus[previousStatus], 'advance active flight once');
          check(JSON.stringify(current.stages) === preparationBefore, 'changing status leaves existing preparation times');
          document.querySelector('[data-page=center]').click();
          const stage = document.querySelector('[data-next-stage]');
          check(stage?.dataset.nextStage === 'close', 'preparation button suggests unrecorded stage');
          stage.click();
          check(Number.isFinite(Date.parse(current.stages.close)), 'preparation button records stage time');
          check(displayDate('2026-11-20') === '20.11.2026' && parseDisplayDate('29.02.2024') === '2024-02-29' &&
                parseDisplayDate('29.02.2026') === '', 'fixed date format and leap year');
          data.flights.length=0;
          save();
          exitDemoWorkspace();
          check(data.flights.length === 0 && !byId('accessGate').hidden, 'demo remains separate');
          data.workspaceUnlocked=true;
          render();
          check(!byId('accessGate').hidden, 'saved unlock flag cannot bypass sign-in');
          cloudSession={user:{id:'test-user',email:'test@example.com'},expiresAt:Date.now()+3600000};
          render();
          check(document.querySelector('h1').textContent === 'Главная', 'initial view');
          check(validBackup(data), 'empty backup');
          applyCloudCopy({airports: [], flights: [], profileName: ''});
          document.querySelector('[data-page=pilot]').click();
          document.querySelector('[data-action=profile-name]').click();
          const settings = document.querySelector('#settingsForm');
          check(!settings.elements.mapsKey && !settings.elements.mapProvider && !settings.elements.density, 'obsolete settings hidden');
          settings.elements.profileName.value = 'Тестовый пилот';
          settings.requestSubmit();
          check(preferences().profileName === 'Тестовый пилот', 'editable profile');
          document.querySelector('[data-page=airports]').click();
          document.querySelector('[data-action=add-airport]').click();
          const airportForm = document.querySelector('#airportForm');
          airportForm.elements.icao.value = 'TEST';
          airportForm.elements.cityRu.value = 'Тестовый город';
          airportForm.elements.nameRu.value = 'Тестовый аэропорт';
          airportForm.elements.developer.value = 'Test Studio';
          airportForm.elements.version.value = '1.2';
          airportForm.requestSubmit();
          check(airport('TEST')?.developer === 'Test Studio' && airport('TEST')?.version === '1.2', 'airport scenery details');
          const version = document.querySelector('[data-airport-scenery=version]');
          version.value = '1.3';
          version.dispatchEvent(new Event('change', {bubbles:true}));
          check(cloudSnapshot().airports[0].version === '1.3', 'airport scenery edit persisted');
          document.querySelector('[data-action=new]').click();
          check(document.querySelector('dialog[data-layout=flight] .flight-editor-footer button[type=submit]'), 'flight editor');
          const editor = byId('editForm');
          editor.elements.std.value = '2335';
          editor.elements.std.dispatchEvent(new Event('input', {bubbles:true}));
          check(editor.elements.std.value === '23:35', 'numeric time entry adds separator');
          editor.querySelectorAll('[data-action=pick-date]').item(1).click();
          const calendar = document.querySelector('dialog.calendar-popover');
          const bounds = calendar.getBoundingClientRect();
          check(calendar.open && bounds.width > 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight, 'calendar fits viewport above form');
          calendar.querySelector('.calendar-days button.today').click();
          check(!calendar.isConnected && byId('dialog').open, 'date selection leaves editor open');
          document.querySelector('#dialog').close();
          const diversion = {id:'diversion-test',number:'TEST',tail:fleet[0].tail,dep:'UUEE',arr:'USPP',diversionAirport:'USSS',
            status:'Уход на запасной',date:'2026-11-20',std:'21:00',sta:'23:55',atd:'21:15',ata:'23:40'};
          data.flights.push(diversion);
          check(routeProgress(diversion) === 50 && routeOverview(diversion).includes('USSS'), 'alternate landing track');
          editContinuation(diversion);
          const onward = byId('continuationForm');
          check(onward.elements.date.value === '21.11.2026' && onward.elements.std.value === '00:40' && parseFlightTime(onward.elements.sta.value), 'onward flight defaults across midnight');
          onward.elements.std.value = '00:55';
          onward.requestSubmit();
          check(diversion.continuation?.std === '00:55', 'onward departure remains editable');
          diversion.continuation.status='Выполнен';
          diversion.continuation.ata='01:45';
          check(routeProgress(diversion) === 100, 'alternate route completed after onward landing');
          check(completedRoutes([diversion]).routes[0].codes.join('/') === 'USPP/UUEE', 'map retains scheduled endpoints');
          document.querySelector('[data-page=journal]').click();
          check(document.querySelectorAll('.flight-board tbody tr').length===2 &&
                document.querySelector('.board-original')?.textContent === 'Пермь', 'adjacent diversion and onward journal rows');
          const board=document.querySelector('.board-panel');
          check(board.scrollWidth<=board.clientWidth+1, 'logbook fits viewport');
          document.querySelector('[data-page=pilot]').click();
          check([...document.querySelectorAll('.profile-metrics .metric')].some(e=>e.querySelector('small').textContent==='Посадки' &&
                e.querySelector('strong').textContent==='2'), 'alternate and onward both count as landings');
          check(byId('profilePhotoInput') && document.querySelector('[data-action=pick-profile-photo]'), 'profile photo picker available');
          document.querySelector('[data-page=home]').click();
          const bar = document.querySelector('.activity-bars button');
          bar.dispatchEvent(new MouseEvent('pointerover', {bubbles:true}));
          check(bar.classList.contains('active') && document.querySelector('.activity-tooltip.visible')?.textContent.includes('Рейсов:'), 'activity tooltip highlights day');
          data.flights.pop();
          const fixture = \(fixture);
          if (!fixture) return 'PASS: calendar, numeric time, linked diversion, landing count, direct map, profile and activity';
          check(validBackup(fixture), 'legacy backup format');
          data = migrateDiversion(fixture);
          airportCode = '';
          pickTail(tail);
          render();
          check(capacity(fleet[2]) === 402 && fleet[2].stands === fleet[1].stands, '777');
          check(stands('UUEE').some(s => s.includes('118')), 'standing range');
          const sample = {...flight(), date:'2026-02-07', std:'09:10', status:'Идет посадка',
            stages:{board:'2026-02-07T08:47:00Z'}};
          check(forecast(sample).includes('09:17 UTC · +7 мин'), 'delay prediction');
          check(validBackup(data), 'backup format');
          check(summaryFlights().length===48 && flightStats(summaryFlights()).minutes===9007, 'A321 PDF total');
          check(data.flights.filter(f=>f.demo).length===8, 'demo flights');
          const diverted = data.flights.find(f=>f.number==='SU 1485');
          check(continuationLeg(diverted)?.number==='SU 1485' && arrivalDelay(diverted)===195, 'linked diversion');
          document.querySelector('[data-page=journal]').click();
          check(document.querySelector('.flight-board') && document.querySelector('#typeFilter'), 'flight board');
          check(data.airports.every(a=>/^[A-Z]{3}$/.test(a.iata)), 'IATA catalog');
          check(arrivalDelay({date:'2026-02-07',std:'23:50',sta:'03:45',atd:'00:01',ata:'04:01'})===16,'late overnight arrival');
          check(arrivalDelay({date:'2026-02-07',std:'23:50',sta:'03:45',atd:'23:53',ata:'03:40'})===-5,'early overnight arrival');
          check(stands('ZJSY').includes('Любая стоянка'), 'unrestricted stands');
          document.querySelector('[data-page=fleet]').click();
          check(document.querySelectorAll('.aircraft-art').length===1,'fleet artwork');
          document.querySelector('[data-slide-focus=next]').click();
          check(document.querySelector('.fleet-slide h2').textContent.includes('A350'),'carousel next');
          document.querySelector('[data-aircraft="RA-73155"]').click();
          check(document.querySelector('h1').textContent==='RA-73155','aircraft detail');
          document.querySelector('[data-page=pilot]').click();
          check(document.querySelector('[data-action=profile-name]'),'pilot logbook');
          document.querySelector('[data-page=journal]').click();
          check(document.querySelectorAll('.arrival-late').length>0,'journal late styling');
          document.querySelector('[data-page=airports]').click();
          check(document.querySelectorAll('[data-airport]').length === 9 && filteredAirports().every(isDomestic), 'airport UI');
          check(data.airports.every(a=>airportPhotos[a.icao]?.url), 'airport photo catalog');
          const country = document.querySelector('#airportCountry');
          country.value = 'TR';
          country.dispatchEvent(new Event('change', {bubbles:true}));
          check(filteredAirports().length > 0 && filteredAirports().every(a=>airportCountry(a)==='TR'), 'country filter');
          check(document.querySelector('.airport-photo img') !== null, 'airport photo markup');
          document.querySelector('[data-tail="RA-73132"]').click();
          document.querySelector('[data-action=new]').click();
          const form = document.querySelector('#editForm');
          form.elements.dep.value = 'UUEE';
          form.elements.arr.value = 'URSS';
          form.elements.std.value = '23:50';
          form.elements.sta.value = '03:45';
          form.elements.pax.value = '386';
          form.requestSubmit();
          check(flight()?.tail === 'RA-73132' && flight().pax === 386, 'add 777 flight');
          check(document.querySelector('main').textContent.includes('03:45 +1 UTC'), 'midnight rollover');
          const parking = document.querySelector('[data-stand=depStand]');
          check(parking.options.length > 1, '777 parking');
          parking.selectedIndex = 1;
          parking.dispatchEvent(new Event('change', {bubbles:true}));
          check(flight().depStand === parking.value, 'stand selection');
          const snapshot = JSON.stringify(cloudSnapshot());
          const chooseLanguage = value => {
            document.querySelector('[data-action=settings]').click();
            const settings = document.querySelector('#settingsForm');
            settings.elements.language.value = value;
            settings.requestSubmit();
          };
          chooseLanguage('en');
          check(document.documentElement.lang === 'en' && document.querySelector('h1').textContent === 'Flight center', 'English flight center');
          check(document.querySelector('#status option').textContent === 'Scheduled' &&
                document.querySelector('#status option').value === 'Запланирован', 'English label, canonical value');
          document.querySelector('[data-page=journal]').click();
          check(document.querySelector('h1').textContent === 'Logbook' && document.querySelector('.flight-board').textContent.includes('Completed'), 'English logbook');
          document.querySelector('[data-page=airports]').click();
          check(document.querySelector('h1').textContent === 'Airports' && countryName('RU') === 'Russia', 'English airports');
          window.flightDeckSystemLanguages = ['fr-FR', 'ru-RU'];
          chooseLanguage('system');
          check(document.documentElement.lang === 'ru' && document.querySelector('h1').textContent === 'Аэропорты', 'system language');
          window.flightDeckSystemLanguages = ['fr-FR'];
          chooseLanguage('system');
          check(document.documentElement.lang === 'en', 'fallback language');
          chooseLanguage('ru');
          check(JSON.stringify(cloudSnapshot()) === snapshot, 'language leaves journal intact');
          return 'PASS: flight editing, journal, airports and language selection';
        })()
        """) { result, error in
            if let error { fputs("\(error)\n", stderr); exit(1) }
            print(result ?? "No test result")
            exit(result == nil ? 1 : 0)
        }
    }
}

@main
struct FlightDeckMain {
    @MainActor static func main() {
        let app = NSApplication.shared
        let delegate = FlightDesk()
        app.delegate = delegate
        app.setActivationPolicy(CommandLine.arguments.contains("--self-test") ? .accessory : .regular)
        app.run()
    }
}
