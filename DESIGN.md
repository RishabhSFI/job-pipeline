# Design

The tokens live in `app/globals.css` under `:root`. Change a token there, not a
value inside a component. The page stylesheets (`app/jobs`, `app/board`,
`app/studio`) use the same tokens.

## Decisions

- **Dark.** Near-black page (`--color-bg`), slightly lighter surfaces for
  lists and cards, and light grey text. The resume preview stays white because
  that is what prints.
- **One accent.** Amber `--color-accent` marks the match score, links, the
  active tab and the one main action per page (filled). Row actions such as
  "Mark applied" are outlined in amber. Headings use the text colour, not the
  accent. There is no second brand colour.
- **Colour means state.** `--color-good` is for applied, interview and offer.
  `--color-bad` is for rejected and not-eligible jobs. `--color-warn` (orange)
  is for "Check" eligibility warnings, due follow-ups and the favourite star.
  Every other status is plain muted text.
- **Type.** Inter for everything. Headings get size and weight 600, with a
  slight negative tracking. Use the size scale (`--text-xs` to `--text-xl`).
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
