import ActivityKit
import AuthenticationServices
import BackgroundTasks
import SwiftUI

private let flightRefreshInterval: TimeInterval = 120

@MainActor
final class FlightStore: ObservableObject {
    @Published private(set) var journal: Journal?
    @Published private(set) var email: String?
    @Published private(set) var busy = false
    @Published private(set) var updated: Date?
    @Published private(set) var error: String?
    @Published private(set) var signedIn = false

    @Published private(set) var activity = Activity<FlightActivityAttributes>.activities.first
    @Published private(set) var activityError: String?

    private let cloud = Cloud()
    private var session: CloudSession?
    private var expires = Date.distantPast
    private(set) var canRestoreSession = true

    func signIn(email: String, password: String) async {
        guard !busy else { return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            try accept(await cloud.signIn(email: email, password: password))
            try await download()
        } catch { await report(error) }
    }

    func signInWithGoogle(anchor: ASPresentationAnchor?) async {
        guard !busy else { return }
        guard let anchor else {
            error = "Не удалось открыть окно входа Google. Попробуй еще раз."
            return
        }
        busy = true
        error = nil
        defer { busy = false }
        do {
            let oauth = GoogleOAuth(anchor: { anchor })
            let result = try await oauth.authorize()
            try accept(await cloud.exchangeGoogleCode(result.code, verifier: result.verifier))
            try await download()
        } catch let failure as ASWebAuthenticationSessionError where failure.code == .canceledLogin {
            return
        } catch { await report(error) }
    }

    func refresh() async {
        guard !busy, !Task.isCancelled, session != nil || canRestoreSession else { return }
        busy = true
        defer { busy = false }
        var savedToken: String?
        if session == nil {
            guard UIApplication.shared.isProtectedDataAvailable else { return }
            savedToken = await Task.detached(priority: .utility) { SessionKeychain.load() }.value
            guard !Task.isCancelled else { return }
            canRestoreSession = savedToken != nil
            guard canRestoreSession else { return }
        }
        error = nil
        do { try await download(restoringWith: savedToken) } catch { await report(error) }
    }

