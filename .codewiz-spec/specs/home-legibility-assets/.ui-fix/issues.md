# UI issues

## Module coverage

| Module | Existing mount | Change type |
| --- | --- | --- |
| Compact weapon cards | `app/page.tsx` → `.weapon-card` | information hierarchy and typography |
| Weapon image delivery | `WEAPON_ART` and weapon `<img>` mounts | responsive asset selection |
| Mobile battlefield | `.game-shell::before`, `.guide-backdrop` | responsive background asset |

## UI-001 — Compact weapon metadata overlaps and becomes unreadable

- Severity: high
- Cause: three text rows are compressed into a 2.55rem card; role text and stats use fonts as small as 0.32rem.
- Target: `app/globals.css`
- Fix: keep two readable rows—weapon name plus range/damage/accuracy—and hide the redundant role/trait row only in compact landscape.

## UI-002 — Compact status text is too small

- Severity: medium
- Cause: group counts, equipped state and selection status fall below practical mobile reading sizes.
- Target: `app/globals.css`
- Fix: raise compact metadata sizes and remove the stats divider to reclaim vertical space.

## UI-003 — Homepage downloads oversized weapon art

- Severity: medium
- Cause: 768px detail art is also used for 40px thumbnails, totaling 376KB and decoding about 14MB of source pixels.
- Target: `app/page.tsx`, `public/assets/weapon-*-thumb.webp`
- Fix: add 320px WebP thumbnails totaling 76KB for card, attack and replay contexts; retain 768px originals for the long-press detail sheet.

## UI-004 — Mobile battlefield uses the desktop source

- Severity: medium
- Cause: phones download and decode the 1672 × 941 background even when the viewport is below 900px wide.
- Target: `app/globals.css`, `public/assets/battlefield-mobile.webp`
- Fix: serve a 960 × 540 mobile WebP at the landscape breakpoint, reducing the background from 132KB to 28KB.

## Structure checks

- Presence: all existing weapon, mode and global-action nodes remain present.
- Duplicate: no equivalent card or background layer was added.
- Position: weapon groups, card order and action order remain unchanged.
