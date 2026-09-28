import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Modal, StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Defs, Mask, Rect } from "react-native-svg";
import {
  Button,
  Text,
  placePopup,
  useReducedMotion,
  useTheme,
  type AnchorRect,
} from "@gryt/ui-native";

import { measureTourTarget } from "./tourTargets";
import { tourSteps, type TourControls } from "./steps";
import { finishTour, useAutoStartTourOnFirstJoin, useTourSeen, useTourVisible } from "./tourState";

/** Breathing room between the cut-out and the control it reveals. */
const HALO = 6;
/** Gap between the cut-out and the card. */
const OFFSET = 12;
/** How long a step's `enter` (a tab switch) gets to settle before measuring. */
const SETTLE_MS = 320;
/** How often to re-measure while a step is up, for a layout that shifts under it. */
const POLL_MS = 200;
/** How long to wait for a target before giving up and moving on. */
const TARGET_WAIT_MS = 2000;

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

  if (!visible) return null;
  // A fresh mount per showing, so `index` always starts back at the first step.
  return <TourOverlay switchTab={switchTab} />;
}

function TourOverlay({ switchTab }: { switchTab: TourControls["switchTab"] }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const window = useWindowDimensions();

  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<AnchorRect | null>(null);
  const [cardSize, setCardSize] = useState<{ width: number; height: number } | null>(null);

  const step = tourSteps[index];
  const isLast = index === tourSteps.length - 1;
  const controls = useMemo<TourControls>(() => ({ switchTab }), [switchTab]);

  /** When the step's `enter` ran. The give-up clock for a missing target starts here. */
  const enteredAt = useRef(0);
  /** The tab switch a step's `enter` triggers needs a beat before its target exists. */
  const settling = useRef(false);

  useEffect(() => {
    settling.current = true;
    setRect(null);
    setCardSize(null);
    step.enter?.(controls);
    enteredAt.current = Date.now();

    const timer = setTimeout(
      () => {
        settling.current = false;
      },
      reduceMotion ? 0 : SETTLE_MS,
    );
    return () => clearTimeout(timer);
  }, [step, controls, reduceMotion]);

  const next = useCallback(() => {
    setIndex((current) => {
      if (current >= tourSteps.length - 1) {
        finishTour();
        return current;
      }
      return current + 1;
    });
  }, []);

  const measure = useCallback(() => {
    if (settling.current) return;
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
  }, [step, next]);

  useEffect(() => {
    const id = setInterval(measure, POLL_MS);
    return () => clearInterval(id);
  }, [measure]);

  const cut = rect && {
    x: rect.x - HALO,
    y: rect.y - HALO,
    width: rect.width + HALO * 2,
    height: rect.height + HALO * 2,
  };

  const cardWidth = Math.min(320, window.width - 32);
  const placement =
    cut && cardSize
      ? placePopup(cut, cardSize, window, {
          side: step.side === "above" ? "top" : "bottom",
          align: "center",
          sideOffset: OFFSET,
          screenPadding: 16,
        })
      : null;

  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: placement ? 1 : 0,
      duration: reduceMotion ? 0 : 200,
      useNativeDriver: true,
    }).start();
  }, [placement, reduceMotion, opacity]);

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={finishTour}
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

        <Animated.View
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setCardSize((current) =>
              current && current.width === width && current.height === height
                ? current
                : { width, height },
            );
          }}
          pointerEvents={placement ? "auto" : "none"}
          style={{
            position: "absolute",
            top: placement ? placement.top : -9999,
            left: placement ? placement.left : -9999,
            width: cardWidth,
            opacity,
            backgroundColor: theme.color.surfaceRaised,
            borderRadius: theme.radius.xl,
            borderWidth: 1,
            borderColor: theme.color.border,
            padding: theme.space(4),
          }}
        >
          <Text style={{ color: theme.color.accent, fontSize: 12, fontWeight: "600" }}>
            Step {index + 1} of {tourSteps.length}
          </Text>
          <Text
            style={{
              color: theme.color.text,
              fontSize: 17,
              fontWeight: "700",
              marginTop: theme.space(2),
            }}
          >
            {step.title}
          </Text>
          <Text style={{ color: theme.color.muted, fontSize: 14, marginTop: theme.space(1) }}>
            {step.body}
          </Text>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginTop: theme.space(4),
            }}
          >
            <Button tone="ghost" size="small" onPress={finishTour}>
              Skip
            </Button>
            <Button size="small" onPress={next}>
              {isLast ? "Done" : "Next"}
            </Button>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