    func signOut() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        await clear()
        error = nil
    }

    func resetProfile() async -> Bool {
        guard let session, !busy else { return false }
        busy = true
        error = nil
        defer { busy = false }
        do {
            do {
                journal = try await cloud.resetProfile(session)
            } catch CloudError.service(401) {
                let renewed = try await cloud.renew(session.refresh_token)
                try accept(renewed)
                journal = try await cloud.resetProfile(renewed)
            }
            updated = .now
            await updateActivity()
            return true
        } catch {
            await report(error)
            return false
        }
    }

    private func clear() async {
        SessionKeychain.clear()
        session = nil
        canRestoreSession = false
        signedIn = false
        email = nil
        journal = nil
        updated = nil
        for current in Activity<FlightActivityAttributes>.activities {
            await current.end(nil, dismissalPolicy: .immediate)
        }
        activity = nil
        activityError = nil
    }

    private func accept(_ session: CloudSession) throws {
        try SessionKeychain.save(session.refresh_token)
        self.session = session
        canRestoreSession = true
        expires = .now.addingTimeInterval(TimeInterval(session.expires_in))
        email = session.user.email
        signedIn = true
    }

    private func download(restoringWith savedToken: String? = nil) async throws {
        if session == nil || expires.timeIntervalSinceNow < 60 {
            guard UIApplication.shared.isProtectedDataAvailable else { return }
            guard let token = session?.refresh_token ?? savedToken else { throw CloudError.session }
            try accept(await cloud.renew(token))
        }
        guard let session else { throw CloudError.session }
        do {
            journal = try await cloud.journal(session)
        } catch CloudError.service(401) {
            guard UIApplication.shared.isProtectedDataAvailable else { return }
            let renewed = try await cloud.renew(session.refresh_token)
            try accept(renewed)
            journal = try await cloud.journal(renewed)
        }
        updated = .now
        await updateActivity()
    }

    func setTrackedFlight(_ flight: Flight?) async {
        guard !busy, signedIn else { return }
        busy = true
        defer { busy = false }
        activityError = nil

        for current in Activity<FlightActivityAttributes>.activities {
            await current.end(nil, dismissalPolicy: .immediate)
        }
        activity = nil
        guard let flight, canTrack(flight) else { return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            activityError = "Разреши Live Activity для FlightDeck в настройках iPhone."
            return
        }
        do {
            activity = try Activity.request(
                attributes: FlightActivityAttributes(flightID: flight.id),
                content: activityContent(for: flight),
                pushType: nil
            )
        } catch {
            activityError = "Не удалось запустить Live Activity. Попробуй еще раз."
        }
    }

    func updateActivityLanguage(_ language: String) async {
        guard let activity else { return }
        let content = activity.content
        guard content.state.language != language else { return }
        var state = content.state
        state.language = language
        await activity.update(ActivityContent(state: state, staleDate: content.staleDate))
    }

    func canTrack(_ flight: Flight) -> Bool {
        flight.status != "Выполнен" && flight.status != "Отменен"
    }

    func observeActivity() async {
        guard let current = activity else { return }
        for await state in current.activityStateUpdates {
            guard !Task.isCancelled, activity?.id == current.id else { return }
            if state == .dismissed || state == .ended {
                activity = nil
                return
            }
        }
    }

    private func updateActivity() async {
        guard let current = activity else { return }
        guard let flight = journal?.flights.first(where: { $0.id == current.attributes.flightID }),
              canTrack(flight) else {
            await current.end(nil, dismissalPolicy: .immediate)
            if activity?.id == current.id { activity = nil }
            return
        }
        await current.update(activityContent(for: flight))
    }

    private func activityContent(for flight: Flight) -> ActivityContent<FlightActivityAttributes.ContentState> {
        let airports = journal?.airports ?? []
        let departure = airports.first { $0.icao == flight.dep }?.iata
        let arrival = airports.first { $0.icao == flight.arr }?.iata
        let state = FlightActivityAttributes.ContentState(
            number: flight.number.flatMap { $0.isEmpty ? nil : $0 },
            departure: departure.flatMap { $0.isEmpty ? nil : $0 } ?? flight.dep,
            arrival: arrival.flatMap { $0.isEmpty ? nil : $0 } ?? flight.arr,
            status: flight.status,
            plannedArrivalUTC: flight.leg.arrival.map(utcClock),
            diversionAirport: flight.diverted ? flight.diversionAirport : nil,
            language: FlightLanguage.current
        )
        return ActivityContent(state: state, staleDate: (updated ?? .now).addingTimeInterval(flightRefreshInterval + 30))
    }

    private func report(_ failure: Error) async {
        if Task.isCancelled { return }
        if let cloudError = failure as? CloudError, case .session = cloudError { await clear() }
        if failure is DecodingError {
            error = "Не удалось прочитать облачный журнал."
        } else if failure is URLError {
            error = "Не удалось подключиться к облаку. Потяни экран вниз, чтобы повторить."
        } else {
            error = failure.localizedDescription
        }
    }
}

@main
@MainActor
struct FlightDeckApp: App {
    private static let refreshIdentifier = "app.flightdeck.mobile.refresh"
    @StateObject private var store = FlightStore()
    @Environment(\.scenePhase) private var phase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var launchComplete = false

