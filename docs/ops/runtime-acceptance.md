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

Local configuration:

- `platform/ai-config.json` may contain workstation-specific provider settings.
- The public AI config API must never return raw embedding API keys.
- External embedding keys should be configured locally and verified by runtime smoke before being considered production-ready.

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
