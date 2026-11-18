import SwiftUI
import MessageUI

struct HelpAnchorKey: PreferenceKey {
    static var defaultValue: [String: Anchor<CGRect>] { [:] }
    static func reduce(value: inout [String: Anchor<CGRect>], nextValue: () -> [String: Anchor<CGRect>]) {
        value.merge(nextValue()) { _, new in new }
    }
}

struct HelpOverlay: View {
    let frame: CGRect
    let title: String
    let message: String
    let step: Int
    let count: Int
    let language: String
    let next: () -> Void
    let previous: () -> Void
    let close: () -> Void
    @AccessibilityFocusState private var focused: Bool
    private func t(_ key: String) -> String { FlightLanguage.text(key, language: language) }

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                Color.black.opacity(0.7)
                    .mask {
                        Rectangle().overlay {
                            RoundedRectangle(cornerRadius: 18)
                                .frame(width: max(0, frame.width), height: max(0, frame.height))
                                .position(x: frame.midX, y: frame.midY)
                                .blendMode(.destinationOut)
                        }.compositingGroup()
                    }
                RoundedRectangle(cornerRadius: 18).strokeBorder(.blue, lineWidth: 2)
                    .frame(width: max(0, frame.width), height: max(0, frame.height))
                    .position(x: frame.midX, y: frame.midY)
                    .allowsHitTesting(false)
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Text("\(step + 1) / \(count)").font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        Button(t("Пропустить"), action: close)
                    }
                    Text(title).font(.headline).accessibilityFocused($focused)
                    Text(message).font(.subheadline).fixedSize(horizontal: false, vertical: true)
                    HStack {
                        Button(t("Назад"), action: previous).disabled(step == 0)
                        Spacer()
                        Button(t(step == count - 1 ? "Готово" : "Далее"), action: next).buttonStyle(.borderedProminent)
                    }
                }
                .padding(20)
                .frame(maxWidth: min(350, max(0, proxy.size.width - 32)))
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: frame.midY < proxy.size.height / 2 ? .bottom : .top)
                .padding(.vertical, 24)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {}
        .accessibilityAddTraits(.isModal)
        .onAppear { focused = true }
        .onChange(of: step) { _, _ in focused = true }
    }
}

struct FeedbackView: View {
    let language: String
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var subject = "FlightDeck"
    @State private var message = ""
    @State private var composing = false
    @State private var status: String?
    private let recipient = "valvah2000@gmail.com"
    private func t(_ key: String) -> String { FlightLanguage.text(key, language: language) }
    private var bodyText: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        return message + "\n\nFlightDeck \(version) · iOS · \(language)"
    }
    private var gmail: URL {
        var parts = URLComponents(string: "https://mail.google.com/mail/")!
        parts.queryItems = [URLQueryItem(name: "view", value: "cm"), URLQueryItem(name: "fs", value: "1"),
                            URLQueryItem(name: "to", value: recipient), URLQueryItem(name: "su", value: "FlightDeck · " + subject),
                            URLQueryItem(name: "body", value: bodyText)]
        return parts.url!
    }
    var body: some View {
        NavigationStack {
            Form {
                TextField(t("Тема"), text: $subject)
                Section(t("Сообщение")) { TextEditor(text: $message).frame(minHeight: 180) }
                Text(t("Получатель") + ": " + recipient).font(.footnote).foregroundStyle(.secondary)
                Text(t("Откроется черновик письма. Отправь его из почты, чтобы сообщение дошло."))
                    .font(.footnote).foregroundStyle(.secondary)
                if MFMailComposeViewController.canSendMail() {
                    Button(t("Открыть письмо")) { status = nil; composing = true }
                        .disabled(message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || subject.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                Button(t("Написать через Gmail")) { openURL(gmail) }
                    .disabled(message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                if let status { Text(t(status)).font(.footnote) }
            }
            .navigationTitle(t("Обратная связь"))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(t("Закрыть")) { dismiss() } } }
            .sheet(isPresented: $composing) {
                MailDraft(recipient: recipient, subject: "FlightDeck · " + subject, message: bodyText) { result in
                    composing = false
                    switch result {
                    case .sent: status = "Письмо отправлено."
                    case .saved: status = "Черновик сохранен."
                    case .failed: status = "Не удалось отправить письмо. Попробуй Gmail."
                    default: break
                    }
                }
            }
        }
    }
}

private struct MailDraft: UIViewControllerRepresentable {
    let recipient: String
    let subject: String
    let message: String
    let completion: (MFMailComposeResult) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(completion: completion) }
    func makeUIViewController(context: Context) -> MFMailComposeViewController {
        let controller = MFMailComposeViewController()
        controller.setToRecipients([recipient])
        controller.setSubject(subject)
        controller.setMessageBody(message, isHTML: false)
        controller.mailComposeDelegate = context.coordinator
        return controller
    }
    func updateUIViewController(_ controller: MFMailComposeViewController, context: Context) {}
    final class Coordinator: NSObject, MFMailComposeViewControllerDelegate {
        let completion: (MFMailComposeResult) -> Void
        init(completion: @escaping (MFMailComposeResult) -> Void) { self.completion = completion }
        func mailComposeController(_ controller: MFMailComposeViewController, didFinishWith result: MFMailComposeResult, error: Error?) {
            completion(error == nil ? result : .failed)
        }
    }
}
