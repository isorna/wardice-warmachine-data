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
