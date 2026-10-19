# BAAABS

The official website for BAAABS—the Bad Ass Amazingly Awesome Black Sheep.

BAAABS is a towering, fire-eyed black sheep, a rooftop dance floor, who suffers from IBS yet still exudes queer joy all the way from Seattle, Washington.

The website is published with GitHub Pages at
<https://badassblacksheep.github.io/baaabs/>.

## Contributions

“Help Build BAAABS” offers one-time preset amounts and a custom amount at
hosted checkout, with private ownership, tax, and planned use-of-funds disclosures.
Checkout remains unavailable until verified payment links are configured.
See [CONTRIBUTIONS.md](CONTRIBUTIONS.md) for connection and verification steps.

## Model and responsive heroes

The website uses the October 16, 2026 assembly v16, with all-black exterior
finishes, translucent panels, animated flame eyes, and party-side speaker
stacks positioned between the wheel wells. Desktop and mobile hero images
are rendered from the same model.

The interactive viewer loads only when requested. Both viewing and downloading
use `site/assets/models/baaabs-panelized-v16.glb`. Eye animation respects
reduced-motion preferences and can be paused. The model-viewer 4.1.0 script
and its license are included in `site/assets/vendor/`.

The build section includes a perforated-metal reference photo and the proposed
aluminum-sheet specification with a planned black finish.

Local validation covered 390, 768, 1440 and 1920 px layouts, loading on demand,
mobile sizing, eye animation controls, and a failed-download fallback.

The panel workshop at `panels.html` indexes 207 named exterior sheets and links the panel schedule. Revision 12 removes vertex 7 from both broad head-side panels, accepting the small lower-edge mismatch. It retains the simplified head, extends both ears 25% front to back, and updates their dimensions. Revision 10 simplifies the head and corrects the remaining speaker rigging positions.

Revision 13 centers the ears front to back on the broad head sides, translating them 0.923 m aft without changing their size or height.

Revision 14 removes vertex 5 from H-D-001 and H-P-001. Their former vertex 6 becomes vertex 5; both broad side sheets are now pentagons.

Revision 15 removes vertex 3 from H-D-005 and H-P-005, leaving two simple triangles. All 207 panel outlines and connected planar caps pass the validity audit. Selecting or focusing a panel in the workshop briefly highlights only that panel orange, then restores its original black material. Model, spreadsheet and hero assets are refreshed.

Revision 16 widens the side skin around the speaker stations and generator platform and extends the rear closure around the lower poofer equipment. Equipment positions remain unchanged; the exhaust outlet follows its panel. All 207 panels remain flat and valid, with refreshed measurements and enclosure clearance checks. The mobile portrait workshop and orange focus highlight are retained.

Hovering over the model or a panel row highlights that sheet pink and shows its ID, name, blank dimensions and area in a one-row Current panel table above the filters. Hover inspection preserves the selected panel and filtered list; keyboard focus offers the same preview.

The Help Build section now links directly to the verified public BAAABS GoFundMe fundraiser. Donation amounts and payments are handled on GoFundMe; the former unconfigured Stripe controls are no longer displayed. See CONTRIBUTIONS.md.

The separate subframe layout study at `site/subframe.html` starts with sheep panels, head, and tall poofer masts hidden. Layer controls expose the donor chassis, deck and equipment for station planning. Its GLB retains v16 geometry and changes visibility/materials only. No new structural members or rated connections are implied.

Revision 20 uses exactly 206 panels: redundant crown returns removed, B-P-052 restored, entrance skirts reduced to triangles with one rectangular sill, and the three largest head panels subdivided. The local interactive model and panel workshop load v20, with the matching spreadsheet. Existing hero images and separate subframe studies retain their earlier versions.
