import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Modal, StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Defs, Mask, Rect } from "react-native-svg";
import { Button, Text, useReducedMotion, useTheme, type AnchorRect } from "@gryt/ui-native";

import { permissionAsked } from "../notify/push";
import { askingAboutPush } from "../notify/usePushRegistration";
import { GuideOwl, type Line } from "./GuideOwl";
import { measureTourTarget } from "./tourTargets";
import { tourSteps, type TourControls } from "./steps";
import { finishTour, useAutoStartTourOnFirstJoin, useTourSeen, useTourVisible } from "./tourState";

/** Breathing room between the cut-out and the control it reveals. */
const HALO = 6;
/** How long a step's `enter` (a tab switch) gets to settle before measuring. */
const SETTLE_MS = 320;
/** How often to re-measure while a step is up, for a layout that shifts under it. */
const POLL_MS = 200;
/** How long to wait for a target before giving up and moving on. */
const TARGET_WAIT_MS = 2000;
/** Long enough for a first join's notification question to be on screen before the tour checks. */
const PROMPT_GRACE_MS = 1500;

/**
 * The onboarding tour, shown once after the first server join — see `tourState`'s
 * `useAutoStartTourOnFirstJoin` — or again from the settings row via `resetTour`.
 */
export function OnboardingTour({
  serverCount,
  switchTab,
}: {
  serverCount: number;
  switchTab: TourControls["switchTab"];
}) {
  const seen = useTourSeen();
  useAutoStartTourOnFirstJoin(serverCount, seen);
  const visible = useTourVisible();
  const ready = useNoSystemPrompt(visible);

  if (!visible || !ready) return null;
  // A fresh mount per showing, so `index` always starts back at the first step.
  return <TourOverlay switchTab={switchTab} />;
}

/**
 * Waits out the notification question that a first join brings up. A Modal shown under an iOS
 * system prompt was left dimmed with no card (2026-10-26), and the app is "inactive" while one shows.
 */
function useNoSystemPrompt(visible: boolean): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!visible) return setReady(false);
    let live = true;
    const settle = async () => {
      // The prompt is asked a moment after the join that starts the tour.
      await new Promise((resolve) => setTimeout(resolve, PROMPT_GRACE_MS));
      await permissionAsked();
      // The server's own notification question comes first, or the hello plays behind it.
      while (live && askingAboutPush()) await new Promise((resolve) => setTimeout(resolve, 300));
      while (live && AppState.currentState !== "active") {
        await new Promise<void>((resolve) => {
          const sub = AppState.addEventListener("change", (state) => {
            if (state === "active") {
              sub.remove();
              resolve();
            }
          });
        });
      }
      if (live) setReady(true);
    };
    void settle();
    return () => {
      live = false;
    };
  }, [visible]);
  return ready;
}

const HELLO = { id: "hello", title: "Hi! Let me show you around." };
const BYE = { id: "bye", title: "Goodbye! Enjoy Gryt!" };
/** The entrance, then the wave while it says hi, in the middle of the screen. */
const HELLO_MS = 3600;
/** The wave and the goodbye line, before the owl shrinks away and the tour closes. */
const BYE_MS = 2600;
/** The owl's spring takes about this long to settle beside the next control. */
const FLY_MS = 1300;

