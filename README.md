# wardice-warmachine-data

Public Warmachine data consumed by `wardice-hud` and edited locally through `wardice-hud-admin`.

## Factions As Visual Metadata

`data/mk4/factions.json` is the source of truth for both navigation and theming metadata.

Each faction can define:

- `name`
- `slug`
- `code`
- `trait`
- `icon`
- `accent`
- `description`
- `briefing`
- `armies`

Each army can define:

- `name`
- `slug`
- `format`
- `icon`
- `description`

Example:

```json
{
  "name": "Skorne",
  "slug": "skorne",
  "code": "SKO",
  "icon": "https://.../faction skorne color.png",
  "accent": "faction-accent--skorne",
  "armies": [
    {
      "name": "Exalted",
      "slug": "exalted",
      "format": "prime-armies-of-legend",
      "icon": "https://.../faction skorne color.png"
    }
  ]
}
```

## Meaning Of `icon`

- `faction.icon` is the default visual identity for the faction across Armory, list builder, sidebar recent lists, and deployment cards.
- `army.icon` is an army-level override or specialization.
- Runtime consumers usually show `army.icon` only when it is different from `faction.icon`, to avoid duplicated imagery.

## Meaning Of `accent`

`accent` is a CSS class name, not a hex color and not a semantic token like `primary` or `secondary`.

Required shape:

- `faction-accent--<slug>`

Example:

- `faction-accent--cryx`
- `faction-accent--skorne`
- `faction-accent--mercenaries`

The matching CSS class must exist in:

- `wardice-hud/src/styles.css`
- `wardice-hud-admin/src/styles.css`

Each class is expected to define:

- `--faction-accent-start`
- `--faction-accent-end`
- `--faction-accent-text`
- `--faction-accent-muted`

These variables drive:

- card gradients
- code badges
- button fills and hover states
- pills and list discipline tags
- text contrast on tinted backgrounds
- profile list/detail surfaces

## Schema Notes

The schema for this file lives in `data/schemas/factions.schema.json`.

Important validations:

- `faction.slug` and `army.slug` are lowercase kebab-case ids
- `faction.accent` must match `^faction-accent--[a-z0-9]+(?:-[a-z0-9]+)*$`
- `army.format` must be one of:
  - `prime-mk4`
  - `prime-armies-of-legend`
  - `legacy`

## Runtime Consumers

The data in `factions.json` currently affects at least:

- Armory faction selection
- Armory army selection
- Armory profile list
- Armory profile detail
- list builder saved/editing views
- list builder preview modal
- home deployment lists
- sidebar recent lists
- Forge faction and army previews

When changing faction codes, icons, or accent classes, verify both apps:

- `wardice-hud`
- `wardice-hud-admin`

## Warmachine App publications extractor

The standalone extractor rebuilds the Warmachine App library as JSON suitable for a web client. It merges the extracted `data core.json` catalog with every available `data library*.json` bundle, resolves publication → chapter → article → segment references, preserves localized arrays and rich text, and copies cached publication media.

```powershell
node scripts/extract-warmachine-publications.mjs
```

Defaults:

- input bundles: `output/warmachine-app/bundles`
- app media: `%USERPROFILE%/AppData/LocalLow/Privateer Press/Warmachine App/public-20/Media/Publications`
- output: `output/warmachine-app/publications`

Output:

- `catalog.json`: lightweight categories and publication summaries
- `publications/*.json`: resolved publication trees
- `media/`: locally cached publication images
- `media-manifest.json`: size and SHA-256 for copied assets
- `extraction-report.json`: counts and unresolved references

Use `--input`, `--input-dir`, `--media-root`, `--output`, `--no-copy-media`, or `--quiet` to override the defaults. A non-zero unresolved-reference count means the corresponding `data library*.bundle` has not yet been downloaded and extracted; the catalog remains usable and marks missing nodes explicitly. `requiresSubscription` is preserved for every publication.
