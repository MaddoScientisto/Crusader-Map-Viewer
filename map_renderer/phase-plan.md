# Map Renderer Phase Plan

## Phase 1

Goal: tighten the current viewer flow without changing the map semantics.

- remove the explicit manual build button because map selection and filter changes already trigger builds automatically
- hide the viewport's "choose a detected map" message as soon as a map is selected and a build starts
- add build feedback in the side panel with a spinner and a simple phase-based loading bar
- remove visible tile seam lines and the synthetic background grid so the map reads as one surface
- use a more efficient streamed visualization format for interactive tiles while keeping PNG as the final export format

Phase 1 implementation choice:

- interactive tiles switch from PNG to lossless WebP because it is broadly supported in current browsers and is more bandwidth-efficient for repeated server-rendered tile delivery
- full-map download remains PNG so export quality and compatibility stay unchanged

## Phase 2

Goal: promote editor-only content from "baked into the raster" to interactive overlay objects.

- completed: keep the base map rendered as a flat server-generated tile surface
- completed: extract editor-only objects into a standalone overlay data stream
- completed: render editor-only overlay items in the client as positioned sprite overlays above the base map
- completed: remove editor-only records from the base raster so overlay shapes are not duplicated in the map tiles
- completed: fix overlay transparency so the sprite background stays transparent instead of fading black
- completed: add an inspection mode checkbox that shows metadata for any rendered shape under the cursor, not just editor overlays
- improve roof detection before or during the overlay split because the current roof filtering still lets some roofs render when they should not
- identify occluding helper geometry such as invisible walls and render those semitransparently so they remain legible without hiding too much of the map beneath them
- fix pipe rendering because pipes currently are not showing up correctly
- investigate force-field rendering because they appear yellow instead of the expected blue semitransparent look; this may be a debug-shape choice issue or a palette/color-rendering issue
- likely revisit ScummVM Crusader handling in `D:\source\scummvm` to confirm what editor/debug records carry and how best to decode them for display

Current phase 2 status:

- the server now builds three outputs from one map build: base raster tiles, editor-only overlay sprites, and a shared inspectable-shape metadata stream
- editor-only shapes are interactive overlay sprites rendered from their original decoded frames rather than synthetic markers
- when inspect mode is active, the cursor reports metadata for whichever rendered shape is currently under it, including base-map shapes

Next steps:

- use inspect mode on representative maps to identify which visible structures are true roofs versus normal geometry so roof filtering can be tightened with evidence
- decide which helper/occluder families should stay semitransparent overlays and which should eventually be hidden or toggled separately
- inspect broken pipe shapes and compare their metadata against ScummVM handling to determine why they currently render incorrectly
- inspect force-field shapes and compare palette or translucency traits against expected in-game appearance

Open questions for phase 2:

- which helper/editor families should stay as overlay sprites versus gain their own visibility toggles
- what exact metadata fields are reliable enough to expose in the tooltip long-term
- whether some editor-only entries should be clustered, filtered, or toggled by family to keep dense maps usable

## Phase 3

Goal: replace server-side full-map raster composition with a cached atlas-plus-scene-data pipeline that the client renders directly.

- stop baking the playable map and editor-only items into one server-rendered visual surface
- have the server decode every shape needed for a map build, including editor/debug/usecode shapes, and pack them into one or more cached atlas images
- emit cached JSON scene data that tells the client which atlas sprite to draw, where to place it, what metadata it exposes, and how it should be identified in the UI
- reuse the existing usecode shape catalog CSV files in `map_renderer/Catalogs` as part of the build pipeline so shape names and other catalog metadata flow into the exported scene data
- keep the catalog CSV files inside the Docker image build context rather than mounting them separately in `compose.yaml`; they are local source assets and should be burned into the image
- add an explicit npm cache-generation script that prebuilds atlas images and scene JSON for every map outside the web request path; this can be run manually or during Docker/container initialization
- keep the live viewer on cached artifacts by default and regenerate only missing or stale atlas/map data on demand when a request needs them

Phase 3 implementation choice:

- the primary server artifact becomes cached render data per map build rather than cached raster tiles
- cache artifacts are per-map for now; do not generate separate atlas/scene folders for roof/editor visibility modes because those filters will be applied entirely in the client from one full scene payload
- each cached map build should include:
	- atlas image data containing all decoded shape frames required for that map, including editor-only items
	- scene JSON listing every shape instance with atlas coordinates, map placement, draw order or layer hints, ID, and enough metadata for the client to decide whether the instance is a roof, editor/debug object, helper geometry, or normal map geometry
	- build metadata sufficient to validate cache freshness against source assets, decoding rules, and the catalog CSV inputs
- atlas packing and scene serialization should deduplicate repeated shapes so the client draws many instances from a small packed sprite set instead of receiving repeated rendered pixels
- cache invalidation should key off map inputs plus a content/version fingerprint that includes the relevant catalog CSV data so name edits and decoding changes invalidate stale cached outputs cleanly

Phase 3 metadata proposal:

- keep per-instance records compact and focused on placement/runtime state: instance ID, sprite ID, shape-definition ID, draw order, source, world coordinates, flags, map/NPC linkage, and screen rect
- move repeated descriptive data into shared per-shape definitions in the same scene JSON: shape code, display name, description, family, roof/editor/helper traits, and visibility tags
- keep sprite packing data separate from shape definitions so multiple frames can share one shape definition while still pointing at distinct packed atlas entries
- this reduces JSON duplication while keeping the client fully self-sufficient for filtering, inspection, and export operations

Phase 3 client/UI work:

