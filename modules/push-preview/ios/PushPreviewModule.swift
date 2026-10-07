import ExpoModulesCore

/* The notification extension can't reach the app's storage, only the app group's. So the
   preview keys, by the relay's tag for each server, go into the group's defaults (GRYT-1688). */
public class PushPreviewModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PushPreview")

    Function("setKeys") { (keys: [String: String]) -> Bool in
      guard
        let group = Bundle.main.object(forInfoDictionaryKey: "RTCAppGroupIdentifier") as? String,
        let defaults = UserDefaults(suiteName: group)
      else { return false }
      defaults.set(keys, forKey: "gryt.pushPreviewKeys")
      return true
    }
  }
}
