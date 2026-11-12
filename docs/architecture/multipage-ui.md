# Multi-page storefront

## Design direction
Retain the approved sky #A9DDF7, pink #FFB5D5, paper #FFFFFF, ink #17191C palette and rounded hierarchy. Brand lettering uses the exact UI tokens #A9DDF7 (Anres, weight 800) and #FFB5D5 (Store, weight 300), with a 5px pink square after Store; supplied SVG mark stays black. Manrope is shared across all routes.

Layout:

    [logo + brand] [Beranda | Katalog | Tentang | Bantuan] [Login] [Daftar]
    [route-specific content]
    [shared footer / links]

Routes: / introduces services; /katalog owns search, filters and service details; /about explains the business; /bantuan owns searchable FAQ; /login and /daftar contain account forms.

Review: preserve the service-specific controller/document illustrations instead of adding generic particles or gradients. Keep controller and document movement hover-only (y -5px, rotate 2deg), user-driven hover/press response, shared active-navigation movement, and a short route entrance. Do not animate every section on scroll. Reduced motion disables decorative movement.

## Functional boundaries
Account pages are UI previews with local validation only. They do not send credentials, create sessions, or create users. Both pages disclose that account access is not open. Auth integration is a separate backend task.
Catalog content is still a preview with no price/payment claims. Query parameter kategori allows landing links to open a specific category.

## QA inventory
- All six routes load directly and through visible nav links; active page is marked with aria-current.
- Browser back/forward and category deep links preserve correct route/category state.
- Desktop/mobile nav including Login/Daftar, logo home link, footer links, and menu Escape/link close.
- Search/filter/dialog regression on dedicated catalog page; no-match recovery and invalid category URL.
- Searchable help FAQ and reset on no match.
- Login/register required-field, invalid email, short password, confirmation mismatch, show/hide password, valid-form preview notice, links between forms/help/catalog. No success claims or credential requests.
- Desktop 1440, tablet 768 and mobile 390/360 screenshots for route layouts and forms; scroll/sticky and horizontal overflow.
- Controller motion changes position with normal preferences and stays still with reduced motion; route entrance and button press do not cause content clipping.
- Brand colors match request and text contrast remains readable.
- Production build and browser console.

## Final QA results
- Production build passes for all six routes, including dynamic catalog query handling.
- 73 functional/layout checks passed in pages-qa.js. Nine focused polish checks passed in pages-polish.js (82 total).
- Verified: real client-side navigation without document reload, browser back/forward, category links, all filters, search/no-match recovery, dialog focus restore, searchable FAQ, keyboard close, mobile navigation, footer routes, and direct page loads/titles.
- Form checks cover empty input, malformed email, short password, confirmation mismatch, show/hide password, first-error focus, and accurate preview notice. Observed zero credential POST requests. Auth is not enabled.
- Screenshots reviewed at 1440x1000, 768x1024, 390x844, and minimum 360x800 for applicable routes; forms and validation/notice states reviewed separately. No horizontal document overflow, clipped form controls, or unreadable labels found in reviewed states. Vertical scroll on longer forms is intentional.
- Controller motion changes position under normal preference and stays still with reduced motion. Primary button press responds; navigation active state moves. Route transition does not move shared header/footer.
- The long-page/short-page scrollbar shift found during visual review was fixed with scrollbar-gutter: stable and verified with matching navbar X positions.
- Brand style measured: Anres #236C94/800, Store #B13B72/300, black SVG. Contrast against white: 5.76:1 and 5.62:1 respectively. Color-pair sampling is not a full accessibility audit.
- Final browser console: 0 errors and 0 warnings.
- Artifacts: output/playwright/pages-*.png. Browser and owned preview server closed after QA.

Latest owner refinement: brand text uses the exact pastel UI tokens, not the darker text hues from the previous QA snapshot. Controller idle loop removed; its hover spring matches the document illustration.

## Button palette refinement
Login defaults to pink, Daftar to sky blue, including the matching account-form actions. Hover is pink; pressed and current-page states are sky blue. Current page takes precedence over hover. Mobile account actions share a compact two-column row, separated from the four page links. Brand text and square retain the exact hero-card color tokens.
Targeted QA: desktop/mobile account rest, hover, pressed and current states; nav hover/current; form button colors; brand/hero token equality; mobile menu geometry, keyboard focus, and route links. Explore pressing then cancelling, and hovering a current route.

## Scroll-responsive navbar
At scrollY >16px the rounded navbar expands to full document width, removes outside margins/radius, and retains only its bottom border. CSS uses a 280ms easing; the original header footprint is reserved in a transparent sticky wrapper, preventing content shifts. Scrolling back to the top restores the initial form. Reduced-motion CSS disables transitions.
Targeted checks: initial/scrolled/restored state at desktop/mobile, border sides/radius/width, sticky top, unchanged hero document position, menu use while scrolled, scroll during an open menu, and current/hover button state. Screenshots cover top, transition, scrolled, and mobile menu.

Latest targeted QA: build passed; 26 browser checks passed for button rest/hover/pressed/current states, exact hero-brand color equality, cancelling a press, full-width navbar geometry (x=0, width=clientWidth), bottom-only border, unchanged hero document position, top-state restoration, mobile menu while scrolled, no horizontal overflow, and reduced motion. Reviewed initial, transition, scrolled desktop/mobile and expanded mobile-menu screenshots. Console: 0 errors / 0 warnings. Tailwind container max-width was explicitly removed only in the scrolled navbar state. Browser and preview sessions closed after review.

## Fixed navbar content during morph
The scroll effect now animates a separate ::before background/border frame. The inner .nav-shell keeps the same width, border footprint, padding, height, and position in both states. Desktop header has symmetric 16px top/bottom spacing (108px footprint); mobile remains 86px. Logo, nav items, account actions, and mobile toggle must keep identical viewport coordinates before, during, and after scrolling. Only the frame expands to the edges and changes to a bottom border.
QA scope: measure visible controls at top, mid-transition, scrolled, and restored at 1440/768/390/360 widths; check expanded frame and mobile menu placement; inspect screenshots and overflow.

Latest compact-header refinement: remove all outside frame margins in both states. Frame is edge-to-edge from the start with 20px radius (18px mobile), straightening on scroll. Header height is 64px desktop / 60px mobile, with 9px vertical and 16px horizontal padding. Inner max-width remains 1240px; only frame radius/border visibility animates, keeping contents fixed.

Owner correction: restore the inset rounded frame before scrolling (desktop 10px vertical, mobile 8px; responsive horizontal gutters). Remove frame margins only after scroll. Inner compact 64/60px content container remains unchanged across states; only its surrounding frame animates.

Top-spacing refinement: initial navbar now has symmetric 16px vertical outer spacing on desktop and mobile. Reserved footprints are 96px desktop and 92px mobile; the inner 64/60px navbar remains fixed while its frame expands on scroll.
