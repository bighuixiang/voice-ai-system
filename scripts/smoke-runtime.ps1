param(
  [string]$UiUrl = "http://127.0.0.1:5173",
  [string]$ApiUrl = "http://127.0.0.1:8787",
  [string]$ProjectId = "",
  [string]$ChapterId = "",
  [string]$SearchQuery = "chapter",
  [switch]$RunRebuild,
  [int]$TimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Get-Count {
  param([object]$Value)

  if ($null -eq $Value) {
    return 0
  }

  return @($Value).Count
}

function Invoke-Json {
  param(
    [string]$Method = "GET",
    [string]$Uri,
    [object]$Body = $null,
    [int]$TimeoutSec = 30
  )

  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $Uri -TimeoutSec $TimeoutSec
  }

  return Invoke-RestMethod `
    -Method $Method `
    -Uri $Uri `
    -ContentType "application/json; charset=utf-8" `
    -Body ($Body | ConvertTo-Json -Depth 20) `
    -TimeoutSec $TimeoutSec
}

function Wait-ProjectJob {
  param(
    [string]$ApiUrl,
    [string]$ProjectId,
    [string]$Type,
    [int]$TimeoutSeconds
  )

  $started = Invoke-Json `
    -Method "POST" `
    -Uri "$ApiUrl/api/novel/projects/$ProjectId/jobs" `
    -Body @{ type = $Type; payload = @{ source = "runtime-smoke" } }

  $job = $started.job
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ($job.status -notin @("success", "error", "cancelled")) {
    Assert-True ((Get-Date) -lt $deadline) "Timed out waiting for $Type job $($job.id)."
    Start-Sleep -Milliseconds 500
    $job = (Invoke-Json -Uri "$ApiUrl/api/novel/projects/$ProjectId/jobs/$($job.id)").job
  }

  Assert-True ($job.status -eq "success") "$Type job $($job.id) finished with $($job.status): $($job.error)"
  return $job
}

Write-Host "Runtime smoke: UI $UiUrl / API $ApiUrl"

$ui = Invoke-WebRequest -Uri $UiUrl -UseBasicParsing -TimeoutSec 10
Assert-True ($ui.StatusCode -eq 200) "UI did not return HTTP 200."

$health = Invoke-Json -Uri "$ApiUrl/health"
Assert-True ($health.status -eq "healthy") "API health is not healthy."

$config = (Invoke-Json -Uri "$ApiUrl/api/platform/ai-config").config
Assert-True ($null -ne $config.knowledgeEmbedding) "Platform AI config is missing knowledgeEmbedding."
Assert-True ($config.knowledgeEmbedding.provider -in @("local", "openai-compatible")) "Unsupported embedding provider: $($config.knowledgeEmbedding.provider)"
Assert-True (-not ($config.knowledgeEmbedding.PSObject.Properties.Name -contains "apiKey")) "Platform AI config leaked raw embedding apiKey."

$projects = @((Invoke-Json -Uri "$ApiUrl/api/novel/projects").projects)
Assert-True ((Get-Count $projects) -gt 0) "No novel projects are available."

if (-not $ProjectId) {
  $selectedProject = $projects | Sort-Object { -1 * (Get-Count $_.chapters) } | Select-Object -First 1
  $ProjectId = $selectedProject.slug
} else {
  $selectedProject = $projects | Where-Object { $_.slug -eq $ProjectId -or $_.id -eq $ProjectId } | Select-Object -First 1
}

Assert-True ($null -ne $selectedProject) "Project not found: $ProjectId"
Assert-True ((Get-Count $selectedProject.chapters) -gt 0) "Project $ProjectId has no chapters."

if (-not $ChapterId) {
  $ChapterId = if ($selectedProject.lastOpenedChapterId) { $selectedProject.lastOpenedChapterId } else { @($selectedProject.chapters)[0].id }
}

$chapter = @($selectedProject.chapters) | Where-Object { $_.id -eq $ChapterId } | Select-Object -First 1
Assert-True ($null -ne $chapter) "Chapter not found in ${ProjectId}: $ChapterId"

if ($RunRebuild) {
  $qualityJob = Wait-ProjectJob -ApiUrl $ApiUrl -ProjectId $ProjectId -Type "quality.series.rebuild" -TimeoutSeconds $TimeoutSeconds
  $knowledgeJob = Wait-ProjectJob -ApiUrl $ApiUrl -ProjectId $ProjectId -Type "knowledge.index.rebuild" -TimeoutSeconds $TimeoutSeconds
}

$index = (Invoke-Json -Uri "$ApiUrl/api/novel/projects/$ProjectId/knowledge/index").index
$audit = (Invoke-Json -Uri "$ApiUrl/api/novel/projects/$ProjectId/audit-report" -TimeoutSec 60).report
$runtime = (Invoke-Json -Uri "$ApiUrl/api/novel/projects/$ProjectId/runtime/$ChapterId").snapshot
$jobs = @((Invoke-Json -Uri "$ApiUrl/api/novel/projects/$ProjectId/jobs").jobs)

Assert-True ((Get-Count $audit.chapters) -eq (Get-Count $selectedProject.chapters)) "Audit chapter count does not match project chapter count."
Assert-True ($audit.knowledgeSummary.indexedChapterCount -eq (Get-Count $index.chapterIndex.chapters)) "Audit indexedChapterCount does not match knowledge index."
Assert-True ($audit.knowledgeSummary.vectorSummary.provider -eq $index.vectorSummary.provider) "Audit vector provider does not match knowledge index."
Assert-True ($audit.knowledgeSummary.vectorSummary.entryCount -eq $index.vectorSummary.entryCount) "Audit vector entry count does not match knowledge index."
Assert-True ($runtime.fingerprint -match "^[a-f0-9]{16}$") "Runtime snapshot fingerprint is missing or invalid."

$nonTerminalJobs = @($jobs | Where-Object { $_.status -in @("pending", "running") })
Assert-True ((Get-Count $nonTerminalJobs) -eq 0) "Background jobs still pending/running: $((@($nonTerminalJobs) | ForEach-Object { $_.id }) -join ', ')"

if ($SearchQuery) {
  $search = (Invoke-Json `
    -Method "POST" `
    -Uri "$ApiUrl/api/novel/projects/$ProjectId/knowledge/search" `
    -Body @{ query = $SearchQuery; limit = 3 }).result
}

$summary = [pscustomobject]@{
  project = $ProjectId
  chapter = $ChapterId
  embeddingProvider = $config.knowledgeEmbedding.provider
  embeddingApiKeyConfigured = [bool]$config.knowledgeEmbedding.apiKeyConfigured
  chapters = Get-Count $selectedProject.chapters
  indexedChapters = $audit.knowledgeSummary.indexedChapterCount
  facts = $audit.knowledgeSummary.factCount
  triples = $audit.knowledgeSummary.tripleCount
  vectorProvider = $audit.knowledgeSummary.vectorSummary.provider
  vectorEntries = $audit.knowledgeSummary.vectorSummary.entryCount
  backgroundJobs = Get-Count $jobs
  runtimeFingerprint = $runtime.fingerprint
  searchFacts = if ($SearchQuery) { Get-Count $search.facts } else { $null }
  searchChapters = if ($SearchQuery) { Get-Count $search.chapters } else { $null }
  rebuild = if ($RunRebuild) {
    @{
      qualityJob = $qualityJob.id
      knowledgeJob = $knowledgeJob.id
    }
  } else {
    $null
  }
}

$summary | ConvertTo-Json -Depth 8
Write-Host "Runtime smoke passed."
