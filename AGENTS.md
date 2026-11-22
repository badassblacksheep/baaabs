# BAAABS design invariants

- The bus must be able to drive from Washington with its road configuration at or below **102 inches (2.5908 m) total outside width**. This is a hard project requirement, not an optional target. Do not substitute an oversize permit for compliance or relax this requirement without an explicit user change.
- Road configuration means the donor bus plus all permanent supports and every bracket, pad, fastener, cap or other fitting left attached. The current v5 study has six paired stations; station count is a design variable. The roof deck/frame, sheep skin, speakers and projecting panel support assemblies are removed. Any other part left on the bus must be added to the road inventory and measured.
- Count actual outermost retained geometry, including fastener heads, installation clearance and tolerances. Do not infer compliance from station center spacing, the event assembly, nominal bus width or appearance. OEM mirrors have the statutory exception; do not invent exemptions for added structure.
- The authoritative requirement is `site/assets/project-constraints.json`. Run `python3 tools/check-road-width.py --require-pass` before describing or accepting a configuration as meeting the road-width requirement. A passing width check does not establish structural capacity or compliance with other road requirements.
- Explicitly labeled noncompliant studies may be published while the design is in progress. Their failure status must remain visible; regenerate the shared status with `python3 tools/check-road-width.py --write` and run `python3 -m unittest discover -s tests -p 'test_road_width.py'`.
- Current v5 2×6-inch stations are a noncompliant study. Resolve donor exterior/rub-rail measurements and permanent station design; do not hide the width problem by omitting retained hardware, squeezing the bus reference, or downsizing structural sections without analysis.
- The lightweight comparison brief is `site/assets/frame-design-brief.json`: 20 people at 225 lb each, dancing while moving up to 5 mph; preserve current deck footprint/height, 206 panels, removable event assemblies and the 102-inch road envelope. Donor measurements are deferred, not confirmed. Compare optimized six-station and four-station longitudinal-truss concepts; neither is selected or load-rated. Clearly distinguish reference mass, hypothetical weight budgets and engineered results.
- The supplementary interior study is `site/assets/interior-support-study.json`: compare three and four individual cabin posts, not paired portals. BAAAHS post locations and capacity are unknown. Preserve the shared brief; candidate drawings are schematic, with no final sections, mass, capacity or verified road envelope.

- Prefer mirrored, equal-area cuts when dividing large panels. Allocate splits to matching driver and passenger panels together.

## Structural work on Earl

