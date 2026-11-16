# BAAABS eyes — VFX handoff, revision 3

**Mischief, then cute. All theater. No malice.**

The infernal look is a comic costume. BAAABS briefly reveals something absurdly
powerful, blinks, and looks innocent. Preserve the visual intensity and the
friendly emotional payoff. The owner approved this revision's fire treatment
on 16 November 2026. Live model: https://baaabs.org/eyes.html

## Cue sheet

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

The handoff ZIP contains the current animated GLB, this brief, two neutral UV
loops, two paired 16-second references, and editable procedural source.
The separate Blender derivative retains all six native animation clips.

The native fire loop is 128 frames at 24 fps: 5⅓ seconds, repeated three times
per 16-second hold. The model uses 256×256 fire textures; the supplied neutral
movies are 512×512, and paired movies are 1024×512. MP4s are convenient viewing
references. Generate lossless frames from the included source for compositing:

```sh
python3 -m pip install 'numpy>=2.0,<3'
python3 source/export-eye-vfx.py rendered --size 1024 --frames
```

FFmpeg must be installed. The exporter writes 128 RGB PNGs per look when
`--frames` is present. File 0000 follows file 0127; do not add a duplicate end
frame. Play three cycles for an infernal hold.

The deterministic field advects noise with `z = 8d - 16t`, where `d` is distance
from the pupil edge toward the shell and `t` is normalized loop time. Eruption
fronts use a positive radial delay. Domain warping makes the moving fronts curl.
This is a procedural art-direction reference, not a fluid or combustion solver.
A production fluid render can replace it while matching silhouette, outward
transport, palette, timing, and comic cut.

Native clip names are `BAAABS | Eye cycle`, `Ovine`, `Rainbow`, `Anime`, `Sauron`,
and `Otaku`, with the same `BAAABS | ` prefix on each. The complete cycle is
56 seconds; individual infernal clips are 16 seconds and the others 8 seconds.
Fire-frame switches use glTF STEP interpolation. Keep STEP when importing;
crossfading scales creates double images. Blender's active track is Eye cycle.

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
