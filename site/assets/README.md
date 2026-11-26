# Site assets

Public asset URLs begin with `/assets/`. For example, the approved [heart-shaped ram](brand/Baaabs-heart.png) lives at `/assets/brand/Baaabs-heart.png`. This is the approved topology-compatible logo, also saved as `Baaabs-heart.png` in Google Drive’s Website/Assets folder. `brand/heart-ram.webp` is a lossless compatibility rendition of the same artwork for previously published image URLs.

| Looking for | Location |
| --- | --- |
| Current ram, original ram, site and lineage wordmarks | [brand/](brand/) |
| Pitch hero, responsive stills, donor and workshop imagery | [images/earl/](images/earl/) |
| Patch product photos, material samples, game share image | [images/patch/](images/patch/), [images/materials/](images/materials/), [images/test-drive/](images/test-drive/) |
| Smooth Circulars font files, specimen and original readme | [fonts/smooth_circulars/](fonts/smooth_circulars/), loaded by [typography.css](typography.css) |
| Safety documents and structural solver downloads | [downloads/safety/](downloads/safety/), [downloads/structural/](downloads/structural/) |
| Build journal and artist-story photos | [build-log/](build-log/), [itch/](itch/) |
| 3D assets, model sources and the playa art catalog | [models/README.md](models/README.md) |
| Lightweight homepage viewer and its meshes and textures | [home-model/](home-model/) |
| Rendered videos, posters, environment and render provenance | [disco/](disco/) |
| Retired visual studies and panel schedule spreadsheets | [archive/images/](archive/images/), [archive/panel-schedules/](archive/panel-schedules/) (repository only) |

For new media, use the subject directory and reference its canonical URL. For a new pitch render, [the renderer](../../tools/disco/render.py) writes the 820, 1600, 2560 and 3840 px stills together. Keep the pitch page’s responsive image list in sync with those outputs.

The detachable sheep panels use the [original steel photograph](images/materials/round-perforated-steel-reference.png) and a [repeat tile with transparent holes](images/materials/round-perforated-steel-tile.png). Their paths and physical calibration live in [panel-skin.json](panel-skin.json).

Feature data and code stay with their consumers. The [structural reports](../structural/) own their numerical results, [project costs](../costs/) owns its ledger, and [Test Drive](../test-drive/) owns its game code and baked mesh. Shared scripts, styles and configuration are in this directory. The [donor auction archive](../../reference/donor-bus/2007-thomas-hdx/auction-4108380/README.md) preserves original reference photos outside the published site.

Pages stages legacy asset URLs from [the compatibility map](../../tools/legacy-asset-urls.json). When moving a published file, update its consumers and the map together. The map points to the canonical staged file. [Retired paths](../../tools/retired-pages.txt) are excluded from publication.
