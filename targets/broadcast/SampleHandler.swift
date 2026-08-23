import Foundation
import ReplayKit

/// The extension iOS launches when somebody starts a broadcast.
///
/// This is a separate process with a hard memory ceiling — 50 MB, enforced by
/// the system, and exceeding it is a kill rather than a warning. That budget is
/// why the work here is deliberately small: connect a socket, turn each frame
/// into JPEG, write it, and hold nothing else.
///
/// The pairing with the app is the App Group. Both processes see the same
/// container directory, the app binds a socket in it and this connects to the
/// same path. Nothing else is shared and no data is written to disk.
class SampleHandler: RPBroadcastSampleHandler {
  private var connection: SocketConnection?
  private var uploader: SampleUploader?

  /// Read from the extension's own Info.plist rather than hardcoded, so the
  /// identifier lives in one place — the config plugin writes it into the app
  /// and the extension together, and a mismatch would be a broadcast that
  /// starts and silently shows nothing.
  private var appGroupIdentifier: String? {
    Bundle.main.object(forInfoDictionaryKey: "RTCAppGroupIdentifier") as? String
  }

  override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
    guard
      let identifier = appGroupIdentifier,
      let container = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: identifier,
      )
    else {
      finish(reason: "Gryt could not open its shared container. Try reinstalling the app.")
      return
    }

    /// `rtc_SSFD` is `kRTCScreensharingSocketFD` in react-native-webrtc. Both
    /// ends have to agree on it and only one end is ours, so it is written out
    /// rather than derived.
    let path = container.appendingPathComponent("rtc_SSFD").path

    guard let socket = SocketConnection(filePath: path) else {
      finish(reason: "Gryt could not reach the app.")
      return
    }

    socket.didClose = { [weak self] error in
      /// The app went away — closed, crashed, or left the call. There is
      /// nowhere to send frames, so end the broadcast rather than let the
      /// system's red status bar keep claiming the screen is being shared.
      self?.finish(reason: error == nil
        ? "Gryt stopped sharing."
        : "Gryt lost its connection to the app.")
    }

    /// A connect that fails almost always means the same thing: the app is not
    /// waiting, because the person started the broadcast from Control Centre
    /// without asking Gryt to share first. Say that, since the alternative is a
    /// broadcast that ends with no explanation.
    guard socket.open() else {
      finish(reason: "Start the screen share from inside Gryt, in a voice channel.")
      return
    }

    connection = socket
    uploader = SampleUploader(connection: socket)
  }

  override func processSampleBuffer(
    _ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType,
  ) {
    /// Video only. ReplayKit will also offer app audio and the microphone, but
    /// the microphone is already going over the call's own audio track — taking
    /// it here too would send everyone two copies of the same voice, slightly
    /// out of step.
    guard sampleBufferType == .video else { return }
    uploader?.send(sample: sampleBuffer)
  }

  override func broadcastFinished() {
    connection?.close(error: nil)
    connection = nil
    uploader = nil
  }

  private func finish(reason: String) {
    let error = NSError(
      domain: "chat.gryt.mobile.broadcast",
      code: 0,
      userInfo: [NSLocalizedDescriptionKey: reason],
    )
    finishBroadcastWithError(error)
  }
}
