"""Geometry of a panel's installed contour, developed cut pattern and folds."""
import copy

import numpy as np


def value(x):
    return round(float(x),8) or 0.


def points(v):
    return [[value(x) for x in row] for row in v]


def adjacent(loop):
    return zip(loop, np.roll(loop,-1,axis=0))


def area(loop):
    return abs(sum(a[0]*b[1]-a[1]*b[0] for a,b in adjacent(loop)))/2


def inward_distances(loop,check):
    """Signed distances to each directed edge, positive toward the interior."""
    edges=np.roll(loop,-1,axis=0)-loop
    lengths=np.linalg.norm(edges,axis=1)
    if np.any(lengths<=1e-7):
        raise ValueError('Repeated exterior vertex')
    orientation=np.sign(np.sum(loop[:,0]*np.roll(loop[:,1],-1)-loop[:,1]*np.roll(loop[:,0],-1)))
    normals=orientation*np.column_stack((-edges[:,1],edges[:,0])) / lengths[:,None]
    return np.einsum('ijk,ik->ij',check[None,:,:]-loop[:,None,:],normals)


def validate_outline(loop, panel_id):
    if not 3<=len(loop)<=6:
        raise ValueError(f'{panel_id} has {len(loop)} exterior corners')
    distances=inward_distances(loop,loop)
    for i,row in enumerate(distances):
        others=np.delete(row,[i,(i+1)%len(loop)])
        if np.min(others)<=1e-7:
            raise ValueError(f'{panel_id} has a concave, collinear or crossing exterior at edge {i+1}')


def unit(vector):
    return vector / np.linalg.norm(vector)


def flat(panel,world):
    axes = np.array([panel['u_axis'],panel['v_axis']])
    return (world-panel['origin_m']) @ axes.T


def clip(loop,point,normal,sign):
    result=[]
    for a,b in adjacent(loop):
        da=sign*float((a-point)@normal)
        db=sign*float((b-point)@normal)
        if da>=-1e-9:
            result.append(a)
        if da*db < -1e-18:
            result.append(a+(b-a)*da/(da-db))
    clean=[]
    for point in result:
        if not clean or np.linalg.norm(point-clean[-1])>1e-7:
            clean.append(point)
    if len(clean)>1 and np.linalg.norm(clean[0]-clean[-1])<1e-7:
        clean.pop()
    return np.asarray(clean)


def joined_perimeter(first, second):
    """Trace the two outer paths around a shared full edge in world coordinates."""
    first = np.asarray(first)
    second = np.asarray(second)
    for i, (a, b) in enumerate(adjacent(first)):
        for j, (c, d) in enumerate(adjacent(second)):
            if np.linalg.norm(a-c) < .00002 and np.linalg.norm(b-d) < .00002:
                return joined_perimeter(first, second[::-1])
            if np.linalg.norm(a-d) < .00002 and np.linalg.norm(b-c) < .00002:
                outside_first = np.roll(first, -i-1, axis=0)
                outside_second = np.roll(second, -j-2, axis=0)[:len(second)-2]
                return np.vstack((outside_first, outside_second))
    raise ValueError('Panels lack a common full edge')


def piece(panel):
    result=copy.deepcopy(panel)
    result['source_faces']=[{'source':panel['id']}]
    result['folds_m']=[]
    result['folds_flat_m']=[]
    return result


def set_contour(panel,world):
    world=points(world)
    panel['vertices_m']=world
    panel['flat_vertices_m']=points(flat(panel,np.array(world)))
    outline=np.asarray(panel['flat_vertices_m'])
    holes=[]
    for hole in panel['holes_m']:
        distances=inward_distances(outline,flat(panel,np.asarray(hole)))
        if np.all(distances>1e-7):
            holes.append(hole)
        elif np.any(np.all(distances>=-1e-7,axis=0)):
            raise ValueError(f"{panel['id']}: new edge crosses an existing opening")
    panel['holes_m']=holes
    face={'source':panel['source_faces'][0]['source'],'vertices_m':world}
    if holes:
        face['holes_m']=holes
    panel['source_faces']=[face]
    panel['net_area_m2']=value(area(outline)-sum(area(flat(panel,np.asarray(h))) for h in holes))


def divide(parts,part_id,new_id,loops,names):
    old=parts[part_id]
    for id_,loop,label in zip([part_id,new_id],loops,names):
        p=copy.deepcopy(old)
        p.update(id=id_,name=label,object_name=f'{id_} | {label}',highlight_material='Panel_'+id_)
        if id_!=part_id:
            p['split_from_id']=part_id
        set_contour(p,loop)
        parts[id_]=p
    if sum(len(parts[k]['holes_m']) for k in (part_id,new_id))!=len(old['holes_m']):
        raise ValueError(f'{part_id}: a split lost or duplicated an existing opening')
