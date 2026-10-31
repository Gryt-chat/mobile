import { AlertDialog as BaseAlertDialog, Dialog as BaseDialog } from "@gryt/ui-native";
import type { ComponentProps } from "react";

import { useOffFold } from "../shell/useFold";

function Popup({ style, ...props }: ComponentProps<typeof BaseDialog.Popup>) {
  const off = useOffFold();
  return <BaseDialog.Popup {...props} style={[off, style]} />;
}

function AlertPopup({ style, ...props }: ComponentProps<typeof BaseAlertDialog.Popup>) {
  const off = useOffFold();
  return <BaseAlertDialog.Popup {...props} style={[off, style]} />;
}

/** The library's dialogs, kept off the fold when half open. */
export const Dialog = { ...BaseDialog, Popup };
export const AlertDialog = { ...BaseAlertDialog, Popup: AlertPopup };
