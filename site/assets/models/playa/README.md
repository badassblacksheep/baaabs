# Playa models

These are the BAAABS Test Drive team's low-poly interpretations. Coordinates use metres with Y up. Each GLB opens at its own local origin in Blender or a glTF viewer.

| Artwork | Model | Editable geometry | Reference |
| --- | --- | --- | --- |
| Event Horizon, Ben Bartlett, 2025 | [GLB](event-horizon.glb) | [Five nested gimbals and fixed light court](event-horizon.js) | [Duncan Rawlinson’s installation photograph](https://gallery.burningman.org/asset/3c9bcc69-9432-407d-9ceb-66b0ec855561) |
| Head Maze, Matt Schultz and The Pier Group, 2019 | [GLB](head-maze.glb) | [Sculpted exterior](head-maze.js) | [Artist’s photographs](https://www.mattschultzart.com/artwork/headmaze) |
| Caravansary Man, 2014 | [GLB](man-2014.glb) | [105-foot timber effigy](man-2014.js) | [2014 annual report](https://annualreport2014.burningman.org/the-burning-man-event-in-black-rock-city/) |
| Lord Snort, Bryan Tedrick, 2016 | [GLB](lord-snort.glb) | [Running boar and fixed shaft](lord-snort.js) | [Artist’s portfolio](https://www.bryantedrick.com/copy-of-sculpture) |
| Robot Heart art car | [GLB](robot-heart.glb) | [Bus, speaker cabinets and illuminated wire heart](robot-heart.js) | [Robot Heart Foundation](https://robotheartfoundation.org/) |

The game builds the meshes from these modules. The Event Horizon export includes five individually poseable, parented bands in the starting pose. Its continuous motion runs in the game. Regenerate all artwork exports with `node tools/export-playa-models.mjs` from the repository root.

Earl uses the shared [roof-attachment assembly](../earl-roof-attachment-study.glb). The [model directory](../) holds the bus, shell and engineering study revisions. The [landmark registry](../../../test-drive/landmarks.js) places the artwork and its driving objectives in the game.
