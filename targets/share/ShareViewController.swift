import UIKit
import UniformTypeIdentifiers

/**
 What happens when somebody taps Gryt in the iOS share sheet.

 **This draws nothing worth looking at, and that is the design.** iOS runs a
 share extension inside the *sending* app — Photos, Safari, Files — in a
 separate process with no access to Gryt's socket, its keypair, or its list of
 servers. A destination picker here could not tell you which channels exist, and
 building one that could would mean a second copy of the whole connection.

 So it does the one thing it is in a position to do: copy what was shared into
 the App Group container both processes can see, write a small manifest naming
 the copies, and open Gryt. The app reads the manifest — see
 `ShareIntentModule.swift` for the other end — and asks "where?" with the real
 channel list in front of it.

 The visible cost is a launch: you tap Gryt in the sheet and Gryt opens. That is
 what most apps do, and it is the honest version of what is happening anyway.

 **The copies are deliberate.** A shared item arrives as a URL into somebody
 else's sandbox, granted to this process for as long as it lives — which is
 seconds. By the time Gryt is in the foreground the grant is gone and the file
 cannot be read. Copying is not an optimisation to be removed later; it is the
 only way the file survives the trip.
 */
class ShareViewController: UIViewController {
  /** Where the app is told to look. Matches `ShareIntentModule.inbox`. */
  private static let inbox = "share"
  private static let manifest = "pending.json"

  /** One share, one directory, so a sweep can tell batches apart. */
  private let batch = UUID().uuidString

  private var text: String?
  private var files: [[String: String]] = []

  /* `viewDidAppear` can run more than once — a rotation, or the sheet being
     re-presented. Collecting twice would write a second batch and leave the
     first one orphaned in the container. */
  private var collected = false

  override func viewDidLoad() {
    super.viewDidLoad()
    /* Nothing but the sheet's own dimming behind it. A spinner would be honest
       for a large video and a flicker for everything else; the sheet already
       shows the share is in progress. */
    view.backgroundColor = .clear
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    guard !collected else { return }
    collected = true
    collect()
  }

  // MARK: - Collecting

  private func collect() {
    guard
      let inbox = Self.inboxURL,
      let items = extensionContext?.inputItems as? [NSExtensionItem]
    else {
      finish(opening: false)
      return
    }

    let batchURL = inbox.appendingPathComponent(batch)
    try? FileManager.default.createDirectory(at: batchURL, withIntermediateDirectories: true)

    /* Every attachment is loaded asynchronously and there is no ordering
       guarantee between them, so the group is what turns "several callbacks"
       into "all of them are done". */
    let group = DispatchGroup()
    let lock = NSLock()

    for item in items {
      /* The sheet's own text field, when the sending app filled one in. Several
         apps put a page title here alongside the URL. */
      if let attributed = item.attributedContentText?.string, !attributed.isEmpty {
        lock.lock()
        if text == nil { text = attributed }
        lock.unlock()
      }

      for provider in item.attachments ?? [] {
        group.enter()
        load(provider, into: batchURL, lock: lock) { group.leave() }
      }
    }

    group.notify(queue: .main) { [weak self] in
      guard let self else { return }
      self.write(to: inbox)
      self.finish(opening: true)
    }
  }

  /**
   One attachment, in whatever form it turns out to take.

   The order matters. A file URL also conforms to `public.url`, and a shared
   photo conforms to both `public.image` and `public.file-url` — so asking about
   the specific types first is what keeps a picture from being sent as the text
   of its own path.
   */
  private func load(
    _ provider: NSItemProvider,
    into batchURL: URL,
    lock: NSLock,
    done: @escaping () -> Void,
  ) {
    let fileTypes: [UTType] = [.image, .movie, .audio, .pdf, .fileURL]

    for type in fileTypes where provider.hasItemConformingToTypeIdentifier(type.identifier) {
      provider.loadItem(forTypeIdentifier: type.identifier) { [weak self] value, _ in
        defer { done() }
        guard let self else { return }

        /* Three shapes come back from the same call and which one depends on
           the sending app: a URL to a file, the bytes, or a `UIImage` that was
           never on disk (a screenshot being shared straight out of the
           editor). */
        if let url = value as? URL, url.isFileURL {
          self.copy(url, into: batchURL, lock: lock)
        } else if let data = value as? Data {
          self.save(data, name: "shared", type: type, into: batchURL, lock: lock)
        } else if let image = value as? UIImage, let data = image.jpegData(compressionQuality: 0.9) {
          self.save(data, name: "image.jpg", type: .jpeg, into: batchURL, lock: lock)
        }
      }
      return
    }

    if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
      provider.loadItem(forTypeIdentifier: UTType.url.identifier) { [weak self] value, _ in
        defer { done() }
        guard let self, let url = value as? URL else { return }
        /* A web link is text. It is the thing people share most and it belongs
           in the message rather than as an attachment. */
        lock.lock()
        self.text = url.absoluteString
        lock.unlock()
      }
      return
    }

