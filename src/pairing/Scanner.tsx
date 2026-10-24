import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useRef, useState } from "react";
import { Linking, View } from "react-native";
import { Button, Spinner, Text, useTheme } from "@gryt/ui-native";
import { CameraIcon } from "phosphor-react-native/src/icons/Camera";

import { judgeScan } from "./input";

/** Null takes the code; anything else is the line shown under the picture. */
function judgeLinkCode(data: string): string | null {
  const verdict = judgeScan(data);
  if (verdict === "claim") return null;
  if (verdict === "newer_version") return "This code comes from a newer version of Gryt. Update this app to link that device.";
  return "That isn't a Gryt link code.";
}

/**
 * The camera, reading only the codes `judge` takes, Gryt's link codes by default. Anything else
 * is skipped with a line under the picture, so pointing it at the wrong QR doesn't end anything.
 */
export function Scanner({
  onCode,
  judge = judgeLinkCode,
  prompt = "Point the camera at the code on the new device.",
  cameraWhy = "Gryt needs the camera to scan the code on the new device.",
}: {
  onCode: (qr: string) => void;
  judge?: (data: string) => string | null;
  prompt?: string;
  cameraWhy?: string;
}) {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [hint, setHint] = useState<string | null>(null);
  const taken = useRef(false);

  const onScanned = ({ data }: BarcodeScanningResult) => {
    if (taken.current) return;
    const refused = judge(data);
    if (refused === null) {
      taken.current = true;
      onCode(data.trim());
    } else {
      setHint(refused);
    }
  };

  const frame = {
    width: "100%" as const,
    aspectRatio: 1,
    borderRadius: theme.radius.lg,
    overflow: "hidden" as const,
    backgroundColor: theme.color.surfaceRaised,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: theme.space(4),
    gap: theme.space(3),
  };

  if (!permission) {
    return (
      <View style={frame}>
        <Spinner />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={frame}>
        <CameraIcon size={32} color={theme.color.muted} weight="fill" />
        <Text style={{ color: theme.color.text, fontSize: 15, lineHeight: 21, textAlign: "center" }}>
          {permission.canAskAgain
            ? cameraWhy
            : "Gryt can't use the camera. Turn it on for Gryt in Settings, or type the code instead."}
        </Text>
        {permission.canAskAgain ? (
          <Button onPress={() => void requestPermission()}>Allow the camera</Button>
        ) : (
          <Button tone="neutral" onPress={() => void Linking.openSettings()}>
            Open Settings
          </Button>
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: theme.space(2) }}>
      <View style={[frame, { padding: 0 }]}>
        <CameraView
          style={{ width: "100%", height: "100%" }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={onScanned}
        />
      </View>
      <Text
        accessibilityLiveRegion="polite"
        style={{ color: hint ? theme.color.text : theme.color.muted, fontSize: 14, lineHeight: 20, textAlign: "center" }}
      >
        {hint ?? prompt}
      </Text>
    </View>
  );
}
