import CryptoKit
import ExpoModulesCore

/** CryptoKit's Ed25519 check: microseconds, where noble on Hermes takes ~14 ms per MLS message. */
public final class Ed25519VerifyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Ed25519Verify")

    Function("verify") { (publicKey: Data, message: Data, signature: Data) -> Bool in
      guard let key = try? Curve25519.Signing.PublicKey(rawRepresentation: publicKey) else { return false }
      return key.isValidSignature(signature, for: message)
    }
  }
}
