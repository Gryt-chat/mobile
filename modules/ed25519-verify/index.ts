import { requireOptionalNativeModule } from "expo-modules-core";

type Verify = (publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array) => boolean | null;

const native = requireOptionalNativeModule<{ verify: Verify; verifyP256?: Verify }>("Ed25519Verify");

/** The OS's Ed25519 check, for `setMlsSignatureVerifier`. Null where this build has no native module. */
export const platformEd25519Verify: Verify | null = native ? (publicKey, message, signature) => native.verify(publicKey, message, signature) : null;

/** The OS's ES256 check, for `setBindingSignatureVerifier`. Null on a build without it. */
export const platformP256Verify: Verify | null = native?.verifyP256 ? (publicKey, message, signature) => native.verifyP256?.(publicKey, message, signature) ?? null : null;