- replace the current base-map tile surface plus overlay composition with one client-side scene renderer driven entirely by cached atlas plus scene JSON
- preserve inspect mode, but change click behavior so when inspect mode is enabled a clicked shape pins its tooltip in place until the same shape is clicked again or a different shape is selected
- ensure the pinned tooltip text remains selectable and copyable
- add an eye icon to the tooltip that hides the currently selected shape instance from the scene without deleting its metadata
- add a left-panel section that lists hidden shapes by name and ID and allows restoring each hidden shape to visibility
- add a button that exports the current hidden-shape instance list as JSON
- add one export button for each shape database CSV so the current catalog sources can be downloaded directly from the viewer workflow
- make the left column scroll independently from the map viewer
- make the left column horizontally resizable, with the renderer always filling the remaining viewport width and height

Phase 3 server/runtime work:

- separate cache warming from the web server process with a dedicated npm script such as `npm run build-cache` or similar
- optionally call that script during Docker initialization so containers can start warm without forcing atlas generation into the request-serving process
- on normal requests, serve cached atlas and scene artifacts when present; if an artifact is absent or invalid, regenerate just the required map data and then serve it
- keep the runtime response machine-friendly so the client can reconstruct scene state without server-rendered presentation assumptions
- completed: add a dedicated offline `npm run export-static` path that writes a fully static site bundle under `map_renderer/site`
- completed: make the browser runtime support both dynamic live-build mode and read-only static-file mode from one codebase
- completed: add a GitHub Pages deployment workflow that publishes the committed `map_renderer/site` artifacts without rebuilding from private source assets

-- add a production Docker build step that bakes the fully precached atlas images and scene JSON into the production image so the container can serve maps without the original `STATIC` source files present
- ensure the Docker build step excludes raw `STATIC` input sources from the final image layers: only the compiled/packed atlas outputs and scene JSON should be included in the production image
- keep the development image light and mount `STATIC` locally (or read from the workspace) so developers can iterate on source assets without rebuilding the image; the dev image should not precache by default

Open questions for phase 3:

- atlas artifacts stay strictly per-map for now
- prefer compact per-instance records plus shared shape-definition metadata in the JSON payload
- whether hidden-shape state should stay purely client-side for a session or also become part of URL/share state later
- keep the scene renderer DOM/canvas based for now

## Phase 4

Goal: add guarded catalog-editing tools for shape naming once the atlas-plus-scene-data pipeline is stable.

- completed: add a pinned-shape catalog editor UI that updates the usecode shape catalog CSV files from inside the map viewer workflow
- completed: keep catalog editing disabled in the default server mode so externally exposed viewers remain read-only
- completed: expose catalog editing only through dedicated admin npm targets instead of the default `start` or `dev` targets
- completed: make Phase 4 build directly on the Phase 3 scene data so edits operate on stable shape IDs and catalog-backed names instead of ad hoc tooltip text

Phase 4 implementation choice:

- prefer explicit opt-in server modes such as a dedicated admin/edit target over runtime query flags so editing capability cannot be enabled accidentally
- completed: the catalog write path validates CSV targets, preserves formatting conventions, and invalidates the cached scene set for the edited game so updates show up in newly generated atlas data
- the static export and GitHub Pages bundle stay read-only even after Phase 4 lands; catalog or entry editing remains dev/admin-only
- completed: provide a non-static admin mode that can edit the CSV-backed shape database fields used by the viewer: name, description, `roof`, `semitransparency`, and `OOB`
- completed: add an option to remove or hide the black surfaces that cover out-of-bounds areas with a dedicated UI toggle driven by the catalog `OOB` field

Current phase 4 status:

- the viewer now exposes catalog editing from the pinned inspect tooltip when the server is started in admin mode
- admin edits write directly to the local catalog CSV files, preserve the CSV structure, and force a fresh scene rebuild path on the next load
- editable fields currently cover shape name, description, roof status, transparency status, and black out-of-bounds surface status through the `OOB` catalog column
- static export and the normal dynamic server mode remain read-only
- the client keeps an internal catalog-edit history for the current browser session and supports `Ctrl+Z` undo with a notification that explains what was restored

Resolved decisions for phase 4:

- catalog edits write directly to the CSV files
- editing covers names, descriptions, roof status, transparency status, and black out-of-bounds surface status
- no authentication is added because writable endpoints only exist in explicit local admin mode

Phase 4 completion note:

- the planned Phase 4 catalog-editing and out-of-bounds visibility work is complete
- future editor enhancements beyond the current field set, history model, or undo behavior move to later phases unless new Phase 4 scope is added intentionally

## Phase 5

Goal: UX, editor, and documentation improvements to make the renderer easier to use and extend.

- improve the README with clear developer and export/deploy instructions, usage examples, and troubleshooting notes
- fix translucency handling so force fields render as semitransparent blue (investigate palette/flag mapping and per-shape translucency rules)
- make invisible-wall and helper geometry families render semitransparently by default so they remain legible while not fully occluding map content
- add a bounding-box display mode for shape instances to aid layout debugging and selection precision
- explore and add animation support for animated shape frames and animated overlays (server-side packing + client playback)
- improve tooltips to show richer inferred information about editor objects (catalog-based names, flags, linked NPC/map data, likely behavior)
- add a tabular viewer for the live CSV catalog data, including per-shape preview thumbnails, so catalog editing can happen through a denser browse-and-edit workflow
- integrate a usecode decompiler viewer as an optional part of the web app so the viewer can show linked usecode snippets for inspected objects (read-only in Pages/static builds; editable only in admin/dev mode)

Notes:
- keep all editing features opt-in and disabled in the default static/read-only deployment path
- prefer server-run admin modes or explicit npm targets for any feature that writes back to CSV or regenerates cached artifacts

