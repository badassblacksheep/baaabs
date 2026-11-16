# BAAABS eyes — VFX handoff, revision 4

**Mischief, then cute. All theater. No malice.**

The infernal look is a comic costume. BAAABS briefly reveals something absurdly
powerful, blinks, and looks innocent. Preserve the visual intensity and the
friendly emotional payoff. The owner approved this revision's fire treatment
on 16 November 2026. Live model: https://baaabs.org/eyes.html

## Active study: shallow bowls, ovine Sauron only

The owner has temporarily selected only ovine Sauron. The existing positions,
aperture planes and comic cant remain, but the eye shells are shallow spherical
caps: **0.6371 m (~25.08 inches) across and 0.0889 m (3.5 inches) deep**.
The spherical radius is (a²+h²)/(2h), where a is half the aperture and h is
its depth. These are prototype modeling dimensions, not fabricated optics.

The active 16-second loop has three related outward ripple treatments:

| Time | Ripple |
|---|---|
| 0–5⅓ s | Approved Backdraft |
| 5⅓–10⅔ s | Double crest: sharper leading wave and smaller echo |
| 10⅔–16 s | Rolling bloom: broader curling lobes |

Blend between treatments over the final ⅔ second of each section. Preserve the
charred iris, pupil silhouette and warm palette. **The right eye leads by
16 frames / ⅔ second**, one quarter of the 64-frame pulse. This is the
sine/cosine relationship of the eruption rhythm, not a quarter of the full show.
The whole shifted stream wraps continuously at 384 frames.

The other expressions and full show remain embedded in the native model and
reproducible from this repository. They are inactive in the current website,
game and Blender playback. The comedic design tenet remains in force.

## Archived five-look cue sheet

| Time in loop | Look | Hold | Emotional beat |
|---|---|---:|---|
| 0–16 s | Ovine Sauron | 16 s | Infernal sheep mischief |
| 16–24 s | Ovine rainbow | 8 s | Immediate, innocent cute |
| 24–32 s | Vegeta | 8 s | Comically serious warm stare |
| 32–48 s | Sauron | 16 s | Infernal theatrical reveal |
| 48–56 s | Otaku `^_^` | 8 s | Immediate cute punchline |
| 56 s | Repeat | | Return to ovine Sauron |

Both infernal holds are twice the length of every other look. Use a short blink
at each infernal-to-cute cut. Do not insert a lingering hostile stare, lunge,
snarl, or threatening payoff. The paired eyes remain one character.

## Fire art direction

Preserve a black, clearly legible pupil inside a dark copper/charred iris.
Sauron has a long pointed vertical slit; the ovine variant has the same sheep
pupil silhouette as the rainbow look. The owner's supplied reference establishes
the narrow incandescent slit, dark radial iris detail, and deep ember surround.

Fire gathers at the inner iris, erupts, travels radially outward, and rolls into
curling tongues across the curved shell. A darker wake reveals the iris again.
This backdraft rhythm is the essential motion. Small curls can turn locally;
the overall transport is outward. Preserve the approved moving reference rather
than replacing it with a spinning texture, uniform bright disk, or flat halo.

The palette runs from warm black through ember red, copper, orange, and gold.
Concentrate the hottest values at the pupil edge and occasional flame crests.
Keep dark detail between bursts. Rainbow is the intentional cool-color exception.

## Eye placement and UV convention

The bowls stay in their existing positions. Only ovine Sauron has the mirrored 10-degree comic cant: viewed from the front,
the two pupils slope gently like \ /. Keep this slightly sinister tilt as part
of the mischief. Ovine rainbow stays level (— —), as requested by the owner.
Sauron stays vertical. The rainbow iris rotates independently of its level
sheep pupil. Do not add another naturalistic eye orientation.

Neutral motion masters are square, front-view RGB images, with a circular
shell centered at (0.5, 0.5). Image top is up. Pixels outside the circle and
inside the pupil are black. These are neutral UV references, not an
equirectangular panorama or a calibrated projector raster. The paired ovine
movie already contains the outward cant; do not apply it a second time.

The GLB maps the square to each convex cap with `u = 0.5 + x/(2R)` and
`v = 0.5 - y/(2R)`, where `R = 0.275` in head-local coordinates.
This radius is a modeling coordinate, not a fabrication dimension. Retain
the model transforms when interpreting the scene. Measure the real bowls.

## Files and reproduction

The revision-3 handoff ZIP remains an archived reference for the approved fire
and former show. The current GLB, builder and this brief describe revision 4.
The updated Blender derivative retains seven native clips.

The ovine loop now has 384 frames at 24 fps (16 seconds). The inactive vertical
Sauron reference remains 128 frames (5⅓ seconds), repeated three times for its
16-second hold. Native textures are 256×256. Export neutral UV movies, paired
motion references and optional lossless frames from the current repo:

```sh
python3 -m pip install 'numpy>=2.0,<3'
python3 tools/export-eye-vfx.py rendered --size 1024 --frames
```

FFmpeg must be installed. The exporter writes 384 ovine and 128 vertical Sauron
RGB PNG frames with `--frames`. Do not add a duplicate end frame. The paired
ovine export already contains both the mirrored cant and right-eye phase lead.

The deterministic field advects noise with `z = 8d - 16t`, where `d` is distance
from the pupil edge toward the shell and `t` is normalized loop time. Eruption
fronts use a positive radial delay. Domain warping makes the moving fronts curl.
This is a procedural art-direction reference, not a fluid or combustion solver.
A production fluid render can replace it while matching silhouette, outward
transport, palette, timing, and comic cut.

The active `BAAABS | Eye cycle` and individual `BAAABS | Ovine` clips both
play the 16-second three-ripple study. `BAAABS | Archived five-look show`
retains the former 56-second cue sequence. Individual `Rainbow`, `Anime`,
`Sauron` and `Otaku` clips retain the same `BAAABS | ` prefix. Fire-frame
switches use glTF STEP interpolation; crossfading scales creates double images.
Blender's active track is Eye cycle, with the others muted.

## Physical prototype acceptance

Start with one real diffuser bowl and the proposed projector/lens position.
Measure the bowl profile and establish the intended audience viewing direction.
Build the warp, edge mask, orientation and brightness calibration on that setup;
the GLB UVs are not a finished optical calibration. If rear projection reverses
the image, correct the installation output once, then verify both cant directions.

Show the pupil clearly at rest and during the brightest eruption. Verify that
flames visibly move from iris to shell and that the rim retains detail. Check
the effect from the front and oblique audience angles, then play the full
infernal-to-cute cut. Tune for the real diffuser, ambient light and projector
black level. Judge the comedic payoff in that physical preview before producing
final installation-resolution media.
