# UI issues

## Module coverage

| Module | Existing mount | Change type |
| --- | --- | --- |
| Game viewport shell | `app/page.tsx` → `.game-shell` | viewport containment |
| Home hero | `app/page.tsx` → `.home-copy` | narrow-column text containment |
| Loadout card | `app/page.tsx` → `.match-card` | compact landscape spacing |
| Global actions and brand | `app/page.tsx` → `.global-actions`, `.brand-bar` | safe-area placement |

## UI-001 — Mobile landscape page scrolls vertically

- Severity: high
- Evidence: 667 × 375 renders a 392px document and clips the bottom of the action area.
- Cause: the redesigned `max-height:600px` rule overrides an earlier compact top padding rule, leaving 3.6rem top padding; `.game-shell` uses only `min-height`, so content expands the document.
- Target: `app/globals.css`
- Fix: bind the game shell to `100svh`, prevent body scrolling, and restore compact top/bottom padding in the final `max-height:500px` rule.

## UI-002 — Hero description overlaps the loadout column

- Severity: medium
- Evidence: at 667 × 375, the description's 18rem maximum width exceeds the available left grid track.
- Cause: the narrow-landscape rule changes grid proportions but does not constrain the paragraph to its track.
- Target: `app/globals.css`
- Fix: make the grid tracks and hero section shrinkable, constrain the paragraph to 100%, and clamp it to three lines.

## UI-003 — Landscape safe areas are not respected consistently

- Severity: medium
- Evidence: brand, content, and global actions use fixed viewport offsets that can collide with phone cutouts.
- Cause: landscape layout does not include `safe-area-inset-*` values.
- Target: `app/globals.css`
- Fix: combine existing responsive spacing with safe-area environment insets.

## UI-004 — Mobile Safari may enlarge text in landscape

- Severity: medium
- Evidence: the layout is height-sensitive and does not declare a text-size adjustment policy.
- Cause: automatic landscape text inflation can increase the card height beyond the tested CSS layout.
- Target: `app/globals.css`
- Fix: explicitly keep text sizing at 100%.
