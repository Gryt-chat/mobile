import { captureLogs, record } from "./logs";

// Imported first in index.ts, so warnings from the rest of startup land in the buffer too.
captureLogs();

// A frozen JS thread logs nothing itself, so note each gap in the timer.
let tick = Date.now();
setInterval(() => {
  const now = Date.now();
  if (now - tick > 750) record("info", [`js stalled ${now - tick - 250} ms`]);
  tick = now;
}, 250);
