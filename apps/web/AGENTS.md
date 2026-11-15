# Storefront UI

Before changing storefront UI, follow `../../docs/architecture/design-system.md` and use the shared theme tokens and components documented there. The approved visual reference is the current landing, Tentang, Bantuan, and auth UI. Preserve its solid sky-blue and pink palette, Manrope typography, rounded geometry, responsive behavior, accessible focus states, and reduced-motion support.

Reuse existing components before introducing new variants. Use server pricing, verified production payments, and real fulfillment status. Do not add sample promotions or simulated checkout paths. Check affected layouts and interaction states in a browser after visual changes.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
