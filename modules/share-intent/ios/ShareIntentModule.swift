import ExpoModulesCore

/**
 A share handed to Gryt by another app.

 iOS does not deliver a share to the app. It delivers it to a **Share
 Extension** — a separate process, launched inside the sending app, which has no
 way to talk to Gryt directly. The road between them is the same App Group
 container the ReplayKit extension uses: the extension copies what was shared
 into it, writes a small manifest naming the copies, and opens Gryt. This reads
 that manifest.

 So there is nothing to receive until the extension exists. Until then `consume`
 returns null on every call, which is also what it returns on the vast majority
 of calls afterwards — an ordinary launch has no share waiting.

 **The copies are the extension's, and the cleanup is ours.** A share extension
 is killed the moment it finishes; it cannot wait for an upload. So it copies
 first and leaves, and everything it left behind is swept the next time a share
 is consumed. Sweeping on read rather than on send means a share somebody
 abandoned still gets cleared, which a send-side cleanup would miss.
 */
public final class ShareIntentModule: Module {
  /** Everything the extension writes lives under one directory in the group. */
  private static let inbox = "share"
  private static let manifest = "pending.json"

  public func definition() -> ModuleDefinition {
    Name("ShareIntent")

    /* Declared so the JavaScript side can be written once for both platforms.
       Nothing sends it here: iOS brings the app to the front to deliver a
       share, and a foreground is the signal. Android has a case where the app
       is already in front, and does send it. */
    Events("onShare")

    Function("consume") { () -> [String: Any]? in
      Self.consume()
    }
  }

  private static func consume() -> [String: Any]? {
    guard let inboxURL = Self.inboxURL else { return nil }
    let manifestURL = inboxURL.appendingPathComponent(Self.manifest)

    guard
      let data = try? Data(contentsOf: manifestURL),
      let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      /* No manifest is the ordinary case. Sweep anyway: an extension that was
         killed between copying and writing its manifest leaves files nothing
         will ever claim. */
      sweep(inboxURL, keeping: nil)
      return nil
    }

    /* Taken before anything else can fail, so a share that cannot be read is
       not offered again on every foreground for the life of the app. */
    try? FileManager.default.removeItem(at: manifestURL)

    let batch = raw["batch"] as? String
    sweep(inboxURL, keeping: batch)

    let files = (raw["files"] as? [[String: Any]] ?? []).compactMap { entry -> [String: Any]? in
      guard let relative = entry["path"] as? String else { return nil }
      let url = inboxURL.appendingPathComponent(relative)
      guard FileManager.default.fileExists(atPath: url.path) else { return nil }
      return [
        /* A `file://` URL rather than a path, because that is what `fetch` takes
           in the upload — the same thing the image picker hands back. */
        "uri": url.absoluteString,
        "name": entry["name"] as Any,
        "mime": entry["mime"] as Any,
      ]
    }

    let text = raw["text"] as? String
    if files.isEmpty && (text?.isEmpty ?? true) { return nil }

    return ["text": text as Any, "files": files]
  }

  /**
   Delete every batch except the one just claimed.

   Batches are directories named by the extension. Anything that is not the
   current one belongs to a share that was already dealt with, or to one
   somebody backed out of — either way nothing is going to ask for it again, and
   a shared video left in the container is a video taking up the phone's storage
   under a name its owner will never find.
   */
  private static func sweep(_ inbox: URL, keeping batch: String?) {
    let contents = try? FileManager.default.contentsOfDirectory(
      at: inbox,
      includingPropertiesForKeys: nil,
    )
    for url in contents ?? [] {
      if url.lastPathComponent == Self.manifest { continue }
      if let batch, url.lastPathComponent == batch { continue }
      try? FileManager.default.removeItem(at: url)
    }
  }

  /**
   The shared container, or nil where there is not one.

   `RTCAppGroupIdentifier` is the authority: it is written into Info.plist by
   `plugins/withScreenShare.js`, which is also what registers the group in the
   first place, so reading it here means one source of truth rather than the
   same string typed in two config plugins. The name is the WebRTC library's
   because that is what first needed a group; the container is the app's.
   */
  private static var inboxURL: URL? {
    guard
      let identifier = Bundle.main.object(forInfoDictionaryKey: "RTCAppGroupIdentifier") as? String,
      let container = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: identifier,
      )
    else { return nil }

    let inbox = container.appendingPathComponent(Self.inbox)
    guard FileManager.default.fileExists(atPath: inbox.path) else { return nil }
    return inbox
  }
}
