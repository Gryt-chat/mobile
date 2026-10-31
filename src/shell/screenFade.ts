import { LinearTransition } from "react-native-reanimated";

/** Every page change. Short, because people flick between channels and shouldn't wait to read. */
export const SCREEN_FADE = { animation: "fade", animationDuration: 160 } as const;

/** A pane moving to its new width, when the fold appears or the phone turns. */
export const PANE_MOVE = LinearTransition.duration(240);

/** A page you go into and come back from, such as settings. */
export const SCREEN_SLIDE = { animation: "slide_from_right" } as const;
