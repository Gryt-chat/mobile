import ExpoModulesCore
import ReplayKit
import UIKit

/**
 The one button iOS will not let an app draw itself, and the one signal that
 says whether pressing it worked.

 A screen share cannot be started in code. `RPSystemBroadcastPickerView` is the
 only way in, it is a `UIView` rather than a call, and the sheet it presents is
 the system's — which is the point, since it is the moment somebody agrees to
 hand over their screen.

 So Gryt's own button cannot *be* that button. What it does instead is put the
 system's one on screen, invisibly, and press it. That is what every app doing
 this arrives at, and it is worth saying plainly that it relies on the picker
 being a `UIButton` inside a `UIView` — a private detail that has held since iOS
 12 but is not promised. The `Bool` return exists so that the day it stops
 holding, the caller finds out and can say so, rather than a tap doing nothing.

 **`captured` is the other half and matters just as much.** Pressing the button
 opens a sheet; it does not start a broadcast. The person still has to confirm,
 and then wait out a three second countdown, and they may simply cancel. Telling
 the room "I am sharing my screen" at the moment of the tap would mean a black
 rectangle with somebody's name under it for several seconds, or forever if they
 changed their mind. `UIScreen.isCaptured` is public, is true exactly while the
 screen is really being captured, and has a notification when it changes — so
 the announcement can wait for the truth instead of predicting it.

 It reads as captured for AirPlay mirroring and a Mac recording the phone too.
 That is fine here: nothing looks at it except code that has just asked for a
 broadcast.

 **Everything touching UIKit is an `AsyncFunction` pinned to the main queue, and
 that is not a style preference.** In expo-modules-core a sync `Function` has no
 queue of its own: `SyncFunctionDefinition` runs inline on whatever thread called
 it, which for a JSI call is the **JS thread**. `runOnQueue` exists only on the
 async variants. The first version of this file used `Function`, and reading
 `UIApplication.shared` off the main thread is a hard assertion — tapping the
 screen share button crashed Gryt outright (GRYT-577). Constructing a UIView and
 calling `addSubview` from there are the same class of mistake, one step behind.

 `AudioRouteModule` next door still uses sync `Function` and is fine, because
 `AVAudioSession` is safe off-main. That is the difference, and it is worth
 knowing before copying the shape of one module into the other.

 Not `DispatchQueue.main.sync` from the JS thread either: the main thread can be
 waiting on JS, and that is a deadlock rather than a crash — which is worse,
 because it looks like a hang with nothing in the log.

 **This module knows nothing about WebRTC.** `getDisplayMedia()` has to have been
 called first — that is what starts the app listening on the shared socket — and
 the caller owns that ordering. See `useScreenShare.ts`.
 */
public final class BroadcastPickerModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("BroadcastPicker")

    Events("onCaptureChange")

    /* Whether the picker will show a sheet at all, which is really a question
       about the OS rather than about the device. */
    Property("available") { () -> Bool in
      if #available(iOS 12.0, *) { return true }
      return false
    }

    /**
     The extension's bundle id, derived here rather than passed in.

     It is the app's plus `.broadcast`, which is what `withScreenShare.js`
     builds the target with. Deriving it from `Bundle.main` means the two cannot
     drift — the alternative is the same string written in a config plugin and
     again in a TypeScript constant, where a mismatch shows up as a picker
     listing nothing.
     */
    Property("extensionBundleId") { () -> String? in
      guard let identifier = Bundle.main.bundleIdentifier else { return nil }
      return "\(identifier).broadcast"
    }

    /** Whether the screen is being captured right now. */
    AsyncFunction("captured") { () -> Bool in
      UIScreen.main.isCaptured
    }
    .runOnQueue(.main)

    /**
     Opens the system sheet, preselected to Gryt's extension.

     Returns false when the button could not be found, so the caller can tell
     somebody that rather than leaving them tapping.
     */
    AsyncFunction("present") { () -> Bool in
      guard #available(iOS 12.0, *) else { return false }
      return Self.present()
    }
    .runOnQueue(.main)

    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(
        forName: UIScreen.capturedDidChangeNotification,
        object: nil,
        queue: .main,
      ) { [weak self] _ in
        self?.sendEvent("onCaptureChange", ["captured": UIScreen.main.isCaptured])
      }
    }

    OnStopObserving {
      if let observer = self.observer {
        NotificationCenter.default.removeObserver(observer)
        self.observer = nil
      }
    }
  }

  @available(iOS 12.0, *)
  private static func present() -> Bool {
    guard
      let identifier = Bundle.main.bundleIdentifier,
      let window = Self.keyWindow
    else { return false }

    let picker = RPSystemBroadcastPickerView(
      frame: CGRect(x: 0, y: 0, width: 44, height: 44),
    )
    /* Without this the sheet lists every broadcast extension installed on the
       phone, and picking the wrong one starts a broadcast Gryt never receives a
       frame from. */
    picker.preferredExtension = "\(identifier).broadcast"
    /* ReplayKit's microphone is a second capture of the same voice already going
       over the call's audio track. Two copies, slightly out of step. */
    picker.showsMicrophoneButton = false

    /* It has to be in a window before the button will act. Off-screen is enough
       — nothing of this view is ever meant to be seen. */
    picker.alpha = 0
    picker.isUserInteractionEnabled = false
    window.addSubview(picker)

    let button = picker.subviews.compactMap { $0 as? UIButton }.first
    button?.sendActions(for: .touchUpInside)

    /* Removed after the tap has been delivered rather than immediately —
       tearing the view out in the same run loop turn cancels it. */
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
      picker.removeFromSuperview()
    }

    return button != nil
  }

  private static var keyWindow: UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first { $0.isKeyWindow }
  }
}
