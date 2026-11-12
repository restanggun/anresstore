# Storefront UI review

## Direction
Retain the approved solid sky #A9DDF7 / pink #FFB5D5, white #FFFFFF, black brand, ink #17191C, muted #5B626B, and Manrope. Preserve the storefront controller/document visuals. Use a centered desktop navigation and compact mobile disclosure, not new decorative effects.

    [brand]       [Beranda Katalog Tentang Bantuan]       [Login Daftar]
    [rounded frame, 16px outside space at top]
    [same controls; only frame expands when scrolled]

Review findings: navbar declarations were distributed across many revisions. The route template rendered opacity:0 server-side and remained invisible in the current dev-browser session. Fix content visibility independently of hydration, and consolidate navbar geometry/state rules. Use a 900px breakpoint so tablet navigation is not squeezed.

## QA inventory
- Page is visible immediately, including before JavaScript; route transitions stay subtle and respect reduced motion.
- Navbar logo/nav/account centers align, equal control heights, consistent top/inner spacing, desktop nav centered.
- Logo black, pink square; Login pink/blue hover, Daftar blue/pink hover, current route blue.
- Frame is rounded with margins at top, full-width/bottom border after scroll. Visible controls keep exact coordinates at initial, transition, scrolled, restored states.
- Mobile/tablet menu: open/close, Escape/focus, account links, outside click, resize to desktop, short viewport scrollability.
- Home, catalog, about, help, login/register: visible initial view and relevant below-fold content, no document overflow at 360/390/768/1024/1440.
- Catalog search/filter/dialog and help search/FAQ still work; account preview validation still accurate.
- Exploratory: resize with menu open; rapidly toggle then follow a route; scroll while open; no-match filter recovery.
- Inspect screenshots for desktop/mobile at top/scrolled/menu and page/form states. Production build and browser-console check.

## Results
Production build passes. 66 structural/functional checks and 9 targeted visual-interaction checks pass (75 total). Verified at widths 1440, 1024, 768, 390, and 360. Visible navbar controls keep identical geometry before, during, and after scroll (tolerance <0.1px). Desktop navigation is centered; all desktop control heights are 44px. Tablet switches to disclosure at 900px. Short viewport menu scrolls internally and account links stay reachable.

Reviewed home desktop/tablet/mobile, scrolled header, expanded menu, catalog, about, help, login/register and service-dialog screenshots. No horizontal document overflow or clipped controls were found in reviewed states. Outside click, Escape/focus, resize-with-menu-open and route changes were exercised. Catalog/help empty states and signup validation remain correct.

The route template no longer emits invisible inline styles: CSS entrance begins at opacity .9 and returns to the default visible style. Visibility passes with JavaScript disabled and on the user's existing dev server after refresh. Production application pageerror listener recorded zero runtime errors. The existing dev server still reports HMR WebSocket connection errors in this execution environment; its process was left running and its configuration was not changed.

Color/interaction checks: black logo text, Login pink to sky hover, Daftar sky to pink hover, controller static at rest, hover-only spring and return. Reduced-motion route animation is disabled.

Navbar source is app/navbar.css; app/globals.css imports it. Prior navbar rules were removed rather than layered with new overrides. Existing dev server at port 3000 is left running; owned production preview and browser are closed after QA.

Follow-up spacing adjustment: scrolled header removes the 16px outside vertical padding, bringing its visible height to 70px desktop / 66px mobile. Inner controls retain horizontal alignment; vertical compaction uses the same 240ms easing. Reserved layout footprint stays constant so page content does not jump. Hero top margin reduced by 8px (desktop 16 to 8, mobile 8 to 0).
