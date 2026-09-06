# Contributing to FiberShare OSS

Thank you for helping with the community MVP.

## Ground rules

- Keep this repository public-safe. Do not add API keys, operator emails, Mailjet config, or private ranch copy.
- Do not import code from the paid US product, the Expo app, or private ranch repos.
- Placeholder goats and shop items are fiction for the demo. Do not substitute a live production herd.

## Dev loop

1. Fork and clone `steelhead99x/fibershare-oss`
2. `npm install` then `npm run dev` (Node 20)
3. Open a pull request against `main` with a short description of the change

## Good first contributions

- Improve the herd map (keyboard focus, legends, more sample animals)
- Extend `public/data/shop.json` with richer fiber fields
- Accessibility and dark-theme polish
- Docs: architecture notes, Pages deploy tips (still wrangler v3 on Node 20)

## Code style

Vanilla JS plus CSS, small files, no framework required.

Visual direction is a **ranch journal / fiber catalog**: editorial and utilitarian, not a SaaS landing page. Prefer numbered lists and tables over soft card grids. Fonts are Source Serif 4 (headings) and IBM Plex Sans (UI/body).

Palette: paper `#f4efe6`, ink `#1c1916`, leather `#5c4030`, pasture `#4f5d41`, muted `#6e675c`. Gold is a rare accent (rules, active states), not labels.
