import ExpoModulesCore
import UIKit

/** Where the fold divides the inner display, in window points. React Native has no way to ask. */
public final class FoldRegionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FoldRegion")

    AsyncFunction("current") { () -> [String: CGFloat]? in
      guard #available(iOS 27.1, *) else { return nil }
      let window = UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .flatMap(\.windows)
        .first(where: \.isKeyWindow)
      guard let window, let region = window.reservedRegions(kind: .division).first else { return nil }
      let frame = region.frame
      return ["x": frame.minX, "y": frame.minY, "width": frame.width, "height": frame.height]
    }.runOnQueue(.main)
  }
}
