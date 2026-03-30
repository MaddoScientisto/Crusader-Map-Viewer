# Crusader Map Renderer and Usecode Work-in-Progress

This repository contains two related things:

- Work-in-progress disassembly and extraction scripts for Crusader: No Remorse and Crusader: No Regret usecode.
- A map viewer web application that can be published as a static site (GitHub Pages) or run dynamically as a local Node/Docker service.

Live demo (static export on GitHub Pages): https://maddoscientisto.github.io/crusader-map/viewer/

## Static vs Dynamic viewer

- Static (recommended for publishing): run `npm run export-static` from `map_renderer` to produce a self-contained, read-only site in `map_renderer/site`. The static bundle contains the browser app shell, prebuilt atlas PNGs, scene JSON, and downloadable catalog CSVs. This is what is deployed to GitHub Pages.
- Dynamic (local server): run the app with Node (`npm start`) or in Docker. The dynamic server can build caches on demand and provides UI-driven catalog editing and live reload of catalog data. Use the dynamic mode when you want to edit catalogs from the UI or generate scene caches locally.

## Catalog CSVs — locations and behavior

Catalog CSVs are the authoritative per-shape metadata the viewer uses. They live in several places in this workspace; common locations:

- `usecode_shape_catalog_remorse.csv` and `usecode_shape_catalog_regret.csv` at the repository root ([usecode_shape_catalog_remorse.csv](usecode_shape_catalog_remorse.csv) / [usecode_shape_catalog_regret.csv](usecode_shape_catalog_regret.csv)).
- Per-game copies under `USECODE_REMORSE/` and `USECODE_REGRET/`.
- Viewer-local catalogs under `map_renderer/Catalogs/` and the exported read-only copies under `map_renderer/site/data/catalogs/`.

Typical CSV columns and semantics:

- `shape_code`: unique identifier for a shape (required).
- `roof`, `semitransparency`: boolean overrides; blank = `false`, only explicit `true` enables the flag.
- `categorization`, `qualities`: non-authoritative metadata columns; helpful for search/filters and can be filled in automatically by the cache-build process.

Behavior:

- Dynamic server builds add newly observed shapes into the matching game catalog CSV without deleting existing rows, then rewrite the file sorted by `shape_code`.
- Cache builds may auto-fill blank `categorization` / `qualities` from derived values but do not change explicit overrides.
- Static exports include the current catalog CSVs as downloadable files but are read-only in that bundle — editing from the UI requires the dynamic server.

## Which static files are required for the exported site

For a deployable static export (what GitHub Pages serves) the following are required in `map_renderer/site`:

- `index.html` and the bundled JavaScript and CSS (`app.js`, `app.css` or equivalent bundle files).
- `data/catalogs/` containing the exported catalog CSVs (e.g. `remorse.csv`, `regret.csv`) and `catalog.json` index.
- Prebuilt atlas PNGs and scene JSON files (the viewer expects packed atlas images and per-map scene payloads).
- A minimal runtime config (`site-config.json` or similar) used by the static shell.

Files in the repository that implement or generate those artifacts include (not exhaustive):

- `map_renderer/package.json` — project scripts and dependencies.
- `map_renderer/Dockerfile` — Docker build targets for dev/production.
- `map_renderer/src/public/index.html`, `app.js`, `app.css` — source app shell.
- `map_renderer/src/export-static.js` and `map_renderer/scripts/serve-static.js` — export and serve helpers.
- `map_renderer/site/` — the exported static bundle; `site/data/catalogs/` contains exported CSVs.

## Quick run recipes

Dynamic (local development):

```powershell
cd map_renderer
npm install
npm start
```

Static export for GitHub Pages (produces `map_renderer/site`):

```powershell
cd map_renderer
npm run export-static
```

Docker (dev image mounts assets read-only):

```powershell
cd map_renderer
docker build --target dev -t crusader-map-renderer:dev .
docker run --rm -p 3000:3000 -v ${PWD}/STATIC:/app/STATIC:ro -v ${PWD}/STATIC_REGRET:/app/STATIC_REGRET:ro crusader-map-renderer:dev
```

## Acknowledgements

This work builds on and has been greatly helped by the excellent efforts of two projects:

- https://github.com/mduggan/crusader-disasm — foundational Crusader disassembly and data extraction work used heavily for mapping and format understanding.
- https://github.com/scummvm/scummvm — ScummVM tooling and documentation that helped clarify file formats and rendering behaviors.

Both projects were extremely helpful in understanding how to decompile various file formats and disassemble the game's code; many insights and verification points here come from their prior analysis.
