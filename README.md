# BAAABS

The official website for BAAABS—the Bad Ass Amazingly Awesome Black Sheep.

BAAABS is a towering, fire-eyed black sheep, a rooftop dance floor, who suffers from IBS yet still exudes queer joy all the way from Seattle, Washington.

The website is published with GitHub Pages at
<https://badassblacksheep.github.io/baaabs/>.

## Hard road-width requirement

The bus must drive from Washington with **no more than 102 inches / 2.5908 m total outside width** in road configuration. This is a project invariant. The retained configuration is the donor bus plus six station pairs and all attached fittings; deck/frame, panels, projecting panel supports, speakers and event equipment come off. The requirement cannot be replaced with an oversize-permit assumption.

The authoritative constraint is `site/assets/project-constraints.json`; contributor instructions are in `AGENTS.md`. The current v4 study **fails** at 104.87 inches across the stations alone, approximately 105.35 inches with mirrored docking pads. These are model dimensions; the 96-inch manufacturer exterior width and the model's added rub rails need reconciliation against field measurements.

`python3 tools/check-road-width.py --require-pass` rejects an overwidth or incomplete road configuration. `--write` regenerates the visibly labeled study report on all three design pages. Publishing a failing study is allowed; describing it as road-compliant is not. CI tests boundary cases, retained hardware and incomplete inventories, and checks the published report against the model files. Meeting this width check alone does not establish strength, field clearance or compliance with other road rules.

## Contributions

“Help Build BAAABS” offers one-time preset amounts and a custom amount at
hosted checkout, with private ownership, tax, and planned use-of-funds disclosures.
Checkout remains unavailable until verified payment links are configured.
See [CONTRIBUTIONS.md](CONTRIBUTIONS.md) for connection and verification steps.

## Model and responsive heroes

The interactive website uses assembly v24, with all-black exterior finishes,
translucent panels, animated flame eyes, and party-side speaker stacks
positioned between the wheel wells. Desktop and mobile hero images retain
the October 16, 2026 assembly v16.

The interactive viewer loads only when requested. Both viewing and downloading
use `site/assets/models/baaabs-panelized-v24.glb`. Eye animation respects
reduced-motion preferences and can be paused. The model-viewer 4.1.0 script
and its license are included in `site/assets/vendor/`.

The build section includes a perforated-metal reference photo and the proposed
aluminum-sheet specification with a planned black finish.

Local validation covered 390, 768, 1440 and 1920 px layouts, loading on demand,
mobile sizing, eye animation controls, and a failed-download fallback.

The panel workshop at `panels.html` indexes 206 named exterior sheets and links the panel schedule. Revision 12 removes vertex 7 from both broad head-side panels, accepting the small lower-edge mismatch. It retains the simplified head, extends both ears 25% front to back, and updates their dimensions. Revision 10 simplifies the head and corrects the remaining speaker rigging positions.

Revision 13 centers the ears front to back on the broad head sides, translating them 0.923 m aft without changing their size or height.

Revision 14 removes vertex 5 from H-D-001 and H-P-001. Their former vertex 6 becomes vertex 5; both broad side sheets are now pentagons.

Revision 15 removes vertex 3 from H-D-005 and H-P-005, leaving two simple triangles. All 207 panel outlines and connected planar caps pass the validity audit. Selecting or focusing a panel in the workshop briefly highlights only that panel orange, then restores its original black material. Model, spreadsheet and hero assets are refreshed.

Revision 16 widens the side skin around the speaker stations and generator platform and extends the rear closure around the lower poofer equipment. Equipment positions remain unchanged; the exhaust outlet follows its panel. All 207 panels remain flat and valid, with refreshed measurements and enclosure clearance checks. The mobile portrait workshop and orange focus highlight are retained.

Hovering over the model or a panel row highlights that sheet pink and shows only its name in a mouse tooltip. Clicking a panel or table row updates the Current panel table and details. Keyboard focus alone does not change the selection.

The Help Build section now links directly to the verified public BAAABS GoFundMe fundraiser. Donation amounts and payments are handled on GoFundMe; the former unconfigured Stripe controls are no longer displayed. See CONTRIBUTIONS.md.

The separate subframe layout study at `site/subframe.html` starts with sheep panels, head, and tall poofer masts hidden. Layer controls expose the donor chassis, deck and equipment for station planning. Its GLB retains v16 geometry and changes visibility/materials only. No new structural members or rated connections are implied.

Revision 20 uses exactly 206 panels: redundant crown returns removed, B-P-052 restored, entrance skirts reduced to triangles with one rectangular sill, and the three largest head panels subdivided. This revision introduced the v20 model and matching spreadsheet. Existing hero images and separate subframe studies retain their earlier versions.

Revision 21 raises the entrance panel tips and rectangular sill, exposing the front-right hoof while retaining exactly 206 panels. That update introduced the v21 model and matching spreadsheet. Current panel changes only when a panel or table row is clicked; hover shows a mouse tooltip containing only the panel name and retains the pink preview highlight. Camera drags do not change selection.

