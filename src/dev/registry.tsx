/* Every component @gryt/ui-native exports, one entry each.
 *
 * The point is feedback, not documentation: each entry shows the states worth
 * having an opinion about — tones, sizes, disabled, long text — so a real
 * finger on real hardware can find what a unit test cannot. The Slider bug in
 * GRYT-378 was found exactly this way and could not have been found any other.
 *
 * `notes` is for the things a screenshot will not tell you: that Tooltip is a
 * long press here rather than a hover, that a positioned overlay does not
 * follow a trigger that moves. Read them before filing something as broken.
 */
import { useState } from "react";
import { View } from "react-native";
import { Text } from "../ui/Text";
import {
  Accordion,
  Alert,
  AlertDialog,
  Avatar,
  Badge,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  Checkbox,
  Chip,
  Collapsible,
  Dialog,
  Divider,
  Drawer,
  Menu,
  Meter,
  NumberField,
  OtpField,
  Popover,
  Progress,
  Radio,
  RadioGroup,
  ScrollArea,
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
  Toolbar,
  ToolbarSeparator,
  Tooltip,
  useToast,
  useTheme
} from "@gryt/ui-native";
import { Case, Label, Note, Row, TriggerLabel } from "./Row";

export interface Entry {
  id: string;
  name: string;
  group: string;
  /** Things a screenshot cannot say. Shown above the demo. */
  notes?: string;
  Demo: () => React.ReactElement;
}

// --- Actions -----------------------------------------------------------------

const ButtonDemo = () => (
  <>
    <Case title="TONES">
      <Row>
        <Button tone="primary">Primary</Button>
        <Button tone="secondary">Secondary</Button>
        <Button tone="neutral">Neutral</Button>
      </Row>
      <Row>
        <Button tone="danger">Danger</Button>
        <Button tone="ghost">Ghost</Button>
      </Row>
    </Case>
    <Case title="SIZES">
      <Row>
        <Button size="xsmall">XS</Button>
        <Button size="small">Small</Button>
        <Button size="medium">Medium</Button>
        <Button size="large">Large</Button>
      </Row>
    </Case>
    <Case title="DISABLED">
      <Row>
        <Button disabled>Primary</Button>
        <Button tone="danger" disabled>
          Danger
        </Button>
      </Row>
    </Case>
    <Case title="LONG LABEL">
      <Button tone="primary">Disconnect from every voice channel</Button>
    </Case>
  </>
);

const ToggleDemo = () => (
  <Case title="SIZES AND STATE">
    <Row>
      <Toggle>Off</Toggle>
      <Toggle defaultPressed>On</Toggle>
      <Toggle disabled>Disabled</Toggle>
    </Row>
    <Row>
      <Toggle size="small">Small</Toggle>
      <Toggle size="medium">Medium</Toggle>
    </Row>
  </Case>
);

const ToolbarDemo = () => (
  <Case title="HORIZONTAL">
    <Toolbar>
      <Button size="small" tone="ghost">
        Mute
      </Button>
      <ToolbarSeparator />
      <Button size="small" tone="ghost">
        Deafen
      </Button>
      <ToolbarSeparator />
      <Button size="small" tone="danger">
        Leave
      </Button>
    </Toolbar>
  </Case>
);

// --- Data input --------------------------------------------------------------

const TextFieldDemo = () => {
  const [value, setValue] = useState("");

  return (
    <>
      <Case title="STATES">
        <TextField label="Display name" value={value} onChangeText={setValue} placeholder="How others see you" />
        <TextField label="With helper" helperText="Shown on every server you join." placeholder="Status" />
        <TextField label="Error" error helperText="That name is taken." defaultValue="sivert" />
        <TextField label="Disabled" editable={false} defaultValue="Cannot edit" />
      </Case>
      <Case title="SIZES">
        <TextField size="small" placeholder="Small" />
        <TextField size="medium" placeholder="Medium" />
      </Case>
      <Case title="MULTILINE">
        <TextField multiline minRows={3} placeholder="A longer message…" />
      </Case>
    </>
  );
};

