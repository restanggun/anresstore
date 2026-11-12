# Professional landing page

## Design plan
Palette: sky #A9DDF7, pink #FFB5D5, white #FFFFFF, ink #17191C, muted #5B626B. Manrope 400-800. Rounded panels remain part of the approved identity. Preserve the navbar and its current scroll behavior.

    [shared navbar]
    [sky: all-service proposition / catalog CTA / controller] [pink: document service]
    [five quiet category shortcuts]
    [four representative services / catalog link]
    [how to choose: concise editorial explanation + actionable steps]
    [short FAQ]
    [clear catalog CTA / help link]
    [shared footer]

Review: the existing hero describes only gaming and the service preview shows three games plus one app. Revise the lead message to cover the business and show a representative service mix. Use familiar service-specific graphics; no generic particles, gradients, fake numbers, testimonials, or unsupported delivery promises. Keep motion hover-only on illustrations. Do not introduce automatic section reveals.

Copy: professional conversational Indonesian, clear action names, restrained headings. Current catalog is a preview, so status remains visible and no order/payment capability is implied.

## QA scope
- Primary/secondary hero links, all category shortcuts, four service links, choosing-guide links, FAQ cycles and final CTA.
- Verify category deep links land in the right filtered catalog.
- Layout and readable text at 1440, 1024, 768, 390 and 360px. Inspect initial view, products, guide, FAQ/final CTA, and footer. No horizontal page overflow.
- Hero controller/document artwork stays clear of text/actions at rest and hover; reduced motion respected.
- Navbar remains unchanged, sticky scroll compactness preserved.
- Keyboard focus, FAQ open/close, no-match navigation and return to homepage.
- Production build and browser app runtime errors.

## Final implementation and QA
The lead copy is now "Kebutuhan digital. Satu tempat." and represents the full service range. Primary CTA opens the full catalog; gaming/document shortcuts retain category deep links. Five category shortcuts and four representative previews cover game, app, pulsa and document services. The lower page contains an actionable choosing guide, three FAQ items, and a catalog/help closing section. Preview availability is stated clearly.

Production build passes. 53 Playwright checks pass across widths 1440/1024/768/390/360: no horizontal overflow, one main heading, primary CTA visible, hero text/actions inside the panel, all 20 landing links and category destinations, FAQ open/switch/keyboard close, hover-only controller/document animation, reduced motion and zero application page errors.

Reviewed initial desktop/tablet/mobile plus services, guide, FAQ and closing/footer screenshots. The minimum-width review prompted shorter hero copy and smaller task heading. The action-row transparent region was adjusted so it cannot intercept the controller hover. Primary and task actions meet 44px minimum height. No clipped text/actions or page overflow found in final reviewed states; below-fold content intentionally scrolls.

Artifacts: output/playwright/landing-hero-*.png, landing-services-*.png, landing-guide-*.png, landing-faq-*.png and landing-closing-*.png. Shared navbar and other pages were not redesigned. Browser and owned production preview are closed after QA; existing dev server is left running.
