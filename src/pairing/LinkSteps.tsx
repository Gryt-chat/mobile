import { useKeepAwake } from "expo-keep-awake";
import { View } from "react-native";
import { Spinner, Text, useTheme } from "@gryt/ui-native";
import { CheckCircleIcon } from "phosphor-react-native/src/icons/CheckCircle";

import type { LinkStep } from "./linkStepsModel";

const SPOKEN: Record<LinkStep["state"], string> = { done: "done", busy: "in progress", todo: "next" };

/**
 * From Approve to Done, on both sides, so a slow step never looks like a hang. The screen
 * stays on while it shows: a locked phone stops the link.
 */
export function LinkSteps({ title, steps }: { title: string; steps: LinkStep[] }) {
  useKeepAwake("gryt-link");
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space(4) }}>
      <View style={{ gap: theme.space(1), alignItems: "center" }}>
        <Text style={{ color: theme.color.text, fontSize: 24, fontWeight: "700", textAlign: "center" }}>{title}</Text>
        <Text style={{ color: theme.color.muted, fontSize: 15, lineHeight: 21, textAlign: "center" }}>
          Keep Gryt open on both devices until it's done.
        </Text>
      </View>
      <View style={{ padding: theme.space(3), gap: theme.space(3), borderRadius: theme.radius.lg, backgroundColor: theme.color.surfaceRaised }}>
        {steps.map((step) => (
          <View
            key={step.label}
            accessible
            accessibilityLabel={`${step.label}, ${SPOKEN[step.state]}${step.detail ? `. ${step.detail}` : ""}`}
            style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3) }}
          >
            {step.state === "done" ? <CheckCircleIcon size={22} color={theme.color.success} weight="fill" /> : null}
            {step.state === "busy" ? <Spinner size="small" /> : null}
            {step.state === "todo" ? <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: theme.color.border }} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={{ color: step.state === "todo" ? theme.color.muted : theme.color.text, fontSize: 15 }}>{step.label}</Text>
              {step.detail ? <Text style={{ color: theme.color.muted, fontSize: 13 }}>{step.detail}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