const NumberFieldDemo = () => (
  <>
    <Case title="DEFAULT">
      <NumberField label="Voice seats" defaultValue={10} min={1} max={99} />
    </Case>
    <Case title="STEP OF 5, DISABLED">
      <NumberField label="Bitrate (kbps)" defaultValue={64} min={8} max={256} step={8} />
      <NumberField label="Disabled" defaultValue={3} disabled />
    </Case>
  </>
);

const OtpFieldDemo = () => {
  const [code, setCode] = useState("");

  return (
    <>
      <Case title="SIX DIGITS">
        <OtpField length={6} value={code} onValueChange={setCode} />
        <Note>Value: {code || "(empty)"}</Note>
      </Case>
      <Case title="FOUR DIGITS, DISABLED">
        <OtpField length={4} disabled />
      </Case>
    </>
  );
};

const SelectDemo = () => {
  const [value, setValue] = useState<string>("default");

  return (
    <Case title="SIZES">
      <Select
        value={value}
        onValueChange={(v) => setValue(String(v))}
        options={[
          { value: "default", label: "System default" },
          { value: "airpods", label: "AirPods Pro" },
          { value: "studio", label: "Studio Display Microphone" }
        ]}
      />
      <Select
        size="small"
        defaultValue="a"
        options={[
          { value: "a", label: "Small" },
          { value: "b", label: "Another option" }
        ]}
      />
    </Case>
  );
};

const CheckboxDemo = () => (
  <Case title="TONES AND STATE">
    <Row>
      <Checkbox defaultChecked />
      <Label>Checked</Label>
    </Row>
    <Row>
      <Checkbox />
      <Label>Unchecked</Label>
    </Row>
    <Row>
      <Checkbox defaultChecked tone="danger" />
      <Label>Danger tone</Label>
    </Row>
    <Row>
      <Checkbox disabled defaultChecked />
      <Label>Disabled</Label>
    </Row>
  </Case>
);

const RadioDemo = () => {
  const [value, setValue] = useState<string>("balanced");

  return (
    <Case title="GROUP">
      <RadioGroup value={value} onValueChange={(v) => setValue(String(v))}>
        {["low", "balanced", "high"].map((v) => (
          <Row key={v}>
            <Radio value={v} />
            <Label>{v}</Label>
          </Row>
        ))}
      </RadioGroup>
      <Note>Selected: {value}</Note>
    </Case>
  );
};

const SwitchDemo = () => {
  const [on, setOn] = useState(true);

  return (
    <Case title="TONES AND STATE">
      <Row>
        <Switch checked={on} onCheckedChange={setOn} accessibilityLabel="Primary" />
        <Label>{on ? "On" : "Off"}</Label>
      </Row>
      <Row>
        <Switch defaultChecked tone="danger" accessibilityLabel="Danger" />
        <Label>Danger</Label>
      </Row>
      <Row>
        <Switch disabled defaultChecked accessibilityLabel="Disabled" />
        <Label>Disabled</Label>
      </Row>
    </Case>
  );
};

const SliderDemo = () => {
  const [value, setValue] = useState(40);

  return (
    <>
      <Case title="DRAG AND TAP">
        <Slider value={value} onValueChange={setValue} min={0} max={100} />
        <Note>Value: {Math.round(value)}</Note>
      </Case>
      <Case title="STEPPED, TONES, DISABLED">
        <Slider defaultValue={50} step={25} tone="secondary" />
        <Slider defaultValue={70} tone="danger" />
        <Slider defaultValue={30} disabled />
      </Case>
    </>
  );
};

// --- Display -----------------------------------------------------------------

const AvatarDemo = () => (
  <>
    <Case title="SIZES">
      <Row>
        {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
          <Avatar key={size} name="Ada Lovelace" size={size} />
        ))}
      </Row>
    </Case>
    <Case title="SINGLE NAME AND FALLBACK">
      <Row>
        <Avatar name="Sivert" size="lg" />
        <Avatar size="lg" />
      </Row>
    </Case>
  </>
);

const BadgeDemo = () => (
  <Case title="COUNTS AND DOTS">
    <Row>
      <Badge count={1} />
      <Badge count={12} />
      <Badge count={128} max={99} />
    </Row>
    <Row>
      {(["neutral", "accent", "secondary", "success", "danger", "warning"] as const).map((tone) => (
        <Badge key={tone} dot tone={tone} />
      ))}
    </Row>
    <Note>A count of zero renders nothing, by design.</Note>
    <Badge count={0} />
  </Case>
);

