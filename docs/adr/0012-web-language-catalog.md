# ADR-0012 The web renders screen text from an English and Korean catalog, and composes the screen Headline itself

Status: accepted (V1). Source: `apps/web/src/shared/i18n/`, `scripts/check-i18n-keys.ts`.

- Context:
  Every screen string in `apps/web` was Korean, and a reader who does not read Korean could not use the review screens.
  The Headline of a Diff Group or Adoption Group is rendered by replay from a fixed template in one language and stored with the group.
  The Evidence Report quotes that stored Headline, and `resultHash` excludes it, so changing its wording never changes a hash.
- Decision:
  `apps/web` keeps its screen text in two catalogs, `en.ts` and `ko.ts`, and reads them only through `useT`.
  `en.ts` defines the shape; `ko.ts` is typed against it, and `pnpm check:i18n` fails CI when either catalog lacks a key, leaves one empty, or holds it as a different kind.
  The language comes from a saved choice in `localStorage`, else from `navigator.language` (Korean for `ko*`, English otherwise); the header toggle switches it and saves it.
  No i18n library is used: two catalogs and one hook cover what the screens need.
  The screens do not show the stored Headline.
  They compose the Headline in the screen language from the group's structured fields (Capability, Zone, Effect, action count, Target Summary), and the stored Headline stays only in the Evidence Report.
  The Korean screen Headline keeps the wording of the Korean Headline template in `docs/cutline.md`.
  Because the Target Summary keeps at most five Target keys, the screen states a Target count of five as "at least five" while the stored Headline states the exact count.
  Values that come from data (Capability, Zone, and program identifiers, Rule rationales, redacted tool input) are shown as recorded, in either language.
- Limitation:
  The Evidence Report is Markdown that the server generates in one language.
  The screen language does not change it, and a downloaded report can differ in language from the screen it came from.
- Alternatives:
  A language parameter on the API that makes replay and the report render Headlines per language.
  That puts screen language into stored groups and report bytes, which are evidence, for a concern that belongs to the screen.
  An i18n library such as i18next or FormatJS.
  The screens need two languages, a handful of counted phrases, and no runtime loading, which a typed catalog covers without a new dependency.
