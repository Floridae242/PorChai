# Compact PorChai chat

Direction: calm, readable conversation. Show the item and its state before asking for an action. Keep the existing green brand and Thai wording from น้องพอใช้.

- Generic answers use a small illustrated heading, full text, and compact contextual actions. App/help shortcuts remain above the keyboard instead of repeating two large buttons in every bubble.
- Plans, entries and rewards use one continuous list with a tappable row for every item (up to ten per page). Preserve server-owned selection keys and indexes. Cancelled plans explain that no payment is needed; other instructions use the selected index and page.
- Notification confirmation shows daily, monthly and budget settings at equal visual weight, with the summary time in Thai time. Confirm/cancel sit side by side; saving still requires confirmation.
- Bill-specific reminder requests do not mutate digest preferences. The current supported route is MINI App → settings → recurring bills. Custom per-bill time through chat is not implemented; the response says so before linking to that screen.
- Icons: selected original transparent PNG sticker variants from the user-supplied `PorChai_Icon_Collection_320.zip`, under `public/icons/porchai`. All essential text/actions remain usable if decorative images fail.

Preview: `/dev/line-flex`, first four “ใหม่” examples. Preview actions are inert and contain no user data. Browser screenshots approximate Flex layout; LINE fonts and rendering can differ. Assets and payload changes require deployment before appearing in the live OA.

Verification covers exact postbacks, all ten row targets, notification hierarchy, image fallback text, unchanged global preferences after bill reminder requests and confirmation, cancelled-plan selection, keyboard-accessible preview actions, and mobile overflow.