const ChipDemo = () => (
  <>
    <Case title="TONES">
      <Row>
        {(["neutral", "accent", "secondary", "success", "danger", "warning"] as const).map((tone) => (
          <Chip key={tone} label={tone} tone={tone} />
        ))}
      </Row>
    </Case>
    <Case title="VARIANTS">
      <Row>
        <Chip label="soft" variant="soft" tone="accent" />
        <Chip label="solid" variant="solid" tone="accent" />
        <Chip label="outline" variant="outline" tone="accent" />
      </Row>
    </Case>
  </>
);

const SurfaceDemo = () => (
  <Case title="LEVELS">
    <Surface level="bg" bordered padding={16} radius="lg">
      <Label>bg</Label>
    </Surface>
    <Surface level="surface" bordered padding={16} radius="lg">
      <Label>surface</Label>
    </Surface>
    <Surface level="raised" bordered padding={16} radius="lg">
      <Label>raised</Label>
    </Surface>
  </Case>
);

const CardDemo = () => (
  <Case title="HEADER, CONTENT, ACTIONS">
    <Card>
      {/* Not a settings form. It was "General / Server settings" with Cancel
          and Save, which modelled a pattern the app deliberately does not have
          any more — settings commit when a field loses focus, and there is no
          Save button anywhere to copy. A catalogue that shows one teaches it.
          GRYT-513. */}
      <CardHeader title="Leaving ws1" subtitle="You can rejoin with an invite" />
      <CardContent>
        <Label>Everything reads from the same ramps the web components use.</Label>
      </CardContent>
      <CardActions>
        <Button size="small" tone="ghost">
          Stay
        </Button>
        <Button size="small" tone="danger">
          Leave
        </Button>
      </CardActions>
    </Card>
  </Case>
);

const DividerDemo = () => (
  <Case title="HORIZONTAL">
    <Label>Above</Label>
    <Divider />
    <Label>Below</Label>
  </Case>
);

const MeterDemo = () => (
  <Case title="THRESHOLDS">
    <Meter value={20} label="Quiet" showValue format={(v) => `${Math.round(v)}%`} />
    <Meter value={71} label="Warning above 66" showValue format={(v) => `${Math.round(v)}%`} />
    <Meter value={95} label="Danger above 90" showValue format={(v) => `${Math.round(v)}%`} />
  </Case>
);

const ProgressDemo = () => (
  <Case title="DETERMINATE AND INDETERMINATE">
    <Progress value={35} />
    <Progress value={80} />
    <Progress />
    <Note>No value renders the indeterminate animation.</Note>
  </Case>
);

const SpinnerDemo = () => (
  <Case title="DEFAULT">
    <Row>
      <Spinner />
      <Label>Connecting…</Label>
    </Row>
  </Case>
);

const SkeletonDemo = () => (
  <Case title="SHAPES">
    <Skeleton width={220} height={14} />
    <Skeleton width={160} height={14} />
    <Row>
      <Skeleton width={40} height={40} shape="circle" />
      <Skeleton width={140} height={14} />
    </Row>
  </Case>
);

const AlertDemo = () => (
  <Case title="SEVERITIES">
    <Alert severity="info" title="Connected">
      You are on gryt-prod-sfu.
    </Alert>
    <Alert severity="success">Settings saved.</Alert>
    <Alert severity="warning">Your connection is unstable.</Alert>
    <Alert severity="error" title="Rejected">
      The server would not accept your certificate.
    </Alert>
  </Case>
);

// --- Navigation and disclosure ----------------------------------------------

const TabsDemo = () => (
  <Case title="ROW OF TRIGGERS">
    <Tabs defaultValue="voice">
      <Tabs.List>
        <Tab value="voice">Voice</Tab>
        <Tab value="video">Video</Tab>
        <Tab value="text">Text</Tab>
      </Tabs.List>
      <Tabs.Panel value="voice">
        <Label>Voice settings</Label>
      </Tabs.Panel>
      <Tabs.Panel value="video">
        <Label>Video settings</Label>
      </Tabs.Panel>
      <Tabs.Panel value="text">
        <Label>Text settings</Label>
      </Tabs.Panel>
    </Tabs>
    <Note>Tab triggers need the Tabs.List wrapper or they stack vertically.</Note>
  </Case>
);

