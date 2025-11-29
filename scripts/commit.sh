#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "No es un repositorio git."
  exit 1
fi

msg="${*:-chore: manual checkpoint}"
branch="$(git branch --show-current || echo main)"

git add -A

if ! git diff --cached --quiet; then
  git commit -m "$msg"
else
  echo "Sin cambios para commit; se hace push igualmente..."
fi

git push -u origin "$branch"












