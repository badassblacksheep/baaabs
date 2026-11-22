"""Seam plan on Earl's modeled facets, with convex blanks around the DJ window."""
import copy
import numpy as np

from dj_booth import panel_loops
from panel_patterns import clip, divide, joined_perimeter, points, set_contour, unit


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
    # The intact flank above this shoulder is one panel. Short seams from the
    # window corners terminate at the original flank boundary.
    rim_direction = upper-left
    shoulder_edge = crown-shoulder
    def square_end(corner):
        t = np.dot(corner-shoulder,rim_direction)/np.dot(shoulder_edge,rim_direction)
        return along(shoulder,crown,t)
    # Carry the window's lower-left bevel straight through the left corner
    # to the old flank seam. That corner is a T-junction on the broad skirt.
    edge_coordinates = np.column_stack((shoulder_edge,lip-left))[[0,2]]
    extension = np.linalg.solve(edge_coordinates,(left-shoulder)[[0,2]])[0]
    start, end = along(shoulder,crown,extension),square_end(upper)
    replace_face(parts, 'B-D-048', [
        ('B-D-048', 'Driver skirt · forward window bevel', [toe, shoulder, start, lip]),
        ('B-D-085', 'Driver window · flat forward reveal', [start, end, upper, left]),
        ('B-D-086', 'Driver window · forward crown', [end, crown, rim_end, upper]),
    ], booth=True)
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


def simple_boundary(first, second, corrections):
    """Drop near-straight seam ends in a merged field; move neighboring junctions with them."""
    boundary = list(joined_perimeter(first, second))
    while len(boundary) > 3:
        candidates = []
        for i,p in enumerate(boundary):
            a,b = boundary[i-1],boundary[(i+1)%len(boundary)]
            edge = b-a
            fraction = np.dot(p-a,edge)/np.dot(edge,edge)
            if 0 < fraction < 1:
                on_edge = along(a,b,fraction)
                candidates.append((np.linalg.norm(p-on_edge),i,on_edge))
        if not candidates:
            break
        distance, i, destination = min(candidates, key=lambda x:x[0])
        if distance > .0015:
            break
        corrections.append((boundary.pop(i),destination))
    return np.array(boundary)


def field(parts, sources, outline, output, line=None):
    """Cut an entire field; preserve each original facet's clipped coverage as provenance."""
    donors = [parts.pop(s) for s in sources]
    output = list(output)
    for index,(pid,label) in enumerate(output):
        sign = 2*index - 1
        if line is None:
            contour = outline
        else:
            point, normal = line
            contour = clip(outline,point,normal,sign)
        panel = copy.deepcopy(donors[0])
        panel.update(id=pid,name=label,object_name=f'{pid} | {label}',highlight_material='Panel_'+pid,
                     vertices_m=points(contour),source_faces=[],folds_m=[],folds_flat_m=[],
                     notes='Single flat plate on the revised shell.',
                     merged_from_ids=list(sources),vertex_average_m=points([np.mean(contour,axis=0)])[0])
        panel.pop('split_from_id',None)
        for donor in donors:
            for face in donor['source_faces']:
                if line is None:
                    panel['source_faces'].append(copy.deepcopy(face))
                else:
                    world = np.array(face.get('vertices_m',donor['vertices_m']))
                    original_cut = clip(world,point,normal,sign)
                    if len(original_cut) >= 3 and np.linalg.norm(np.cross(original_cut,
                                                    np.roll(original_cut,-1,axis=0)).sum(0))>1e-8:
                        panel['source_faces'].append(dict(source=face['source'],vertices_m=points(original_cut)))
        parts[pid] = panel


def diagonal_flip(parts, first, second):
    """Change the diagonal of two triangles without moving any exterior corner."""
    p,q = parts[first],parts[second]
    a,b = np.array(p['vertices_m']),np.array(q['vertices_m'])
    match = np.linalg.norm(a[:,None]-b[None,:],axis=2) < .00002
    hinge = a[np.any(match,axis=1)]
    start, = a[~np.any(match,axis=1)]
    end, = b[~np.any(match,axis=0)]
    boundary = np.array([start,hinge[0],end,hinge[1]])
    along_edge = unit(end-start)
    separation = hinge[1]-hinge[0]
    cut = unit(separation - np.dot(separation,along_edge)*along_edge)
    field(parts, (first,second), boundary, [(first,p['name']), (second,q['name'])], (start,cut))


