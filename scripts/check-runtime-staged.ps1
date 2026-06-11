$ErrorActionPreference = "Stop"

$stagedFiles = @(git diff --cached --name-only)
if (-not $stagedFiles.Length) {
  Write-Host "Runtime staged check passed: no staged files."
  exit 0
}

$blockedPatterns = @(
  "^novels/[^/]+/knowledge/",
  "^novels/[^/]+/memory/",
  "^novels/[^/]+/tasks/background-jobs\.jsonl$",
  "^novels/[^/]+/tasks/invocations\.jsonl$",
  "^novels/[^/]+/tasks/history\.jsonl$",
  "^novels/[^/]+/quality/series-metrics\.json$",
  "^novels/[^/]+/story-graph/storyline\.json$",
  "^platform/ai-config\.json$",
  "^platform/library\.json$"
)

$blocked = @()
foreach ($file in $stagedFiles) {
  foreach ($pattern in $blockedPatterns) {
    if ($file -match $pattern) {
      $blocked += $file
      break
    }
  }
}

if ($blocked.Length) {
  Write-Error (
    "Runtime staged check failed. These files look like local runtime state or workstation config:`n" +
    (($blocked | Sort-Object -Unique | ForEach-Object { "- $_" }) -join "`n") +
    "`nIf this is intentional, commit them explicitly outside the normal runtime flow."
  )
  exit 1
}

Write-Host "Runtime staged check passed: no generated runtime state is staged."
