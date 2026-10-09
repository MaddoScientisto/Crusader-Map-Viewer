# Map Editing: Analysis and Roadmap

## Purpose

This document describes a path from the current map viewer to a general-purpose map editor. The first usable stage covers selecting and moving map shapes, deleting them, and placing new shapes. Later stages add configuration-aware editing for eggs, triggers, and other structured editor objects.

The editor should modify map instances, not the shared shape catalog. Catalog names and display metadata remain a separate data-editing concern.

## Current State

- The viewer renders cached atlas and scene data. A loaded scene also carries a cloned `mapSource`, which is the appropriate working model for edits that must appear in map-data exports.
- For `crusader-fixed-map-v1`, the browser's Map Binary download serializes `mapSource.items` as 16-byte records. Each record contains X/Y, Z, shape, frame, flags, quality, NPC number, map number, and `nextItem`. X and Y are stored at half the viewer coordinate scale. The export is a single map payload, not a complete `FIXED.DAT` archive.
- Scene JSON download (`viewer-scene-json`) includes render-oriented scene data and `mapSource`; it is useful for inspection and exchange, but is not currently a dedicated, validated editor-project format.
- `src/map-compiler.js` can split maps from `FIXED.DAT` and rebuild an archive into a separate output directory. It refuses to overwrite its input archive. This is an existing offline packaging path, not a browser archive-save workflow.
- The browser already has specialized teleporter and destination placement, teleport-ID editing, and monster-spawner controls. These mutate the current map source for supported fixed records and should be integrated with general editing history and validation.
- Shape-catalog administration edits CSV metadata, not map placements. The static export and GitHub Pages deployment are read-only; general map editing should follow the existing opt-in dynamic/admin boundary.
- Hiding a shape is a presentation preference, not deletion from map data.

## Design Analysis

### Authoritative Data

Treat `mapSource.items` as the editable record list and the rendered `scene.items` as a derived projection. A rendered scene may contain expanded or synthetic objects that do not correspond one-to-one with source records. Editing only a canvas sprite or scene item would therefore risk producing a visual change that the map export omits.

Existing fixed-map scene items can refer back to records through `mapSourceIndex`; current UI identity also uses that index. Deleting or reordering records can invalidate those references. The editor needs a stable per-instance identity for the editing session and a deliberate mapping back to source-record order before export.

### Glob-Expanded Items and Source Layers

`shape` and `frame` identify artwork; they do not identify where a placement is stored. A normal fixed-map item and a glob child can use the same shape/frame while having different source data and different edit/export behavior. Keep these concepts separate:

- **Source** describes provenance: `fixed` is a record in this map's fixed data; `glob` is an expanded child read from `GLOB.FLX`.
- **Kind** describes the renderer's classification, such as `terrain`, `egg`, or `editor`. Kind is not a storage layer. On map 34, all 48 glob children are terrain, while the 18 fixed items classify as 12 eggs and 6 editor items.
- **Shape/frame** describes which sprite is drawn. It does not say whether that sprite has an independent map record.

For Crusader maps, `loadGlobs()` reads `GLOB.FLX` as a Flex archive. Each non-empty entry starts with a little-endian 16-bit child count, followed by that many 6-byte descriptors: local X, local Y, local Z, 16-bit shape number, and frame. A fixed map record whose shape has TYPEFLAG family 3 uses its `quality` value as the GLOB archive entry index. `collectRenderItems()` expands those entries when glob expansion is enabled. The implementation and coordinate constants are in [`formats.js`](../src/lib/formats.js); the renderer loads the shared archive through [`build-manager.js`](../src/lib/build-manager.js).

Each descriptor is projected relative to its fixed parent. In the current implementation, child X and Y are the parent's 0x400-aligned coordinate plus the descriptor byte shifted left two bits plus 2; child Z is parent Z plus descriptor Z. The generated scene object carries the descriptor's shape and frame, inherits the parent's map number, and is marked `source: "glob"`. Its other fixed-record-looking fields are render-time defaults, not a serialized child record. It has no `mapSourceIndex`.

Map 34 makes the distinction concrete: the cached scene contains 18 fixed records and 48 expanded glob children (66 rendered items total). The floor shown as `0x023d frame 4` is one of those generated children, with `source: "glob"` and no fixed-record index. Its sprite is an ordinary shape; what differs is its placement provenance. There is no independent `0x023d frame 4` entry among map 34's 18 fixed records. The current Map Binary export writes only those fixed records as 16-byte records; changing the generated scene item alone would not survive export or reload.

This also explains why a general “layer” control needs a precise meaning. A selector can filter by source (`fixed` versus `glob`) or by display kind (`terrain`, `egg`, `editor`), but those are different views of the data. Hiding a layer should remain presentation-only. For selection and edits, a glob child needs provenance back to its parent fixed-record index, its GLOB entry index (`quality`), and its child ordinal; the current expanded scene item does not retain that full edit mapping.

