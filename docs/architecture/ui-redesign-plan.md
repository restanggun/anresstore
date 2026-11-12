# Soft sky / pink redesign

## Design plan and critique
Palette: sky #A9DDF7, sky light #EAF6FD, pink #FFB5D5, pink light #FFF0F6, ink #17191C, paper #FFFFFF. Manrope: body 400-500, controls 650, headings 700-800. All colors solid. Dark text and primary actions protect contrast on pastel surfaces. Rounded hierarchy: navigation 24px, hero 32px, products 22px, controls 14px.

Layout concept: a digital storefront with a game-focused sky banner and a smaller pink document-service panel. Left-aligned copy, practical catalog, clear product names.

    [black logo / Anres Store]  [Katalog | Cara order | Bantuan] [Cari layanan]
    [sky: game headline + controller illustration] [pink: document service]
    [catalog heading] [search]
    [category filters]
    [product] [product] [product] [product]
    [order steps in one quiet row]
    [FAQ]                              [accordion]

Review: avoid the previous generic big-slogan + nested cards hero. Use service-specific game/document graphics and content; remove repeated uppercase labels, decorative arrows, automatic word effects, gradients, and meaningless feature statistics. Keep genuine interactive Motion layout and Radix controls. Original logo remains in brand; web uses recolored black copy.

## QA inventory before testing
- Desktop initial view: black logo loads, pastel sky/pink solid surfaces, Manrope, rounded panels, heading and main action fit. Inspect screenshot at 1440x1000.
- Sticky navigation: scroll into catalog and FAQ; header remains visible, anchors clear header, dropdown/dialog layer above content correctly.
- Mobile 390x844 and minimum 360px: header/logo/menu fit, open and close menu, follow category link, no horizontal page overflow. Category scroller may scroll internally.
- Catalog: all six filters, search, clear-search tooltip/action, service dialog open/close with close, footer button, Escape and outside click; focus returns to triggering service.
- FAQ: open, switch, close using actual buttons and keyboard.
- Exploratory: whitespace/no-match query and reset; combine category with unmatched search then recover.
- Reduced motion: content remains visible, layout transition disabled.
- Contrast: measure foreground/background for body, muted labels, buttons and controls; at least 4.5:1 for ordinary text. Inspect keyboard focus.
- Screenshots: initial desktop/mobile, scrolled catalog, dialog, FAQ, expanded mobile menu. Review them rather than relying solely on numeric bounds.
- Console: inspect errors, missing logo/font/favicon requests.

Playwright Interactive cannot run because js_repl is absent in this session. QA uses the installed Playwright CLI without changing session sandbox settings.

## QA results
- Production builds for web and admin pass TypeScript and static generation.
- Playwright CLI functional flow passed desktop hero shortcuts, all six category filters, search, clear-search tooltip/action, no-match reset, whitespace query, combined filter/search recovery, service dialog close button/return/Escape/outside click, focus restoration, FAQ open/switch/keyboard close, nav anchors and input focus, and mobile menu open/close/Escape/link navigation.
- No horizontal document overflow at 1440, 390, and 360px. Sticky header stays at y=0 before and after scrolling. Additional screenshot review at 768px.
- Manrope is the computed body font. Black logo SVG loads; original SVG is preserved. No gradients detected in computed backgrounds.
- Main palette contrast: ink/white 17.61:1, ink/sky 12.06:1, ink/pink 10.75:1, muted/white 6.17:1, muted/light-gray 5.78:1, notice/pink-soft 7.73:1, white/dark-button 17.61:1. These are sampled palette pairs, not a full WCAG audit.
- Browser console: zero errors, zero warnings on the final visual pass. Favicon is provided via app/icon.svg.
- Reviewed desktop initial/catalog, tablet, mobile initial/minimum width, expanded menu, dialog, and keyboard-focus screenshots. Transition screenshots were reviewed separately and superseded by settled captures for visual signoff. A transient screenshot/compositor displacement during resize/scroll was investigated with header bounds and fresh captures; live header bounds remained y=0.
- Review found small labels, a misleading carousel counter, tight controller/CTA spacing at 360px, and nav search focus loss. All were corrected. Mobile category navigation intentionally scrolls horizontally inside its own group.
- Current product initials are typography placeholders; transactions and product pricing remain inactive. Admin received shared tokens, not a complete dashboard redesign.
- Browser and preview sessions are closed after QA. Screenshots and temporary QA scripts are in output/playwright/.