    var body: some Scene {
        WindowGroup {
            ZStack {
                if launchComplete {
                    FlightDeckView(store: store)
                } else {
                    FlightLaunchView()
                }
            }
            .animation(reduceMotion ? nil : .easeOut(duration: 0.22), value: launchComplete)
            .task {
                do { try await Task.sleep(for: .seconds(2)) } catch { return }
                launchComplete = true
            }
            .task(id: store.activity?.id) { await store.observeActivity() }
            .task(id: phase) {
                guard phase == .active else { return }
                let clock = ContinuousClock()
                while !Task.isCancelled {
                    let next = clock.now.advanced(by: .seconds(flightRefreshInterval))
                    // A scene change must not interrupt a refresh-token rotation.
                    await Task { await store.refresh() }.value
                    guard !Task.isCancelled else { return }
                    launchComplete = true
                    do { try await clock.sleep(until: next) } catch { return }
                }
            }
            .onChange(of: store.signedIn) { _, signedIn in
                if !signedIn {
                    BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.refreshIdentifier)
                }
            }
        }
        .onChange(of: phase) { _, phase in
            if phase == .background, store.signedIn { scheduleRefresh() }
        }
        .backgroundTask(.appRefresh(Self.refreshIdentifier)) {
            await store.refresh()
            if store.canRestoreSession { scheduleRefresh() }
        }
    }

    private func scheduleRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: Self.refreshIdentifier)
        request.earliestBeginDate = .now.addingTimeInterval(flightRefreshInterval)
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            // Foreground refresh still works when iOS disables background refresh.
        }
    }
}

private struct FlightLaunchView: View {
    var body: some View {
        ZStack {
            Color("LaunchNavy")
            RadialGradient(colors: [Color(red: 0.10, green: 0.32, blue: 0.64).opacity(0.66), .clear],
                           center: .center, startRadius: 28, endRadius: 260)
            Image("LaunchMark")
                .resizable()
                .frame(width: 120, height: 120)
                .shadow(color: .blue.opacity(0.42), radius: 30)
                .accessibilityHidden(true)
                .overlay(alignment: .top) {
                    VStack(spacing: 18) {
                        Text("FlightDeck")
                            .font(.system(size: 36, weight: .bold, design: .rounded))
                            .tracking(-0.8)
                            .foregroundStyle(.white)
                        ProgressView()
                            .tint(Color(red: 0.58, green: 0.79, blue: 1))
                            .accessibilityLabel(FlightLanguage.text("Запуск FlightDeck", language: FlightLanguage.current))
                    }
                    .fixedSize()
                    .offset(y: 138)
                }
        }
        .ignoresSafeArea()
        .environment(\.colorScheme, .dark)
        .statusBarHidden()
    }
}

struct FlightDeckView: View {
    @ObservedObject var store: FlightStore
    @AppStorage("includeDemo") private var includeDemo = false
    @AppStorage("flightdeck.theme") private var theme = "system"
    @State private var tab = 0
    @State private var demoMode = false
    @AppStorage("flightdeck.onboarding.v1") private var helpCompleted = false
    @State private var helpStep: Int?
    private let helpPages = [0, 1, 1]
    private var helpTitles: [String] { ["Актуальный рейс под рукой", "Аккаунт FlightDeck", "Настрой FlightDeck под себя"] }
    private var helpMessages: [String] { ["Здесь виден актуальный рейс, время и статус. Потяни экран вниз, чтобы обновить журнал.", "Один аккаунт открывает общий журнал на компьютере и iPhone.", "В профиле можно выбрать язык, повторить обучение и написать обратную связь."] }
    private func finishHelp() { helpCompleted = true; helpStep = nil }

    @AppStorage(FlightLanguage.preferenceKey) private var language = "system"
    private var languageCode: String { FlightLanguage.resolve(language) }
    private func t(_ key: String, _ args: String...) -> String { FlightLanguage.text(key, language: languageCode, args: args) }