There are two distinct edit scopes to consider:

- Moving the fixed parent changes its anchor, which moves the entire glob cluster generated from that parent. This is a group operation, not an independent move of one floor sprite.
- Editing one glob child means changing its descriptor. `GLOB.FLX` is shared game data, so directly changing an existing archive entry can affect every map and parent record that references it. A map-local copy-on-write approach could clone the entry, edit the clone, and point only the selected parent record at the new entry, but archive writing, entry allocation, reference limits, and round-trip behavior have not yet been validated.

The editor supports adding a new map instance of an existing GLOB entry. It creates a family-3 fixed parent record with `quality` set to the chosen archive entry index; it does not modify `GLOB.FLX` or any child descriptor. The parent egg is placed at Z=0 at the last even X/Y coordinate (`0x3fe`) within the selected `0x400`-unit block, matching existing glob eggs. Child expansion masks the parent back to the block origin; group movement shifts by whole blocks and preserves the egg's low coordinate bits. Existing children remain group-selected and group-moved through their parent, not independently editable or exportable.

Flattening children into ordinary fixed records is another possible design, but should not be assumed equivalent: it changes the map's stored representation and needs in-game and parser validation before becoming an export strategy. Direct child-descriptor editing and GLOB archive export remain disabled until a safe representation is selected and tested.

### Record Preservation and Validation

The current fixed-map record is 16 bytes. Moving an instance should change only its coordinates; untouched fields must round-trip unchanged. Adding a generic shape requires valid shape/frame and coordinates plus explicit defaults for the remaining record fields. Coordinates must respect the source format's scale and range.

`nextItem` and other relationship-bearing fields must not be treated as ordinary decoration metadata. Confirm their meaning and any index/link invariants before allowing reorder, delete, or object creation that could invalidate them. Until validation exists for a structured object type, preserve its opaque fields and restrict operations that could corrupt its relationships.

### Export Boundary

Reuse the existing Map Binary download for the edited per-map record payload; do not add a competing map export. Verify the download serializes the edited working copy and can be parsed back with the existing record decoder. Keep Scene JSON as a separate scene/project-oriented export, and label its role clearly if it becomes an editable project format.

Full `FIXED.DAT` rebuilding remains a separate packaging step through the existing map compiler unless a later milestone explicitly brings that workflow into the app. Never write edited bytes back over source game assets by default. PSX scene data currently marks binary export unsupported and needs a separately researched format before it can join the same editing/export path.

## Roadmap

### Stage 1: Core Shape Editing

Deliver the requested basic editing workflow for supported map instances:

The complete Edit Mode interaction described in this stage is Stage 1 scope: selection and the XYZ gizmo, snap controls, the Z=0 floor grid and height indicator, the shape browser, pointer-follow placement, and bounding-box-top placement are all included. None of these UI behaviors is deferred to a later stage.

- Add an Edit Mode button to the sidebar. When disabled, map gestures retain their current pan, inspect, and zoom behavior; when enabled, clicking a source-backed shape selects it. Support single and multiple selection, visible selection feedback, predictable deselection, and keyboard behavior.
- Show a translation gizmo on the selected shape or selection group, with screen-projected X, Y, and Z axis arrows. Dragging an axis handle moves the selection only along that world axis. Preserve relative offsets for multi-selection moves and keep ordinary viewport panning available away from gizmo handles.
- Add a floating toolbar at the bottom of the editor view while Edit Mode is active. Include a Grid Snap toggle and a grid-size dropdown; snapping applies consistently to gizmo movement and new-shape placement, and the size control is disabled when snapping is off.
- Include a World Floor Grid toggle in that toolbar. When enabled, render a world-coordinate grid at Z=0 and a colored height indicator from each selected shape's center to its projection on the floor so elevation is legible.
- Delete selected instances with undo. Confirm destructive operations when selection contains records whose relationship safety is not yet established.
- Add an Add button to the floating toolbar. In Fixed records mode it opens the shape browser; in Glob terrain mode it opens a grid of composed previews for the selected game's GLOB entries. Selecting a glob starts placement at Z=0, snaps its parent origin to `0x400`-unit blocks, and displays the expanded children as a pointer-following preview. Clicking commits a family-3 parent record that references the selected entry; Escape cancels.
- While placing, resolve the preview position from the cursor's world X/Y and the top of the bounding box of the source-backed shape under the cursor. If no shape is under the cursor, use the Z=0 floor. Show the resolved placement preview; a left click commits the instance and Escape cancels placement.
- Initialize every field in a new source record explicitly and validate before accepting it. Preserve the selected shape and frame identity in the added record.
- Track dirty state and provide undo/redo for move, add, and delete operations. Keep edits in a working copy; changing maps or reloading must not silently discard dirty edits.
- Route all edits through the canonical map-source model, refresh derived scene items and indices, then render the updated map.
- Make the existing Map Binary download export the edited record list. Preserve the existing Scene JSON download and document that it is not the full archive format.
- Keep the capability opt-in in a local dynamic/admin workflow. Static/Pages builds remain read-only.

