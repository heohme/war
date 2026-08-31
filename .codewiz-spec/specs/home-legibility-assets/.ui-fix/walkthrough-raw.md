# UI walkthrough evidence

- Source: user feedback after the mobile one-screen release plus production screenshot inspection at 667 × 375.
- Feedback: some fonts appear folded or overlapped; asks whether image information is fully optimized and whether further improvement is possible.
- Reproduced cause: a compact weapon card shows weapon name, role/trait, range, accuracy and selection state in about 40px height. Secondary text is 5–6px and competes for three rows.
- Asset audit: six homepage weapon images are 768 × 768 WebP files totaling 376KB although rendered at roughly 40px; the 1672 × 941 battlefield background is 132KB on mobile.
- Existing guide art is 960 × 640 WebP and loaded one slide at a time; it is already appropriately sized for its presentation and does not need another lossy pass.

No Figma input was provided. Existing page structure, art direction and all interactions are preserved.
