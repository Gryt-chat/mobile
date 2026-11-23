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

    // ES256 over the raw message (CryptoKit hashes it), `r || s` raw: ~25 ms each in noble on Hermes.
    Function("verifyP256") { (publicKey: Data, message: Data, signature: Data) -> Bool in
      guard let key = try? P256.Signing.PublicKey(x963Representation: publicKey),
            let sig = try? P256.Signing.ECDSASignature(rawRepresentation: signature) else { return false }
      return key.isValidSignature(sig, for: message)
    }
  }
}
