# Frontend toolkit

## Shared system

- `packages/ui` provides shared buttons, styles, and design tokens for the storefront and admin.
- Web and admin are Next.js App Router applications; React components are written in TypeScript.
- Radix UI supplies accessible primitives, Lucide provides icons, and Motion handles selective interaction and entrance animation.
- Manrope Variable is bundled locally through Fontsource. The font license remains with the package.
- Design tokens, focus states, and reduced-motion guidance are documented in [design-system.md](design-system.md).

## Local source components

`apps/web/src/components/ui` contains project-owned wrappers and adapted components. `BlurFade` is adapted from Magic UI; `TextGenerateEffect` is adapted from Aceternity UI. Review the source headers and upstream license terms before redistributing adapted code.

Prefer the shared `@anres/ui` primitives and existing components before adding a dependency. Keep motion optional, preserve keyboard focus, and provide a usable reduced-motion experience.
