import { setMlsSignatureVerifier } from "@gryt/crypto";

import { platformEd25519Verify } from "../../modules/ed25519-verify";

setMlsSignatureVerifier(platformEd25519Verify);
