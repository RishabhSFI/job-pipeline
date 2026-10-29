# Design

The tokens live in `app/globals.css` under `:root`. Change a token there, not a
value inside a component. The page stylesheets (`app/jobs`, `app/board`,
`app/studio`) use the same tokens.

## Decisions

- **One accent.** Navy `--color-accent` is used for primary buttons, links,
  the active tab and headings. There is no second brand colour.
- **Warm neutrals.** The background, borders and muted text are one warm grey
  family. Don't add cool greys.
- **Colour means state.** `--color-good` is for applied, interview and offer.
  `--color-bad` is for rejected and not-eligible jobs. `--color-warn` is for
  "Check" eligibility warnings, due follow-ups and the favourite star.
  Every other status is plain muted text.
- **Type.** Fraunces is the display face, for page titles and section headings
  only. Inter is the body face. Use the size scale (`--text-xs` to `--text-xl`).
  Don't use letter-spacing.
- **Spacing.** Use `--space-1` to `--space-12` (4, 8, 12, 16, 24, 32, 48 px).
  Gaps inside a group are smaller than gaps between groups.
- **Radius.** Use `--radius-sm` (4px) for inputs, chips and tags, and
  `--radius-md` (8px) for buttons, lists, cards and dialogs. Nothing larger.
- **Statuses.** Sheet statuses keep their stored values. Show them with
  `statusLabel()` from `lib/board.js`, which gives sentence case.

## Don't add

- A second big heading that repeats the app name, or a tagline under it.
- Stat tiles that repeat counts the tabs already show.
- Pills or outlined badges for statuses or eligibility. Use a line of text.
- Cards inside cards, or every section of a page boxed in its own card.
- Gradients, glow, emoji icons, "New" or "Live" badges, or scroll animations.
- Per-row link lists. Links about one job belong on that job's page.
