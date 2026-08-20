import { DevCatalogue } from "../src/dev/DevCatalogue";

/**
 * The `@gryt/ui-native` catalogue, pushed over the tab bar rather than given a
 * tab of its own.
 *
 * It is a harness for feedback, not a product screen — the README is explicit
 * about that — so it does not belong in a navbar the brief describes as never
 * changing. It is reached from the "you" sheet, which is where the desktop
 * client puts its own developer section.
 */
export default DevCatalogue;
