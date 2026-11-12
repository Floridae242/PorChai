# LINE frontend and OA Developing implementation

User authorizes full front UI and motion adaptation from parnuan.com and LINE work.
Keep branch Tle, all existing work, no deployment or external Console changes.

Reference audit: desktop hero/phone and floating accents, six-position pinned
feature section, conversation CTA, 2-column feature cards, tabbed feature carousel,
pricing comparison, testimonial carousel, accordion FAQ, final LINE CTA/footer,
back-to-top. Mobile stacks the hero and removes the desktop pinned section.

PorChai adaptation: own green/cream brand and Figma chat colors; six student
feature previews, student/partner business-model switch rather than invented paid
plans, illustrative daily scenarios rather than invented testimonials. All pending
features marked as such. No reference-site logos, assets, reviews or usage metrics.

Implementation:
- Responsive landing, mobile navigation, scroll-driven showcase and manual tabs.
- CSS/DOM motion with reduced-motion and no-JavaScript readable defaults.
- Feature/scenario carousels, FAQ, LINE entry and return-to-top.
- Improve LIFF loading/login/error/verified screens without bypassing verification.
- Independent OA work: welcome/help replies, signature-first, mocked tests.

Validate tests/lint/typecheck, desktop/mobile/reduced-motion browser states and
specialist code review. Production build previously blocked by loader port EPERM;
re-run only if a change affects that issue. No claim of real LINE testing.

## Result

- Implemented landing, six-scene scroll/manual showcase, carousels, student/partner
  switch, native FAQ, mobile menu and return-to-top. No reference-site assets,
  testimonials or metrics used.
- Improved LIFF loading/login and verified-user home, offers and about navigation.
- OA follow/text replies and a MINI App quick reply; raw signature still first.
  Successful reply-token cache is process-local; failures remain retryable.
- Final checks: 91 tests passed; lint, typecheck, whitespace check and code review
  passed. Reviewer findings for redelivery recovery and carousel position fixed.
- Browser: 1440px desktop and 390px mobile without horizontal overflow; desktop
  scroll changes the scene, manual selection works, menu opens/closes, native rail
  scrolling updates controls and Previous moves immediately from desktop end.
  Audience switch, scenario navigation and grouped FAQ work. Reduced-motion desktop
  has zero active animations/transforms, no hidden reveals and no pinned scroll.
- LIFF browser login gate rendered correctly on mobile; no offers shown before
  identity verification. Real authenticated LINE flow and Console remain untested.
- Build remains unverified because of the previously reproduced Turbopack CSS
  loader port-binding EPERM. No deploy, commit, push or Console changes.

Update on 12 November: the later LINE integration task resolved the build failure
by migrating Tailwind to PostCSS. Real HTTPS/LINE checks and Developing Console
changes are recorded in `docs/LINE-LIVE-SETUP.md`; the earlier limitation above is
historical.
