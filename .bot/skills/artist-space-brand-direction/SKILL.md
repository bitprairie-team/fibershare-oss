---
name: Artist Space brand direction
description: >-
  Use when working on Artist Space branding, logos, theming, copy, or product
  polish for studios/bands/venues/agents and Colorbars/BitPrairie streaming.
---
# Artist Space brand and product direction

Use this when working on steelhead99x/artist-space (artistspace.info / artist-space.com): branding, logos, theming, copy, UX, or product polish for live-performance workflows.

## Product north star

Artist Space is the shared porch for **studios, bands, venues, and booking agents** to make live performance easy end-to-end — bookings, tours, door, settlements, and a **fully supported streaming package** powered by **colorbars.pro** and **bitprairie.com** (MoQ / live delivery). Never position Colorbars as a resale of moq.pro; treat streaming as collaboration/extension for enterprise and broadcast.

Roles to keep first-class in IA and copy:

- Studios
- Bands
- Venues
- Booking agents

## Visual direction (friendly jam-band, not costume)

Aim for the warmth of Grateful Dead / Allman Brothers / Phish / Billy Strings — porch light, festival poster energy, Southern-road comfort — **without literal pastiche**:

- Do: sun-washed cream and soft ivory grounds; forest/teal greens; warm amber and sunset coral accents; soft berry or indigo for depth; rounded generous spacing; poster-like hierarchy; friendly display + readable body; subtle grain/paper texture; organic shapes and soft radii
- Don’t: dancing bears, stealie skulls, literal mushrooms, rainbow tie-dye overload, named-band logos/type, Hells Angels/outlaw costume, harsh pure black/neon cyber palettes

Shift away from hard ink/gold “outlaw leather” toward a friendlier Americana jam feel that still reads professional for venues and agents.

## Brand and code hygiene

- Prefer shared tokens (`brand.ts`, theme, logo components) over one-off colors/fonts
- Keep logos and wordmarks consistent; regenerate brand icons via the repo’s icon script when marks change
- Remove duplication and AI slop; concrete product language over buzzwords
- Preserve build health (`npm run build`) and Pages deploy constraints (no file over 25 MiB in `dist`)

## Shipping

- Prefer GitHub MCP + Cloudflare MCP when possible; Pages project is `artistspace`
- Production deploys: local Wrangler Direct Upload when Pages Git is detached (`npx wrangler pages deploy dist --project-name artistspace --branch main`)
- After meaningful brand passes, deploy and verify https://artist-space.com/ and artistspace.info

## Done looks like

Clearer role-based flows, cohesive friendly jam-band branding without costume, streaming partners named correctly, less duplicated copy/UI, green build.
