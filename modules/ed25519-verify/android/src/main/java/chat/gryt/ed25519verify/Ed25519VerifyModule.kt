package chat.gryt.ed25519verify

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec

/** The platform's Ed25519 check, from API 33. Null below that, and the JS check runs instead. */
class Ed25519VerifyModule : Module() {
  // SubjectPublicKeyInfo for Ed25519 is this fixed prefix and the raw 32-byte key.
  private val spkiPrefix = byteArrayOf(0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00)

  override fun definition() = ModuleDefinition {
    Name("Ed25519Verify")

    Function("verify") { publicKey: ByteArray, message: ByteArray, signature: ByteArray ->
      if (Build.VERSION.SDK_INT < 33) return@Function null
      try {
        val key = KeyFactory.getInstance("Ed25519").generatePublic(X509EncodedKeySpec(spkiPrefix + publicKey))
        Signature.getInstance("Ed25519").run {
          initVerify(key)
          update(message)
          verify(signature)
        }
      } catch (e: Exception) {
        false
      }
    }
  }
}
