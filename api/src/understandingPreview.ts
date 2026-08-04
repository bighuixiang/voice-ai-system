import { createHash } from "node:crypto";
import type { CreativeSession } from "./creativeSession.js";

export type EpistemicStatus = "explicit" | "inferred" | "provisional" | "unknown" | "conflicted";

export interface UnderstandingSourceSpan {
  messageId: string;
  start: number;
  end: number;
}

export interface UnderstandingClaim {
  id: string;
  text: string;
  status: EpistemicStatus;
  evidence: UnderstandingSourceSpan[];
}

export interface UnderstandingPreview {
  schemaVersion: "understanding-preview.v1";
  projectSlug: string;
  inputFingerprint: string;
  sourceMessageIds: string[];
  coreExplicit: UnderstandingClaim[];
  inferred: UnderstandingClaim[];
  unknowns: UnderstandingClaim[];
  nextAction: "await-safe-understanding-dependencies";
  modelCallIssued: false;
  canonWritten: false;
}

export function buildUnderstandingPreview(session: CreativeSession): UnderstandingPreview {
  const sourceMessageIds = session.messages.map((message) => message.id);
  const inputFingerprint = createHash("sha256")
    .update(JSON.stringify({ schemaVersion: session.schemaVersion, messages: session.messages }))
    .digest("hex");
  const coreExplicit = session.messages.map((message) => ({
    id: `claim-${message.id}`,
    text: message.text,
    status: "explicit" as const,
    evidence: [{ messageId: message.id, start: 0, end: message.text.length }]
  }));

  return {
    schemaVersion: "understanding-preview.v1",
    projectSlug: session.projectSlug,
    inputFingerprint,
    sourceMessageIds,
    coreExplicit,
    inferred: [],
    unknowns: [
      {
        id: "unknown-story-intent",
        text: "故事意图和下一项作者决策尚未明确。",
        status: "unknown",
        evidence: []
      }
    ],
    nextAction: "await-safe-understanding-dependencies",
    modelCallIssued: false,
    canonWritten: false
  };
}
