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

The website uses the October 15, 2026 assembly v15, with all-black exterior
finishes, translucent panels, animated flame eyes, and party-side speaker
stacks positioned between the wheel wells. Desktop and mobile hero images
are rendered from the same model.

The interactive viewer loads only when requested. Both viewing and downloading
use `site/assets/models/baaabs-panelized-v15.glb`. Eye animation respects
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
