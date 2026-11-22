"""Geometry of a panel's installed contour, developed cut pattern and folds."""
import copy
import math

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


def unfold(first,second):
    """Develop the adjacent faces, tracing only the outside of their shared edge."""
    first=np.asarray(first);second=np.asarray(second)
    for i,(a,b) in enumerate(adjacent(first)):
        for j,(c,d) in enumerate(adjacent(second)):
            if np.linalg.norm(a-d)<.00002 and np.linalg.norm(b-c)<.00002:
                break
            if np.linalg.norm(a-c)<.00002 and np.linalg.norm(b-d)<.00002:
                return unfold(first,second[::-1])
        else:
            continue
        break
    else:
        raise ValueError('panels lack a common full edge')
    axis=unit(b-a)
    def across(loop):
        offsets=loop-a
        across=offsets-np.outer(offsets@axis,axis)
        return unit(across[np.argmax(np.linalg.norm(across,axis=1))])
    u,v=across(first),across(second)
    dot=np.clip(-u@v,-1.,1.)
    bend=math.degrees(math.acos(dot))
    F=(first-a)@np.array([axis,u]).T
    S=(second-a)@np.array([axis,-v]).T
    # First outside path runs b ... a. Append second's external interior points.
    order1=[(i+1+k)%len(first) for k in range(len(first))]
    order2=[(j+2+k)%len(second) for k in range(len(second)-2)]
    world=np.vstack([first[order1],second[order2]])
    uv=np.vstack([F[order1],S[order2]])
    fold=np.array([[0.,0.],[np.linalg.norm(b-a),0.]])
    return world,uv,np.stack([a,b]),fold,bend,np.array([axis,u]),a


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


def combine(parts,keep,retired):
    first=parts[keep];second=parts.pop(retired)
    assert not first['holes_m'] and not second['holes_m']
    w,uv,e,ef,bend,axes,origin=unfold(first['vertices_m'],second['vertices_m'])
    folded=bend>.1  # sub-tenth-degree variation is within the photo model precision
    name=first['name'].split(' · section')[0].split(' · split')[0]
    second_name=second['name'].split(' · section')[0].split(' · split')[0]
    if name!=second_name:
        end=second_name.removeprefix(first['side']+' ')
        name+=' + '+end
    first.update(name=name,object_name=f'{keep} | {name}',vertices_m=points(w),flat_vertices_m=points(uv),
                 origin_m=origin.tolist(),u_axis=axes[0].tolist(),v_axis=axes[1].tolist(),
                 net_area_m2=value(first['net_area_m2']+second['net_area_m2']),
                 merged_from_ids=[keep,retired],source_faces=first['source_faces']+second['source_faces'],
                 folds_m=[points(e)] if folded else [],folds_flat_m=[points(ef)] if folded else [],
                 formed_angle_deg=value(bend) if folded else 0.,
                 notes=('One detachable sheet with a continuous developed pattern. '
                        +('The dashed line marks the formed crease.' if folded else 'The former interior seam is removed.')))
    first.pop('split_from_id',None)
