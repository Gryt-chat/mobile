import { useLocalSearchParams } from "expo-router";

import { ReportScreen } from "../src/feedback/ReportScreen";

/**
 * One route, two labels: `?type=bug` or `?type=feedback`. The same shape with a
 * different word on the front, which is the call the reports service made too.
 */
export default function Report() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  return <ReportScreen type={type === "bug" ? "bug" : "feedback"} />;
}
