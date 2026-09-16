import { useEffect, useSyncExternalStore } from "react";
import { Keyboard } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Button, Dialog, Text, useTheme } from "@gryt/ui-native";

import { GUIDELINES_URL, TERMS_URL } from "./termsAgreement";
import { termsGate } from "./termsGate";

/** Asked before the first message leaves this phone. The desktop app asks with the same words. */
export function TermsPrompt() {
  const asking = useSyncExternalStore(termsGate.subscribe, termsGate.asking);

  useEffect(() => {
    termsGate.load();
  }, []);

  /* The keyboard would cover the buttons, and the draft is still in the field afterwards. */
  useEffect(() => {
    if (asking) Keyboard.dismiss();
  }, [asking]);

  return (
    /* A `Dialog` rather than an `AlertDialog`: saying no is safe, so a tap outside can mean it. */
    <Dialog.Root
      open={asking}
      onOpenChange={(open: boolean) => {
        if (!open) termsGate.decline();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.Title>Before you post</Dialog.Title>
          <Dialog.Description>
            Please agree to the <Link url={TERMS_URL}>Terms of Use</Link> and the{" "}
            <Link url={GUIDELINES_URL}>Community Guidelines</Link>.
          </Dialog.Description>
          <Dialog.Description>
            Abusive content and abusive people aren&rsquo;t tolerated. You can report both, and
            block anyone who bothers you.
          </Dialog.Description>
          <Dialog.Footer>
            <Button tone="ghost" onPress={termsGate.decline}>
              Not now
            </Button>
            <Button tone="primary" onPress={termsGate.agree}>
              Agree
            </Button>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Link({ url, children }: { url: string; children: string }) {
  const theme = useTheme();

  return (
    <Text
      accessibilityRole="link"
      onPress={() => void WebBrowser.openBrowserAsync(url)}
      style={{ color: theme.color.accent, textDecorationLine: "underline" }}
    >
      {children}
    </Text>
  );
}
