#!/usr/bin/env node

const fs = require("node:fs");

const args = process.argv.slice(2);
if (args.includes("--version") || args.includes("-v")) {
  process.stdout.write("mock-codex-agent 1.0.0\n");
  process.exit(0);
}

const outputFlagIndex = args.indexOf("--output-last-message");
const outputPath = outputFlagIndex >= 0 ? args[outputFlagIndex + 1] : "";

let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  prompt += chunk;
});

process.stdin.on("end", () => {
  const isRecap = prompt.includes("writing.recap") || prompt.includes("WritingRecapCandidate");
  const recap = {
    chapterId: matchPrompt(/"chapterId"\s*:\s*"([^"]+)"/) || "chapter-001",
    summary: "Mock recap captured the latest saved chapter change.",
    newFacts: ["The workflow smoke chapter was saved."],
    characterStateChanges: ["The author workflow reached recap."],
    foreshadowingUpdates: [],
    continuityRisks: [],
    powerProgressionUpdates: [],
    createdAt: new Date().toISOString()
  };

  const payload = {
    summary: isRecap ? "Mock recap ready" : "Mock task complete",
    content: isRecap ? JSON.stringify(recap) : "Mock agent output.",
    changes: ["mock-agent"],
    risks: [],
    questions: [],
    patches: []
  };
  const text = JSON.stringify(payload);
  if (outputPath) {
    fs.writeFileSync(outputPath, text, "utf8");
  }
  process.stdout.write(text);
});

function matchPrompt(pattern) {
  const match = prompt.match(pattern);
  return match ? match[1] : "";
}
