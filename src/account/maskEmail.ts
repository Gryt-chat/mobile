/** "someone@example.com" as "s•••@e•••.com": enough to tell two accounts apart over a shoulder. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "•••••";
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  return `${email.slice(0, 1)}•••@${domain.slice(0, 1)}•••${dot > 0 ? domain.slice(dot) : ""}`;
}
