import { captureLogs } from "./logs";

// Imported first in index.ts, so warnings from the rest of startup land in the buffer too.
captureLogs();
