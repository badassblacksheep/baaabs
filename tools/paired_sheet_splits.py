"""Split the largest mirrored pair of installed sheets while preserving the shell surface."""
import copy
import numpy as np

from panel_patterns import clip, points, set_contour

# Register fit differences between corresponding vertices on Earl's two sides, in metres.
MIRROR_FIT_M = .005
FORE_AFT = np.array([1., 0., 0.])


def matched_pairs(parts, omitted):
    def side(name):
        return [p for p in parts.values() if p['side'] == name and p['id'] not in omitted and p['region'] != 'Hoof']
    pairs = []
    passengers = side('Passenger')
    for left in side('Driver'):
        reflected = np.asarray(left['vertices_m']) * [1, -1, 1]
        matches = []
        for right in passengers:
            if right['region'] != left['region'] or len(right['vertices_m']) != len(reflected) or len(right['holes_m']) != len(left['holes_m']):
                continue
            dist = np.linalg.norm(reflected[:,None] - right['vertices_m'],axis=2)
            if max(dist.min(axis=0).max(),dist.min(axis=1).max()) < MIRROR_FIT_M:
                matches.append(right['id'])
        if len(matches)>1:
            raise ValueError(f"Ambiguous mirror of {left['id']}")
        if matches:
            pairs.append((left['id'],matches[0]))
    return pairs


def median_station(panel):
    world = np.asarray(panel['vertices_m'])
    holes = [np.asarray(h) for h in panel['holes_m']]
    def area_at(loop, x):
        poly = clip(loop, np.array([x,0.,0.]), FORE_AFT, -1)
        if len(poly)<3:
            return 0.
        return np.linalg.norm(np.cross(poly, np.roll(poly,-1,axis=0)).sum(axis=0))/2
    lo,hi = min(world[:,0]),max(world[:,0])
    for _ in range(48):
        mid = (lo+hi)/2
        if area_at(world,mid)-sum(area_at(h,mid) for h in holes) < panel['net_area_m2']/2:
            lo=mid
        else:
            hi=mid
    return (lo+hi)/2


def cut(parts, pid, new_id, original, source_station):
    parent = parts[pid]
    world = np.asarray(parent['vertices_m'])
    station = median_station(parent)
    if any(min(np.asarray(h)[:,0]) <= station <= max(np.asarray(h)[:,0]) for h in parent['holes_m']):
        raise ValueError(f'Seam on {pid} crosses an aperture')
    for child_id,label,sign in [(pid,'forward',-1),(new_id,'aft',1)]:
        child = copy.deepcopy(parent)
        name = parent['name']+' · '+label
        child.update(id=child_id,name=name,object_name=child_id+' | '+name,highlight_material='Panel_'+child_id)
        if child_id != pid:
            child['split_from_id']=pid
            child.pop('prior_ids',None)
            child.pop('merged_from_ids',None)
        set_contour(child,clip(world,np.array([station,0.,0.]),FORE_AFT,sign))
        faces=[]
        for face in parent['source_faces']:
            loop=np.asarray(face.get('vertices_m', original[face['source']]['vertices_m']))
            section=clip(loop,np.array([source_station,0.,0.]),FORE_AFT,sign)
            if len(section)>=3 and np.linalg.norm(np.cross(section,np.roll(section,-1,axis=0)).sum(axis=0))>1e-8:
                # Preserve source vertices at their recorded precision. Round only the
                # inserted seam intersections so register regeneration is portable.
                contour=[v.tolist() if any(np.array_equal(v,w) for w in loop) else v.round(10).tolist() for v in section]
                faces.append(dict(source=face['source'],vertices_m=contour))
        if not faces:
            raise ValueError(f'Missing source provenance for {child_id}')
        child['source_faces']=faces
        child['vertex_average_m']=points([np.mean(child['vertices_m'],axis=0)])[0]
        parts[child_id]=child
    return station


def split_to_target(parts, previous, original, omitted, target, reserved):
    remaining = target-(len(parts)-len(omitted))
    if remaining<0 or remaining%2:
        raise ValueError('A mirrored split adds two panels')
    pairs=matched_pairs(parts,omitted)
    used=set(parts)|set(reserved)|set(original)
    steps=[]
    for _ in range(remaining//2):
        def rank(pair):
            return (-sum(parts[k]['net_area_m2'] for k in pair),pair)
        left,right=min(pairs,key=rank)
        group=left.split('-')[0]
        number=1+max(int(key.split('-')[2]) for key in used if key.startswith(group+'-'))
        children=[f'{group}-{side}-{number:03}' for side in ('D','P')]
        areas=[parts[k]['net_area_m2'] for k in (left,right)]
        for pid,new_id in zip((left,right),children):
            station=median_station(previous[pid])
            cut(previous,pid,new_id,original,station)
            cut(parts,pid,new_id,original,station)
        used.update(children)
        pairs.append(tuple(children))
        steps.append(dict(parents=[left,right],added=children,parentAreasM2=areas))
    return steps
