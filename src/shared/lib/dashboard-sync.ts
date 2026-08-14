import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/shared/lib/supabase";

const channelName = "dashboard-order-sync";
const eventName = "orders-changed";
const listeners = new Set<() => void>();

let channel: RealtimeChannel | null = null;
let channelReady: Promise<boolean> | null = null;

export function subscribeToDashboardChanges(listener: () => void) {
  listeners.add(listener);
  ensureChannel();

  return () => {
    listeners.delete(listener);
  };
}

export async function broadcastDashboardChange() {
  const activeChannel = ensureChannel();
  if (!(await channelReady)) return;

  await activeChannel.send({
    type: "broadcast",
    event: eventName,
    payload: { changedAt: new Date().toISOString() },
  });
}

function ensureChannel() {
  if (channel) return channel;

  channel = supabase
    .channel(channelName, { config: { broadcast: { self: false } } })
    .on("broadcast", { event: eventName }, () => {
      listeners.forEach((listener) => listener());
    });

  channelReady = new Promise((resolve) => {
    channel?.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve(true);
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") resolve(false);
    });
  });

  return channel;
}