    var body: some View {
        Group {
            if store.signedIn {
                personalWorkspace
            } else if demoMode {
                NavigationStack {
                    DemoFlightView(languageCode: languageCode) { demoMode = false }
                        .background(background)
                        .navigationTitle("FlightDeck")
                }
            } else {
                NavigationStack {
                    ProfileView(store: store, includeDemo: $includeDemo, language: $language, languageCode: languageCode,
                                theme: $theme, replayHelp: {}, openDemo: { demoMode = true })
                        .navigationTitle(t("Вход в FlightDeck"))
                }
            }
        }
        .onChange(of: store.signedIn) { _, signedIn in
            if signedIn { demoMode = false; tab = 0 }
            else { helpStep = nil }
        }
        .preferredColorScheme(theme == "dark" ? .dark : theme == "light" ? .light : nil)
        .tint(.blue)
        .task(id: languageCode) { await store.updateActivityLanguage(languageCode) }
    }

    private var personalWorkspace: some View {
        TabView(selection: $tab) {
            NavigationStack {
                ScrollView {
                    TimelineView(.periodic(from: .now, by: 30)) { time in
                        dashboard(at: time.date)
                            .anchorPreference(key: HelpAnchorKey.self, value: .bounds) { ["flight": $0] }
                    }
                    .padding(20)
                    .frame(maxWidth: 580)
                    .frame(maxWidth: .infinity)
                }
                .refreshable { await store.refresh() }
                .background(background)
                .navigationTitle("FlightDeck")
            }
            .tabItem { Label(t("Рейс"), systemImage: "airplane") }
            .tag(0)

            NavigationStack {
                ProfileView(store: store, includeDemo: $includeDemo, language: $language, languageCode: languageCode,
                            theme: $theme, replayHelp: { tab = 0; helpStep = 0 })
                    .navigationTitle(t("Профиль"))
            }
            .tabItem { Label(t("Профиль"), systemImage: "person.crop.circle") }
            .tag(1)
        }
        .accessibilityHidden(helpStep != nil)
        .overlayPreferenceValue(HelpAnchorKey.self) { anchors in
            GeometryReader { proxy in
                if let step = helpStep {
                    let key = step == 0 ? "flight" : step == 1 ? "account" : "help"
                    let fallback = CGRect(x: 12, y: 80, width: max(0, proxy.size.width - 24), height: 100)
                    let frame = anchors[key].map { proxy[$0] } ?? fallback
                    HelpOverlay(frame: frame, title: t(helpTitles[step]), message: t(helpMessages[step]),
                                step: step, count: helpTitles.count, language: languageCode,
                                next: {
                                    if step == helpTitles.count - 1 { finishHelp() }
                                    else { tab = helpPages[step + 1]; helpStep = step + 1 }
                                }, previous: {
                                    if step > 0 { tab = helpPages[step - 1]; helpStep = step - 1 }
                                }, close: finishHelp)
                }
            }
            .allowsHitTesting(helpStep != nil)
        }
        .task { if !helpCompleted { tab = 0; helpStep = 0 } }
    }

