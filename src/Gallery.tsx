/* Every @gryt/ui-native component that renders without a server behind it.
 *
 * This is the app's first screen on purpose. The component library has 33
 * components and, until this existed, none of them had been drawn on a device —
 * the only coverage was vitest over the token maths, which cannot tell you that
 * a ramp resolves, an overlay lands in the right place, or a long press opens a
 * tooltip. Those are the things a phone answers and a unit test does not.
 *
 * It is a harness, not a product screen. The real screens replace it.
 */
import { useState } from "react";
import { FrameProbe } from "./FrameProbe";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Chip,
  Divider,
  Meter,
  Progress,
  Radio,
  RadioGroup,
  Select,
  Skeleton,
  Slider,
  Spinner,
  Surface,
  Switch,
  Tab,
  Tabs,
  TextField,
  Toggle,
  useTheme
} from "@gryt/ui-native";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.color.muted }]}>
        {title.toUpperCase()}
      </Text>
      <Surface level="surface" bordered radius="lg" padding={16} style={styles.sectionBody}>
        {children}
      </Surface>
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export function Gallery() {
  const theme = useTheme();
  const [volume, setVolume] = useState(62);
  const [muted, setMuted] = useState(false);
  const [pushToTalk, setPushToTalk] = useState(true);
  const [device, setDevice] = useState("default");
  const [quality, setQuality] = useState("balanced");
  const [name, setName] = useState("");

  return (
    <ScrollView
      style={{ backgroundColor: theme.color.bg }}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.heading, { color: theme.color.text }]}>Gryt UI Native</Text>
      <Text style={[styles.sub, { color: theme.color.muted }]}>
        The same tokens as the desktop client, drawn by React Native.
      </Text>

      <Section title="Frame rate">
        <FrameProbe />
      </Section>

      <Section title="Buttons">
        <Row>
          <Button tone="primary">Join</Button>
          <Button tone="secondary">Invite</Button>
          <Button tone="neutral">Settings</Button>
        </Row>
        <Row>
          <Button tone="danger">Leave</Button>
          <Button tone="ghost">Cancel</Button>
          <Button tone="primary" disabled>
            Disabled
          </Button>
        </Row>
        <Row>
          <Button tone="primary" size="xsmall">XS</Button>
          <Button tone="primary" size="small">Small</Button>
          <Button tone="primary" size="medium">Medium</Button>
          <Button tone="primary" size="large">Large</Button>
        </Row>
      </Section>

      <Section title="Identity">
        <Row>
          <Avatar name="Sivert" size="xs" />
          <Avatar name="Sivert" size="sm" />
          <Avatar name="Ada Lovelace" size="md" />
          <Avatar name="Grace Hopper" size="lg" />
          <Avatar name="Alan Turing" size="xl" />
        </Row>
        <Row>
          <Badge count={3} />
          <Badge count={128} max={99} />
          <Badge dot tone="success" />
          <Badge dot tone="danger" />
        </Row>
        <Row>
          <Chip label="online" tone="success" />
          <Chip label="idle" tone="warning" variant="outline" />
          <Chip label="muted" tone="danger" variant="solid" />
          <Chip label="bot" tone="accent" />
        </Row>
      </Section>

      <Section title="Voice controls">
        <Text style={[styles.label, { color: theme.color.muted }]}>Output volume</Text>
        <Slider value={volume} onValueChange={setVolume} min={0} max={100} tone="primary" />
        <Text style={[styles.value, { color: theme.color.text }]}>{Math.round(volume)}%</Text>
        <Divider />
        <Row>
          <Switch checked={muted} onCheckedChange={setMuted} tone="danger" accessibilityLabel="Mute" />
          <Text style={{ color: theme.color.text }}>{muted ? "Muted" : "Microphone live"}</Text>
        </Row>
        <Row>
          <Switch checked={pushToTalk} onCheckedChange={setPushToTalk} accessibilityLabel="Push to talk" />
          <Text style={{ color: theme.color.text }}>Push to talk</Text>
        </Row>
        <Divider />
        <Meter value={71} label="Input level" showValue format={(v) => `${Math.round(v)}%`} />
      </Section>

      <Section title="Inputs">
        <TextField
          label="Display name"
          value={name}
          onChangeText={setName}
          placeholder="How others see you"
          helperText="Shown on every server you join."
        />
        <Select
          value={device}
          onValueChange={(value) => setDevice(String(value))}
          options={[
            { value: "default", label: "System default" },
            { value: "airpods", label: "AirPods Pro" },
            { value: "mac", label: "MacBook Microphone" }
          ]}
        />
        <Row>
          <Checkbox defaultChecked />
          <Text style={{ color: theme.color.text }}>Start muted</Text>
        </Row>
        <RadioGroup value={quality} onValueChange={(value) => setQuality(String(value))}>
          <Row>
            <Radio value="low" />
            <Text style={{ color: theme.color.text }}>Low data</Text>
          </Row>
          <Row>
            <Radio value="balanced" />
            <Text style={{ color: theme.color.text }}>Balanced</Text>
          </Row>
          <Row>
            <Radio value="high" />
            <Text style={{ color: theme.color.text }}>High quality</Text>
          </Row>
        </RadioGroup>
        <Row>
          <Toggle>Noise gate</Toggle>
          <Toggle defaultPressed>Echo cancel</Toggle>
        </Row>
      </Section>

      <Section title="Feedback">
        <Alert severity="info">Connected to gryt-prod-sfu.</Alert>
        <Alert severity="warning">Your connection is unstable.</Alert>
        <Alert severity="error">The server rejected your certificate.</Alert>
        <Divider />
        <Progress />
        <Row>
          <Spinner />
          <Text style={{ color: theme.color.muted }}>Connecting…</Text>
        </Row>
        <Skeleton width={180} height={14} />
        <Skeleton width={120} height={14} />
      </Section>

      <Section title="Containers">
        <Card>
          <CardHeader title="General" subtitle="Server settings" />
          <CardContent>
            <Text style={{ color: theme.color.muted }}>
              Cards, surfaces and dividers all read their colours from the same
              ramps the web components use.
            </Text>
          </CardContent>
        </Card>
        <Tabs defaultValue="voice">
          <Tabs.List>
            <Tab value="voice">Voice</Tab>
            <Tab value="video">Video</Tab>
            <Tab value="text">Text</Tab>
          </Tabs.List>
        </Tabs>
      </Section>

      <Section title="Neutral ramp">
        <View style={styles.ramp}>
          {theme.scales.neutral.map((step, i) => (
            <View key={i} style={[styles.swatch, { backgroundColor: step }]} />
          ))}
        </View>
        <Text style={[styles.label, { color: theme.color.muted }]}>Accent ramp</Text>
        <View style={styles.ramp}>
          {theme.scales.accent.map((step, i) => (
            <View key={i} style={[styles.swatch, { backgroundColor: step }]} />
          ))}
        </View>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 72, paddingBottom: 64, gap: 8 },
  heading: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  sub: { fontSize: 14, marginBottom: 16 },
  section: { marginTop: 20, gap: 8 },
  sectionTitle: { fontSize: 11, fontWeight: "600", letterSpacing: 1 },
  sectionBody: { gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  label: { fontSize: 12 },
  value: { fontSize: 13, fontVariant: ["tabular-nums"] },
  ramp: { flexDirection: "row", borderRadius: 8, overflow: "hidden" },
  swatch: { flex: 1, height: 28 }
});