    if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
      provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { [weak self] value, _ in
        defer { done() }
        guard let self, let shared = value as? String else { return }
        lock.lock()
        /* A link already read from `public.url` wins: an app sharing both sends
           the same address twice, once wrapped in a sentence. */
        if self.text == nil { self.text = shared }
        lock.unlock()
      }
      return
    }

    done()
  }

  private func copy(_ from: URL, into batchURL: URL, lock: NSLock) {
    let name = from.lastPathComponent
    let destination = batchURL.appendingPathComponent(name)

    /* Two photos from the same album can share a name. Left alone, the second
       would overwrite the first and the message would carry one picture twice. */
    let unique = FileManager.default.fileExists(atPath: destination.path)
      ? batchURL.appendingPathComponent("\(UUID().uuidString)-\(name)")
      : destination

    do {
      try FileManager.default.copyItem(at: from, to: unique)
    } catch {
      return
    }

    record(unique, name: name, mime: Self.mime(for: from.pathExtension), lock: lock)
  }

  private func save(_ data: Data, name: String, type: UTType, into batchURL: URL, lock: NSLock) {
    let ext = type.preferredFilenameExtension ?? "bin"
    let filename = name.contains(".") ? name : "\(name).\(ext)"
    let destination = batchURL.appendingPathComponent("\(UUID().uuidString)-\(filename)")

    do {
      try data.write(to: destination)
    } catch {
      return
    }

    record(destination, name: filename, mime: type.preferredMIMEType, lock: lock)
  }

  private func record(_ url: URL, name: String, mime: String?, lock: NSLock) {
    var entry = [
      /* Relative to the inbox, because that is the only path both processes
         agree on: the container's absolute path is different in each of them. */
      "path": "\(batch)/\(url.lastPathComponent)",
      "name": name,
    ]
    if let mime { entry["mime"] = mime }

    lock.lock()
    files.append(entry)
    lock.unlock()
  }

  private static func mime(for pathExtension: String) -> String? {
    UTType(filenameExtension: pathExtension)?.preferredMIMEType
  }

  // MARK: - Handing over

  /**
   The manifest, written last.

   Last on purpose: the app treats the manifest as the signal that a share is
   ready, so writing it before the copies have finished would mean Gryt reading
   a list of files that are still arriving. `ShareIntentModule` drops entries
   whose file is missing, so the failure would be a quietly incomplete share
   rather than a crash — which is worse.
   */
  private func write(to inbox: URL) {
    guard text != nil || !files.isEmpty else { return }

    let payload: [String: Any] = [
      "batch": batch,
      "text": text as Any,
      "files": files,
    ]

    guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return }
    try? data.write(to: inbox.appendingPathComponent(Self.manifest))
  }

  private func finish(opening: Bool) {
    if opening { open() }
    extensionContext?.completeRequest(returningItems: nil)
  }

  /**
   Open Gryt.

   `NSExtensionContext.open(_:completionHandler:)` is documented as unavailable
   to share extensions, so this walks the responder chain to find
   `UIApplication` and calls its `openURL:` instead. That is what every
   implementation of this does and it is not a promised API — which is why
   nothing depends on it working.

   **A failure here costs a tap, not the share.** The files and the manifest are
   already in the container by this point, so opening Gryt by hand finds the
   share waiting. That is the whole reason the manifest is written before this
   is attempted.
   */
  private func open() {
    guard let url = URL(string: "gryt://share") else { return }

    var responder: UIResponder? = self
    while let current = responder {
      if let application = current as? UIApplication {
        let selector = sel_registerName("openURL:")
        if application.responds(to: selector) {
          _ = application.perform(selector, with: url)
        }
        return
      }
      responder = current.next
    }
  }

  /**
   The shared container, made if it is not there yet.

   Made here rather than assumed, because this can genuinely be the first thing
   that ever writes to it: a phone that has shared into Gryt but never started a
   screen share has an App Group container with nothing in it.
   */
  private static var inboxURL: URL? {
    guard
      let identifier = Bundle.main.object(forInfoDictionaryKey: "RTCAppGroupIdentifier") as? String,
      let container = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: identifier,
      )
    else { return nil }

    let inbox = container.appendingPathComponent(Self.inbox)
    try? FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
    return inbox
  }
}
