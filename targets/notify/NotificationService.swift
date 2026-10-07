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
    guard
      let tag = info["c"] as? String,
      let blob = info["p"] as? String,
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

  static func base64url(_ text: String) -> Data? {
    var padded = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    while padded.count % 4 != 0 { padded += "=" }
    return Data(base64Encoded: padded)
  }
}