For the initial release, ordinary fixed-map source records are fully editable. A classified complex object may be moved only if its opaque fields remain intact; gate deletion or generic creation of linked/configured objects until the relevant integrity rules are known. Renderer-only overlays cannot be exported as map records. Glob-expanded children are not renderer-only artwork: they are authored descriptors in a shared archive, but are not independent fixed-map records; use the glob analysis above before enabling their edits.

**Acceptance checks:** select and move shapes independently along X, Y, and Z; verify multi-selection offsets; test snap on/off and multiple grid sizes; toggle the Z=0 grid and verify height indicators; place a shape on another shape's bounding-box top and over empty floor; cancel placement; place a glob from the preview grid and verify its family-3 parent record uses the selected `quality` index, Z=0, and `0x3fe` low bits while its children remain rooted at the `0x400`-aligned origin; confirm its children render and undo/redo restores the whole group; add and delete a shape and verify export record counts; decode the exported payload and confirm unchanged fields survive byte-for-byte; verify unsupported formats and read-only deployments cannot enter edit mode.

### Stage 2: Structured Editor Objects

Build on the general editing model to edit objects whose meaning depends on record configuration:

- Consolidate existing teleporter/destination placement and teleport-ID editing with selection, dirty state, undo/redo, and export validation.
- Add structured forms and placement workflows for supported egg families and triggers. Validate IDs, paired endpoints, activation settings, usecode references, map destinations, and any object-specific field encoding before committing an edit.
- Show links between related objects and explain validation failures at both the object and map level.
- Keep unknown object data intact; do not normalize or discard fields that the editor does not understand.

**Acceptance checks:** representative object configurations round-trip through decode/edit/export/decode, invalid or duplicate links are reported, and undo restores the complete prior record and relationship state.

### Stage 3: Persistent Editing Projects and Broader Format Coverage

- Define a versioned editable-project format if Scene JSON is not a suitable stable interchange format. Preserve source game/version, map identity, original record identity, edits, and format provenance.
- Support reopening an exported project and reconciling it with the source map. Detect stale or mismatched source data instead of silently applying changes to a different map revision.
- Decide whether to expose full archive rebuild in the app or continue handing the edited map payload to the existing map-compiler workflow. Any archive output must be written to a new destination and validated before use.
- Research PSX map record families and export semantics independently; do not enable binary editing based only on visual-scene compatibility.
- Add map-level validation summaries for malformed records, broken links, duplicate IDs, out-of-range coordinates, and unsupported object types.

### Stage 4: Advanced Authoring and Validation

- Add optional alignment guides, copy/paste, and bulk operations after Stage 1 selection and history behavior is stable.
- Expand structured editing only for object families with verified field semantics and round-trip tests.
- Add comparison/preview workflows for edited versus source maps and a final export validation report.
- Keep editing capabilities and write endpoints disabled in static deployments.

## Later Research Note: Arbitrary Map-Data Loading

Investigate whether Crusader has an undocumented mechanism for loading map data from arbitrary locations, analogous to the custom-usecode feature. This is an open research question, not an assumed game capability. Trace executable file-loading and map-selection paths, compare them with the custom-usecode lookup behavior, identify supported game/version constraints, and test only with a separate game-data copy. Record whether the mechanism can load a standalone map payload, a replacement archive, or neither; do not make editor delivery depend on this finding.

## Implementation Readiness Checklist

- Confirm `nextItem` semantics and any other map-record references before enabling destructive edits on linked objects.
- Establish stable instance IDs that survive in-session insertions and deletions while retaining a reliable source-record mapping.
- Define safe defaults and supported shape/frame selection rules for generic new instances; verify bounding-box dimensions and top-surface placement coordinates for representative shapes.
- Define world-axis gizmo projection and hit testing, snap-size units, and how the Z=0 floor grid maps to viewer coordinates.
- Trace uses of each GLOB entry across maps and validate a non-destructive copy-on-write or flattening strategy before adding glob-child edits or GLOB archive export.
- Specify dirty-state handling, undo/redo boundaries, and behavior on map switch/reload.
- Add focused record-codec round-trip tests and UI tests for selection, transform, add, delete, and export.
- Verify edited exports against the existing decoder and, where appropriate, rebuild only to a new `FIXED.DAT` output for in-game testing.