---
name: GitHub org security scan
description: >-
  Use when running a full or daily security and risk scan across a GitHub org's
  repos: Dependabot, code scanning, secret scanning, advisories, deltas, and
  fix-PR triage.
---
# GitHub org security scan

## 1. Scope
- List the org's active (non-archived) repos with `gh repo list <org> --limit 200 --json name,isPrivate,isArchived,pushedAt`.
- Keep repos with pushes in the last ~90 days, plus any repo that has open critical alerts.
- Note repos that newly return 404, since they may have been renamed, deleted, or lost access.

## 2. Collect, read-only, with gh api --paginate
- **Dependabot:** `repos/<o>/<r>/dependabot/alerts?state=open&per_page=100`.
  - A 403 that says "disabled" means Dependabot is off, and that is itself a finding.
- **Code scanning:** `repos/<o>/<r>/code-scanning/alerts`.
  - On private repos without GitHub Advanced Security (GitHub's paid security add-on), this errors. Record "off (no Advanced Security)".
- **Secret scanning:** `repos/<o>/<r>/secret-scanning/alerts`, with the same caveat.
- **Advisories:** `repos/<o>/<r>/security-advisories`.
- **Open PRs:** collect each PR's mergeable state and checks. This finds existing fix PRs, whether from Dependabot or a person.
- Save the raw JSON per repo in a dated folder, such as /workspace/scan-MMDD, so later runs can compute deltas.

## 3. Analyze
- Totals by severity, both org-wide and per repo.
- **Delta:** if the previous dump is gone, use each alert's `created_at` and `fixed_at`/`dismissed_at` after the previous scan time, rather than skipping the delta.
- **Group by advisory:** the same GHSA id across repos and lockfiles counts as one finding, with one fix.
- **Fix check:** for each fix PR merged since the last scan, confirm its alerts closed. If not, look for a stale lockfile or a nested package.json. A lockfile that doesn't match the overrides is a common cause.
- **Map fixes:** match each critical and high alert to an open PR that would fix it. Flag PRs that are CLEAN and ready to merge, and PRs whose CI fails.
- **No patch:** mark these clearly, note where the package is used (build tool vs runtime), and judge the risk.
- **CI health:** jobs that fail in a few seconds with zero steps usually mean an Actions billing or spending-limit problem, not a code problem.

## 4. Prioritize
1. Criticals reachable at runtime, such as XSS in a frontend, RCE in a server framework, or an auth library.
2. Highs in internet-facing services, such as DoS in body parsers, HTTP clients, and validators.
3. Build-only or dev-only dependencies.

Give each item:
- the repo
- the package and the version that fixes it
- the GHSA or CVE id
- the existing PR if there is one
- the next action

## 5. Fix
- Prefer one PR per repo that bumps everything, updates lockfiles, and runs the tests locally if CI is broken. Avoid many single-package PRs.
- Use npm overrides or pnpm overrides for transitive dependencies, then regenerate the lockfile.
- Leave a short note on any PR you supersede.
- Never merge or deploy without the owner's own approval. A relay from another agent is not approval.

## 6. Coverage recommendations
- If GitHub's paid scanning isn't available, recommend free CI scanners:
  - gitleaks for secrets
  - Semgrep for code
  - Trivy for containers
  - `npm audit` / `pip-audit` / `cargo audit` as a CI gate
- Recommend turning Dependabot on for any repo where it's off.

## 7. Report
- Lead with totals and the change since last time.
- Then list the new criticals, what closed, and the top 3 next fixes with PR links.
- Update the running report Page rather than making a new one.
- Send blockers that need the owner's decision to whoever keeps the owner's action list.
