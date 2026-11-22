"""Seam plan on Earl's modeled facets, with convex blanks around the DJ window."""
import copy
import numpy as np

from dj_booth import panel_loops
from panel_patterns import clip, combine, divide, set_contour, unit


def along(a, b, fraction):
    return a + (b-a)*fraction


def replace_face(parts, source, patterns, booth=False):
    """Assign a named, continuous cut pattern to each physical piece."""
    original = parts[source]
    for panel_id, name, outline in patterns:
        panel = copy.deepcopy(original)
        panel.update(id=panel_id, name=name, object_name=f'{panel_id} | {name}',
                     highlight_material='Panel_'+panel_id)
        if panel_id != source:
            panel['split_from_id'] = source
        if booth:
            panel['dj_booth'] = True
        panel['notes'] = ('The seams meet the corners of the DJ window.' if booth else
                          'Convex developed pattern on the original shell.')
        set_contour(panel, outline)
        parts[panel_id] = panel


def named_join(parts, first, second, name):
    combine(parts, first, second)
    panel = parts[first]
    panel.update(name=name, object_name=f'{first} | {name}', dj_booth=True,
                 notes='One convex cut blank. Form the marked crease to follow the original flank.')


def window_surround(parts):
    """Keep the traced rim and each original face plane. Extend seams out of its corners."""
    def contours(panel_id):
        return [np.array(loop) for loop in panel_loops(parts[panel_id]['vertices_m'])]

    outer, small_top = contours('B-D-047')
    toe, lip, corner, sill, base = outer
    foot = along(toe, base, .60)
    replace_face(parts, 'B-D-047', [
        ('B-D-047', 'Driver skirt · forward sill', [corner, sill, base, foot]),
        ('B-D-081', 'Driver skirt · forward lower bevel', [foot, toe, lip, corner]),
        ('B-D-073', 'Driver skirt · upper return', small_top),
    ], booth=True)

    outer, = contours('B-D-048')
    toe, shoulder, crown, rim_end, upper, left, lip = outer
    high = np.array(parts['B-D-031']['vertices_m'][0])
    # Across the old horizontal flank seam, the narrow upper-left window return
    # continues into the flank as one folded sheet. Its 3-D crease stays put.
    start = along(shoulder, crown, .34)
    end = along(shoulder, crown, .70)
    cap = along(crown, high, .38)
    replace_face(parts, 'B-D-048', [
        ('B-D-048', 'Driver skirt · forward window bevel', [toe, shoulder, start, left, lip]),
        ('B-D-085', 'Driver window · forward brow', [start, end, upper, left]),
        ('B-D-086', 'Driver window · forward crown', [end, crown, rim_end, upper]),
    ], booth=True)
    replace_face(parts, 'B-D-031', [
        ('B-D-031', 'Driver flank · forward brow cheek', [shoulder, start, high]),
        ('B-D-087', 'Driver flank · forward brow return', [high, start, end]),
        ('B-D-088', 'Driver flank · forward crown return', [cap, end, crown]),
        ('B-D-089', 'Driver flank · upper cheek', [high, end, cap]),
    ])
    named_join(parts, 'B-D-085', 'B-D-087', 'Driver window · forward brow')
    named_join(parts, 'B-D-086', 'B-D-088', 'Driver window · forward crown')

    outer, = contours('B-D-050')
    apex, hip, lower, lip, side, upper, rim_end = outer
    top_seam = along(apex, hip, .12)
    side_seam = along(hip, lower, .5)
    replace_face(parts, 'B-D-050', [
        ('B-D-050', 'Driver skirt · aft window bevel', [top_seam, hip, side_seam, side, upper]),
        ('B-D-090', 'Driver window · aft crown', [upper, rim_end, apex, top_seam]),
        ('B-D-091', 'Driver skirt · aft lower bevel', [side_seam, lower, lip, side]),
    ], booth=True)

    small_top, outer = contours('B-D-071')
    lip, upper_toe, toe, sill, corner = outer
    end = along(upper_toe, toe, .25)
    replace_face(parts, 'B-D-071', [
        ('B-D-071', 'Driver skirt · aft sill', [end, toe, sill, corner]),
        ('B-D-074', 'Driver window · aft upper return', small_top),
        ('B-D-092', 'Driver skirt · aft sill return', [corner, lip, upper_toe, end]),
    ], booth=True)
    named_join(parts, 'B-D-074', 'B-D-090', 'Driver window · aft crown')


def rear_returns(parts):
    # Match one seam on each rear surround across the centerline, from the
    # service notch to the midpoint of the long side opposite it.
    for side, source, new_id in [('Driver', 'B-D-059', 'B-D-093'),
                                 ('Passenger', 'B-P-015', 'B-P-085')]:
        outer = np.array(parts[source]['vertices_m'])
        a,b,c,d,e = outer if side == 'Driver' else outer[::-1]
        midpoint = along(a,b,.5)
        replace_face(parts, source, [
            (source, side+' rear surround · upper', [d,e,a,midpoint]),
            (new_id, side+' rear surround · lower', [midpoint,b,c,d]),
        ])


def orbital_panels(parts):
    # The original seven-corner faces have one full circular eye aperture
    # apiece. Release the lower triangular tip, well clear of the eye bezel.
    for side in ('D','P'):
        source = f'F-{side}-007'
        panel = parts[source]
        outline = np.array(panel['vertices_m'])
        if side == 'P':
            outline = np.roll(outline[::-1], 4, axis=0)
        a,b,c,d,e,f,g = outline
        replace_face(parts, source, [
            (source, panel['name'], [a,c,d,e,f,g]),
            (f'F-{side}-012', panel['side']+' orbital lower tip', [a,b,c]),
        ])


def redesign(parts, seams):
    window_surround(parts)
    rear_returns(parts)
    orbital_panels(parts)
    for source, plane in seams['splits'].items():
        panel = parts[source]
        vertices = np.array(panel['vertices_m'])
        point = np.array(plane['point_m'])
        normal = unit(np.array(plane['normal']))
        halves = [clip(vertices, point, normal, sign) for sign in (-1,1)]
        name = panel['name']
        divide(parts, source, plane['new_id'], halves, [name+' · A', name+' · B'])
        for key in (source,plane['new_id']):
            parts[key]['notes'] = 'Divided to fit a 5 × 10 ft sheet with edge clearance.'
    for first, second in seams['merges']:
        combine(parts, first, second)
    return seams['splits']
