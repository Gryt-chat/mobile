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

    // AES-256-GCM with the 16-byte tag after the ciphertext, the layout noble's gcm writes. Nil on a bad tag.
    Function("aesGcmOpen") { (key: Data, iv: Data, aad: Data, sealed: Data) -> Data? in
      guard key.count == 32, sealed.count >= 16, let nonce = try? AES.GCM.Nonce(data: iv),
            let box = try? AES.GCM.SealedBox(nonce: nonce, ciphertext: sealed.dropLast(16), tag: sealed.suffix(16)) else { return nil }
      return try? AES.GCM.open(box, using: SymmetricKey(data: key), authenticating: aad)
    }

    Function("aesGcmSeal") { (key: Data, iv: Data, aad: Data, plain: Data) -> Data? in
      guard key.count == 32, let nonce = try? AES.GCM.Nonce(data: iv),
            let box = try? AES.GCM.seal(plain, using: SymmetricKey(data: key), nonce: nonce, authenticating: aad) else { return nil }
      return box.ciphertext + box.tag
    }
  }
}