Revision 22 places B-P-065 exactly one inch below the modeled door bottom and joins the four adjoining triangular panels to its lower corners. The outer hem and exposed front-right hoof are preserved. That update introduced v22 with 206 panels; click selection and name-only hover tooltips are retained.

Revision 23 corrects three entrance seams while preserving the vertical door jamb, sill clearance and exposed passenger-front hoof. That update introduced v23 with 206 panels. The workshop adds numbered A/B vertices, highlighted edges, 3D and side-view angle measurements, coordinates, camera presets and 15-degree orbit steps. An audit of all 167 triangles flags 21 remaining surface-crossing pairs at body/head/collar junctions and the driver-front hoof for review; each pair can be loaded into the inspector. The audit thresholds and detailed findings are downloadable.

Workshop interaction checks: `node tests/workshop.cjs`. These exercise selection, name-only hover, drag suppression, vertex/edge comparison, camera controls and audit navigation against the shipped panel data; they do not replace a browser layout check.

Revision 24 merges 16 crown triangle pairs into 16 single flat quadrilaterals and splits 16 heavy side panels into equal-weight pieces, retaining 206 panels. B-P-061 becomes B-P-061/B-P-067 at approximately 8.25 lb each. New IDs retain source lineage; retired crown IDs remain searchable. The model and spreadsheet use v24. The expanded all-shape audit identifies 27 existing crossing pairs and no new junction pairs after matching changed IDs. The workshop offers an “Inspect lighter B-P-061” shortcut.

## Workshop framing

The panel workshop combines the v24 exterior (206 panels) with the six-station v4 subframe and removable roof deck framing. Six paired stations mean twelve uprights. Visibility controls reveal the frame alone or alongside the panels, bus, floor and equipment. Panel selection reveals hidden skin; hover remains name-only. The six-station layout is the first/default contender in the subframe study; `?layout=five` still opens the comparison.

`site/assets/models/baaabs-workshop-v24-six-station.glb` preserves v24 panel geometry and eye animation. It adds the study's 102 steel members and 12 mounting zones and replaces only 12 generic deck slabs and two generic chassis boxes with the study's plywood and C-channel references. The original v24 assembly download remains available. The framing retains its provisional sections and longitudinal station locations; this integration does not load-rate it.

Rebuild with `python3 tools/build-workshop-frame.py`. Check interactions with `node tests/workshop.cjs`, study defaults/switching with `node tests/subframe.cjs`, and weight arithmetic with `node --test tests/weight-budget.test.mjs`.

## Panel mounting concept 01

`site/panel-mounting.html` shows an assembled/exploded local bay using existing panels B-D-033/B-D-034 and exact C/D station positions. Orange steel outriggers carry a teal aluminum cassette on two lower seats, with four bolted flanges and isolation pads. The detail is provisional: no section, weld, fastener, local tube-wall, vehicle-motion or access design is approved. Existing workshop geometry is unchanged; the concept is linked from the workshop and subframe study.

Rebuild with Blender: `blender -b --python tools/build-panel-mounting.py`. The script exports three current concept GLBs, modeled mass assumptions and local QA renders under the parent project's `outputs/panel-mounting-v3/`. Test concept controls with `node tests/panel-mounting.cjs`. The skin remains 206 panels; this example groups two sheets without merging or renumbering them.

## Removable station mounts — concept 02

The preserved second concept uses v2 assets. Lower arms, braces, seats and outer retainers form removable brackets; upper arms detach separately. Three prepared locations per station use front/back pads, internal sleeves and captive nut cages with illustrative through-bolts, avoiding a rear holding wrench. The upper arm root is 80 mm below its outer attachment to avoid placing its sleeve at the existing D-brace node. Assembled, exploded and Arms removed views expose the two removal stages. V1 models and `tools/build-panel-mounting-v1.py` remain preserved.

That preserved stripped local model retains only station tubes, stationary pads/sleeves and existing frame references. It is not a whole-vehicle road configuration: the existing paired uprights are 105.36 inches wide before pads (105.83 with matching pads both sides), exceeding Washington's standard 102-inch width. The permanent station design must be revised to meet the hard 102-inch project requirement. No structural capacity or release access is established.

## Closer station fit — concept 03

The current v4 six-station study moves each side inward 6.2 mm, leaving a provisional 6 mm gap to modeled rub rails. The bare post width is 104.87 in; mirrored mounting pads reach 105.35 in. The 96-in nominal bus body and added rub-rail details are unmeasured reference geometry. Mounting concept v3 uses internal captive-nut cartridges with flush bus-facing sleeve ends, replacing the external rear nut cages and avoiding the old bolt/window interference. These are illustrative connections, not fabrication-ready or load-rated. Panel geometry remains at revision 24 / 206 panels.
