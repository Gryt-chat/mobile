import { requireOptionalNativeModule } from "expo-modules-core";

type Verify = (publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array) => boolean | null;

const native = requireOptionalNativeModule<{ verify: Verify }>("Ed25519Verify");

/** The OS's Ed25519 check, for `setMlsSignatureVerifier`. Null where this build has no native module. */
export const platformEd25519Verify: Verify | null = native ? (publicKey, message, signature) => native.verify(publicKey, message, signature) : null;
