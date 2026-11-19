import Foundation
import Security

struct CloudSession: Codable {
    struct User: Codable {
        let id: UUID
        let email: String?
    }

    let access_token: String
    let refresh_token: String
    let expires_in: Int
    let user: User
}

enum CloudError: LocalizedError {
    case credentials, emailNotConfirmed, rateLimited, session, service(Int), secureStorage(OSStatus), changedJournal
    var errorDescription: String? {
        switch self {
        case .credentials: return "Проверь email и пароль."
        case .emailNotConfirmed: return "Почта не подтверждена. Подтверди адрес и попробуй снова."
        case .rateLimited: return "Слишком много попыток входа. Попробуй позже."
        case .session: return "Сеанс закончился. Войди снова."
        case .service(let code): return "Облако недоступно (HTTP \(code))."
        case .secureStorage: return "Не удалось сохранить сеанс в защищенном хранилище."
        case .changedJournal: return "Журнал изменился. Подтверди сброс снова."
        }
    }
}

struct Cloud {
    private struct AuthFailure: Decodable {
        let error_code: String?
        let code: String?
    }

    private let base = URL(string: "https://dntuchblnbpxgvdggapw.supabase.co")!
    private let key = "sb_publishable_2G0lwSIutKWV7bS6ry72mg_x_B5EsYt"

    func signIn(email: String, password: String) async throws -> CloudSession {
        try await request("/auth/v1/token", query: [.init(name: "grant_type", value: "password")],
                          body: ["email": email, "password": password], passwordSignIn: true)
    }

    func exchangeGoogleCode(_ code: String, verifier: String) async throws -> CloudSession {
        try await request("/auth/v1/token", query: [.init(name: "grant_type", value: "pkce")],
                          body: ["auth_code": code, "code_verifier": verifier])
    }

    func renew(_ token: String) async throws -> CloudSession {
        do {
            return try await request("/auth/v1/token", query: [.init(name: "grant_type", value: "refresh_token")],
                                     body: ["refresh_token": token])
        } catch CloudError.service(let code) where [400, 401, 403].contains(code) {
            throw CloudError.session
        }
    }

    func journal(_ session: CloudSession) async throws -> Journal? {
        struct Row: Decodable { let journal: Journal }
        let rows: [Row] = try await request("/rest/v1/flightdeck_journals", query: [
            .init(name: "owner_id", value: "eq." + session.user.id.uuidString.lowercased()),
            .init(name: "select", value: "journal")
        ], token: session.access_token)
        return rows.first?.journal
    }

    private func request<T: Decodable>(_ path: String, query: [URLQueryItem],
                                      token: String? = nil, body: [String: String]? = nil,
                                      passwordSignIn: Bool = false) async throws -> T {
        let encoded = try body.map { try JSONEncoder().encode($0) }
        let data = try await responseData(path, query: query, token: token,
                                          method: encoded == nil ? "GET" : "POST", body: encoded,
                                          passwordSignIn: passwordSignIn)
        return try JSONDecoder().decode(T.self, from: data)
    }

    func resetProfile(_ session: CloudSession) async throws -> Journal? {
        let path = "/rest/v1/flightdeck_journals"
        let owner = URLQueryItem(name: "owner_id", value: "eq." + session.user.id.uuidString.lowercased())
        let data = try await responseData(path, query: [owner, .init(name: "select", value: "version,journal")],
                                          token: session.access_token)
        guard let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw CloudError.service(502)
        }
        guard let row = rows.first else { return nil }
        guard let version = row["version"] as? Int, var journal = row["journal"] as? [String: Any],
              journal["airports"] is [Any] else { throw CloudError.service(502) }
        journal["flights"] = [Any]()
        journal["profileName"] = ""
        let body = try JSONSerialization.data(withJSONObject: ["journal": journal, "version": version + 1])
        struct UpdatedRow: Decodable { let journal: Journal }
        let updated = try await responseData(path, query: [owner, .init(name: "version", value: "eq.\(version)")],
                                             token: session.access_token, method: "PATCH", body: body, representation: true)
        guard let result = try JSONDecoder().decode([UpdatedRow].self, from: updated).first else {
            throw CloudError.changedJournal
        }
        return result.journal
    }

    private func responseData(_ path: String, query: [URLQueryItem], token: String?,
                              method: String = "GET", body: Data? = nil,
                              passwordSignIn: Bool = false, representation: Bool = false) async throws -> Data {
        var components = URLComponents(url: base, resolvingAgainstBaseURL: false)!
        components.path = path
        components.queryItems = query
        var request = URLRequest(url: components.url!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        request.httpMethod = method
        request.setValue(key, forHTTPHeaderField: "apikey")
        if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if representation { request.setValue("return=representation", forHTTPHeaderField: "Prefer") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = body
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            if passwordSignIn {
                let failure = try? JSONDecoder().decode(AuthFailure.self, from: data)
                if status == 429 { throw CloudError.rateLimited }
                switch failure?.error_code ?? failure?.code {
                case "invalid_credentials": throw CloudError.credentials
                case "email_not_confirmed": throw CloudError.emailNotConfirmed
                default: break
                }
            }
            throw CloudError.service(status)
        }
        return data
    }
}

enum SessionKeychain {
    private static var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "FlightDeck iOS",
         kSecAttrAccount as String: "Supabase refresh token"]
    }

    static func load() -> String? {
        var request = query
        request[kSecReturnData as String] = true
        var result: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func save(_ token: String) throws {
        let attributes = [kSecValueData as String: Data(token.utf8)]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var item = query.merging(attributes) { _, value in value }
            item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            status = SecItemAdd(item as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw CloudError.secureStorage(status) }
    }

    static func clear() {
        SecItemDelete(query as CFDictionary)
    }
}