    private var background: some View {
        LinearGradient(colors: [.blue.opacity(0.18), .indigo.opacity(0.07), .clear],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
            .ignoresSafeArea()
    }

    @ViewBuilder private func dashboard(at now: Date) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            if let journal = store.journal,
               let selection = FlightSelection.choose(journal.flights, now: now, includeDemo: includeDemo) {
                FlightCard(languageCode: languageCode, selection: selection, airports: journal.airports)
                if store.canTrack(selection.flight), store.activity?.attributes.flightID != selection.flight.id {
                    Button {
                        Task { await store.setTrackedFlight(selection.flight) }
                    } label: {
                        Label(t("Следить за рейсом"), systemImage: "livephoto")
                    }
                    .buttonStyle(.bordered)
                    .disabled(store.busy)
                }
            } else if !store.signedIn && !store.busy {
                VStack(alignment: .leading, spacing: 12) {
                    Label(t("Облачный журнал"), systemImage: "icloud")
                        .font(.title2.bold())
                    Text(t("Войди под тем же аккаунтом, что и в FlightDeck на компьютере."))
                        .foregroundStyle(.secondary)
                    Button(t("Открыть профиль")) { tab = 1 }
                        .buttonStyle(.borderedProminent)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(22)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24))
            } else if store.busy {
                ProgressView(t("Загружаем журнал…"))
            } else if store.updated != nil {
                ContentUnavailableView(t("Рейсов пока нет"), systemImage: "airplane",
                                       description: Text(store.journal == nil
                                         ? t("Синхронизируй журнал в FlightDeck на компьютере.")
                                         : t("В облачном журнале нет рейсов для отображения.")))
            }
            if store.signedIn, store.activity != nil {
                Button {
                    Task { await store.setTrackedFlight(nil) }
                } label: {
                    Label(t("Остановить слежение"), systemImage: "stop.circle")
                }
                .buttonStyle(.bordered)
                .disabled(store.busy)
            }
            if let activityError = store.activityError {
                Text(t(activityError)).font(.footnote).foregroundStyle(.orange)
            }
            if let error = store.error {
                Label(FlightLanguage.error(error, language: languageCode), systemImage: "exclamationmark.icloud")
                    .font(.footnote)
                    .foregroundStyle(.orange)
            }
            if let updated = store.updated {
                Label(t("Обновлено в %@ UTC", utcClock(updated)), systemImage: "icloud")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct FlightCard: View {
    let languageCode: String
    private func t(_ key: String, _ args: String...) -> String { FlightLanguage.text(key, language: languageCode, args: args) }
    let selection: FlightSelection
    let airports: [Airport]
    private var flight: Flight { selection.flight }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(t(selection.title)).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
            Text((flight.number?.isEmpty == false ? flight.number : nil) ?? t("Без номера")).font(.largeTitle.bold())
            Text("\(flight.date) · \(flight.tail)").font(.subheadline).foregroundStyle(.secondary)
            HStack(alignment: .top, spacing: 10) {
                endpoint(flight.dep, alignment: .leading)
                Image(systemName: "airplane").foregroundStyle(.blue).accessibilityHidden(true)
                endpoint(flight.arr, alignment: .trailing)
            }
            Divider()
            if let minutes = flight.estimatedMinutes {
                Text(t("Примерное время") + " · \(minutes / 60) " + (languageCode == "ru" ? "ч" : "h") + " \(minutes % 60) " + (languageCode == "ru" ? "мин" : "min"))
                    .font(.footnote).foregroundStyle(.secondary)
            }
            times(t("Вылет"), plan: flight.leg.departure, actual: flight.leg.actualDeparture)
            times(t("Прилет"), plan: flight.leg.arrival, actual: flight.finalArrival)
            Label(t(flight.status), systemImage: "circle.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(statusColor)
            if let difference = flight.arrivalDifference, difference != 0 {
                Text(difference > 0 ? t("Задержка на %@ мин", String(difference)) : t("Раньше на %@ мин", String(-difference)))
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(difference > 0 ? Color.orange : Color.green)
            }
            if flight.diverted, let alternate = flight.diversionAirport {
                Text(t("Запасной аэропорт · %@", alternate)).font(.footnote).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(22)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 26))
        .overlay(RoundedRectangle(cornerRadius: 26).strokeBorder(.blue.opacity(0.18)))
    }

    private var statusColor: Color {
        switch flight.status {
        case "Выполнен": .green
        case "Задержан": .orange
        case "Отменен": .red
        case "Уход на запасной": .purple
        default: .blue
        }
    }

    private func endpoint(_ code: String, alignment: HorizontalAlignment) -> some View {
        let airport = airports.first { $0.icao == code }
        return VStack(alignment: alignment, spacing: 4) {
            Text(code).font(.title2.bold())
            if let iata = airport?.iata, !iata.isEmpty { Text(iata).font(.caption).foregroundStyle(.secondary) }
            if let city = airport?.city(language: languageCode) {
                Text(city).font(.footnote).foregroundStyle(.secondary)
                    .multilineTextAlignment(alignment == .leading ? .leading : .trailing)
            }
        }
        .frame(maxWidth: .infinity, alignment: alignment == .leading ? .leading : .trailing)
    }

    private func times(_ title: String, plan: Date?, actual: Date?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title + " · UTC").font(.subheadline.bold())
            Text(t("План  %@   ·   Факт  %@", flightClock(plan), flightClock(actual)))
                .font(.footnote.monospacedDigit())
                .foregroundStyle(.secondary)
        }
    }

    private func flightClock(_ value: Date?) -> String {
        guard let value else { return "—" }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        guard let day = Leg.utc(flight.date, "00:00") else { return utcClock(value) }
        let offset = calendar.dateComponents([.day], from: day, to: calendar.startOfDay(for: value)).day ?? 0
        return utcClock(value) + (offset == 0 ? "" : " (\(offset > 0 ? "+" : "")\(offset))")
    }
}

