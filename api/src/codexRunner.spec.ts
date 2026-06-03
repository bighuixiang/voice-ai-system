import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CodexProcessRunner } from "./codexRunner.js";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock
}));

describe("CodexProcessRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs codex exec with the current non-interactive read-only arguments", async () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { write: vi.fn(), end: vi.fn() };
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      const outputPath = args[args.indexOf("--output-last-message") + 1];
      setTimeout(async () => {
        await fs.writeFile(
          outputPath,
          JSON.stringify({ summary: "ok", content: "ok", changes: [], risks: [], questions: [], patches: [] }),
          "utf8"
        );
        child.emit("close", 0);
      }, 0);
      return child;
    });

    const runner = new CodexProcessRunner();
    const output = await runner.run("Return JSON", process.cwd(), { command: "codex" });
    const [, args, options] = spawnMock.mock.calls[0];

    expect(args).toContain("exec");
    expect(args).toContain("--sandbox");
    expect(args).toContain("read-only");
    expect(args).toContain("--skip-git-repo-check");
    expect(args).toContain("--output-last-message");
    expect(args).not.toContain("--ask-for-approval");
    expect(options).toMatchObject({ shell: true });
    expect(child.stdin.write).toHaveBeenCalledWith("Return JSON");
    expect(output.exitCode).toBe(0);
    expect(output.finalMessage).toContain('"summary":"ok"');
  });
});
