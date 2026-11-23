import AppKit
import CryptoKit

// The release manifest is authenticated before any package is downloaded or run.
struct UpdateManifest: Codable {
    let version: String
    let build: Int
    let minimumSystemVersion: String
    let url: String
    let sha256: String
}

struct SignedUpdate: Codable { let payload: String; let signature: String }

enum UpdateFailure: Error { case invalid, unsupported, download, install }



enum UpdateVerification {
    static func manifest(_ data: Data, publicKey: String) throws -> UpdateManifest {
        guard data.count < 65536,
              let envelope = try? JSONDecoder().decode(SignedUpdate.self, from: data),
              let payload = Data(base64Encoded: envelope.payload),
              let signature = Data(base64Encoded: envelope.signature),
              let keyData = Data(base64Encoded: publicKey),
              let key = try? Curve25519.Signing.PublicKey(rawRepresentation: keyData),
              key.isValidSignature(signature, for: payload),
              let manifest = try? JSONDecoder().decode(UpdateManifest.self, from: payload),
              manifest.build > 0,
              manifest.version.range(of: #"^\d+\.\d+\.\d+$"#, options: .regularExpression) != nil,
              manifest.sha256.range(of: #"^[a-f0-9]{64}$"#, options: .regularExpression) != nil,
              let url = URL(string: manifest.url), url.scheme == "https", url.host == "github.com",
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
              url.path.hasPrefix("/valerii-palch/FlightDeck/releases/download/"), url.pathExtension == "pkg"
        else { throw UpdateFailure.invalid }
        return manifest
    }

    static func hash(_ url: URL) throws -> String {
        let file = try FileHandle(forReadingFrom: url)
        defer { try? file.close() }
        var hash = SHA256()
        while let data = try file.read(upToCount: 1024 * 1024), !data.isEmpty { hash.update(data: data) }
        return hash.finalize().map { String(format: "%02x", $0) }.joined()
    }

    static func shellQuote(_ value: String) -> String { "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'" }
    static func appleScriptString(_ value: String) -> String {
        "\"" + value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\""
    }
}

@MainActor final class AppUpdater {
    private var busy = false
    private var installer: Process?
    var status: ((String) -> Void)?
    var available: ((String, String) -> Void)?
    private var candidate: UpdateManifest?
    private let feed = URL(string: "https://github.com/valerii-palch/FlightDeck/releases/latest/download/macos-update.json")!

    func check() {
        guard !busy else { return }
        busy = true
        candidate = nil
        status?("checking")
        Task {
            defer { busy = false }
            let session = makeSession()
            defer { session.invalidateAndCancel() }
            do {
                let (data, response) = try await session.data(from: feed)
                if (response as? HTTPURLResponse)?.statusCode == 404 { status?("unpublished"); return }
                guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw UpdateFailure.download }
                let publicKey = Bundle.main.object(forInfoDictionaryKey: "FlightDeckUpdatePublicKey") as? String ?? ""
                let manifest = try UpdateVerification.manifest(data, publicKey: publicKey)
                let build = Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0") ?? 0
                guard manifest.build > build else { status?("current"); return }
                let os = ProcessInfo.processInfo.operatingSystemVersion
                let currentOS = "\(os.majorVersion).\(os.minorVersion).\(os.patchVersion)"
                guard manifest.minimumSystemVersion.range(of: #"^\d+(\.\d+){0,2}$"#, options: .regularExpression) != nil,
                      manifest.minimumSystemVersion.compare(currentOS, options: .numeric) != .orderedDescending
                else { throw UpdateFailure.unsupported }
                candidate = manifest
                let notes = await releaseNotes(for: manifest.version, session: session)
                available?(manifest.version, notes)
            } catch UpdateFailure.invalid { status?("invalid") }
              catch UpdateFailure.unsupported { status?("unsupported") }
              catch { status?("failed") }
        }
    }

    private func makeSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 600
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: configuration)
    }

    private func releaseNotes(for version: String, session: URLSession) async -> String {
        let url = URL(string: "https://api.github.com/repos/valerii-palch/FlightDeck/releases/tags/v\(version)")!
        var request = URLRequest(url: url, timeoutInterval: 5)
        request.setValue("FlightDeck", forHTTPHeaderField: "User-Agent")
        struct Release: Decodable { let body: String? }
        guard let (data, response) = try? await session.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let release = try? JSONDecoder().decode(Release.self, from: data)
        else { return "" }
        return String((release.body ?? "").prefix(16000))
    }

    func install() {
        guard !busy, let manifest = candidate else { return }
        busy = true
        status?("downloading")
        Task { [self] in
            var folder: URL?
            defer {
                busy = false
                if let folder { try? FileManager.default.removeItem(at: folder) }
            }
            let session = makeSession()
            defer { session.invalidateAndCancel() }
            do {
                let (download, downloadResponse) = try await session.download(from: URL(string: manifest.url)!)
                defer { try? FileManager.default.removeItem(at: download) }
                guard (downloadResponse as? HTTPURLResponse)?.statusCode == 200,
                      let size = try download.resourceValues(forKeys: [.fileSizeKey]).fileSize,
                      size > 0, size <= 512 * 1024 * 1024 else { throw UpdateFailure.download }
                status?("verifying")
                guard try UpdateVerification.hash(download) == manifest.sha256 else { throw UpdateFailure.invalid }
                let directory = FileManager.default.temporaryDirectory.appendingPathComponent("flightdeck-update-" + UUID().uuidString)
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false,
                                                       attributes: [.posixPermissions: 0o700])
                folder = directory
                let package = directory.appendingPathComponent("FlightDeck.pkg")
                try FileManager.default.moveItem(at: download, to: package)
                status?("installing")
                // System Installer owns the privileged operation and requests macOS authorization.
                let command = "/usr/sbin/installer -pkg " + UpdateVerification.shellQuote(package.path) + " -target /"
                let process = Process()
                process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
                process.arguments = ["-e", "do shell script " + UpdateVerification.appleScriptString(command) + " with administrator privileges"]
                process.standardOutput = FileHandle.nullDevice
                process.standardError = FileHandle.nullDevice
                installer = process
                let result: Int32 = try await withCheckedThrowingContinuation { continuation in
                    process.terminationHandler = { process in continuation.resume(returning: process.terminationStatus) }
                    do { try process.run() } catch { process.terminationHandler = nil; continuation.resume(throwing: error) }
                }
                installer = nil
                let installedApp = URL(fileURLWithPath: "/Applications/FlightDeck.app")
                let installedPlist = installedApp.appendingPathComponent("Contents/Info.plist")
                guard result == 0,
                      let installed = NSDictionary(contentsOf: installedPlist),
                      installed["CFBundleShortVersionString"] as? String == manifest.version,
                      installed["CFBundleVersion"] as? String == String(manifest.build)
                else { throw UpdateFailure.install }
                // Restart only after installation succeeds; the helper waits until this process exits.
                let restart = Process()
                restart.executableURL = URL(fileURLWithPath: "/bin/sh")
                restart.arguments = ["-c", "while /bin/kill -0 \(ProcessInfo.processInfo.processIdentifier) 2>/dev/null; do /bin/sleep 1; done; /usr/bin/open /Applications/FlightDeck.app"]
                restart.standardOutput = FileHandle.nullDevice
                restart.standardError = FileHandle.nullDevice
                try restart.run()
                NSApp.terminate(nil)
            } catch UpdateFailure.invalid { status?("invalid") }
              catch UpdateFailure.unsupported { status?("unsupported") }
              catch UpdateFailure.install { status?("installFailed") }
              catch { status?("failed") }
        }
    }
}