const AccordionDemo = () => (
  <Case title="SINGLE AND MULTIPLE">
    <Accordion.Root type="single" defaultValue={["a"]}>
      <Accordion.Item value="a">
        <Accordion.Trigger>
          <Label>Audio</Label>
        </Accordion.Trigger>
        <Accordion.Panel>
          <Label>Input, output and noise suppression.</Label>
        </Accordion.Panel>
      </Accordion.Item>
      <Accordion.Item value="b">
        <Accordion.Trigger>
          <Label>Video</Label>
        </Accordion.Trigger>
        <Accordion.Panel>
          <Label>Camera and screen share.</Label>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion.Root>
  </Case>
);

const CollapsibleDemo = () => (
  <Case title="TRIGGER AND PANEL">
    <Collapsible.Root>
      <Collapsible.Trigger>
        <TriggerLabel>Advanced</TriggerLabel>
      </Collapsible.Trigger>
      <Collapsible.Panel>
        <Surface level="raised" bordered padding={12} radius="md">
          <Label>Things most people never change.</Label>
        </Surface>
      </Collapsible.Panel>
    </Collapsible.Root>
  </Case>
);

const ScrollAreaDemo = () => (
  <>
    <Case title="VERTICAL">
      <Surface level="raised" bordered radius="md" style={{ height: 160 }}>
        <ScrollArea>
          {Array.from({ length: 20 }, (_, i) => (
            <Text key={i} style={{ padding: 8, color: "#c9ced8" }}>
              Row {i + 1}
            </Text>
          ))}
        </ScrollArea>
      </Surface>
    </Case>
    <Case title="HORIZONTAL">
      <Surface level="raised" bordered radius="md">
        <ScrollArea horizontal>
          <Row>
            {Array.from({ length: 12 }, (_, i) => (
              <Chip key={i} label={`tag ${i + 1}`} tone="accent" />
            ))}
          </Row>
        </ScrollArea>
      </Surface>
    </Case>
  </>
);

// --- Overlays ----------------------------------------------------------------

const DialogDemo = () => (
  <>
    <Case title="SCROLLABLE={FALSE}">
      <Dialog.Root>
        <Dialog.Trigger>
          <TriggerLabel>Open (not scrollable)</TriggerLabel>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup scrollable={false}>
            <Dialog.Title>Leave this server?</Dialog.Title>
            <Dialog.Description>
              You will need a new invite to come back.
            </Dialog.Description>
            <Dialog.Footer>
              <Dialog.Close>
                <TriggerLabel>Cancel</TriggerLabel>
              </Dialog.Close>
              <Dialog.Close>
                <TriggerLabel tone="danger">Leave</TriggerLabel>
              </Dialog.Close>
            </Dialog.Footer>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </Case>
    <Case title="TALLER THAN THE 80% CAP">
      <Dialog.Root>
        <Dialog.Trigger>
          <TriggerLabel>Open (long content)</TriggerLabel>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
            <Dialog.Title>Terms</Dialog.Title>
            {Array.from({ length: 20 }, (_, i) => (
              <Dialog.Description key={i}>
                Paragraph {i + 1}. The popup caps at 80% of the screen and the
                body scrolls; the footer must stay reachable.
              </Dialog.Description>
            ))}
            <Dialog.Footer>
              <Dialog.Close>
                <TriggerLabel>Close</TriggerLabel>
              </Dialog.Close>
            </Dialog.Footer>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </Case>
  <Case title="DISMISSIBLE (DEFAULT, SCROLLABLE)">
    <Dialog.Root>
      <Dialog.Trigger>
        <TriggerLabel tone="primary">Open dialog</TriggerLabel>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.Title>Leave this server?</Dialog.Title>
          <Dialog.Description>
            You will need a new invite to come back.
          </Dialog.Description>
          <Dialog.Footer>
            <Dialog.Close>
              <TriggerLabel>Cancel</TriggerLabel>
            </Dialog.Close>
            <Dialog.Close>
              <TriggerLabel tone="danger">Leave</TriggerLabel>
            </Dialog.Close>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  </Case>
  </>
);

