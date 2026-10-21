import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, useTheme, useToast } from "@gryt/ui-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { interpolate, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { ShareIcon } from "phosphor-react-native/src/icons/Share";
import { XIcon } from "phosphor-react-native/src/icons/X";

import { shareImage } from "./imageExport";

export interface LightboxImage {
  uri: string;
  label?: string;
}

const DOUBLE_TAP_SCALE = 2.4;
const MAX_SCALE = 4;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;
// Past this many the dots stop being countable, so it says "4 of 18" instead.
const MAX_DOTS = 10;

/**
 * A picture, full screen, over everything — matching the desktop's own zoom. One
 * `FlatList` page per attachment: paging is native scroll, zoom and dismiss are not.
 */
export function ImageLightbox({
  images,
  index,
  title,
  onClose,
}: {
  images: LightboxImage[];
  /** Who sent it and when, over the picture. */
  title?: { name: string; detail?: string };
  /** Which one is open, or null while the viewer is closed. */
  index: number | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<LightboxImage>>(null);
  const [current, setCurrent] = useState(index ?? 0);
  const [zoomed, setZoomed] = useState(false);
  const [sharing, setSharing] = useState(false);
  // How far the open page is dragged down, so the backdrop thins as it goes.
  const dragY = useSharedValue(0);
  const backdrop = useAnimatedStyle(() => ({ opacity: interpolate(dragY.value, [0, DISMISS_DISTANCE * 2], [1, 0.3], "clamp") }));

  useEffect(() => {
    if (index === null) return;
    setCurrent(index);
    setZoomed(false);
    dragY.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setCurrent(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const share = async () => {
    const image = images[current];
    if (!image || sharing) return;
    setSharing(true);
    try {
      await shareImage(image.uri, image.label);
    } catch {
      toast.show({ title: "Could not share the image", severity: "error" });
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal visible={index !== null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1 }}>
        <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#06070a" }, backdrop]} />
        {index !== null ? (
          <FlatList
            ref={listRef}
            data={images}
            horizontal
            pagingEnabled
            scrollEnabled={!zoomed}
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            keyExtractor={(item, i) => `${i}:${item.uri}`}
            onMomentumScrollEnd={onScrollEnd}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item, index: i }) => (
              <ZoomableImage
                uri={item.uri}
                width={width}
                height={height}
                active={i === current}
                dragY={i === current ? dragY : undefined}
                onZoomChange={setZoomed}
                onRequestClose={onClose}
              />
            )}
          />
        ) : null}

        <View
          style={{
            position: "absolute",
            top: insets.top + theme.space(2),
            left: theme.space(4),
            right: theme.space(4),
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <ChromeButton onPress={onClose} label="Close">
            <XIcon size={20} color="#fff" weight="bold" />
          </ChromeButton>

          <View style={{ flex: 1, alignItems: "center", paddingHorizontal: theme.space(2) }}>
            {title ? (
              <Text numberOfLines={1} style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>
                {title.name}
              </Text>
            ) : null}
            {title?.detail || images.length > 1 ? (
              <Text numberOfLines={1} style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                {[title?.detail, images.length > 1 ? `${current + 1} of ${images.length}` : null].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
          </View>

          <ChromeButton onPress={share} label="Share">
            <ShareIcon size={20} color="#fff" weight="bold" />
          </ChromeButton>
        </View>

        {images.length > 1 && images.length <= MAX_DOTS ? (
          <View
            pointerEvents="none"
            style={{ position: "absolute", bottom: insets.bottom + theme.space(4), left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 }}
          >
            {images.map((_, i) => (
              <View
                key={i}
                style={{ width: i === current ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === current ? "#fff" : "rgba(255,255,255,0.35)" }}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

export function ChromeButton({ onPress, label, children }: { onPress: () => void; label: string; children: ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.5)",
      })}
    >
      {children}
    </Pressable>
  );
}

/**
 * One page of the carousel. Pinch and double-tap zoom in place; a plain drag pans while
 * zoomed and closes the viewer while not — the horizontal case is left to the `FlatList`.
 */
function ZoomableImage({
  uri,
  width,
  height,
  active,
  dragY,
  onZoomChange,
  onRequestClose,
}: {
  uri: string;
  width: number;
  height: number;
  /** Whether the carousel is currently on this page. */
  active: boolean;
  /** The lightbox's backdrop follows this page's drag down. */
  dragY?: SharedValue<number>;
  onZoomChange: (zoomed: boolean) => void;
  onRequestClose: () => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const [zoomed, setZoomedState] = useState(false);

  useEffect(() => {
    onZoomChange(active && zoomed);
  }, [active, zoomed, onZoomChange]);

  /* Reset once a page is swiped away, or coming back to it shows it still zoomed
   * in — every other photo viewer leaves you at fit-to-screen instead. */
  useEffect(() => {
    if (active) return;
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    setZoomedState(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const reset = () => {
    scale.value = withTiming(1);
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 1), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.02) {
        reset();
        runOnJS(setZoomedState)(false);
      } else {
        runOnJS(setZoomedState)(true);
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        reset();
        runOnJS(setZoomedState)(false);
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
        runOnJS(setZoomedState)(true);
      }
    });

  // Unzoomed, only a vertical drag is ours (to close); a sideways one pages the list.
  const pan = (zoomed ? Gesture.Pan() : Gesture.Pan().activeOffsetY([-12, 12]).failOffsetX([-12, 12]))
    .onUpdate((e) => {
      if (scale.value > 1) {
        const maxX = Math.max(0, (width * (scale.value - 1)) / 2);
        const maxY = Math.max(0, (height * (scale.value - 1)) / 2);
        translateX.value = Math.min(maxX, Math.max(-maxX, savedTranslateX.value + e.translationX));
        translateY.value = Math.min(maxY, Math.max(-maxY, savedTranslateY.value + e.translationY));
      } else {
        translateY.value = Math.max(0, e.translationY);
        if (dragY) dragY.value = translateY.value;
      }
    })
    .onEnd((e) => {
      if (scale.value > 1) {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
        return;
      }
      if (translateY.value > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        runOnJS(onRequestClose)();
        return;
      }
      translateY.value = withTiming(0);
      if (dragY) dragY.value = withTiming(0);
    });

  const composed = Gesture.Simultaneous(pinch, Gesture.Race(doubleTap, pan));

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={{ width, height, alignItems: "center", justifyContent: "center" }}>
        <Animated.Image source={{ uri }} resizeMode="contain" style={[{ width, height }, style]} />
      </Animated.View>
    </GestureDetector>
  );
}
