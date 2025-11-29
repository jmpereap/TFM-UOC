Param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$MessageParts
)
$ErrorActionPreference = "Stop"

git rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "No es un repositorio git." -ForegroundColor Red
  exit 1
}

$msg = if ($MessageParts -and $MessageParts.Count -gt 0) { $MessageParts -join ' ' } else { "chore: manual checkpoint" }
$branch = (git branch --show-current).Trim()
if (-not $branch) { $branch = "main" }

git add -A

git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "$msg"
} else {
  Write-Host "Sin cambios para commit; se hace push igualmente..."
}

git push -u origin $branch












