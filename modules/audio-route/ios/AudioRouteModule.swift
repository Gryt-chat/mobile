import AVFoundation
import ExpoModulesCore

/**
 Where the call comes out, read from and written to `AVAudioSession`.

 `react-native-webrtc` has no route API at all — it exposes `RTCAudioSession`
 with two CallKit hooks and nothing else — so this is the only way to offer the
 choice. It is deliberately small: read the route, list what can be picked,
 pick one, and say when it changes underneath you.

 **This does not own the session.** WebRTC configures it — `playAndRecord`,
 `voiceChat`, `allowBluetooth` — and activates it, and everything here assumes
 that has already happened. `overrideOutputAudioPort` throws outside
 `playAndRecord`, which is exactly what it does before a call has started, so
 the errors are surfaced rather than swallowed.

 Bluetooth and wired headsets are chosen by setting the **input**, not the
 output. `overrideOutputAudioPort` only knows `.speaker` and `.none`; a headset
 becomes the route because `setPreferredInput` moved the whole route to it.
 That asymmetry is why `outputs()` reads `availableInputs`.
 */
public final class AudioRouteModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("AudioRoute")

    Events("onRouteChange")

    Function("outputs") { () -> [[String: Any]] in
      Self.outputs()
    }

    Function("current") { () -> [String: Any]? in
      Self.current()
    }

    Function("select") { (id: String) in
      try Self.select(id)
    }

    /* Attached only while something is listening. A route observer that
       outlives the call is a retain cycle nobody asked for. */
    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(
        forName: AVAudioSession.routeChangeNotification,
        object: AVAudioSession.sharedInstance(),
        queue: .main
      ) { [weak self] _ in
        self?.sendEvent("onRouteChange", ["current": Self.current() as Any])
      }
    }

    OnStopObserving {
      if let observer = self.observer {
        NotificationCenter.default.removeObserver(observer)
        self.observer = nil
      }
    }
  }

  // MARK: - The session

  /**
   Everything you could pick right now.

   The speaker is always there. The receiver — the earpiece you hold to your
   head — is only a real thing on a device with a built-in mic, which is how
   this tells an iPhone from an iPad without asking what kind of device it is.

   Everything after that is an accessory, listed from `availableInputs` for the
   reason in the type doc: picking one means setting it as the input.
   */
  private static func outputs() -> [[String: Any]] {
    let session = AVAudioSession.sharedInstance()
    let inputs = session.availableInputs ?? []

    var result: [[String: Any]] = [
      ["id": "speaker", "name": "Speaker", "kind": "speaker"]
    ]

    if inputs.contains(where: { $0.portType == .builtInMic }) {
      result.append(["id": "receiver", "name": "iPhone", "kind": "receiver"])
    }

    for port in inputs where port.portType != .builtInMic {
      result.append([
        "id": port.uid,
        "name": port.portName,
        "kind": kind(of: port.portType),
      ])
    }

    return result
  }

  /**
   What is playing right now.

   An accessory is reported under its **input** port's id rather than its
   output's, because those are two different uids for one pair of headphones
   and `select` only understands the input's. Matched by name, which is what
   the two ports genuinely share.
   */
  private static func current() -> [String: Any]? {
    let session = AVAudioSession.sharedInstance()
    guard let output = session.currentRoute.outputs.first else { return nil }

    switch output.portType {
    case .builtInSpeaker:
      return ["id": "speaker", "name": "Speaker", "kind": "speaker"]
    case .builtInReceiver:
      return ["id": "receiver", "name": "iPhone", "kind": "receiver"]
    default:
      let input = session.availableInputs?.first { $0.portName == output.portName }
      return [
        "id": input?.uid ?? output.uid,
        "name": output.portName,
        "kind": kind(of: output.portType),
      ]
    }
  }

  private static func select(_ id: String) throws {
    let session = AVAudioSession.sharedInstance()

    switch id {
    case "speaker":
      /* Leaves the input alone. Forcing the built-in mic here would take the
         call off a headset's microphone as a side effect of asking for the
         loudspeaker, which is not what was asked for. */
      try session.overrideOutputAudioPort(.speaker)

    case "receiver":
      try session.overrideOutputAudioPort(.none)
      if let mic = session.availableInputs?.first(where: { $0.portType == .builtInMic }) {
        try session.setPreferredInput(mic)
      }

    default:
      guard let port = session.availableInputs?.first(where: { $0.uid == id }) else {
        throw NoSuchRouteException(id)
      }
      /* The override has to come off first. It outranks the preferred input,
         so a session already forced to the speaker ignores the headset. */
      try session.overrideOutputAudioPort(.none)
      try session.setPreferredInput(port)
    }
  }

  private static func kind(of type: AVAudioSession.Port) -> String {
    switch type {
    case .builtInSpeaker: return "speaker"
    case .builtInReceiver: return "receiver"
    case .headphones, .headsetMic, .lineIn, .lineOut, .usbAudio:
      return "headphones"
    case .bluetoothA2DP, .bluetoothHFP, .bluetoothLE:
      return "bluetooth"
    case .carAudio: return "car"
    case .airPlay: return "airplay"
    default: return "other"
    }
  }
}

internal final class NoSuchRouteException: GenericException<String> {
  override var reason: String {
    "No audio route with id \(param) is available"
  }
}
