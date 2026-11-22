"""Seam plan on Earl's modeled facets, with convex blanks around the DJ window."""
import copy
import numpy as np

from dj_booth import APERTURE
from panel_patterns import area, clip, divide, joined_perimeter, points, set_contour, unit


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


def at_x(a, b, x):
    return along(a,b,(x-a[0])/(b[0]-a[0]))


def source_coverage(boundary, donors):
    """Clip the original elevation drawing to its source triangles for the panel history."""
    result = []
    for source,panel in donors.items():
        v=np.asarray(panel['vertices_m'])
        elevation=v[:,[0,2]]
        polygon=np.array(boundary)[:,[0,2]]
        center=elevation.mean(axis=0)
        for a,b in zip(elevation,np.roll(elevation,-1,axis=0)):
            normal=np.array([a[1]-b[1],b[0]-a[0]])
            polygon=clip(polygon,a,normal,np.sign((center-a)@normal))
            if len(polygon)<3:
                break
        if len(polygon)<3 or area(polygon)<1e-9:
            continue
        # Interpolate depth on the original face, independent of the installed sheet.
        to_depth=np.linalg.solve(np.column_stack((elevation,np.ones(3))),v[:,1])
        depth=polygon@to_depth[:2]+to_depth[2]
        world=np.column_stack((polygon[:,0],depth,polygon[:,1]))
        result.append((area(polygon),dict(source=source,vertices_m=points(world))))
    return [record for _,record in sorted(result,key=lambda item:-item[0])]


def window_surround(parts):
    """Lay six flat sheets against the six projected edges of the DJ opening."""
    ids=['B-D-031','B-D-047','B-D-048','B-D-050','B-D-071']
    donors={k:parts.pop(k) for k in ids}
    original={k:np.asarray(p['vertices_m']) for k,p in donors.items()}
    def rim(xz,k):
        v=original[k]
        yz=np.linalg.solve(np.column_stack((v[:,[0,2]],np.ones(3))),v[:,1])
        return np.array([xz[0], xz@yz[:2]+yz[2], xz[1]])
    left,lower_l,lower_r,right,upper_r,upper_l=[
        rim(xz,k) for xz,k in zip(APERTURE,
        ['B-D-048','B-D-047','B-D-071','B-D-050','B-D-050','B-D-048'])]
    front_base,old_shoulder,old_apex=original['B-D-048']
    flank_top=original['B-D-031'][0]
    _,hip,heel=original['B-D-050']
    toe=original['B-D-071'][2]
    foot=along(toe,front_base,.15)
    # Straight bevels meet in the centered apex. The left bevel sets its depth;
    # the right upper corner moves only in depth to meet the same apex.
    apex=at_x(left,upper_l,(upper_l[0]+upper_r[0])/2)
    shoulder=at_x(left,upper_l,old_shoulder[0])
    right_at_apex=at_x(right,apex,upper_r[0])
    # Fit the lower surrounds in depth only. Each new sheet shares two
    # consecutive corners with its neighbor; every projected station stays put.
    def depth_on(a,b,c,p):
        v=np.array([a,b,c])
        coeff=np.linalg.solve(np.column_stack((v[:,[0,2]],np.ones(3))),v[:,1])
        return np.array([p[0],np.dot(coeff,[p[0],p[2],1.]),p[2]])
    new_base=depth_on(shoulder,left,lower_l,front_base)
    new_foot=depth_on(shoulder,left,lower_l,foot)
    new_heel=depth_on(lower_l,lower_r,new_foot,heel)
    new_toe=depth_on(lower_l,lower_r,new_foot,toe)
    new_hip=depth_on(right,lower_r,new_heel,hip)
    # Record the same six regions on the original surface as provenance. Their
    # outer stations follow the old flank, including its off-center apex.
    regions=[
        ('B-D-031','Driver flank · forward window bevel',[shoulder,flank_top,apex],
         [old_shoulder,flank_top,old_apex,upper_l,left]),
        ('B-D-074','Driver window · triangular header',[upper_l,apex,right_at_apex],
         [upper_l,old_apex,upper_r]),
        ('B-D-050','Driver flank · aft window bevel',[apex,new_hip,right],
         [old_apex,hip,right,upper_r]),
        ('B-D-091','Driver skirt · aft window bevel',[new_hip,new_heel,lower_r,right],
         [hip,heel,lower_r,right]),
        ('B-D-047','Driver skirt · window sill',[lower_l,lower_r,new_heel,new_toe,new_foot],
         [lower_l,lower_r,heel,toe,foot]),
        ('B-D-048','Driver skirt · forward window bevel',[new_base,shoulder,left,lower_l,new_foot],
         [front_base,old_shoulder,left,lower_l,foot]),
    ]
    # Translate external seam junctions on the two moving stations and the
    # source edges ending there. Adjacent skins consequently share one vertex.
    shifts=[(old_shoulder,shoulder),(old_apex,apex),(front_base,new_base),
            (heel,new_heel),(toe,new_toe),(hip,new_hip)]
    old_edges=[(a,b) for poly in original.values() for a,b in zip(poly,np.roll(poly,-1,axis=0))]
    for panel in parts.values():
        updated=copy.deepcopy(panel['vertices_m'])
        for i,p in enumerate(np.asarray(panel['vertices_m'])):
            shift=np.zeros(3)
            for old,new in shifts:
                if np.linalg.norm(p-old)<1e-6:
                    shift=new-old
                    break
                for a,b in old_edges:
                    if np.linalg.norm(a-old)>1e-6 and np.linalg.norm(b-old)>1e-6:
                        continue
                    far=b if np.linalg.norm(a-old)<1e-6 else a
                    edge=far-old
                    t=(p-old)@edge/(edge@edge)
                    if 0<t<1 and np.linalg.norm(old+t*edge-p)<1e-6:
                        shift+=(1-t)*(new-old)
                        break
            if np.any(shift):
                updated[i]=points([p+shift])[0]
        panel['vertices_m']=updated
    for pid,name,outline,baseline in regions:
        faces=source_coverage(baseline,donors)
        panel=copy.deepcopy(donors[faces[0]['source']])
        panel.update(id=pid,name=name,object_name=f'{pid} | {name}',highlight_material='Panel_'+pid,
                     vertices_m=points(outline),source_faces=faces,dj_booth=True,
                     notes='Flat plate bordering the six-sided DJ window.')
        parts[pid]=panel


