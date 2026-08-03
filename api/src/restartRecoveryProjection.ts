export interface RecoveryEvent { type: "answer" | "understanding" | "task" | "candidate"; id: string; questionId?: string; status: string; canonWritten?: boolean; value?: string; }
export function rebuildAfterRestart(events: readonly RecoveryEvent[]): { answers: RecoveryEvent[]; understanding?: RecoveryEvent; tasks: RecoveryEvent[]; canonCandidates: RecoveryEvent[] } {
  const answers = events.filter((event) => event.type === "answer").reduce<RecoveryEvent[]>((result, event) => {
    if (!event.questionId || result.some((item) => item.questionId === event.questionId)) return result;
    result.push(event); return result;
  }, []);
  return { answers, understanding: [...events].reverse().find((event) => event.type === "understanding"), tasks: events.filter((event) => event.type === "task"), canonCandidates: events.filter((event) => event.type === "candidate" && event.canonWritten === true && event.status !== "isolated") };
}
