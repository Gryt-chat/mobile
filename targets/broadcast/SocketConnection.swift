import Foundation

/// The extension's end of the pipe to the app.
///
/// **The app listens and this connects**, which is the opposite of what most
/// descriptions of ReplayKit assume. `ScreenCaptureController` in
/// `react-native-webrtc` binds a unix socket inside the App Group container the
/// moment `getDisplayMedia()` is called, and waits. Nothing happens until the
/// person starts a broadcast and iOS launches this extension, which then dials
/// that path.
///
/// The path is fixed on both sides: the App Group container, plus `rtc_SSFD`.
/// That name is `kRTCScreensharingSocketFD` in the library and is not
/// configurable, so it is repeated here rather than passed in — a constant that
/// has to match something in a dependency is worth being obvious about.
final class SocketConnection: NSObject {
  private var socketHandle: Int32 = -1
  private var writeSource: DispatchSourceWrite?
  private var readSource: DispatchSourceRead?

  /// Called when the app goes away — the broadcast has nowhere to go and should
  /// end rather than keep encoding frames into a closed pipe.
  var didClose: ((Error?) -> Void)?

  private let filePath: String
  private var address: sockaddr_un

  init?(filePath path: String) {
    /// `sockaddr_un.sun_path` is 104 bytes on Darwin and the App Group
    /// container path is long. A path that does not fit is a connect that fails
    /// with a truncated address rather than an obvious error, so it is refused
    /// here where the reason is visible.
    guard path.utf8.count < MemoryLayout.size(ofValue: sockaddr_un().sun_path) else { return nil }

    filePath = path
    address = sockaddr_un()
    address.sun_family = sa_family_t(AF_UNIX)
    super.init()

    withUnsafeMutablePointer(to: &address.sun_path.0) { pointer in
      path.withCString { cString in
        strncpy(pointer, cString, path.utf8.count)
      }
    }
  }

  func open() -> Bool {
    socketHandle = socket(AF_UNIX, SOCK_STREAM, 0)
    guard socketHandle != -1 else { return false }

    let result = withUnsafePointer(to: &address) { pointer -> Int32 in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { address in
        connect(socketHandle, address, socklen_t(MemoryLayout<sockaddr_un>.size))
      }
    }

    guard result != -1 else {
      close(error: nil)
      return false
    }

    /// Non-blocking, because a write that blocks blocks the ReplayKit callback
    /// that handed us the frame — and iOS kills a broadcast extension that
    /// stops consuming samples.
    let flags = fcntl(socketHandle, F_GETFL, 0)
    _ = fcntl(socketHandle, F_SETFL, flags | O_NONBLOCK)

    setupSources()
    return true
  }

  func close(error: Error?) {
    writeSource?.cancel()
    readSource?.cancel()
    writeSource = nil
    readSource = nil

    if socketHandle != -1 {
      Darwin.close(socketHandle)
      socketHandle = -1
    }

    didClose?(error)
    didClose = nil
  }

  /// Hands bytes to the socket, returning how many actually went.
  ///
  /// A short write is ordinary on a non-blocking socket and is the caller's to
  /// deal with — `SampleUploader` keeps an offset for exactly this. Returning
  /// zero on `EAGAIN` rather than treating it as failure is what keeps a busy
  /// pipe from ending the broadcast.
  func writeToSocket(buffer: UnsafePointer<UInt8>, length: Int) -> Int {
    guard socketHandle != -1 else { return 0 }

    let sent = send(socketHandle, buffer, length, 0)
    if sent < 0 {
      if errno == EAGAIN || errno == EWOULDBLOCK { return 0 }
      close(error: NSError(domain: NSPOSIXErrorDomain, code: Int(errno)))
      return 0
    }
    return sent
  }

  private func setupSources() {
    /// Reading is only used to notice the far end closing. The app never sends
    /// anything back; a readable socket with nothing in it means the app has
    /// gone, which ends the broadcast rather than leaving it encoding into
    /// nowhere.
    let read = DispatchSource.makeReadSource(fileDescriptor: socketHandle)
    read.setEventHandler { [weak self] in
      guard let self else { return }
      if read.data == 0 { self.close(error: nil) }
    }
    read.resume()
    readSource = read
  }
}
