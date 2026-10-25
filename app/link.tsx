import { Redirect, useLocalSearchParams } from "expo-router";

/** Where a link code opened from the camera lands, `gryt://link?p=…`: straight into approving it. */
export default function Link() {
  const { p } = useLocalSearchParams<{ p?: string }>();
  return <Redirect href={p ? { pathname: "/link-device", params: { qr: p } } : "/link-device"} />;
}
