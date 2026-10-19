/** The toast after reporting a message: one line, because the answer is one line. */
export function reportToast(outcome: string, message?: string): { title: string; description?: string } {
  if (outcome === "submitted") return { title: "Report sent", description: "Whoever runs this server can see it." };
  if (outcome === "already") return { title: "You have already reported this" };
  return { title: "Report not sent", description: message };
}
