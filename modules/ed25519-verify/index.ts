import { requireOptionalNativeModule } from "expo-modules-core";

type Verify = (publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array) => boolean | null;

type Gcm = (key: Uint8Array, iv: Uint8Array, aad: Uint8Array, input: Uint8Array) => Uint8Array | null;

const native = requireOptionalNativeModule<{ verify: Verify; verifyP256?: Verify; aesGcmOpen?: Gcm; aesGcmSeal?: Gcm }>("Ed25519Verify");

/** The OS's Ed25519 check, for `setMlsSignatureVerifier`. Null where this build has no native module. */
export const platformEd25519Verify: Verify | null = native ? (publicKey, message, signature) => native.verify(publicKey, message, signature) : null;

/** The OS's ES256 check, for `setBindingSignatureVerifier`. Null on a build without it. */
export const platformP256Verify: Verify | null = native?.verifyP256 ? (publicKey, message, signature) => native.verifyP256?.(publicKey, message, signature) ?? null : null;

/** The OS's AES-256-GCM, tag after the ciphertext. Null on a build without it. */
export const platformAesGcm: { open: Gcm; seal: Gcm } | null =
  native?.aesGcmOpen && native.aesGcmSeal
    ? {
        open: (key, iv, aad, sealed) => native.aesGcmOpen?.(key, iv, aad, sealed) ?? null,
        seal: (key, iv, aad, plain) => native.aesGcmSeal?.(key, iv, aad, plain) ?? null,
      }
    : null;
