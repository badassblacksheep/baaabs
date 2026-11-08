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

## Site typography

Reserve Smooth Circulars for the BAAABS wordmark, BAAABS word art (including the words that spell out the acronym), and the standalone names `BAAABS` and `BAAAHS`. Both names have first-class status in site typography. Match either name as a whole word regardless of capitalization, including next to punctuation, and preserve its written case. In sentences, headings, captions, buttons, and navigation labels, style only the name itself. Use the site’s regular typography for the surrounding text and the hero tagline.

## Provisional exterior skin material (2026-11-08)

**Penciled in, not purchased or fabrication-approved:** McNICHOLS 20-gauge perforated carbon/mild-steel sheet, nominal 0.0359 in (0.91 mm) thick, with 1/8 in round holes on 3/16 in staggered centers (approximately 40% open area). Supplier: McNICHOLS, Fife, Washington. Reference pattern: https://www.mcnichols.com/perforated-metal/round-hole/carbon-steel-cs-16183122 (verify the exact 20-gauge SKU and availability before ordering; linked listing may be a different gauge).

Use this as the **working estimate for all 206 nonstructural exterior panels**, not for the roof, chassis supports, guardrails, or load-bearing components. Approximate bare sheet weight: 0.88 lb/ft² of gross sheet area at 40% open area; excludes edging, frames, mounts, coating, and offcuts. Actual weight depends on mill thickness and perforation pattern. Confirm final area and nesting before budgeting or ordering.

**Required next steps:** request 20-gauge sample and quote; test a representative large panel with its real perimeter support and mounting method for oil-canning, vibration, fatigue, fastener tear-out, sharp edges, corrosion protection, highway wind and thermal exposure near poofers. Do not treat this tentative choice as a verified specification or purchase order.
