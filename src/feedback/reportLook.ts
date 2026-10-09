import type { NativeTheme } from "@gryt/ui-native";

export type ReportKind = "bug" | "feedback";

/** What tells a bug report from feedback at a glance. Theme colours, so they follow light and dark. */
export function reportLook(kind: ReportKind, theme: Pick<NativeTheme, "color">) {
  return kind === "bug"
    ? { colour: theme.color.warning, title: "Report a bug", tagline: "Something broke" }
    : { colour: theme.color.success, title: "Give feedback", tagline: "An idea, or a gripe" };
}