struct ProfileView: View {
    @State private var feedbackPresented = false
    @State private var resetPresented = false
    @ObservedObject var store: FlightStore
    @Binding var includeDemo: Bool
    @Binding var language: String
    let languageCode: String
    @Binding var theme: String
    let replayHelp: () -> Void
    var openDemo: (() -> Void)? = nil
    private func t(_ key: String) -> String { FlightLanguage.text(key, language: languageCode) }
    @State private var email = ""
    @State private var password = ""
    @AppStorage("flightdeck.displayName") private var displayName = ""

    private var googleWindow: ASPresentationAnchor? {
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }.flatMap(\.windows)
        return windows.first(where: \.isKeyWindow)
            ?? windows.first { !$0.isHidden && $0.windowLevel == .normal }
    }

    var body: some View {
        Form {
            Section(t("Аккаунт FlightDeck")) {
                if store.signedIn {
                    if let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? store.journal?.profileName : displayName,
                       !name.isEmpty { Text(name).font(.headline) }
                    if let email = store.email { Text(email).foregroundStyle(.secondary) }
                    Button(t("Обновить журнал")) { Task { await store.refresh() } }
                        .disabled(store.busy)
                    Button(t("Выйти"), role: .destructive) { Task { await store.signOut() } }
                        .disabled(store.busy)
                } else {
                    Button(t("Продолжить с Google")) {
                        let window = googleWindow
                        Task { await store.signInWithGoogle(anchor: window) }
                    }
                    .disabled(store.busy)
                    TextField("Email", text: $email)
                        .textContentType(.username).keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    SecureField(t("Пароль"), text: $password).textContentType(.password)
                    Button(t("Войти")) {
                        let login = email.trimmingCharacters(in: .whitespacesAndNewlines)
                        let enteredPassword = password
                        Task {
                            await store.signIn(email: login, password: enteredPassword)
                            if store.signedIn { password = "" }
                        }
                    }
                    .disabled(store.busy || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || password.isEmpty)
                    if let openDemo {
                        Button(t("Продолжить без входа · Демо"), action: openDemo)
                            .disabled(store.busy)
                    }
                }
                if store.busy { ProgressView() }
                if let error = store.error { Text(FlightLanguage.error(error, language: languageCode)).foregroundStyle(.orange) }
            }
            .anchorPreference(key: HelpAnchorKey.self, value: .bounds) { ["account": $0] }
            if store.signedIn {
                Section(t("Настройки")) {
                    TextField(t("Имя в профиле"), text: $displayName)
                        .textContentType(.nickname)
                        .onChange(of: displayName) { _, value in
                            if value.count > 80 { displayName = String(value.prefix(80)) }
                        }
                    Picker(t("Язык"), selection: $language) {
                        Text(t("Как в системе")).tag("system")
                        Text("Русский").tag("ru")
                        Text("English").tag("en")
                    }
                    Picker(t("Оформление"), selection: $theme) {
                        Text(t("Как в системе")).tag("system")
                        Text(t("Светлая")).tag("light")
                        Text(t("Темная")).tag("dark")
                    }
                }
                Section {
                    Button(t("Повторить обучение"), action: replayHelp)
                    Button(t("Обратная связь")) { feedbackPresented = true }
                }
                .anchorPreference(key: HelpAnchorKey.self, value: .bounds) { ["help": $0] }
                Section(t("Отображение")) {
                    Toggle(t("Показывать деморейсы"), isOn: $includeDemo)
                }
                Section {
                    Button(t("Сбросить рейсы и профиль"), role: .destructive) { resetPresented = true }
                        .disabled(store.busy)
                }
            }
        }
        .sheet(isPresented: $feedbackPresented) { FeedbackView(language: languageCode) }
        .alert(t("Сбросить рейсы и профиль?"), isPresented: $resetPresented) {
            Button(t("Отмена"), role: .cancel) {}
            Button(t("Удалить все рейсы"), role: .destructive) {
                Task { if await store.resetProfile() { displayName = "" } }
            }
        } message: {
            Text(t("Все рейсы и имя профиля будут удалены из облака. Аэропорты сохранятся."))
        }
    }
}

