# Runtime Acceptance

This note defines the repeatable local acceptance check for the novel workbench runtime. It is meant to catch integration drift that unit tests can miss, especially mismatches between persisted project state, knowledge indexes, background jobs, and audit report summaries.

## Runtime Data Policy

Tracked authored project data:

- `novels/*/chapters/`
- `novels/*/outline/`
- `novels/*/bible/`
- `novels/*/ledger/`
- `novels/*/story-control/`
- `novels/*/project.json`

Generated runtime data:

- `novels/*/knowledge/`
- `novels/*/memory/`
- `novels/*/tasks/background-jobs.jsonl`
- `novels/*/tasks/invocations.jsonl`

Generated runtime data should not be committed by default. If a test fixture needs it, add a fixture under a dedicated test path rather than committing a live project run.

Before committing after a runtime smoke, run:

```powershell
npm run check:runtime-staged
```

The check only inspects staged files. It blocks generated runtime JSON/JSONL and local platform config from being mixed into ordinary code commits.

Browser smoke:

```powershell
npm run smoke:ui
```

By default, the Playwright smoke starts isolated API/UI services on `18787` and `15173`, injects `scripts/mock-codex-agent.cjs` as the Codex-compatible agent, opens a real project workspace, and checks the save pipeline, embedding config panel, background job panel, audit report preview, workflow save pipeline, and dark theme backgrounds.

Reuse already-started local services only when that is intentional:

```powershell
$env:PLAYWRIGHT_REUSE_EXISTING_SERVER = "1"
npm run smoke:ui
Remove-Item Env:\PLAYWRIGHT_REUSE_EXISTING_SERVER
```

When reusing services, make sure the API process was started with the real agent and embedding environment you want to verify. The smoke will not inject the mock agent in reuse mode.

First-time browser setup:

```powershell
npx playwright install chromium
```

Combined local acceptance:

```powershell
npm run smoke:all
```

This runs the staged runtime-state guard, runtime API smoke, and browser UI smoke in sequence.

Local configuration:

- `platform/ai-config.json` may contain workstation-specific provider settings.
- The public AI config API must never return raw embedding API keys.
- External embedding keys should be configured locally and verified by runtime smoke before being considered production-ready.
- Automated browser smoke intentionally uses a deterministic mock agent by default. Real-model author workflow acceptance must reuse an already-started API/UI pair.

## Smoke Command

Run against already-started services:

```powershell
npm run smoke:runtime
```

Run against a specific project/chapter:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/smoke-runtime.ps1 `
  -ProjectId novel-1780911338197 `
  -ChapterId chapter-001
```

Run with background rebuilds:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/smoke-runtime.ps1 -RunRebuild
```

## Real AI Workflow Acceptance

Use this pass after `CODEX_COMMAND` or another agent profile is configured and, if needed, after the embedding provider/API key is saved through the workspace AI settings panel.

1. Start the API with the real agent environment.

   ```powershell
   $env:CODEX_COMMAND = "codex"
   npm --prefix api run dev
   ```

2. Start the UI in another shell.

   ```powershell
   npm --prefix ui run dev -- --host 127.0.0.1 --port 5173
   ```

3. Run runtime smoke against the local services.

   ```powershell
   npm run smoke:runtime
   ```

4. Run browser smoke in reuse mode so Playwright does not replace the agent with the mock.

   ```powershell
   $env:PLAYWRIGHT_REUSE_EXISTING_SERVER = "1"
   npm run smoke:ui
   Remove-Item Env:\PLAYWRIGHT_REUSE_EXISTING_SERVER
   ```

5. In the workspace, manually save a chapter with the save pipeline enabled and confirm:

   - the `writing.recap` task reaches `success` or a clear terminal `error`;
   - the recap candidate appears for author review and is not auto-accepted;
   - quality, knowledge, and runtime steps finish after recap success;
   - if recap is cancelled or errors, later steps are skipped with the reason visible;
   - audit preview opens in the UI and JSON download remains available;
   - external embedding status shows the configured provider, vector entries, and no raw API key leakage.

## Acceptance Checks

The smoke script verifies:

- UI returns HTTP 200.
- API `/health` returns `status: healthy`.
- platform AI config exposes a valid embedding provider and does not leak raw API keys.
- at least one project and chapter are available.
- audit chapter count matches project chapter count.
- audit knowledge counts match the source knowledge index.
- audit vector provider and entry count match the source vector index.
- runtime snapshot has a stable fingerprint.
- background jobs are not stuck in `pending` or `running`.
- knowledge search returns a valid result shape.

## Lessons From 2026-06-11 Acceptance

The first real workflow acceptance found that audit reports under-counted indexed chapters because the audit code only counted chapters with fact/triple links. A project can still have chapter index entries and chapter vectors without fact/triple links, so the audit source of truth is now `chapterIndex.chapters.length`.