Start structural work by reading [Earl’s structural tracker](https://baaabs.org/structural/) (`site/structural/index.html`). Use it for the current roof-frame layout, survey deliverables, engineering decisions and fabrication status. Older studies provide comparison history. When measurements, drawings or decisions change, update the relevant row and dated progress entry, link the supporting evidence, and identify assumptions explicitly. Only record a fabrication release against the reviewed drawing revision and its scope.

The [interactive structural report](site/structural/index.html) is iteration 06, dated 2026-11-14. [Iteration 02](site/structural/iteration-02.html) preserves the previous shoring study. The owner explicitly approved a **38 × 8 ft roof deck**, replacing the previous 36 × 8 ft footprint invariant. Extend 2 ft forward from the iteration 01 deck so the front corner post centerlines lie about 3.46 in behind the front floor edge and the edge girders bear over them. Current analytical geometry and assumptions are in [iteration-02-design.json](site/structural/iteration-02-design.json). The dimensions and approval reason also live in `site/assets/frame-design-brief.json`. The displayed/downloadable workshop model applies this revision in `site/assets/rear-roof-frame-preview.js`; the source GLB and Blender master remain iteration 01 extraction references. Preserve the runtime transformation when changing the model pipeline, or bake it into a new source and update its revision metadata. Iteration 03 adds two orange conceptual shores and provisional bearing/landing pads to this runtime model. The 70 mm display struts and pad sizes are illustrative; selected sections, mass and body landings await survey.

For iteration 02, assume both rear corners transfer gravity through Earl's rear chassis drop-frame into the rails, with the same analytical portal/sill sections and fixed rail-seat restraint as the front corners. This is an owner-authorized modeling assumption with unmeasured real stiffness and capacity. Add one compression-only vertical shore beneath each longitudinal edge girder halfway between the interior bearers. Its effective stiffness includes the prop, bearings, Thomas structural body and body-to-chassis path. The report compares assumed stiffnesses and shows reactions. Use those forces to develop landing details and verify the load path. No operating occupancy has been established.

Preserve each structural iteration's report, load data and downloadable solver when adding a successor. Keep [iteration 01](site/structural/baseline.html), its 36 × 8 ft geometry and its original results available through the report navigation. Update the current tab, dated findings, survey tracker and this note together. Read the assumptions before using the displayed values.

Iteration 03 answers the owner’s conceptual headcount comparison, expressly subject to change after surveying Earl Thomas. It uses 225 lb/person, a selected 2× live-load sensitivity and a 0.60 × 345 = 207 MPa normal-stress ceiling, with 5,000 lbf/in effective stiffness per compression-only shore. The resulting stress-screen ceilings are 7 / 10 / 13 people for ⅛ / 3/16 / ¼-inch effective walls. These are not released admission limits, and 2× is not a proven bound on rhythmic forces. Deflection/vibration acceptance, full strength and stability checks, connections and landing capacity remain unresolved. Do not label these counts safe, certified or code-compliant. Preserve the stated assumptions with every displayed ceiling.

Present a broad-audience interactive summary and findings first, followed by the full equations, input tables, governing cases, sensitivity, scoring rules and reproducible source. Green/yellow/red describes stress-screen reserve only; the score compares stress reserve and frame/plywood weight. It is not a probability of safety. Only recommend a conceptual option as clearing the stress screen when its demand meets the criterion. The original 01 and 02 reports, JSON datasets and solver archives must remain available.

## Site typography

Reserve Smooth Circulars for the BAAABS wordmark, BAAABS word art (including the words that spell out the acronym), and the standalone names `BAAABS` and `BAAAHS`. Both names have first-class status in site typography. Match either name as a whole word regardless of capitalization, including next to punctuation, and preserve its written case. In sentences, headings, captions, buttons, and navigation labels, style only the name itself. Use the site’s regular typography for the surrounding text and the hero tagline.

## Provisional exterior skin material (2026-11-08)

**Penciled in, not purchased or fabrication-approved:** McNICHOLS 20-gauge perforated carbon/mild-steel sheet, nominal 0.0359 in (0.91 mm) thick, with 1/8 in round holes on 3/16 in staggered centers (approximately 40% open area). Supplier: McNICHOLS, Fife, Washington. Reference pattern: https://www.mcnichols.com/perforated-metal/round-hole/carbon-steel-cs-16183122 (verify the exact 20-gauge SKU and availability before ordering; linked listing may be a different gauge).

Use this as the **working estimate for all 206 nonstructural exterior panels**, not for the roof, chassis supports, guardrails, or load-bearing components. Approximate bare sheet weight: 0.88 lb/ft² of gross sheet area at 40% open area; excludes edging, frames, mounts, coating, and offcuts. Actual weight depends on mill thickness and perforation pattern. Confirm final area and nesting before budgeting or ordering.

**Required next steps:** request 20-gauge sample and quote; test a representative large panel with its real perimeter support and mounting method for oil-canning, vibration, fatigue, fastener tear-out, sharp edges, corrosion protection, highway wind and thermal exposure near poofers. Do not treat this tentative choice as a verified specification or purchase order.

## Panel pages and mass baseline

The interactive workshop is `site/the_build.html` (public /the_build.html). The material/weight/procurement study is `site/panels.html` (public /panels.html). Keep navigation consistent. The current DJ-booth register contains 206 panel IDs and 206 detachable sheet pieces, with 183.328712 m² net area. At 40% open, estimated bare skin is 1,048 lb for 0.063-in aluminum and 1,736 lb for 20-ga steel. Do not describe 20-ga steel as lighter than the prior aluminum assumption. Material is provisional.

### DJ booth and driver-side skin

The six-sided opening is centered between the party-side speaker arrays. Its side projection measures 1.72 × 0.59 m (about 68 × 23 in). Leave the closed factory windows and side exit in place. Check DJ eye height, adjacent window posts and exit swing on Earl before fabrication. B-D-033 sits above the glass.

Flat storage and convexity are hard requirements for every detachable skin panel. Each panel uses one plane through its entire installed surface and its cut pattern. Count three or four physical perimeter corners in the usual case and five or six where needed. Keep all six original hoof plates, the six-sided DJ aperture, the passenger-side circular opening and the two eye sockets. The original marked bends are seams between separate sheets wherever both sides are retained.

Aim for 206 physical panels. First simplify seams between coplanar pieces and redistribute oversized patterns. Where count pressure persists, favor omitting matching pairs of top-facing crown skins with low crowd visibility. The count may change if necessary to preserve flat storage and convexity. Keep the 119 × 59 in working envelope on 120 × 60 in stock and publish the estimates with edging and fittings. Confirm finished handling on Earl.

In the current 206-panel layout, both sides omit body roof crowns 01, 02, 04, 05 and 07. Keep the roof deck and frame independent of that removable skin. B-D-031 absorbs the former upper fan, including B-D-089. B-D-085 is the flat tapered strip beside the window. The final result records 139 triangles, 58 quadrilaterals, 7 pentagons and 2 hexagons.

Use `reference/panels/earl-before-dj.json` as the immutable source for the pre-booth panels. The aperture definition is in `tools/dj_booth.py` and the 206-piece seam plan is `tools/earl-panel-seams.json`. Run `python3 tools/build-dj-register.py` to regenerate the model layout, cut register, workshop and handling totals. Verify with `--check`. Publish the physical register and operator/crowd views at [the panel workshop](https://baaabs.org/the_build.html#dj-booth). The structural reports retain the loads assumed for each analysis.

## Future BAAABS launch-party fundraiser (planning only)

We intend to explore a Seattle launch party that blends queer nightlife, Burner culture, and the broader arts community. The event should introduce BAAABS to audiences beyond existing circles and raise money for construction. No date, venue, or booking is confirmed; do not advertise it as scheduled.

The working checklist and source of truth for event planning is [BAAABS Launch Party — Checklist](https://docs.google.com/spreadsheets/d/1BAVp-JZbJpvkJ2p4vI2laHVVlUEH3ITbwHsXk8UQkss/edit), in the BAAABS Google Drive. Keep scope minimal: validate venue/co-host economics, budget, performers, ticketing, promotion, reveal, and closeout before adding production extras. Planning targets (not commitments): 100+ paid attendees and $1,500+ net proceeds.


## Structural iteration 04 (2026-11-15)

Preserve [iteration 03](site/structural/iteration-03.html), its original data/source and frozen `rear-roof-frame-preview-03.js`. Iteration 04 is the archived finite frame/shoring search. Owner priority: 20 people if possible, no cabin intrusions; eight was only the minimum threshold for considering removal of cabin uprights. Protecting cabin occupants remains a hard design requirement.

The selected conceptual model is `grid6-3-3.175-c0-portal`: 38 × 8 ft, 6 × 2-inch edge girders, 4 × 2-inch joists at no more than 24-inch intervals, nominal ⅛-inch roof walls, ¼-inch front/rear portal-sill walls, other portal walls assumed 3/16 inch, no cabin uprights or their dedicated transverse bearers, and three transverse shore pairs. Coordinates are evenly spaced between existing front/rear portals, not surveyed OEM bow stations. HDX literature establishes architecture only. Rear drop-frame load transfer remains assumed. `site/assets/structural-models-04.json` defines all three shore-count models; the workshop/homepage runtime uses the selected three-pair model. Source GLB and Blender remain provenance references; preserve the transformation.

Default screen: 225 lbf/person × 2, 207 MPa normal-stress ceiling, 5,000 lbf/in per independent compression-only body path, and 2,311.25 lb hanging skins (1,849 × 1.25). At 20 people selected stress 168.00 MPa, deck drop 1.115 in, peak shore force 5,006 lbf, score 95.1. Three-pair roofs have 25-person stress-screen ceilings for all three walls; these are NOT admission limits. Soft body support, one shore lost, a pair lost and 3× live-load sensitivity exceed the criterion. No body capacity, accidental-load robustness, dynamic suitability or cabin occupant protection is released. Never call this safe or fabricate from the display.

Use the interactive lay summary first, then the equations, full input basis, sensitivity, ranking and reproducible source. The color and score describe only the chosen stress/reserve and weight comparison. Catalog A500 properties and nominal mass are used where available. Fixed portal wall, added shore mass, panel allowance and design-wall treatment changed from iteration 03; do not compare the old and new numbers as a pure shore-count change.

Next authorized work: finish/preserve iteration 04, then report iteration 05 separately. Study the dancefloor and mutation as one system, preserving the 38 × 8 ft deck, finished sheep form and 206-panel register, while considering shared versus separate structural load paths, hanging-panel mass and failure tolerance. Keep the 20-person goal and cabin protection explicit.


## Structural iteration 05 — accessible shared structure (2026-11-14 Pacific)

Read `site/structural/iteration-05.html`, `iteration-05-data.json` and `site/assets/structural-models-05.json`. Iteration 04 and its runtime are frozen as `iteration-04.html` and `rear-roof-frame-preview-04.js`. The workshop/homepage now show the 05 exploratory accessible end-truss, using `structural-preview-05.js`; the original GLB and Blender remain unchanged provenance.

Owner constraint: retain accessible crawl-space service storage for lighting controllers, sound controllers, cables and small organized totes, nothing very heavy. Do not fill access with truss diagonals or require a loaded brace to be removed. Two permanent side openings, roughly 50.5 × 25.5 inches, use reinforced jambs. Reserve a central 24-inch service strip; the nominal local height above raised transverse ties is 22.6 inches. Tray layout, actual equipment weight, loaded clearances, ventilation and restraint require measurement. Default 250 lb is an explicit planning placeholder, not a rated payload.

The 38 × 8 ft deck, height, sheep shape and 206-panel register remain constraints. The 05 beam study has 0 cabin posts and 0 body shores, 0.8 m-deep side trusses, raised ties at z=3.21 m, 6×2×1/8 top chords, 6×2×3/16 lower chords, 4×2×1/8 opening jambs and strengthened trial end portals. Both rear chassis connections and all feet remain assumed. Skins are nonstructural; use verified nodes for future removable hangers, with no unearned mass/stiffness credit.

This is a preferred direction for engineering layout, not a final selection, fabrication release or established occupancy. The 2× / 207 MPa stress screen omits buckling, connection/local loads, dynamics and vehicle/cabin protection; the 3× sensitivity fails. End forces/hold-downs are now major design drivers. Reject the earlier 0.9 m trial's bottom-level transverse ties: they intersect the model roof. Do not substitute those unmodified ties for the raised access-preserving layout. All trial inputs and results are in `iteration-05-source.zip`.

## Structural iteration 05a — visual explanation (2026-11-14 Pacific)

The owner requested iteration-05 data in iteration-03's lay-facing interactive style, as an additional tab. `site/structural/iteration-05a.html` is that companion view; `iteration-05.html` preserves the original 05 report; `index.html` is now 06. Preserve both. `tools/build-structural05a.py` regenerates the page, member-to-material mapping and seven-tab navigation. The 05 dataset and geometry are unchanged.

Only directly calculated 8/12/20-person and 0/250/500/1000-lb gear combinations are selectable. Comparison cards use full skins and zero service gear for all three concepts. The separate assumption explorer is fixed at 20 people and 250 lb. Do not interpolate a final-truss headcount ceiling or label 2×/3× as particular dancing behaviors. Color is stress demand divided by 207 MPa: green ≤80%, yellow >80% through 100%, red >100%; no color establishes safety.

The exact accessible truss has not been analyzed with supplemental body shores. The shored alternative shown in 05a is the earlier lighter 0.6004 m truss, without the permanent access bays. Do not imply that toggling the diagram adds shores to the current truss. Thomas body stiffness and capacity remain unknown; no added-deck rating follows from the newer HDX brochure.

The explicit provisional frame material basis is ASTM A500 Grade C carbon-steel HSS, consistent with the existing assumed 345 MPa yield, E=200 GPa and density 7850 kg/m³. The nominal walls and original outside dimensions are mapped for every analytical member in `iteration-05a-materials.json`. Inherited 45/65/38/~52 mm members remain modeled sizes with unresolved stock selection; do not silently substitute nearby stock. Main sections: upper chords 6×2×1/8, lower chords 6×2×3/16, joists/access jambs 4×2×1/8, other side-truss members/ties 2×2×1/8, main end posts 4×4×1/4, sills 8×3×1/4 inches. Nominal procurement walls differ from the 0.93 design-wall basis. No fabrication BOM or material purchase approval is implied.


## Structural iteration 06 — full truss with six shores (2026-11-14 Pacific)

This supersedes the iteration-05 access-opening constraint and the earlier no-body-support preference. The owner selected three equally spaced transverse pairs of shores, ordinary complete side-truss triangulation, and preserved deck/crawl-space height. Keep the 38×8 ft deck, sheep geometry, 206 panels, light service storage and zero added cabin posts. Do not remove a structural diagonal to retrieve gear.

Current report: `site/structural/index.html`. Inputs/results: `iteration-06-data.json`, `iteration-06-materials.json`, `iteration-06-source.zip`; exact geometry: `site/assets/structural-models-06.json`. Homepage/workshop use `structural-preview-06.js`. `tools/bake-structural06.mjs` bakes that same transformation for download/import and the test-drive game during deployment. Game renderer supports GLB matrix nodes. Preserve archived 05 and 05a with their own 05 runtime/data.

Literature-informed guess: 115 inches (4×28.75-inch modules) between pairs, centered between x=-6.27 and 4.81355 m portals. Pair x=-3.649225, -0.728225, 2.192775 m; y=±1.1692 m; springs at lower-chord nodes z=3.0604 m. Body landing z=2.787072 m is unsurveyed. Earl's photographed label is body 79765-0538548-130YS, built 11-2005, chassis model year 2007. Thomas drawing 260635 (2006) is another 130YS order; it flags a false rafter. Neither literature nor photos prove any landing capacity. Identify real full bows on both sides and trace the complete body-to-chassis path. No roof-sheet-only support.

Full side trusses remain 0.8 m deep with raised ties at z=3.21 m. Materials are A500 Grade C HSS: 6×2×1/8 upper chords, 6×2×3/16 lower chords, 4×2×1/8 joists, 2×2×1/8 truss webs/verticals/ties, 4×4×1/4 portal posts, 8×3×1/4 sills. Shores: 3×3×1/8 with illustrative 3/4-inch A36 plates; saddle details unverified. Inherited metric portal/plan brace sections remain explicitly unresolved stock. Complete material mapping is published.

At 20 people, full skins, 250 lb service gear and 2× equivalent people force: 150.44766 MPa, 0.44847 in deck drop, 1,928.76 lbf peak shore, 6,986.88 lbf peak absolute rail-seat force, frame/floor/supports 4,796.56 lb. k=5,000 lbf/in per shore is an assumption for the entire body path. No body-support credit: 184.65 MPa / 0.65083 in. 3× force: 209.29 MPa, above the 207 MPa chosen screen. These are static sensitivities, not dance behavior categories or occupancy ratings. Lost-shore cases remove support before loading; no sudden-loss dynamics/collapse simulation. All joints, buckling, body/chassis strength, loaded clearances, vehicle dynamics and cabin protection remain open.


## Animated eyes and comedic intent (2026-11-16)

**BAAABS always follows mischief with cute. Any infernal effect must execute as comedy and convey no malice.** Treat this as a design tenet across the model, physical VFX, site, and show cues. Fire is theatrical mischief; the immediate innocent response is the punchline. Never present the infernal reveal as hostility toward the audience.

`site/eyes.html` is the expression close-up; `site/assets/baaabs-eye-vfx-brief.md` is the VFX handoff. Current homepage, workshop and iteration-06 model use `earl-animated-eyes.glb`, generated from the unchanged source by `python3 tools/build-animated-eyes.py` (NumPy required). Run it before `tools/bake-structural06.mjs`. Preserve the 206 panels, eye sockets, ears/temple fixes and current iteration-06 structural transformation; archived structural models stay unchanged.

Owner-selected order and holds: **Ovine Sauron 16 s → Ovine rainbow 8 s → Vegeta 8 s → Sauron 16 s → Otaku 8 s → repeat**. Native glTF clip names retain Ovine / Rainbow / Anime / Sauron / Otaku for compatibility; the cycle is 56 seconds. Both infernal looks hold twice as long. Ovine inferno always lands on rainbow, and Sauron always lands on ^_^, with a blink as the comedic cut.

The owner approved this fire treatment on 2026-11-16. Revision 3 fire uses a dark, charred iris and narrow incandescent pupil edge, with turbulent eruption fronts propagating from iris to shell; no rotating pinwheel or uniform glowing disk. `tools/infernal_eyes.py` shares deterministic radial advection with the GLB and `tools/export-eye-vfx.py`. The native texture loop is 128 frames at 24 fps (5⅓ s), repeated three times per 16-second hold. Preserve STEP sampling in the game. Only Ovine Sauron has the mirrored 10° comic cant (\ / in front view, gently angled); bowls stay in place. The owner reverted canting on Ovine rainbow: its pupils remain level (— —). Do not reintroduce a naturalistic ovine tilt or expand the VFX scope. Rainbow's texture and fixed horizontal pupil are retained. All other looks use warm colors. Vegeta irises remain clipped inside the whites for the full gaze range. Otaku uses an actual Menlo-Bold ^ glyph.

The GLB and motion masters are art-direction references. Production projection needs the actual bowl geometry, projector/lens placement, viewing orientation, color calibration and a physical warp test. Never describe the model's UVs as an already-calibrated projector output.


### Current eye study — revision 4 (2026-11-16)

The owner selected **Ovine Sauron only for now**, superseding the live five-look sequence. Keep every other expression and the archived five-look show in the source and native GLB clips for later. `BAAABS | Eye cycle` now plays the 16-second solo ovine study everywhere, including the game. The original comedic design tenet remains; this temporary solo study does not erase it.

Replace deep bowls with shallow spherical caps: unchanged aperture centers/planes, 0.6371 m (~25.08 in) diameter, 0.0889 m (3.5 in) sagitta. All eye graphics follow the new surface; these are prototype geometry, not fabrication or optical calibration drawings. Preserve the approved Backdraft as the first of three related outward ripple treatments: Backdraft → Double crest → Rolling bloom → repeat. Each occupies 128 frames at 24 fps with a short smooth transition; full loop 384 frames/16 s. Each section has two pulses, so the right eye leads by **16 frames / 2/3 s / one quarter pulse**, like sine and cosine. Do not confuse this with a quarter of the whole 16-second show. Keep ovine Sauron's comic cant, rainbow level, all other looks intact and inactive.


### Eye suite revision 5 — Hypnotoad and selectors (2026-11-16)

Hypnotoad is an additional selectable native clip (`BAAABS | Hypnotoad`), with a 48-frame/24-fps seamless procedural redraw at 512×512; reference and source live in `tools/hypnotoad_eyes.py`. Match the original mustard-gold field, red/yellow bands and irregular horizontal pupils, with differing left/right shapes. Do not substitute a spiral. Exporter supports larger native renders. No show footage or audio is bundled.

Preserve Ovine Sauron as the default, all six individual expressions, and the unchanged archived five-look cue sheet. Homepage, eye lab and workshop selectors share `animated-eyes.js`. Native selection must switch without crossfade, retain pause/reduced-motion behavior and survive a model reload. Homepage controls live below the separate model viewport at widths ≤1000px; no phone playback controls overlay the canvas.