def aft_skirt(parts, side, corrections):
    """One trapezoid and one triangle cover the original coplanar 07b field."""
    first = 'B-D-054' if side=='D' else 'B-P-062'
    second = f'B-{side}-066'
    p,q = parts[first],parts[second]
    boundary = simple_boundary(p['vertices_m'],q['vertices_m'],corrections)
    assert len(boundary)==3
    tip = boundary[np.argmin(boundary[:,2])]
    a,b = boundary[boundary[:,2]>tip[2]+.01]
    u,v = along(tip,a,.634),along(tip,b,.634)
    along_line = unit(v-u)
    offset = tip-u
    n = unit(offset-np.dot(offset,along_line)*along_line)
    name=p['side']+' aft skirt'
    field(parts, (first,second), boundary, [(first,name+' · shoulder'),(second,name+' · lower tip')], (u,n))


def head_side(parts, side, corrections):
    ids = [f'H-{side}-{i:03}' for i in ([1,14,16,17] if side=='D' else [1,14,17,16])]
    mirror = np.array([1., 1. if side=='D' else -1., 1.])
    # Select modeled physical perimeter stations geometrically for both windings.
    originals = np.vstack([parts[k]['vertices_m'] for k in ids])
    targets = np.array([[-7.031,-1.260,4.544],[-7.031,-1.260,6.176],
                        [-4.988,-1.931,6.995],[-4.130,-2.212,5.047],
                        [-5.600,-1.729,4.337]])*mirror
    outline = np.array([originals[np.argmin(np.linalg.norm(originals-x,axis=1))] for x in targets])
    for old in originals:
        for a,b in zip(outline,np.roll(outline,-1,axis=0)):
            edge=b-a
            t=np.dot(old-a,edge)/np.dot(edge,edge)
            location=along(a,b,t)
            if .0001<t<.9999 and 1e-8<np.linalg.norm(old-location)<.0025:
                corrections.append((old,location))
    line=(np.array([-5.69944,-1.69702,5.51365])*mirror,
          unit(np.array([-.27264,.08915,.95798])*mirror))
    name=parts[ids[0]]['side']+' head side'
    field(parts,ids,outline,[(ids[0],name+' · lower'),(ids[1],name+' · upper')],line)


def move_junctions(parts, corrections):
    for panel in parts.values():
        for p in panel['vertices_m']:
            for old,destination in corrections:
                if np.linalg.norm(np.asarray(p)-old)<1e-6:
                    p[:]=points([destination])[0]
                    break


def redesign(parts, seams):
    for source in seams['omit']:
        del parts[source]
    window_surround(parts)
    rear_returns(parts)
    orbital_panels(parts)
    corrections=[]
    for side in ('D','P'):
        head_side(parts,side,corrections)
        aft_skirt(parts,side,corrections)
    for a,b in [('B-D-043','B-D-044'),('B-D-035','B-D-036'),
                ('B-P-043','B-P-044'),('B-P-060','B-P-070')]:
        diagonal_flip(parts,a,b)
    a,b='B-D-045','B-D-046'
    outline=simple_boundary(parts[a]['vertices_m'],parts[b]['vertices_m'],corrections)
    # The new seam runs from the forward lower corner to the existing
    # midpoint station of the opposite flank edge. Both sides fit one blank.
    start = outline[1]
    end = along(outline[2],outline[3],.5)
    facet_normal = np.linalg.svd(outline-outline.mean(0),full_matrices=False)[2][-1]
    cut_normal = unit(np.cross(facet_normal,end-start))
    if cut_normal[2] > 0:
        cut_normal = -cut_normal
    line = start,cut_normal
    field(parts,(a,b),outline,[(a,'Driver skirt 03 · shoulder'),('B-D-080','Driver skirt 03 · lower')],line)
    for source, plane in seams['splits'].items():
        panel = parts[source]
        vertices = np.array(panel['vertices_m'])
        point = np.array(plane['point_m'])
        normal = unit(np.array(plane['normal']))
        halves = [clip(vertices, point, normal, sign) for sign in (-1,1)]
        name = panel['name']
        divide(parts, source, plane['new_id'], halves, [name+' · A', name+' · B'])
    for first,second in seams['merges']:
        p,q=parts[first],parts[second]
        outline=simple_boundary(p['vertices_m'],q['vertices_m'],corrections)
        name=p['name'].split(' · ')[0]
        field(parts,(first,second),outline,[(first,name)])
    move_junctions(parts,corrections)
    return seams['splits']
