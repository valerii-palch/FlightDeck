import AuthenticationServices
import CryptoKit
import Foundation

@MainActor
final class GoogleOAuth: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    private let anchor: () -> ASPresentationAnchor
    init(anchor: @escaping () -> ASPresentationAnchor) { self.anchor = anchor }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { anchor() }

    func authorize() async throws -> (code: String, verifier: String) {
        guard session == nil else { throw CancellationError() }
        let verifier = UUID().uuidString + UUID().uuidString
        let digest = SHA256.hash(data: Data(verifier.utf8))
        let challenge = Data(digest).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        var parts = URLComponents(string: "https://dntuchblnbpxgvdggapw.supabase.co/auth/v1/authorize")!
        parts.queryItems = [
            URLQueryItem(name: "provider", value: "google"),
            URLQueryItem(name: "redirect_to", value: "flightdeck-auth://callback"),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "s256")
        ]
        return try await withCheckedThrowingContinuation { continuation in
            let auth = ASWebAuthenticationSession(url: parts.url!, callbackURLScheme: "flightdeck-auth") { [weak self] url, error in
                Task { @MainActor in
                    self?.session = nil
                    if let error { continuation.resume(throwing: error); return }
                    guard let url, url.scheme == "flightdeck-auth", url.host == "callback",
                          let code = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?
                            .first(where: { $0.name == "code" })?.value, !code.isEmpty else {
                        continuation.resume(throwing: URLError(.userAuthenticationRequired)); return
                    }
                    continuation.resume(returning: (code, verifier))
                }
            }
            auth.presentationContextProvider = self
            self.session = auth
            if !auth.start() {
                self.session = nil
                continuation.resume(throwing: URLError(.cannotLoadFromNetwork))
            }
        }
    }
}
