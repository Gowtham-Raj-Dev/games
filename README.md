# CodeLove Games — landing page

Landing page for an independent studio publishing its **own** browser games, in
**English and Tamil**.

**Next.js 16 (App Router) + TypeScript + plain CSS.** No Tailwind, no CSS-in-JS,
no UI kit. Icons from `lucide-react`; illustrations are hand-authored inline SVG.

```bash
npm run dev          # http://localhost:3000
npm run build        # production build (fully static)
npm start            # serve the build
npx eslint src       # lint
npx tsc --noEmit     # typecheck
```

---

## Design

Dark, high-contrast and typographic. Three near-neutral surfaces — page
(`#0b0c0e`), alternating section (`#13151a`) and raised card (`#1a1d23`) — with
**one** warm accent (`#ff7a33`) for labels, selected state and primary actions.
The interface stays neutral so the game screenshots carry the colour.

Every text colour, button fill and interactive border is measured against the
surface it sits on and clears WCAG AA (body text 4.5:1, control borders 3:1).
`--line-ui` exists precisely because the decorative hairlines are too faint to
mark a control on their own.

Elevation is explicit: a card on a section uses `--bg-raise`, never `--bg`.
Getting that backwards is what makes a dark theme look broken — the card reads
as a hole instead of a surface.

**Deliberately not used anywhere:** gradient-clipped text, text-stroke outlines,
scroll-triggered opacity reveals, loading curtains, particles, parallax, custom
cursors and glow effects. Those are what made the previous attempt fragile — any
one of them failing leaves the page blank or invisible. The page now renders
completely from the server HTML with **zero JavaScript**, and the only animation
is one short CSS fade on the hero that starts from already-visible content.

---

## Page structure

| # | Section | `id` | Nav label | Component |
|---|---------|------|-----------|-----------|
| 1 | Header / navigation | — | — | `components/layout/Header.tsx` |
| 2 | Hero | `top` | Home | `components/sections/Hero.tsx` |
| 3 | Featured game | `featured` | — | `components/sections/Featured.tsx` |
| 4 | Screenshot carousel | `showcase` | — | `components/sections/Showcase.tsx` |
| 5 | Our own games | `about` | About us | `components/sections/Originals.tsx` |
| 6 | Categories | `categories` | Categories | `components/sections/Categories.tsx` |
| 7 | The collection | `games` | Games | `components/sections/Games.tsx` |
| 8 | Why play here | `experience` | Features | `components/sections/Experience.tsx` |
| 9 | Closing CTA | `start` | — | `components/sections/CallToAction.tsx` |
| — | Footer | `contact` | — | `components/layout/Footer.tsx` |

Every nav item points at a section that exists, and the row is `nowrap` — the
desktop nav only switches on at 1040px, where all five labels fit on one line.

---

## Images and the carousel

Every image on the home page is a real capture from our own games, under
`public/images/`. There is no stock photography and no placeholder artwork: the
hero collage, the featured still and all 14 carousel frames come from
`src/lib/games.ts`, which also supplies their captions.

**The carousel loop.** `Showcase` moves a track holding each row three times
over and translates it by exactly one third. For that to be seamless, one third
of the track has to equal exactly one copy of the row — which is why the tiles
carry `margin-right` instead of the track carrying `gap`. With `gap`, a track of
n tiles measures `n·tile + (n−1)·gap`, so a third of it falls short of a copy by
two thirds of a gap, and the loop jumps a few pixels every turn. Tile geometry
lives in two custom properties on `.band`, so changing the tile width keeps the
arithmetic correct.

---

## Copy

One typed dictionary: **`src/i18n/translations.ts`**.

- `Dictionary` is an explicit interface, so **the build fails if the Tamil object
  is missing a key**. Copy cannot silently drift between the two.
- Add copy by extending `Dictionary`, then filling `en` and `ta`.
- Read it in any client component: `const { t, lang } = useLanguage();`

The **site chrome ships in English**: `lang` is a constant, so there is no
switcher and nothing to hydrate. The Tamil half of the dictionary is still typed
and still required, because **the games themselves are bilingual** — each title
in `src/lib/games.ts` carries both languages, and the Tamil voice assets live
under `public/games/`.

Per-title content (names, taglines, features, captions, FAQ) lives with the game
in `src/lib/games.ts`, not in the dictionary, so adding a title never touches
shared chrome.

---

## Honesty constraints in the copy

No player counts, download totals, ratings, reviews, awards or community sizes
appear anywhere — none of that exists yet.

The three figures in *Why play here* are **counted from real data** at render
time — `games.length`, `CATEGORY_IDS.length`, `LANGS.length` — not typed into
the dictionary, so they cannot drift when a title is added. The dictionary holds
only their labels. Category cards count their own titles the same way, and a
category with nothing in it says "Coming soon" rather than showing a zero.

---

## Before going live

Two placeholders in **`src/lib/site.ts`**:

```ts
contactEmail: "",              // empty → no mailto link is rendered
socialLinks: [{ href: "" }]    // empty → icons render inert, not as fake accounts
```

Unset social icons appear dimmed and do nothing, so the footer never links to an
account that does not exist. Fill in the URLs and they activate.

Also confirm `site.name` (the wordmark derives from it — the last word takes the
accent) and `site.url` (canonical and Open Graph metadata).

---

## Accessibility

- Semantic landmarks, one `<h1>`, translated skip link, labelled sections.
- `aria-pressed` on the language and category toggles; `aria-current` on the
  active nav link.
- Mobile menu is keyboard operable and closes on `Escape`; it is only mounted
  while open, so there is no hidden panel to trap focus.
- `prefers-reduced-motion` disables all animation and transitions.
- Visible focus rings throughout.
