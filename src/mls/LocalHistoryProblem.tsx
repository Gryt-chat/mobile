import { useState } from "react";
import { View } from "react-native";
import { Button, Text, useTheme, useToast } from "@gryt/ui-native";
import { WarningIcon } from "phosphor-react-native/src/icons/Warning";

import { clearLocalArchive, openLocalArchive, useLocalArchive } from "../archive/localArchive";
import { useConfirm } from "../ui/actionSheet";
import {
  CLEAR_CONFIRM_TEXT,
  CLEAR_CONFIRM_TITLE,
  CLEAR_LOCAL_HISTORY,
  canRetryLocalHistory,
  localHistoryProblemText,
} from "./localHistoryCopy";

/**
 * Shown while the archive won't open: in a DM above the composer, and in Privacy.
 * Try again never deletes anything; only the confirmed clear does.
 */
export function LocalHistoryProblem({ compact = false }: { compact?: boolean }) {
  const theme = useTheme();
  const toast = useToast();
  const confirm = useConfirm();
  const { status } = useLocalArchive();
  const [busy, setBusy] = useState<"retry" | "clear" | null>(null);

  if (status.kind !== "failed") return null;

  const retry = () => {
    setBusy("retry");
    openLocalArchive()
      .then(() => toast.show({ title: "Local history opened.", severity: "success" }))
      .catch(() => undefined)
      .finally(() => setBusy(null));
  };

  const clear = async () => {
    const sure = await confirm({ title: CLEAR_CONFIRM_TITLE, message: CLEAR_CONFIRM_TEXT, confirm: "Clear local history" });
    if (!sure) return;
    setBusy("clear");
    clearLocalArchive()
      .then(() => toast.show({ title: "Local history cleared.", severity: "success" }))
      .catch((e: unknown) => {
        console.warn("[Archive] Clearing failed:", e);
        toast.show({ description: "Couldn't clear local history.", severity: "error" });
      })
      .finally(() => setBusy(null));
  };

  const line = [
    localHistoryProblemText(status.code),
    compact && "Until then, you can't send messages here.",
    "Nothing has been deleted.",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ gap: theme.space(1.5), paddingHorizontal: compact ? theme.space(4) : 0, paddingBottom: compact ? theme.space(1) : 0 }}
    >
      <View style={{ flexDirection: "row", gap: theme.space(1.5), alignItems: "flex-start" }}>
        <WarningIcon size={compact ? 14 : 16} color={theme.color.warning} weight="fill" style={{ marginTop: 2 }} />
        <Text style={{ flex: 1, color: theme.color.muted, fontSize: compact ? 12 : 14 }}>{line}</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space(2) }}>
        {canRetryLocalHistory(status.code) ? (
          <Button size="xsmall" tone="neutral" disabled={busy !== null} onPress={retry}>
            {busy === "retry" ? "Trying…" : "Try again"}
          </Button>
        ) : null}
        <Button size="xsmall" tone="danger" disabled={busy !== null} onPress={() => void clear()}>
          {busy === "clear" ? "Clearing…" : CLEAR_LOCAL_HISTORY}
        </Button>
      </View>
    </View>
  );
}
