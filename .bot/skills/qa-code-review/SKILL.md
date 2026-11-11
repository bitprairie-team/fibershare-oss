---
name: QA code review
description: >-
  Use when reviewing PRs, running LIVE/production smokes, or hardening
  QA/code-review practice — tip-delta, soft-pass residuals, fail-loud
  placeholders, checkout/auth boundaries.
---
# QA + code review

Reusable checklist for reviewing PRs and running LIVE/production smoke. Keep language precise: tip-delta, soft-pass residuals, fail-loud on placeholders and silent failures.

## Before you review or smoke
1. Name the surface under test (URL, PR, branch tip hash/bundle name).
2. Separate **code review** (diff + tests) from **LIVE smoke** (deployed tip). A green PR is not LIVE until the tip/bundle changes.
3. Do not invent PASS. If you did not click it, render it, or call it, mark **NOT tested**.

## Code review (PR / branch)
Read the diff and CI before commenting. For each finding, say severity (P0/P1/nit), the file/area, and a concrete fix ask.

### Always check
- **Silent failure:** empty catch, generic toast, ignored promise, swallowed API error body.
- **Auth boundaries:** guest vs signed-in; 401/403 UX vs dead controls.
- **Secrets:** no credentials, tokens, or sandbox passwords in code, fixtures, or PR text.
- **Deploy path:** Workers/Pages tip change vs merge-only; note if local Wrangler (or similar) is required before LIVE.
- **Tests:** unit/integration cover the bug path; fail loud when integration keys missing (no fake success).
- **Idempotency / duplicates:** drafts, bots, or scripts that open the same PR repeatedly.
- **Conflicts / behind main:** ask rebase before merge praise.

### Review output shape
Lead with merge readiness: **Ready / Blocked / Soft**. Then 3–7 bullets max. End with a one-line smoke ask for after deploy.

## LIVE / production smoke
1. Record tip/bundle ids before and after; report **SAME** or **DELTA** with old→new.
2. HTTP status alone is not a product PASS. Soft-pass when only status/HTML was checked.
3. Soft-pass residuals always list: tip, viewport (mobile/desktop), console, signed-in flows, checkout/payment, media playback — whichever were **NOT tested**.
4. Placeholder / lorem / Coming soon: **fail loud** only when unexpected for that host; construction pages called out as expected stay soft.
5. Flaky presence or CDN colo flaps: confirm with a sustained window or source-of-truth timestamp before FAIL LOUD outage alerts.
6. Never touch prod hardware ownership or start a secondary kit/proxy unless the owner explicitly asks.

## Payment / checkout smokes
- Stay on sandbox until the owner signs off LIVE credentials.
- Trace create-order → approve → capture → credit/balance separately; abandon sticky Loading as FAIL with order id.
- Guest must get a clear sign-in path, not a dead Pay button.

## Coordination
- Tell the product owner agent only actionable deltas (conflicted PRs, red CI on their repo, real outages).
- Informational digests to PM stay priority-low; wakes for owners only on FAIL LOUD or explicit ask.
- After a cloud-agent fix PR: re-smoke the claimed path on LIVE tip change, not on merge alone.