const AlertDialogDemo = () => (
  <Case title="NOT DISMISSIBLE BY BACKDROP">
    <AlertDialog.Root>
      <AlertDialog.Trigger>
        <TriggerLabel tone="danger">Delete channel</TriggerLabel>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop />
        <AlertDialog.Popup>
          <AlertDialog.Title>Delete #general?</AlertDialog.Title>
          <AlertDialog.Description>
            Every message in it goes too. This cannot be undone.
          </AlertDialog.Description>
          <AlertDialog.Close>
              <TriggerLabel tone="danger">Delete</TriggerLabel>
            </AlertDialog.Close>
          <AlertDialog.Close>
              <TriggerLabel>Keep it</TriggerLabel>
            </AlertDialog.Close>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  </Case>
);

const DrawerDemo = () => (
  <Case title="SIDES">
    <Row>
      {(["left", "right", "bottom"] as const).map((side) => (
        <Drawer.Root key={side}>
          <Drawer.Trigger>
            <TriggerLabel>{side}</TriggerLabel>
          </Drawer.Trigger>
          <Drawer.Portal>
            <Drawer.Popup side={side}>
              <Label>Drawer from the {side}</Label>
              <Drawer.Close>
              <TriggerLabel>Close</TriggerLabel>
            </Drawer.Close>
            </Drawer.Popup>
          </Drawer.Portal>
        </Drawer.Root>
      ))}
    </Row>
  </Case>
);

const MenuDemo = () => (
  <Case title="ITEMS AND SEPARATOR">
    <Menu.Root>
      <Menu.Trigger>
        <TriggerLabel>Open menu</TriggerLabel>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner>
          <Menu.Popup>
            <Menu.Item>Invite people</Menu.Item>
            <Menu.Item>Server settings</Menu.Item>
            <Menu.Separator />
            <Menu.Item>Leave server</Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  </Case>
);

const PopoverDemo = () => (
  <Case title="ANCHORED">
    <Popover.Root>
      <Popover.Trigger>
        <TriggerLabel>Open popover</TriggerLabel>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Popup>
          <Label>Anchored to the trigger.</Label>
          <Popover.Close>
              <TriggerLabel>Close</TriggerLabel>
            </Popover.Close>
        </Popover.Popup>
      </Popover.Portal>
    </Popover.Root>
  </Case>
);

const TooltipDemo = () => (
  <Case title="LONG PRESS">
    <Tooltip.Root>
      <Tooltip.Trigger>
        <TriggerLabel>Press and hold me</TriggerLabel>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Popup>
          <Label>Mute everyone</Label>
        </Tooltip.Popup>
      </Tooltip.Portal>
    </Tooltip.Root>
  </Case>
);

const ToastDemo = () => {
  const toast = useToast();

  return (
    <Case title="SEVERITIES">
      <Row>
        <Button size="small" onPress={() => toast.show({ title: "Saved", severity: "success" })}>
          Success
        </Button>
        <Button
          size="small"
          tone="danger"
          onPress={() => toast.show({ title: "Failed", description: "The server refused.", severity: "error" })}
        >
          Error
        </Button>
        <Button
          size="small"
          tone="neutral"
          onPress={() => toast.show({ title: "Sticky", description: "Tap to dismiss.", duration: null })}
        >
          No timeout
        </Button>
      </Row>
    </Case>
  );
};

// --- Theme -------------------------------------------------------------------

const RampsDemo = () => {
  const theme = useTheme();
  const ramps = ["neutral", "accent", "secondary", "success", "danger", "warning"] as const;

  return (
    <Case title="TWELVE STEPS EACH">
      {ramps.map((name) => (
        <View key={name} style={{ gap: 4 }}>
          <Note>{name}</Note>
          <View style={{ flexDirection: "row", borderRadius: 6, overflow: "hidden" }}>
            {theme.scales[name].map((step, i) => (
              <View key={i} style={{ flex: 1, height: 24, backgroundColor: step }} />
            ))}
          </View>
        </View>
      ))}
    </Case>
  );
};

