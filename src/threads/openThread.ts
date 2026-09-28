import { router } from "expo-router";

import type { ThreadSummary } from "../connection/types";

/** A thread is its own screen on the phone, pushed over the channel it hangs off. */
export function openThread(thread: Pick<ThreadSummary, "thread_id" | "conversation_id">) {
  router.push({
    pathname: "/thread/[id]",
    params: { id: thread.thread_id, channel: thread.conversation_id },
  });
}
