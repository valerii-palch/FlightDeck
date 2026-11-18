import Foundation
import CryptoKit

// Never print or bundle the private key. CI receives it through a repository secret.
let arguments = CommandLine.arguments
func fail(_ text: String) -> Never { fputs(text + "\n", stderr); exit(1) }
if arguments.count == 3, arguments[1] == "generate" {
    let path = URL(fileURLWithPath: arguments[2])
    guard !FileManager.default.fileExists(atPath: path.path) else { fail("Key already exists; refusing to replace it.") }
    try FileManager.default.createDirectory(at: path.deletingLastPathComponent(), withIntermediateDirectories: true,
                                          attributes: [.posixPermissions: 0o700])
    let key = Curve25519.Signing.PrivateKey()
    try key.rawRepresentation.base64EncodedString().write(to: path, atomically: true, encoding: .utf8)
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path.path)
    print(key.publicKey.rawRepresentation.base64EncodedString())
} else if arguments.count == 5, arguments[1] == "sign" {
    guard let raw = ProcessInfo.processInfo.environment["FLIGHTDECK_UPDATE_PRIVATE_KEY"],
          let keyData = Data(base64Encoded: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
          let key = try? Curve25519.Signing.PrivateKey(rawRepresentation: keyData) else { fail("Missing or invalid update signing secret.") }
    let expected = try String(contentsOfFile: "tools/update-public-key.txt", encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
    guard key.publicKey.rawRepresentation.base64EncodedString() == expected else { fail("Signing key does not match the app public key.") }
    let package = URL(fileURLWithPath: arguments[2])
    let file = try FileHandle(forReadingFrom: package)
    var hash = SHA256()
    while let data = try file.read(upToCount: 1024 * 1024), !data.isEmpty { hash.update(data: data) }
    try file.close()
    let plist = try PropertyListSerialization.propertyList(from: Data(contentsOf: URL(fileURLWithPath: "FlightDesk/Info.plist")), format: nil) as! [String: Any]
    let version = plist["CFBundleShortVersionString"] as! String
    let payload: [String: Any] = ["version": version, "build": Int(plist["CFBundleVersion"] as! String)!,
        "minimumSystemVersion": plist["LSMinimumSystemVersion"] as! String,
        "url": "https://github.com/valerii-palch/FlightDeck/releases/download/\(arguments[3])/\(package.lastPathComponent)",
        "sha256": hash.finalize().map { String(format: "%02x", $0) }.joined()]
    let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
    let envelope = ["payload": data.base64EncodedString(), "signature": try key.signature(for: data).base64EncodedString()]
    try JSONSerialization.data(withJSONObject: envelope, options: [.sortedKeys]).write(to: URL(fileURLWithPath: arguments[4]), options: .atomic)
    print("Signed macOS update \(version).")
} else { fail("Usage: sign-update.swift generate KEY_PATH | sign PACKAGE TAG OUTPUT") }