export const entries: Entry[] = [
  { id: "button", name: "Button", group: "Actions", Demo: ButtonDemo },
  { id: "toggle", name: "Toggle", group: "Actions", Demo: ToggleDemo },
  { id: "toolbar", name: "Toolbar", group: "Actions", Demo: ToolbarDemo },

  { id: "text-field", name: "TextField", group: "Data input", Demo: TextFieldDemo },
  { id: "number-field", name: "NumberField", group: "Data input", Demo: NumberFieldDemo },
  { id: "otp-field", name: "OtpField", group: "Data input", Demo: OtpFieldDemo },
  { id: "select", name: "Select", group: "Data input", Demo: SelectDemo },
  { id: "checkbox", name: "Checkbox", group: "Data input", Demo: CheckboxDemo },
  { id: "radio", name: "Radio", group: "Data input", Demo: RadioDemo },
  { id: "switch", name: "Switch", group: "Data input", Demo: SwitchDemo },
  {
    id: "slider",
    name: "Slider",
    group: "Data input",
    notes:
      "Drag as well as tap. The thumb should track your finger exactly and scale down while held — GRYT-378 fixed it accelerating past you, GRYT-384 fixed the press animation throwing.",
    Demo: SliderDemo
  },

  { id: "avatar", name: "Avatar", group: "Display", Demo: AvatarDemo },
  { id: "badge", name: "Badge", group: "Display", Demo: BadgeDemo },
  { id: "chip", name: "Chip", group: "Display", Demo: ChipDemo },
  { id: "surface", name: "Surface", group: "Display", Demo: SurfaceDemo },
  { id: "card", name: "Card", group: "Display", Demo: CardDemo },
  { id: "divider", name: "Divider", group: "Display", Demo: DividerDemo },
  { id: "meter", name: "Meter", group: "Display", notes: "A 0-100 scale by default, not a 0-1 ratio.", Demo: MeterDemo },
  { id: "progress", name: "Progress", group: "Display", Demo: ProgressDemo },
  { id: "spinner", name: "Spinner", group: "Display", Demo: SpinnerDemo },
  { id: "skeleton", name: "Skeleton", group: "Display", Demo: SkeletonDemo },
  { id: "alert", name: "Alert", group: "Display", Demo: AlertDemo },

  { id: "tabs", name: "Tabs", group: "Disclosure", Demo: TabsDemo },
  { id: "accordion", name: "Accordion", group: "Disclosure", Demo: AccordionDemo },
  { id: "collapsible", name: "Collapsible", group: "Disclosure", Demo: CollapsibleDemo },
  { id: "scroll-area", name: "ScrollArea", group: "Disclosure", Demo: ScrollAreaDemo },

  {
    id: "dialog",
    name: "Dialog",
    group: "Overlays",
    notes:
      "Every Trigger and Close is itself a Pressable — nesting a Button inside one means the inner wins the touch and nothing opens, silently. Trigger children have to be plain visual content.\n\nKnown: a dialog taller than the 80% cap does not scroll yet (GRYT-383). The short cases are fixed.",
    Demo: DialogDemo
  },
  {
    id: "alert-dialog",
    name: "AlertDialog",
    group: "Overlays",
    notes: "Deliberately not dismissible by tapping the backdrop.",
    Demo: AlertDialogDemo
  },
  { id: "drawer", name: "Drawer", group: "Overlays", Demo: DrawerDemo },
  {
    id: "menu",
    name: "Menu",
    group: "Overlays",
    notes: "A positioned overlay does not follow a trigger that moves after it opens.",
    Demo: MenuDemo
  },
  { id: "popover", name: "Popover", group: "Overlays", Demo: PopoverDemo },
  {
    id: "tooltip",
    name: "Tooltip",
    group: "Overlays",
    notes: "Long press, not hover. There is no hover on a phone, so this is a deliberate difference from the web.",
    Demo: TooltipDemo
  },
  { id: "toast", name: "Toast", group: "Overlays", Demo: ToastDemo },

  { id: "ramps", name: "Colour ramps", group: "Theme", Demo: RampsDemo }
];