function TourOverlay({ switchTab }: { switchTab: TourControls["switchTab"] }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const window = useWindowDimensions();

  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<AnchorRect | null>(null);
  const [waving, setWaving] = useState(true);
  const [arrived, setArrived] = useState(false);
  const [bye, setBye] = useState(false);
  const [gone, setGone] = useState(false);

  const step = tourSteps[index];
  const isLast = index === tourSteps.length - 1;
  const controls = useMemo<TourControls>(() => ({ switchTab }), [switchTab]);

  /** When the step's `enter` ran. The give-up clock for a missing target starts here. */
  const enteredAt = useRef(0);
  /** The tab switch a step's `enter` triggers needs a beat before its target exists. */
  const settling = useRef(true);

  const goodbye = useCallback(() => setBye(true), []);

  useEffect(() => {
    const timer = setTimeout(() => setWaving(false), reduceMotion ? 0 : HELLO_MS);
    return () => clearTimeout(timer);
  }, [reduceMotion]);

  useEffect(() => {
    if (waving) return;
    settling.current = true;
    setRect(null);
    setArrived(false);
    step.enter?.(controls);
    enteredAt.current = Date.now();

    const timer = setTimeout(
      () => {
        settling.current = false;
      },
      reduceMotion ? 0 : SETTLE_MS,
    );
    return () => clearTimeout(timer);
  }, [step, controls, reduceMotion, waving]);

  // The line and the cut-out wait until the owl has flown over.
  const found = rect !== null;
  useEffect(() => {
    if (!found) return;
    const timer = setTimeout(() => setArrived(true), reduceMotion ? 0 : FLY_MS);
    return () => clearTimeout(timer);
  }, [found, reduceMotion]);

  useEffect(() => {
    if (!bye) return;
    const wait = reduceMotion ? 1500 : BYE_MS;
    const leave = setTimeout(() => setGone(true), wait);
    const done = setTimeout(finishTour, wait + 450);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
    };
  }, [bye, reduceMotion]);

  const next = useCallback(() => {
    if (isLast) goodbye();
    else setIndex((current) => current + 1);
  }, [isLast, goodbye]);

  const measure = useCallback(() => {
    if (settling.current || bye) return;
    void measureTourTarget(step.target).then((found) => {
      setRect((current) => {
        if (!found) return current;
        const same =
          current &&
          current.x === found.x &&
          current.y === found.y &&
          current.width === found.width &&
          current.height === found.height;
        return same ? current : found;
      });
      // A target that never turns up is skipped rather than left stuck on screen.
      if (!found && Date.now() - enteredAt.current > TARGET_WAIT_MS) next();
    });
  }, [step, next, bye]);

  useEffect(() => {
    if (waving) return;
    const id = setInterval(measure, POLL_MS);
    return () => clearInterval(id);
  }, [measure, waving]);

  const lit = arrived && !bye ? rect : null;
  let said: Line | null = waving ? HELLO : null;
  if (lit) said = { id: step.id, title: step.title, body: step.body };
  if (bye) said = BYE;

  const cut = lit && {
    x: lit.x - HALO,
    y: lit.y - HALO,
    width: lit.width + HALO * 2,
    height: lit.height + HALO * 2,
  };

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      // A second back press doesn't wait for the goodbye.
      onRequestClose={bye ? finishTour : goodbye}
    >
      <View style={{ flex: 1 }} pointerEvents="box-none">
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={window.width} height={window.height}>
            <Defs>
              <Mask id="tourMask">
                <Rect x={0} y={0} width={window.width} height={window.height} fill="#fff" />
                {cut ? (
                  <Rect
                    x={cut.x}
                    y={cut.y}
                    width={cut.width}
                    height={cut.height}
                    rx={theme.radius.md}
                    fill="#000"
                  />
                ) : null}
              </Mask>
            </Defs>
            <Rect
              x={0}
              y={0}
              width={window.width}
              height={window.height}
              fill="rgba(0,0,0,0.55)"
              mask="url(#tourMask)"
            />
            {cut ? (
              <Rect
                x={cut.x}
                y={cut.y}
                width={cut.width}
                height={cut.height}
                rx={theme.radius.md}
                fill="none"
                stroke={theme.color.accent}
                strokeWidth={2}
              />
            ) : null}
          </Svg>
        </View>

        <GuideOwl
          target={rect ?? null}
          line={said}
          mood={waving || bye ? "happy" : (step.mood ?? "open")}
          waving={(waving || bye) && !reduceMotion}
          point={step.point ?? false}
          gone={gone}
          controls={
            lit ? (
              <View
                accessibilityLabel={step.title}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: theme.space(2),
                  paddingVertical: theme.space(1),
                  paddingLeft: theme.space(3),
                  paddingRight: theme.space(1),
                  borderRadius: theme.radius.full,
                  backgroundColor: theme.color.surfaceRaised,
                }}
              >
                <Text style={{ color: theme.color.muted, fontSize: 12, fontVariant: ["tabular-nums"] }}>
                  {index + 1}/{tourSteps.length}
                </Text>
                <Button tone="ghost" size="small" onPress={goodbye}>
                  Skip
                </Button>
                {index > 0 ? (
                  <Button tone="neutral" size="small" onPress={() => setIndex((current) => current - 1)}>
                    Back
                  </Button>
                ) : null}
                <Button size="small" onPress={next}>
                  {isLast ? "Done" : "Next"}
                </Button>
              </View>
            ) : null
          }
        />
      </View>
    </Modal>
  );
}
