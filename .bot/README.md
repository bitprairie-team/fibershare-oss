# FiberShare OSS bot files

This folder holds the skills and helper scripts used by the fibershare.dev OSS bot (the bot that looks after the FiberShare open-source demo in this repo).

It is an export of what was on the bot's computer on 11 November 2026 (Pacific Time). It is not a live deploy of the demo.

## Skills

Each folder in `skills/` has a `SKILL.md` that says when to use the skill and how to run it.

| Skill | When to use it |
| --- | --- |
| `qa-code-review` | Reviewing PRs, running live smokes, or tightening review practice |
| `artist-space-brand-direction` | Artist Space branding, logos, theming, copy, or product polish |
| `github-org-security-scan` | A full or daily security scan across a GitHub org's repos |
| `moq-camera-bench-via-fanout` | Grading real ESP32 cameras through an already-running MoQ fan-out |

Two skills were listed on the bot but were **not on disk** as files, so they are not in this folder:

- `checkout-payment-parity` — show Stripe and PayPal as equals, within each processor's terms
- `cloudflare-merge-deploy-verify` — after a merge, deploy the Cloudflare build and verify the same day

The expected plugin folder (`agent-data/plugins/bot-skills@…/skills/`) was also missing on this computer. If those skill files live only on the bot server, they still need a later export.

## Helpers

`helpers/` has the health-board scripts this bot used, with secrets removed:

- `check.sh` — probe public sites and money paths; writes `status.json` and `sites.json` in a working directory you pass in
- `drift.sh` — list PRs merged to main after the last recorded deploy time
- `status.example.json` — shape of the money-path board
- `sites.example.json` — shape of the site probe board
- `repos.example.json` — map of product name to `owner/repo`
- `deploys.example.json` — map of product name to last deploy time (and optional sha)

Do not commit `.env`, `.dev.vars`, `probe-creds.env`, live `status.json`, or Cloudflare account IDs. Put probe credentials in an untracked env file or in the environment:

- `MOQ_GATE_PW`, `BP_GATE_PW` — optional gate passwords
- `FS_ACCESS_ID`, `FS_ACCESS_SECRET` — optional Cloudflare Access service-token headers for FiberShare probes
- `GH_TOKEN` or a logged-in `gh` — for `drift.sh`

No secrets, private hostnames, or family names belong in this folder.
