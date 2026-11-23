import { setBindingSignatureVerifier, setMlsSignatureVerifier } from "@gryt/crypto";

import { platformAesGcm, platformEd25519Verify, platformP256Verify } from "../../modules/ed25519-verify";
import { setArchiveCipher } from "../archive/archiveKey";
import { setJwtSignatureVerifier } from "../identity/keys";

setMlsSignatureVerifier(platformEd25519Verify);
setBindingSignatureVerifier(platformP256Verify);
setJwtSignatureVerifier(platformP256Verify);
setArchiveCipher(platformAesGcm);
