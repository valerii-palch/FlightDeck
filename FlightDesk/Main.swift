import AppKit
import WebKit
import Security
import UniformTypeIdentifiers

final class WindowDragHandle: NSView {
    override func mouseDown(with event: NSEvent) {
        if event.clickCount == 1 { window?.performDrag(with: event) }
    }
}

final class FlightDesk: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKScriptMessageHandlerWithReply {
    // Match the header height and horizontal inset in style.css.
    private let toolbarHeight: CGFloat = 56
    private let toolbarInset: CGFloat = 16
    private var window: NSWindow!
    private var windowedContentSize = NSSize(width: 1400, height: 900)
    private var unconstrainedContentMaxSize = NSSize.zero
    private var webView: WKWebView!
    private var googleOAuth: GoogleOAuth?
    private let appUpdater = AppUpdater()
    private let testing = CommandLine.arguments.contains("--self-test")
    private var stateURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("FlightDesk/state.json")
    }

    private func configureApplicationMenu() {
        let language = Locale.preferredLanguages.compactMap {
            Locale(identifier: $0).language.languageCode?.identifier
        }.first { $0 == "ru" || $0 == "en" } ?? "en"
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

        let viewTitle = language == "ru" ? "Вид" : "View"
        let viewItem = NSMenuItem(title: viewTitle, action: nil, keyEquivalent: "")
        let viewMenu = NSMenu(title: viewTitle)
        let fullScreen = NSMenuItem(title: language == "ru" ? "Полноэкранный режим" : "Full Screen",
                                    action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fullScreen.keyEquivalentModifierMask = [.control, .command]
        viewMenu.addItem(fullScreen)
        viewItem.submenu = viewMenu
        menu.addItem(viewItem)
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
        controller.addUserScript(WKUserScript(source: "window.flightDeckTourCompleted = \(completed); window.flightDeckNativeWindow = true;",
            injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let languages = testing ? ["ru"] : Locale.preferredLanguages
        if let encoded = try? JSONEncoder().encode(languages),
           let json = String(data: encoded, encoding: .utf8) {
            controller.addUserScript(WKUserScript(source: """
                window.flightDeckSystemLanguages = \(json);
                """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
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
        let style: NSWindow.StyleMask = [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView]
        if let screen = NSScreen.main {
            let available = NSWindow.contentRect(forFrameRect: screen.visibleFrame, styleMask: style).size
            windowedContentSize.width = min(windowedContentSize.width, available.width)
            windowedContentSize.height = min(windowedContentSize.height, available.height)
        }
        window = NSWindow(contentRect: NSRect(origin: .zero, size: windowedContentSize),
                          styleMask: style, backing: .buffered, defer: false)
        window.delegate = self
        window.title = "FlightDeck"
        window.appearance = NSAppearance(named: .darkAqua)
        window.backgroundColor = NSColor(srgbRed: 9.0 / 255, green: 13.0 / 255, blue: 22.0 / 255, alpha: 1)
        window.collectionBehavior.insert(.fullScreenPrimary)
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.titlebarSeparatorStyle = .none
        window.contentView = webView
        unconstrainedContentMaxSize = window.contentMaxSize
        lockWindowedSize()
        let dragHandle = WindowDragHandle(frame: .zero)
        dragHandle.translatesAutoresizingMaskIntoConstraints = false
        webView.addSubview(dragHandle)
        NSLayoutConstraint.activate([
            dragHandle.leadingAnchor.constraint(equalTo: webView.leadingAnchor, constant: 106),
            dragHandle.trailingAnchor.constraint(equalTo: webView.trailingAnchor, constant: -220),
            dragHandle.topAnchor.constraint(equalTo: webView.topAnchor),
            dragHandle.heightAnchor.constraint(equalToConstant: toolbarHeight)
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

    private func lockWindowedSize() {
        window.contentMinSize = windowedContentSize
        window.contentMaxSize = windowedContentSize
        window.setContentSize(windowedContentSize)
    }

    func windowShouldZoom(_ window: NSWindow, toFrame newFrame: NSRect) -> Bool { false }

    func windowWillEnterFullScreen(_ notification: Notification) {
        window.contentMinSize = .zero
        window.contentMaxSize = unconstrainedContentMaxSize
    }

    func windowDidFailToEnterFullScreen(_ window: NSWindow) { lockWindowedSize() }

    func windowDidExitFullScreen(_ notification: Notification) {
        lockWindowedSize()
        alignNativeToolbar()
    }

    func windowDidResize(_ notification: Notification) {
        alignNativeToolbar()
    }

    private func alignNativeToolbar() {
        guard let window, !window.styleMask.contains(.fullScreen),
              let button = window.standardWindowButton(.closeButton), let webView,
              webView.bounds.height >= toolbarHeight else { return }
        let frame = webView.convert(button.convert(button.bounds, to: nil), from: nil)
        let centerY = webView.isFlipped ? webView.bounds.minY + toolbarHeight / 2
                                      : webView.bounds.maxY - toolbarHeight / 2
        let current = webView.convert(NSPoint(x: frame.minX, y: frame.midY), to: nil)
        let target = webView.convert(NSPoint(x: webView.bounds.minX + toolbarInset, y: centerY), to: nil)
        for kind in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] {
            guard let control = window.standardWindowButton(kind), let container = control.superview else { continue }
            let origin = container.convert(current, from: nil)
            let destination = container.convert(target, from: nil)
            var aligned = control.frame
            aligned.origin.x += destination.x - origin.x
            aligned.origin.y += destination.y - origin.y
            control.frame = aligned
        }
        webView.evaluateJavaScript("document.documentElement.dataset.nativeToolbar = '';")
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        alignNativeToolbar()
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
          check(!byId('openDemo'), 'demo mode removed');
          data.workspaceUnlocked=true;
          render();
          check(!byId('accessGate').hidden, 'saved unlock flag cannot bypass sign-in');
          cloudSession={user:{id:'test-user',email:'test@example.com'},expiresAt:Date.now()+3600000};
          render();
          check(document.querySelector('h1').textContent === 'Главная', 'initial view');
          const current={id:'active-test',number:'FD 100',tail:fleet[0].tail,dep:'UUEE',arr:'USPP',
            status:'Идет посадка',date:dateUTC(),std:'11:00',sta:'14:00',
            stages:{fuel:new Date().toISOString(),bags:new Date().toISOString(),board:new Date().toISOString()}};
          data.flights.push(current);
          tail=current.tail; selected=current.id; page='center'; render();
          check(document.querySelector('[data-next-flight]'), 'quick status button');
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
          const corrected = {status:'Выполнен',date:'2026-11-23',std:'22:00',sta:'00:30',
            atd:'22:08',ata:'00:38',atdDate:'2026-11-23',ataDate:'2026-11-24',actualMinutes:150};
          const other = {...corrected,status:'Запланирован',date:'2026-11-25',std:'09:00'};
          const nearest = {...other,date:'2026-11-24',std:'08:00'};
          const now = clockOn('2026-11-24','02:00');
          check(dashboardFlight([other,corrected,nearest],now).flight===nearest, 'closest scheduled flight');
          check(dashboardFlight([other,corrected,current],now).flight===current, 'active flight takes priority');
          data.flights.push({...current,...other,id:'next-test',date:'2099-01-01'});
          page='home'; render();
          check(document.querySelector('.dashboard-number').textContent.includes('FD 100'), 'dashboard displays active flight');
          changeFlightStatus(current,'Выполнен');
          check(document.querySelector('#dashboardFlightProgress').dataset.flightId==='next-test', 'dashboard switches after completion');
          changeFlightStatus(current,'Подготовка');
          check(document.querySelector('#dashboardFlightProgress').dataset.flightId===current.id, 'dashboard switches after status rollback');

          check(dashboardFlight([{...nearest,status:'Отменен'},corrected],now).flight===corrected,'completed flight fallback');
          check(setFlightStatus(corrected,'Запланирован') && journalStatus(corrected)==='Запланирован' &&
            !corrected.atd && !corrected.ata && !corrected.atdDate && !corrected.ataDate &&
            corrected.actualMinutes===null && !legFlown(corrected) && !delayBadge(corrected), 'corrected status clears stale completion');
          data.flights.length=0;
          check(validBackup(data), 'empty backup');
          applyCloudCopy({airports: [], flights: [], profileName: ''});
          document.querySelector('[data-page=pilot]').click();
          check(byId('cloudLogout') && !document.querySelector('[data-action=reset-profile]'), 'profile actions');
          document.querySelector('[data-action=settings]').click();
          const settings = byId('dialog');
          check(!settings.querySelector('input') && settings.querySelector('[data-action=reset-profile]'), 'settings actions');
          check(settings.querySelector('[data-action=update]')?.closest('fieldset')?.querySelector('legend')?.textContent==='Обновления', 'separate update settings');
          settings.close();
          document.querySelector('[data-action=profile-name]').click();
          const profileForm = byId('profileNameForm');
          profileForm.elements.profileName.value = 'Тестовый пилот';
          profileForm.requestSubmit();
          check(preferences().profileName === 'Тестовый пилот', 'editable profile');
          const notes=document.createElement('div');
          renderReleaseNotes(notes,'<ul><li>Изменение &amp; исправление</li></ul>');
          check(notes.querySelector('ul li')?.textContent==='Изменение & исправление','HTML release notes');
          renderReleaseNotes(notes,'- Первый пункт\\n- Второй пункт');
          check(notes.querySelectorAll('ul li').length===2,'Markdown release notes');
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
          check(!document.querySelector('.airport-preview :is(input,textarea)'), 'airport preview is read-only');
          document.querySelector('[data-airport-card="TEST"]').click();
          const airportCard = byId('airportCardForm');
          check(airportCard.querySelector('[readonly]'), 'airport card IATA is read-only');
          airportCard.elements.version.value = '1.3';
          airportCard.requestSubmit();
          check(airport('TEST').version === '1.3', 'airport scenery edit persisted');
          document.querySelector('[data-action=new]').click();
          check(document.querySelector('dialog[data-layout=flight] .flight-editor-footer button[type=submit]'), 'flight editor');
          const editor = byId('editForm');
          check(!editor.elements.atd && !editor.elements.ataDate && !editor.elements.note, 'new flight has no actual times or note');
          const routeHeader=editor.querySelector('.planner-route-header');
          check(routeHeader.firstElementChild.querySelector('[data-utc-time]').textContent.endsWith(' UTC'), 'route UTC clock line');
          check(routeHeader.firstElementChild.querySelector('[data-utc-date]').textContent===displayDate(dateUTC()), 'route UTC date line');
          for(const aircraft of fleet){
            const model=document.createElement('div');
            model.innerHTML=plannerSeatMap(aircraft);
            check(model.querySelectorAll('.seat-bank i:not(.seat-gap)').length===capacity(aircraft),'cabin capacity '+aircraft.short);
            model.innerHTML=fleetCabinDiagram(aircraft);
            check(model.querySelectorAll('.cabin-seat-shape').length===capacity(aircraft)&&!model.querySelector('text'),'fleet cabin diagram '+aircraft.short);
          }
          check(plannerSeatMap(fleet[0]).includes('data-cabin="business"') && !plannerSeatMap(fleet[0]).includes('data-cabin="comfort"'), 'A321 classes');

          const enter = (form, name, value) => {
            form.elements[name].value = value;
            form.elements[name].dispatchEvent(new Event('input', {bubbles:true}));
          };
          enter(editor,'flightCode','afl');
          check(editor.elements.flightCode.value==='AFL' && editor.elements.airline.value==='Аэрофлот', 'ICAO airline lookup');
          enter(editor,'airline','Aeroflot test');
          enter(editor,'number','002s');
          check(editor.elements.number.value === '002S' && editor.elements.airline.value==='Aeroflot test', 'flight number and airline override');
          enter(editor,'date','23.11.2026');
          enter(editor,'dep','UUEE');
          enter(editor,'arr','ULLI');
          enter(editor,'std','2335');
          check(editor.elements.std.value === '23:35' && editor.elements.localDeparture.value==='02:35', 'UTC to local next day');
          enter(editor,'localArrival','0420');
          check(editor.elements.sta.value==='01:20' && editor.elements.staDate.value==='24.11.2026', 'local to UTC and midnight rollover');
          check(byId('scheduledDuration').textContent.includes('45'), 'planned flight duration');
          enter(editor,'staDate','25.11.2026');
          check(flightTimes({date:'2026-11-23',std:'23:35',sta:'01:20',staDate:'2026-11-25'}).scheduledArrival===clockOn('2026-11-25','01:20'), 'explicit arrival date');
          editor.querySelector('[data-action=pick-date]').click();
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
          check(data.flights.filter(f=>f.demo).length===8, 'legacy demo flights kept in storage');
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
          enter(form,'flightCode','AFL');
          enter(form,'number','1201');
          enter(form,'dep','UUEE');
          enter(form,'arr','URSS');
          enter(form,'std','23:50');
          enter(form,'sta','03:45');
          byId('plannerNext').click();
          form.elements.pax.value = '386';
          form.elements.pax.dispatchEvent(new Event('input', {bubbles:true}));
          byId('plannerNext').click();
          form.requestSubmit();
          check(flight()?.tail === 'RA-73132' && flight().pax === 386, 'add 777 flight');
          check(document.querySelector('main').textContent.includes('03:45 +1 UTC'), 'midnight rollover');
          const parking = document.querySelector('[data-stand=depStand]');
          check(parking.options.length > 1, '777 parking');
          parking.selectedIndex = 1;
          parking.dispatchEvent(new Event('change', {bubbles:true}));
          check(flight().depStand === parking.value, 'stand selection');
          const snapshot = JSON.stringify(cloudSnapshot());
          const chooseLanguage = languages => {
            window.flightDeckSystemLanguages = languages;
            window.dispatchEvent(new Event('languagechange'));
          };
          chooseLanguage(['en']);
          check(document.documentElement.lang === 'en' && document.querySelector('h1').textContent === 'Flight center', 'English flight center');
          check(document.querySelector('#status option').textContent === 'Scheduled' &&
                document.querySelector('#status option').value === 'Запланирован', 'English label, canonical value');
          document.querySelector('[data-page=journal]').click();
          check(document.querySelector('h1').textContent === 'Logbook' && document.querySelector('.flight-board').textContent.includes('Completed'), 'English logbook');
          document.querySelector('[data-page=airports]').click();
          check(document.querySelector('h1').textContent === 'Airports' && countryName('RU') === 'Russia', 'English airports');
          chooseLanguage(['fr-FR', 'ru-RU']);
          check(document.documentElement.lang === 'ru' && document.querySelector('h1').textContent === 'Аэропорты', 'system language');
          chooseLanguage(['fr-FR']);
          check(document.documentElement.lang === 'en', 'fallback language');
          chooseLanguage(['ru']);
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
