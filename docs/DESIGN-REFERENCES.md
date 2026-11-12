# PorChai design references

## Figma: Wireframe – UI / Conversation

[Conversation page, node 51:5](https://www.figma.com/design/N2Izbphmkmbagqb64Z7zws/Wireframe---UI?node-id=51-5)

Read through the Figma connector on 11 November 2026. This node is a page of
conversation flows, not a single MINI App screen.

Inspected frames used for the landing's illustrative chat preview:

- [C-3 · จดรายจ่าย, 52:87](https://www.figma.com/design/N2Izbphmkmbagqb64Z7zws/Wireframe---UI?node-id=52-87): expense 45 baht, daily allowance 120, remaining 75; category, balance and progress within a white bot card.
- [C-18 · ถาม AI ก่อนจ่าย, 470:1078](https://www.figma.com/design/N2Izbphmkmbagqb64Z7zws/Wireframe---UI?node-id=470-1078): Friday meal 199 baht, available 150, shortfall 49; compare the numbers before explaining alternatives.

Applied chat colors: background `#8ca7d3`, user bubble `#8de055`, white bot card,
primary text `#00105b`, secondary `#5b5f7a`, progress `#6061b6`, border `#e6e2ef`,
over-budget `#cc2626`. Reference typeface is IBM Plex Sans Thai; the user later
selected the locally supplied SanamDeklen_chaya font for PorChai's website and
MINI App. Font source and author note are recorded in `docs/fonts/README.md`.

The landing adapts these frames into a compact phone illustration and keeps the
cream/green public-page identity. It is not a full screen-for-screen implementation.
The inspected frames use text and CSS shapes, with no external image assets.
Progress displays 45 / 120 = 37.5% to match the sample numbers.

All previews remain fictional. They do not record expenses, retrieve a user's
budget, call AI, or issue coupons. The live `/miniapp` identity gate and webhook
are separate from the public illustration. Other flows on the Figma page remain
references for future scoped work, not implemented functionality.

## Public introduction structure

[parnuan.com](https://parnuan.com/) informs the explanatory hierarchy: value
proposition, LINE conversation preview, features, FAQ and entry CTA. PorChai uses
its own copy and brand treatment; no reference-site images or claims are copied.

### Full-page behavior audit and implementation

Inspected the live desktop and 390px mobile page, including scrolling and DOM
layout/animation styles. PorChai adapts these observed patterns:

| Reference pattern | PorChai implementation |
| --- | --- |
| Hero with phone, brand accents and LINE entry | Original cream/green hero, Figma-style chat and Developing CTA |
| Six-position pinned desktop feature showcase | Scroll selects six preview scenes; buttons also select scenes |
| Mobile unpinned layout | Compact manual scene selector with a normal-height section |
| Conversation transition and CTA | Original PorChai exchange linking to the local LIFF entry |
| Two-column feature cards | Reminders, budget, offers and points, with explicit development status |
| Tabbed horizontal feature carousel | OA/MINI App entry buttons, arrows, touch/keyboard scroll |
| Pricing comparison | Student/partner model switch; no invented paid subscription tiers |
| Customer review carousel | Clearly fictional daily scenarios, no invented customer quotes |
| FAQ accordion, final CTA, footer, return to top | Functional controls and links using PorChai destinations |

Motion uses short transform/opacity entrances, scene transitions and hover
feedback. It does not reproduce proprietary animation source code. Reduced motion
disables transforms, reveals all content, unpins the showcase and uses instant
navigation. No autoplay loops or scroll hijacking are used. Existing native CSS and
browser APIs implement the interaction without an animation dependency.

`app/components/marketing.tsx`, `marketing.module.css` and `line-showcase.tsx`
own this page. `miniapp.tsx` owns loading/login/error and verified-user screens;
it retains the server identity gate. `lib/line/oa-replies.ts` owns the actual
Developing OA welcome/help response, which is separate from these illustrations.
