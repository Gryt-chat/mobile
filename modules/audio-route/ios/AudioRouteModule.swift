import AVFoundation
import AVKit
import ExpoModulesCore
import WebRTC

/**
 Where the call comes out, read from and written to `AVAudioSession`.

 `react-native-webrtc` has no route API at all — it exposes `RTCAudioSession`
 with two CallKit hooks and nothing else — so this is the only way to offer the
 choice. It is deliberately small: read the route, list what can be picked,
 pick one, and say when it changes underneath you.

 **This does not own the session, and that is why it goes through
 `RTCAudioSession`.** WebRTC configures the session — `playAndRecord`,
 `voiceChat`, `allowBluetooth` — activates it, and then keeps its own cached
 copy of that configuration, re-applying it when the route changes underneath.
 It is not an observer of `AVAudioSession`; it is a wrapper that expects to be
 the one making the changes.

 The first version of this file called `AVAudioSession.sharedInstance()`
 directly. That is the documented way to end up with a session WebRTC believes
 is active and the OS has already torn down, and it is what GRYT-576 was:
 picking a different output killed the call. `react-native-webrtc` touches
 `RTCAudioSession` in exactly one file — two CallKit hooks — so nothing else
 was going to tell it the route had moved.

 So every *write* is inside `lockForConfiguration()`. Reads are not: listing
 ports and asking what is playing do not mutate anything, and taking the lock to
 read would contend with the audio thread for no reason.

 `overrideOutputAudioPort` still throws outside `playAndRecord`, which is
 exactly what it does before a call has started, so the errors are surfaced
 rather than swallowed.

 Bluetooth and wired headsets are chosen by setting the **input**, not the
 output. `overrideOutputAudioPort` only knows `.speaker` and `.none`; a headset
 becomes the route because `setPreferredInput` moved the whole route to it.
 That asymmetry is why `outputs()` reads `availableInputs`.
 */
public final class AudioRouteModule: Module {
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("AudioRoute")

    Events("onRouteChange", "onSessionEvent")

    Function("outputs") { () -> [[String: Any]] in
      Self.outputs()
    }

    Function("current") { () -> [String: Any]? in
      Self.current()
    }

    Function("select") { (id: String) in
      try Self.select(id)
    }

    /* Apple's own output sheet, the one behind the AirPlay button. UIKit, so on the main
       queue: a sync Function runs on the JS thread (see BroadcastPickerModule). */
    AsyncFunction("present") { () -> Bool in
      Self.presentSystemPicker()
    }
    .runOnQueue(.main)

    /* Read only, and it exists because every audio fault on this phone points
       at the session and none of them is proven. Category, mode, options and
       route, taken together at a known moment, are what tell "WebRTC put it
       back" apart from three unrelated bugs. See GRYT-978. */
    Function("session") { () -> [String: Any] in
      Self.session()
    }

