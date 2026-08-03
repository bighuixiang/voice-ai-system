export function reconcileOfflineMessages(input: { serverCursor: number; localCursor: number; pending: readonly { clientMessageId: string; text: string }[]; serverMessageIds: readonly string[] }): { showDiff: boolean; merged: Array<{ clientMessageId: string; text: string }>; resubmit: boolean; overwriteDecision: boolean } {
  if (input.serverCursor < 0 || input.localCursor < 0) throw new Error("OFFLINE_CURSOR_INVALID");
  const known = new Set(input.serverMessageIds);
  const merged = input.pending.filter((message) => !known.has(message.clientMessageId));
  return { showDiff: input.serverCursor > input.localCursor, merged, resubmit: false, overwriteDecision: false };
}