private struct DemoFlightView: View {
    let languageCode: String
    let exit: () -> Void
    @State private var selected = 0

    private func t(_ key: String) -> String { FlightLanguage.text(key, language: languageCode) }

    private let airports = [
        Airport(icao: "ZZNA", iata: "ZNA", name: "North Bay", cityRu: "Норд-Бей", cityEn: "North Bay"),
        Airport(icao: "ZZSC", iata: "ZSC", name: "Sun Coast", cityRu: "Солнечный Берег", cityEn: "Sun Coast"),
        Airport(icao: "ZZSP", iata: "ZSP", name: "Silver Port", cityRu: "Серебряный Порт", cityEn: "Silver Port")
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(t("Демо")).font(.title2.bold())
                Picker(t("Рейс"), selection: $selected) {
                    Text("FD 100").tag(0)
                    Text("FD 101").tag(1)
                    Text("FD 102").tag(2)
                }
                .pickerStyle(.segmented)
                if let flight = demoFlight {
                    FlightCard(languageCode: languageCode,
                               selection: FlightSelection(flight: flight, title: "Демо"), airports: airports)
                }
                Button(t("Выйти из демо"), action: exit).buttonStyle(.bordered)
            }
            .padding(20)
            .frame(maxWidth: 580)
            .frame(maxWidth: .infinity)
        }
    }

    private var demoFlight: Flight? {
        let day = ISO8601DateFormatter.string(from: .now,
            timeZone: TimeZone(secondsFromGMT: 0)!, formatOptions: [.withFullDate])
        let examples = [
            ("ZZNA", "ZZSC", "DEMO-A1", "Идет посадка"),
            ("ZZSC", "ZZSP", "DEMO-A2", "Выполнен"),
            ("ZZSP", "ZZNA", "DEMO-B1", "Запланирован")
        ]
        let (departure, arrival, tail, status) = examples[selected]
        var row = [
            "id": "example-\(selected)", "number": "FD \(100 + selected)", "tail": tail,
            "date": day, "dep": departure, "arr": arrival, "status": status, "std": "11:00", "sta": "14:00"
        ]
        if selected == 1 { row["atd"] = "11:15"; row["ata"] = "14:36" }
        guard let encoded = try? JSONEncoder().encode(row) else { return nil }
        return try? JSONDecoder().decode(Flight.self, from: encoded)
    }
}

private func utcClock(_ date: Date) -> String {
    let format = DateFormatter()
    format.locale = Locale(identifier: "en_US_POSIX")
    format.timeZone = TimeZone(secondsFromGMT: 0)
    format.dateFormat = "HH:mm"
    return format.string(from: date)
}
