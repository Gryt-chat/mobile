import { setBindingSignatureVerifier, setMlsSignatureVerifier } from "@gryt/crypto";

import { platformEd25519Verify, platformP256Verify } from "../../modules/ed25519-verify";
import { setJwtSignatureVerifier } from "../identity/keys";

setMlsSignatureVerifier(platformEd25519Verify);
setBindingSignatureVerifier(platformP256Verify);
setJwtSignatureVerifier(platformP256Verify);