    /* Attached only while something is listening. A route observer that
       outlives the call is a retain cycle nobody asked for. */
    OnStartObserving {
      let center = NotificationCenter.default
      let av = AVAudioSession.sharedInstance()
      self.observers = [
        center.addObserver(forName: AVAudioSession.routeChangeNotification, object: av, queue: .main) { [weak self] note in
          let reason = (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt)
            .flatMap(AVAudioSession.RouteChangeReason.init(rawValue:))
          self?.sendEvent("onRouteChange", [
            "current": Self.current() as Any,
            "reason": Self.name(of: reason),
          ])
        },
        /* A call that goes quiet a few seconds in is the report (GRYT-946). An interruption
           or a media-services reset is the likeliest thing to do that, and nothing logged it. */
        center.addObserver(forName: AVAudioSession.interruptionNotification, object: av, queue: .main) { [weak self] note in
          let type = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt)
            .flatMap(AVAudioSession.InterruptionType.init(rawValue:))
          self?.sendEvent("onSessionEvent", [
            "event": type == .began ? "interruption-began" : "interruption-ended",
            "session": Self.session(),
          ])
        },
        center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: av, queue: .main) { [weak self] _ in
          self?.sendEvent("onSessionEvent", ["event": "media-services-reset", "session": Self.session()])
        },
      ]
    }

    OnStopObserving {
      self.observers.forEach { NotificationCenter.default.removeObserver($0) }
      self.observers = []
    }
  }

  // MARK: - What the session is actually doing

  /**
   What `AVAudioSession` says about itself right now.

   Strings rather than the raw constants, because this is read by a person in a
   bug report rather than by code. `playAndRecord` with `voiceChat` is what
   WebRTC configures for a call; anything else during one is the finding.

   The options are spelled out individually. `categoryOptions` is a bitmask and
   printing the number tells nobody anything -- `defaultToSpeaker` being set is
   the difference between a route picker that can leave the loudspeaker and one
   that cannot, because with it `overrideOutputAudioPort(.none)` returns to the
   speaker rather than to the receiver.
   */
  private static func session() -> [String: Any] {
    let session = AVAudioSession.sharedInstance()
    let options = session.categoryOptions

    var names: [String] = []
    if options.contains(.defaultToSpeaker) { names.append("defaultToSpeaker") }
    if options.contains(.allowBluetooth) { names.append("allowBluetooth") }
    if options.contains(.allowBluetoothA2DP) { names.append("allowBluetoothA2DP") }
    if options.contains(.mixWithOthers) { names.append("mixWithOthers") }
    if options.contains(.duckOthers) { names.append("duckOthers") }
    if options.contains(.allowAirPlay) { names.append("allowAirPlay") }

    return [
      "category": session.category.rawValue,
      "mode": session.mode.rawValue,
      "options": names,
      "outputs": session.currentRoute.outputs.map { "\($0.portName) (\($0.portType.rawValue))" },
      "inputs": session.currentRoute.inputs.map { "\($0.portName) (\($0.portType.rawValue))" },
      /* WebRTC's own view, which is the one that matters: it is what gets
         re-applied over anything written underneath it. */
      "webRTCActive": RTCAudioSession.sharedInstance().isActive,
    ]
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

  /**
   The configuration for a call, with the loudspeaker or without it.

   This is the fix for GRYT-946. Overriding the port underneath WebRTC changed the route
   and left WebRTC's cached configuration as it was, so the next time WebRTC re-applied
   it (a route change, an interruption ending, the audio unit restarting) the pick was
   undone. Setting it as WebRTC's own configuration means what gets re-applied is the pick.
   */
  private static func callConfiguration(speaker: Bool) -> RTCAudioSessionConfiguration {
    let config = RTCAudioSessionConfiguration.webRTC()
    config.category = AVAudioSession.Category.playAndRecord.rawValue
    // videoChat defaults to the loudspeaker and voiceChat to the earpiece, as FaceTime does.
    config.mode = (speaker ? AVAudioSession.Mode.videoChat : AVAudioSession.Mode.voiceChat).rawValue
    var options: AVAudioSession.CategoryOptions = [.allowBluetooth, .allowBluetoothA2DP, .allowAirPlay]
    if speaker { options.insert(.defaultToSpeaker) }
    config.categoryOptions = options
    return config
  }

  private static func select(_ id: String) throws {
    let session = RTCAudioSession.sharedInstance()

    /* Held across the whole switch rather than per call. The two-step cases
       below are one change as far as the route is concerned, and letting WebRTC
       observe the halfway state is the thing this lock exists to prevent. */
    session.lockForConfiguration()
    defer { session.unlockForConfiguration() }

    let speaker = id == "speaker"
    let config = callConfiguration(speaker: speaker)
    RTCAudioSessionConfiguration.setWebRTC(config)
    try session.setConfiguration(config)

    switch id {
    case "speaker":
      // Leaves the input alone, so a headset's mic stays the mic.
      try session.overrideOutputAudioPort(.speaker)

    case "receiver":
      try session.overrideOutputAudioPort(.none)
      if let mic = AVAudioSession.sharedInstance().availableInputs?
        .first(where: { $0.portType == .builtInMic }) {
        try session.setPreferredInput(mic)
      }

    default:
      guard let port = AVAudioSession.sharedInstance().availableInputs?
        .first(where: { $0.uid == id }) else {
        throw NoSuchRouteException(id)
      }
      // The override outranks the preferred input, so it comes off first.
      try session.overrideOutputAudioPort(.none)
      try session.setPreferredInput(port)
    }
  }

  private static func name(of reason: AVAudioSession.RouteChangeReason?) -> String {
    switch reason {
    case .newDeviceAvailable: return "new-device"
    case .oldDeviceUnavailable: return "device-gone"
    case .categoryChange: return "category-change"
    case .override: return "override"
    case .wakeFromSleep: return "wake"
    case .noSuitableRouteForCategory: return "no-route"
    case .routeConfigurationChange: return "configuration-change"
    default: return "unknown"
    }
  }

  /**
   Opens the system route picker by pressing an invisible `AVRoutePickerView`'s button,
   the same trick as the screen share picker. It relies on the view holding a `UIButton`,
   which isn't promised, so false tells the caller to fall back to Gryt's own list.
   */
  private static func presentSystemPicker() -> Bool {
    guard let window = UIApplication.shared.connectedScenes
      .compactMap({ $0 as? UIWindowScene })
      .flatMap(\.windows)
      .first(where: { $0.isKeyWindow }) else { return false }

    let picker = AVRoutePickerView(frame: CGRect(x: 0, y: 0, width: 44, height: 44))
    picker.prioritizesVideoDevices = false
    picker.alpha = 0
    picker.isUserInteractionEnabled = false
    window.addSubview(picker)

    let button = picker.subviews.compactMap { $0 as? UIButton }.first
    button?.sendActions(for: .touchUpInside)

    // Removing it in the same run loop turn cancels the tap.
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
      picker.removeFromSuperview()
    }
    return button != nil
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
