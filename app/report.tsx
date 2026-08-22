import { useLocalSearchParams } from "expo-router";

import { ReportScreen } from "../src/feedback/ReportScreen";

/**
 * One route, two labels. `?type=bug` or `?type=feedback`.
 *
 * A bug and a piece of feedback are the same shape with a different word on the
 * front, which is the call the reports service made as well: one endpoint and a
 * `type` field rather than two of everything.
 */
export default function Report() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  return <ReportScreen type={type === "bug" ? "bug" : "feedback"} />;
}
