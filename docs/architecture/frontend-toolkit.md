# Frontend toolkit

## Installed
- Anthropic frontend-design skill: https://github.com/anthropics/skills/tree/main/skills/frontend-design (user-level Codex skill, available next turn).
- shadcn CLI is pinned by package-lock.json. Web source components live in apps/web/src/components/ui.
- shadcn: Dialog, Input, Accordion, Tabs, Tooltip, Badge, Separator, Skeleton. Button reuses @anres/ui.
- Radix primitives are installed in @anres/ui; generated web components use the radix-ui umbrella package.
- Motion is installed; web Providers enables reducedMotion="user".
- Lucide React icons are installed. Import named icons, not the entire collection.
- Magic UI BlurFade and Aceternity TextGenerateEffect are installed as local source, with reduced-motion fallbacks. They are available for selective use, not enabled on every section.
- Registry source: https://magicui.design/r/blur-fade.json and https://ui.aceternity.com/registry/text-generate-effect.json.
- Registry setup exists in both web and admin components.json. Only web has generated source components so far.

## Usage
Run from repo root:

    npx --no-install shadcn add accordion --cwd apps/web
    npx --no-install shadcn add @magicui/blur-fade --cwd apps/web
    npx --no-install shadcn add @aceternity/text-generate-effect --cwd apps/web

Review generated imports, dependency changes, license terms, and visual tokens after additions. Keep cn imported from @/lib/utils (which delegates to @anres/ui). Avoid overwriting the shared Button. Generated components must use CSS variables; source tokens and Tailwind mappings are in packages/ui/src/styles.css.

## Design constraints
Use the current storefront system in `docs/architecture/design-system.md`: blue/pink solid colors, restrained decoration, clear keyboard focus, and reduced-motion support. Landing sections and cards may use the existing entrance motion; preserve a readable, usable interface throughout.

## Typography
Manrope Variable is selected and installed in @anres/ui through @fontsource-variable/manrope. The shared stylesheet imports the package stylesheet with unicode-range subsets and maps Tailwind font-sans and body to Manrope Variable. Web and admin serve bundled WOFF2 assets locally, with font-display: swap from Fontsource. Heading weights: 700-800; body: 400-500; controls: 600-700. Font license is included in the installed package. Fallback: Segoe UI/Arial.

Official references:
- https://ui.shadcn.com/docs/components-json
- https://magicui.design/docs/installation
- https://ui.aceternity.com/docs
- https://motion.dev/docs/react-installation
- https://lucide.dev/guide/react
- https://fonts.google.com/specimen/Plus+Jakarta+Sans

## Applied to the storefront
- shadcn/Radix: service dialog, search input, FAQ accordion, clear-search tooltip, and rounded controls.
- Lucide: category navigation, search controls, game/document illustration, and service links.
- Motion: result-grid layout changes triggered by search/category selection, respecting reduced motion.
- Magic UI BlurFade: available for cases that need its existing behavior.
- Aceternity TextGenerateEffect: used for selected hero, card, and page headings; use the shared `useReveal` hook for section entrances.

Invoke the installed skill with `$frontend-design`, followed by a concrete task and constraints. Example: "Pakai $frontend-design untuk rapikan katalog Anres, warna biru-pink solid, Manrope, tanpa gradient." Skills guide design decisions; libraries supply implementation components.

Design review: removed repetitive uppercase labels, reduced decorative arrows, retained left-aligned catalog and practical service information. No new transaction claims were added. Browser visual QA results are documented in ui-redesign-plan.md.

## Multi-page storefront
Shared shell: components/storefront/site-shell.tsx. Route transition: app/template.tsx. Client-side navigation uses Next Link; catalog deep links use ?kategori=. Account forms are local UI previews with no credential transmission. Shared design and QA coverage are in multipage-ui.md.
