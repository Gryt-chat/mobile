import { useMemo, useRef, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "@gryt/ui-native";

import {
  hexToHsv,
  hsvToHex,
  hueFromX,
  pointFromSv,
  svFromPoint,
  xFromHue,
  type Hsv,
} from "./colorMath";

const SQUARE_HEIGHT = 160;
const STRIP_HEIGHT = 28;
const THUMB = 22;

/**
 * A hue strip over a saturation/value square. `onChange` fires on every move;
 * `onCommit` fires once on release, for whatever is expensive to write.
 */
export function HsvColorPicker({
  value,
  onChange,
  onCommit,
}: {
  value: string;
  onChange: (hex: string) => void;
  onCommit: (hex: string) => void;
}) {
  const theme = useTheme();
  const hsv = useMemo(() => hexToHsv(value), [value]);

  return (
    <View style={{ gap: theme.space(3) }}>
      <SvSquare hsv={hsv} onChange={onChange} onCommit={onCommit} />
      <HueStrip hsv={hsv} onChange={onChange} onCommit={onCommit} />
    </View>
  );
}

function SvSquare({
  hsv,
  onChange,
  onCommit,
}: {
  hsv: Hsv;
  onChange: (hex: string) => void;
  onCommit: (hex: string) => void;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const state = useRef(hsv);
  state.current = hsv;
  const widthRef = useRef(width);
  widthRef.current = width;

  const gesture = useMemo(() => {
    const seek = (x: number, y: number) => {
      const { s, v } = svFromPoint(x, y, widthRef.current, SQUARE_HEIGHT);
      onChange(hsvToHex({ h: state.current.h, s, v }));
    };
    const commit = (x: number, y: number) => {
      const { s, v } = svFromPoint(x, y, widthRef.current, SQUARE_HEIGHT);
      onCommit(hsvToHex({ h: state.current.h, s, v }));
    };

    const pan = Gesture.Pan()
      .runOnJS(true)
      .onUpdate((event) => seek(event.x, event.y))
      .onEnd((event) => commit(event.x, event.y));

    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((event, success) => {
        if (!success) return;
        seek(event.x, event.y);
        commit(event.x, event.y);
      });

    return Gesture.Race(pan, tap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChange, onCommit]);

  const thumb = pointFromSv(hsv.s, hsv.v, width, SQUARE_HEIGHT);
  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <GestureDetector gesture={gesture}>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel="Saturation and brightness"
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={{
          height: SQUARE_HEIGHT,
          borderRadius: theme.radius.md,
          overflow: "hidden",
        }}
      >
        {width > 0 ? (
          <Svg height={SQUARE_HEIGHT} width={width}>
            <Defs>
              <LinearGradient id="sat" x1="0" x2="1" y1="0" y2="0">
                <Stop offset="0" stopColor="#ffffff" />
                <Stop offset="1" stopColor={hueColor} />
              </LinearGradient>
              <LinearGradient id="val" x1="0" x2="0" y1="0" y2="1">
                <Stop offset="0" stopColor="#000000" stopOpacity={0} />
                <Stop offset="1" stopColor="#000000" stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect fill="url(#sat)" height={SQUARE_HEIGHT} width={width} x={0} y={0} />
            <Rect fill="url(#val)" height={SQUARE_HEIGHT} width={width} x={0} y={0} />
          </Svg>
        ) : null}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: thumb.x - THUMB / 2,
            top: thumb.y - THUMB / 2,
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            borderWidth: 2,
            borderColor: "#ffffff",
            backgroundColor: hsvToHex(hsv),
            shadowColor: "#000000",
            shadowOpacity: 0.3,
            shadowRadius: 2,
            shadowOffset: { width: 0, height: 1 },
          }}
        />
      </View>
    </GestureDetector>
  );
}

function HueStrip({
  hsv,
  onChange,
  onCommit,
}: {
  hsv: Hsv;
  onChange: (hex: string) => void;
  onCommit: (hex: string) => void;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const state = useRef(hsv);
  state.current = hsv;
  const widthRef = useRef(width);
  widthRef.current = width;

  const gesture = useMemo(() => {
    const seek = (x: number) => {
      const h = hueFromX(x, widthRef.current);
      onChange(hsvToHex({ h, s: state.current.s, v: state.current.v }));
    };
    const commit = (x: number) => {
      const h = hueFromX(x, widthRef.current);
      onCommit(hsvToHex({ h, s: state.current.s, v: state.current.v }));
    };

    const pan = Gesture.Pan()
      .runOnJS(true)
      .onUpdate((event) => seek(event.x))
      .onEnd((event) => commit(event.x));

    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((event, success) => {
        if (!success) return;
        seek(event.x);
        commit(event.x);
      });

    return Gesture.Race(pan, tap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChange, onCommit]);

  const thumbX = xFromHue(hsv.h, width);

  return (
    <GestureDetector gesture={gesture}>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel="Hue"
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: STRIP_HEIGHT, justifyContent: "center" }}
      >
        {width > 0 ? (
          <Svg height={STRIP_HEIGHT} width={width}>
            <Defs>
              <LinearGradient id="hue" x1="0" x2="1" y1="0" y2="0">
                {HUE_STOPS.map(({ offset, color }) => (
                  <Stop key={offset} offset={offset} stopColor={color} />
                ))}
              </LinearGradient>
            </Defs>
            <Rect
              fill="url(#hue)"
              height={STRIP_HEIGHT}
              rx={theme.radius.sm}
              width={width}
              x={0}
              y={0}
            />
          </Svg>
        ) : null}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: Math.max(0, thumbX - STRIP_HEIGHT / 2),
            width: STRIP_HEIGHT,
            height: STRIP_HEIGHT,
            borderRadius: STRIP_HEIGHT / 2,
            borderWidth: 2,
            borderColor: "#ffffff",
            backgroundColor: hsvToHex({ h: hsv.h, s: 1, v: 1 }),
          }}
        />
      </View>
    </GestureDetector>
  );
}

/** Six stops, evenly spaced — a strip needs no more than the wheel itself does. */
const HUE_STOPS = [
  { offset: "0", color: "#ff0000" },
  { offset: "0.166", color: "#ffff00" },
  { offset: "0.333", color: "#00ff00" },
  { offset: "0.5", color: "#00ffff" },
  { offset: "0.666", color: "#0000ff" },
  { offset: "0.833", color: "#ff00ff" },
  { offset: "1", color: "#ff0000" },
];
