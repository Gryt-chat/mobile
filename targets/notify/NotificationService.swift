import CryptoKit
import UserNotifications

/* Swaps the relay's fixed text for the preview the server sealed to this phone (GRYT-1688).
   Anything it can't open keeps the fixed text, which is already in the notification. */
class NotificationService: UNNotificationServiceExtension {
  private var deliver: ((UNNotificationContent) -> Void)?
  private var content: UNMutableNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    deliver = contentHandler
    guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
      contentHandler(request.content)
      return
    }
    self.content = content
    if let preview = Self.open(request.content.userInfo) {
      content.title = preview.t
      content.subtitle = preview.s ?? ""
      content.body = preview.b
    }
    contentHandler(content)
  }

  // iOS gives an extension about 30 seconds. Opening one preview takes milliseconds, but just in case.
  override func serviceExtensionTimeWillExpire() {
    if let deliver, let content { deliver(content) }
  }

  struct Preview: Decodable {
    let t: String
    let s: String?
    let b: String
  }

  /* 0x01 | nonce (12) | ciphertext | tag (16), base64url, AES-256-GCM with "gryt-push-1|<tag>" as
     additional data. The key comes from the app, by the relay's tag for that server. */
  static func open(_ info: [AnyHashable: Any]) -> Preview? {
    guard
      let group = Bundle.main.object(forInfoDictionaryKey: "RTCAppGroupIdentifier") as? String,
      let keys = UserDefaults(suiteName: group)?.dictionary(forKey: "gryt.pushPreviewKeys") as? [String: String]
    else { return nil }
    return open(info, keys: keys)
  }

  static func open(_ info: [AnyHashable: Any], keys: [String: String]) -> Preview? {
    guard let tag = info["c"] as? String, let blob = info["p"] as? String else { return nil }
    if let raw = base64url(blob), raw.first == 2 { return openDm(raw, json: keys["dm:\(tag)"]) }
    guard
      let keyText = keys[tag],
      let key = base64url(keyText), key.count == 32,
      let raw = base64url(blob), raw.count > 29, raw.first == 1
    else { return nil }

    do {
      let box = try AES.GCM.SealedBox(
        nonce: AES.GCM.Nonce(data: raw.subdata(in: 1..<13)),
        ciphertext: raw.subdata(in: 13..<(raw.count - 16)),
        tag: raw.subdata(in: (raw.count - 16)..<raw.count)
      )
      let plain = try AES.GCM.open(box, using: SymmetricKey(data: key), authenticating: Data("gryt-push-1|\(tag)".utf8))
      return try JSONDecoder().decode(Preview.self, from: plain)
    } catch {
      return nil
    }
  }

  struct DmKeys: Decodable {
    let d: String
    let k: [String]
  }

  /* A line a DM's sender sealed to this phone (GRYT-2275): 0x02 | ephemeral X25519 (32) | nonce (12) |
     AES-256-GCM, key from HKDF-SHA256 with salt ephemeral + this phone's key. Tries the newest key first. */
  static func openDm(_ raw: Data, json: String?) -> Preview? {
    guard
      let json, let dm = try? JSONDecoder().decode(DmKeys.self, from: Data(json.utf8)),
      raw.count > 1 + 32 + 12 + 16
    else { return nil }
    let ephemeral = raw.subdata(in: 1..<33)
    for keyText in dm.k {
      guard
        let keyData = base64url(keyText),
        let mine = try? Curve25519.KeyAgreement.PrivateKey(rawRepresentation: keyData),
        let theirs = try? Curve25519.KeyAgreement.PublicKey(rawRepresentation: ephemeral),
        let shared = try? mine.sharedSecretFromKeyAgreement(with: theirs)
      else { continue }
      let key = shared.hkdfDerivedSymmetricKey(
        using: SHA256.self, salt: ephemeral + mine.publicKey.rawRepresentation,
        sharedInfo: Data("gryt-dm-preview-1".utf8), outputByteCount: 32)
      guard
        let box = try? AES.GCM.SealedBox(
          nonce: AES.GCM.Nonce(data: raw.subdata(in: 33..<45)),
          ciphertext: raw.subdata(in: 45..<(raw.count - 16)),
          tag: raw.subdata(in: (raw.count - 16)..<raw.count)),
        let plain = try? AES.GCM.open(box, using: key, authenticating: Data("gryt-dm-preview-1|\(dm.d)".utf8))
      else { continue }
      return try? JSONDecoder().decode(Preview.self, from: plain)
    }
    return nil
  }

  static func base64url(_ text: String) -> Data? {
    var padded = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    while padded.count % 4 != 0 { padded += "=" }
    return Data(base64Encoded: padded)
  }
}
