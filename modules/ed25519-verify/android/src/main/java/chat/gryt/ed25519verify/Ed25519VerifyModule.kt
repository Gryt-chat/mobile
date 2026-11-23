package chat.gryt.ed25519verify

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/** The platform's Ed25519 check, from API 33. Null below that, and the JS check runs instead. */
class Ed25519VerifyModule : Module() {
  // SubjectPublicKeyInfo for Ed25519 is this fixed prefix and the raw 32-byte key.
  private val spkiPrefix = byteArrayOf(0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00)
  // SubjectPublicKeyInfo for an uncompressed P-256 point, before its 65 bytes.
  private val p256SpkiPrefix = byteArrayOf(
    0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86.toByte(), 0x48, 0xce.toByte(), 0x3d, 0x02, 0x01,
    0x06, 0x08, 0x2a, 0x86.toByte(), 0x48, 0xce.toByte(), 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
  )

  /** Raw `r || s` as the DER sequence `SHA256withECDSA` wants. */
  private fun derSignature(raw: ByteArray): ByteArray {
    fun integer(half: ByteArray): ByteArray {
      var v = half.dropWhile { it == 0.toByte() }.toByteArray()
      if (v.isEmpty() || v[0] < 0) v = byteArrayOf(0) + v
      return byteArrayOf(0x02, v.size.toByte()) + v
    }
    val body = integer(raw.copyOfRange(0, 32)) + integer(raw.copyOfRange(32, 64))
    return byteArrayOf(0x30, body.size.toByte()) + body
  }

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

    Function("verifyP256") { publicKey: ByteArray, message: ByteArray, signature: ByteArray ->
      if (publicKey.size != 65 || signature.size != 64) return@Function false
      try {
        val key = KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(p256SpkiPrefix + publicKey))
        Signature.getInstance("SHA256withECDSA").run {
          initVerify(key)
          update(message)
          verify(derSignature(signature))
        }
      } catch (e: Exception) {
        false
      }
    }

    // AES-256-GCM with the 16-byte tag after the ciphertext, the layout noble's gcm writes. Null on a bad tag.
    Function("aesGcmOpen") { key: ByteArray, iv: ByteArray, aad: ByteArray, sealed: ByteArray ->
      gcm(Cipher.DECRYPT_MODE, key, iv, aad, sealed)
    }

    Function("aesGcmSeal") { key: ByteArray, iv: ByteArray, aad: ByteArray, plain: ByteArray ->
      gcm(Cipher.ENCRYPT_MODE, key, iv, aad, plain)
    }
  }

  private fun gcm(mode: Int, key: ByteArray, iv: ByteArray, aad: ByteArray, input: ByteArray): ByteArray? {
    if (key.size != 32) return null
    return try {
      Cipher.getInstance("AES/GCM/NoPadding").run {
        init(mode, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        updateAAD(aad)
        doFinal(input)
      }
    } catch (e: Exception) {
      null
    }
  }
}
