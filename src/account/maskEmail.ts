/** "someone@example.com" as "s•••••@example.com": enough to tell two accounts apart over a shoulder. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "•••••";
  return `${email.slice(0, 1)}•••••${email.slice(at)}`;
}