def rear_returns(parts):
    # Recut each nearly coplanar rear service surround as two quads. Start the
    # seam at the inward corner of the service opening and run it to the lower
    # outside corner. This removes the redundant triangular return.
    for first, second in [('B-D-059','B-D-060'),('B-P-015','B-P-016')]:
        side = parts[first]['side']
        v=np.array(joined_perimeter(parts[first]['vertices_m'],parts[second]['vertices_m']))
        notch=v[np.argmin(np.linalg.norm(v[:,[2,1]]-[3.317,(-.478 if side=='Driver' else .478)],axis=1))]
        lower=v[np.argmin(v[:,2])]
        direction=unit(lower-notch)
        normal=np.linalg.svd(v-v.mean(0),full_matrices=False)[2][-1]
        cut=unit(np.cross(direction,normal))
        if np.dot(cut, v[np.argmax(v[:,2])]-notch)>0:
            cut=-cut
        field(parts,(first,second),v,[
            (first,side+' rear surround · outer return'),
            (second,side+' rear surround · inner return')], (notch,cut))


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


def passenger_lower_hem(parts):
    """Trade one stock split for a new station on the free lower edge of skirt 04."""
    first,second='B-P-055','B-P-071'
    a,b,c=np.asarray(parts[first]['vertices_m'])
    _,d,_=np.asarray(parts[second]['vertices_m'])
    station=along(c,a,.145)
    # The hem has no adjacent plate. Keep its station and height, and set its
    # depth on the adjoining skirt's plane. Every original outer corner stays.
    neighbor=np.array([b,d,c])
    coefficients=np.linalg.solve(np.column_stack((neighbor[:,[0,2]],np.ones(3))),neighbor[:,1])
    fitted=station.copy()
    fitted[1]=np.dot([station[0],station[2],1.],coefficients)
    ray=(station-b)[[0,2]]
    normal=np.array([-ray[1],0.,ray[0]])
    if np.dot(a-b,normal)>0:
        normal=-normal
    field(parts,(first,second),np.array([a,b,d,c]),[
        (first,'Passenger skirt 04 · lower hem'),
        (second,'Passenger skirt 05 · lower hem')],(b,normal))
    parts[first]['vertices_m']=points([a,b,fitted])
    parts[second]['vertices_m']=points([b,d,c,fitted])


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
    rear_returns(parts)
    orbital_panels(parts)
    passenger_lower_hem(parts)
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
    window_surround(parts)
    move_junctions(parts,corrections)
    return seams['splits']
