import CoreImage
import CoreMedia
import Foundation
import ReplayKit

/// One frame, turned into bytes the app knows how to read.
///
/// The wire format is not ours and is not negotiable — it is whatever
/// `ScreenCapturer.m` in `react-native-webrtc` parses. That is a `CFHTTPMessage`:
/// a framed message with headers and a body, where
///
/// - `Content-Length` is the body size, and is how the reader knows a frame is
///   complete across however many socket reads it takes;
/// - `Buffer-Width` and `Buffer-Height` are the pixel dimensions it allocates;
/// - `Buffer-Orientation` is the `CGImagePropertyOrientation` raw value;
/// - the body is **JPEG**, because the app side does `CIImage(data:)` and
///   renders that into a pixel buffer.
///
/// Sending raw pixels would be the obvious thing and would not work: the reader
/// hands the body to `CIImage`, which needs a container it can sniff.
final class SampleUploader {
  private static let imageContext = CIContext(options: nil)

  private let connection: SocketConnection

  /// The frame being written, and how much of it has gone.
  ///
  /// A non-blocking socket takes what it can and no more, so a frame usually
  /// needs several writes. Anything arriving while one is in flight is dropped
  /// rather than queued — see `send`.
  private var dataToSend: Data?
  private var byteIndex = 0
  private let serialQueue = DispatchQueue(label: "chat.gryt.broadcast.uploader")

  /// Whether a frame is mid-flight. Read from the ReplayKit callback thread and
  /// written from the uploader queue, so it is guarded rather than a plain Bool.
  private var isSending = false
  private let sendingLock = NSLock()

  init(connection: SocketConnection) {
    self.connection = connection
  }

  /// True when the frame was taken, false when it was dropped.
  ///
  /// **Dropping is correct here.** ReplayKit delivers frames at the screen's
  /// rate and will not wait; a queue would grow without bound behind a slow
  /// socket and every frame in it would be stale by the time it went. A screen
  /// share that skips a frame under load is what every implementation of this
  /// does.
  @discardableResult
  func send(sample buffer: CMSampleBuffer) -> Bool {
    sendingLock.lock()
    if isSending {
      sendingLock.unlock()
      return false
    }
    isSending = true
    sendingLock.unlock()

    guard let message = prepare(sample: buffer) else {
      finish()
      return false
    }

    serialQueue.async { [weak self] in
      self?.dataToSend = message
      self?.byteIndex = 0
      self?.pump()
    }
    return true
  }

  private func finish() {
    sendingLock.lock()
    isSending = false
    sendingLock.unlock()
  }

  private func pump() {
    guard let data = dataToSend else {
      finish()
      return
    }

    var remaining = data.count - byteIndex
    while remaining > 0 {
      let written = data.withUnsafeBytes { raw -> Int in
        guard let base = raw.bindMemory(to: UInt8.self).baseAddress else { return 0 }
        return connection.writeToSocket(buffer: base.advanced(by: byteIndex), length: remaining)
      }

      /// The socket is full. Rather than spin, give it a moment and come back —
      /// the frame is still ours and the index remembers where we were.
      if written == 0 {
        serialQueue.asyncAfter(deadline: .now() + 0.01) { [weak self] in self?.pump() }
        return
      }

      byteIndex += written
      remaining -= written
    }

    dataToSend = nil
    byteIndex = 0
    finish()
  }

  private func prepare(sample buffer: CMSampleBuffer) -> Data? {
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(buffer) else { return nil }

    /* `CMGetAttachment` hands back an untyped `CFTypeRef`, so the cast is ours
       to make. Absent for the first frames of some broadcasts, which is why
       there is a default rather than a `guard`. */
    let orientation = (CMGetAttachment(
      buffer,
      key: RPVideoSampleOrientationKey as CFString,
      attachmentModeOut: nil,
    ) as? NSNumber)?.uintValue ?? UInt(CGImagePropertyOrientation.up.rawValue)

    /// Scaled down before encoding rather than after. A phone screen is around
    /// three million pixels and re-encoding all of them sixty times a second is
    /// the whole battery; the receiving end is a tile on somebody else's phone.
    /// The long edge is capped and the aspect ratio is kept, so text stays
    /// readable in proportion to what was shared.
    let image = CIImage(cvPixelBuffer: pixelBuffer)
    let scale = min(1.0, 960.0 / max(image.extent.width, image.extent.height))
    let scaled = scale < 1.0
      ? image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
      : image

    guard
      let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
      let jpeg = SampleUploader.imageContext.jpegRepresentation(
        of: scaled,
        colorSpace: colorSpace,
        options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.6],
      )
    else { return nil }

    let message = CFHTTPMessageCreateResponse(
      kCFAllocatorDefault, 200, nil, kCFHTTPVersion1_1,
    ).takeRetainedValue()

    CFHTTPMessageSetHeaderFieldValue(
      message, "Content-Length" as CFString, String(jpeg.count) as CFString,
    )
    CFHTTPMessageSetHeaderFieldValue(
      message, "Buffer-Width" as CFString, String(Int(scaled.extent.width)) as CFString,
    )
    CFHTTPMessageSetHeaderFieldValue(
      message, "Buffer-Height" as CFString, String(Int(scaled.extent.height)) as CFString,
    )
    CFHTTPMessageSetHeaderFieldValue(
      message, "Buffer-Orientation" as CFString, String(orientation) as CFString,
    )
    CFHTTPMessageSetBody(message, jpeg as CFData)

    return CFHTTPMessageCopySerializedMessage(message)?.takeRetainedValue() as Data?
  }
}
