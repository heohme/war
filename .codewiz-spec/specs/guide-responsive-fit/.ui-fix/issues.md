# UI issues

## UI-001 — Guide artwork is cropped

- Severity: high
- Evidence: the first slide loses both horizontal edges in the supplied screenshot.
- Cause: `.guide-visual > img` uses `object-fit: cover` together with a scale transform while its container ratio does not match the 3:2 artwork.
- Target: `app/globals.css`
- Fix: preserve the 3:2 visual ratio and render all guide images with `object-fit: contain` without artificial scaling.

## UI-002 — Guide modal is too large in landscape

- Severity: medium
- Evidence: the modal nearly touches both sides of the supplied viewport and dominates the screen.
- Cause: the default width is 91vw and the compact-landscape width is 92vw.
- Target: `app/globals.css`
- Fix: reduce default and compact-landscape viewport widths and lower the maximum viewport height.

## UI-003 — Compact landscape lacks content-density tuning

- Severity: medium
- Evidence: the screenshot's low-height landscape layout leaves the guide visually oversized.
- Cause: the compact breakpoint reduces some padding but keeps a large fixed visual minimum height.
- Target: `app/globals.css`
- Fix: remove the fixed visual minimum, tighten copy and controls, and let the artwork ratio define the visual height.
