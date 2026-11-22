#!/usr/bin/env python3
"""Build a physical panel register and developed patterns from the original surface."""
import argparse
import copy
import csv
import io
import itertools
import json
import math
from pathlib import Path
import re
import numpy as np
from dj_booth import PANEL_IDS, panel_loops

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
BASE = ROOT / 'reference/panels/earl-before-dj.json'
SEAMS = ROOT / 'tools/earl-panel-seams.json'
REGISTER = SITE / 'assets/earl-dj-panel-register.csv'
LAYOUT = SITE / 'assets/earl-panel-layout.json'
WORKSHOP = SITE / 'the_build.html'
MATERIALS = SITE / 'panels.html'
INCH = .0254
SQFT = .09290304
LB_PER_KG = 2.20462262185
STEEL = .0359 * INCH * 7850 * .60 * LB_PER_KG
ALUMINUM = .063 * INCH * 2700 * .60 * LB_PER_KG
STOCK = np.array([119., 59.]) * INCH
DATA_BLOCK = re.compile(r'(?<=const DATA=).*?(?=;\n)')
UPPER = {'B-D-047':'B-D-073', 'B-D-071':'B-D-074'}


def value(x):
    return round(float(x),8) or 0.


def points(v):
    return [[value(x) for x in row] for row in v]


def adjacent(loop):
    return zip(loop, np.roll(loop,-1,axis=0))


def area(loop):
    return abs(sum(a[0]*b[1]-a[1]*b[0] for a,b in adjacent(loop)))/2


def unit(vector):
    return vector / np.linalg.norm(vector)


def flat(panel,world):
    axes = np.array([panel['u_axis'],panel['v_axis']])
    return (world-panel['origin_m']) @ axes.T


def pattern_orientation(uv):
    """Minimize the largest fraction of the 119 × 59 in working rectangle.

    A support pair changes when the caliper meets an edge. Between those
    angles an optimum can occur where the two normalized spans are equal.
    Enumerate those crossings for all vertex pairs to avoid an angle grid.
    """
    angles=[0.]
    deltas=[b-a for a,b in itertools.combinations(uv,2) if np.linalg.norm(b-a)>1e-9]
    ratio=STOCK[0]/STOCK[1]
    for dx,dy in deltas:
        theta=math.atan2(dy,dx)
        angles.extend([theta,theta+math.pi/2])
        for qx,qy in deltas:
            for r in (ratio,-ratio):
                angles.append(math.atan2(r*qy-dx,dy+r*qx))
    best=None
    for theta in np.unique(np.round(np.remainder(angles,math.pi),12)):
        theta=theta % math.pi
        cs,sn=math.cos(theta),math.sin(theta)
        rot=np.array([[cs,-sn],[sn,cs]])
        ru=uv@rot
        dims=np.ptp(ru,axis=0)
        if np.all(dims<=STOCK+1e-7):
            rank=(round(max(dims/STOCK),8),round(float(np.prod(dims)),7),round(theta,7))
            if best is None or rank<best[0]:
                best=(rank,rot,ru.min(axis=0),dims)
    if best is None:
        raise ValueError('developed perimeter exceeds the 119 × 59 inch working envelope')
    return best[1:]


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
    panel['source_faces']=[{'source':panel['source_faces'][0]['source'],'vertices_m':world}]
    assert not panel['holes_m']
    panel['net_area_m2']=value(area(np.asarray(panel['flat_vertices_m'])))


def divide(parts,part_id,new_id,loops,names):
    old=parts[part_id]
    for id_,loop,label in zip([part_id,new_id],loops,names):
        p=copy.deepcopy(old)
        p.update(id=id_,name=label,object_name=f'{id_} | {label}',highlight_material='Panel_'+id_)
        if id_!=part_id:
            p['split_from_id']=part_id
        set_contour(p,loop)
        parts[id_]=p


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


def finish(panel):
    uv=np.asarray(panel['flat_vertices_m'])
    try:
        rot,shift,dims=pattern_orientation(uv)
    except ValueError as err:
        raise ValueError(f"{panel['id']}: {err}") from err
    old_axes=np.array([panel['u_axis'],panel['v_axis']])
    axes=rot.T@old_axes
    holes=[points(flat(panel,np.array(loop))@rot-shift) for loop in panel['holes_m']]
    folds=[points(np.array(loop)@rot-shift) for loop in panel['folds_flat_m']]
    xyz=np.asarray(panel['vertices_m'])
    assert all(np.linalg.norm(a-b)>1e-7 for a,b in itertools.combinations(xyz,2)), panel['id']
    actual_area=area(uv)-sum(area(np.asarray(h)) for h in holes)
    assert abs(actual_area-panel['net_area_m2'])<1e-6,panel['id']
    panel.update(material='Provisional McNICHOLS perforated mild steel',thickness_in=.0359,open_area_fraction=.40)
    distances=[np.linalg.norm(a-b) for a,b in adjacent(xyz)]
    perimeter=sum(distances)+sum(np.linalg.norm(a-b) for h in panel['holes_m'] for a,b in adjacent(np.array(h)))
    panel.update(origin_m=points([np.array(panel['origin_m'])+shift@axes])[0],
                 u_axis=points(axes)[0],v_axis=points(axes)[1],
                 flat_vertices_m=points(uv@rot-shift),flat_holes_m=holes,folds_flat_m=folds,
                 length_m=value(dims[0]),width_m=value(dims[1]),
                 edge_lengths_m=[value(x) for x in distances],cut_perimeter_m=value(perimeter),
                 bare_steel_lb=value(panel['net_area_m2']*STEEL),
                 tip_span_m=value(max(np.linalg.norm(a-b) for a,b in itertools.combinations(xyz,2))),
                 stock_margin_in=value(min((120-dims[0]/INCH)/2,(60-dims[1]/INCH)/2)))
    perimeter_ft=perimeter/.3048
    panel['handling_half_lb']=value(panel['bare_steel_lb']+.5*perimeter_ft+2)
    panel['handling_one_lb']=value(panel['bare_steel_lb']+perimeter_ft+2)
    if panel.get('dj_booth') or len(panel['source_faces'])>1 or 'vertices_m' in panel['source_faces'][0]:
        panel['vertex_average_m']=points([xyz.mean(axis=0)])[0]


def build():
    original=json.loads(BASE.read_text())
    seams=json.loads(SEAMS.read_text())
    parts={p['id']:piece(p) for p in original['panels']}
    for id_ in PANEL_IDS:
        p=parts[id_]
        loops=panel_loops(p['vertices_m'])
        p['dj_booth']=True
        p['notes']='DJ booth opening above the party-side speakers.'
        if id_ in UPPER:
            loops.sort(key=lambda loop:np.mean(np.array(loop)[:,2]))
            divide(parts,id_,UPPER[id_],loops,[p['name']+' · lower',p['name']+' · upper return'])
        else:
            assert len(loops)==1
            set_contour(p,loops[0])
    for keep,remove in seams['merges']:
        combine(parts,keep,remove)
    used=set(parts)|{p['id'] for p in original['panels']}
    for source,plane in sorted(seams['splits'].items()):
        p=parts[source]
        prefix=source[:4]
        seq=max(int(k[4:]) for k in used if k.startswith(prefix))+1
        new_id=f'{prefix}{seq:03d}'
        used.add(new_id)
        vertices=np.asarray(p['vertices_m'])
        point=np.array(plane['point_m']);normal=unit(np.array(plane['normal']))
        halves=[clip(vertices,point,normal,sign) for sign in (-1,1)]
        before=p['net_area_m2']
        divide(parts,source,new_id,halves,[p['name']+' · A',p['name']+' · B'])
        for k in [source,new_id]:
            parts[k]['notes']=('DJ booth opening. ' if p.get('dj_booth') else '')+'Divided to fit a 5 × 10 ft sheet with edge clearance.'
        assert abs(parts[source]['net_area_m2']+parts[new_id]['net_area_m2']-before)<2e-6
    layout=[];panels=[]
    for k in sorted(parts):
        p=parts[k]
        finish(p)
        faces=p.pop('source_faces')
        layout.append(dict(id=k,name=p['name'],faces=faces))
        panels.append(p)
    assert len(parts)==206, len(parts)
    layout=dict(pieces=layout,splits=seams['splits'])
    return dict(revision='Earl · DJ booth · 206 detachable panels',panel_count=206,panels=panels),layout,original


def regenerated():
    html=WORKSHOP.read_text()
    block=DATA_BLOCK.search(html)
    data,layout,original=build()
    panels=data['panels']
    csv_text=io.StringIO(newline='')
    writer=csv.writer(csv_text,lineterminator='\n')
    writer.writerow(['Panel ID','Name','Length (in)','Width (in)','Area (sq ft)','Vertices (world meters)',
                     'Material (provisional)','Thickness (in)','Open area fraction','Bare steel (lb)','With 0.5 lb/ft edging + 2 lb fittings (lb)','With 1 lb/ft edging + 2 lb fittings (lb)','Tip span (in)','Stock margin per side (in)','Flat outline (meters)',
                     'Flat holes (meters)','Fold lines (flat meters)','Bend from flat (deg)','Source faces'])
    for p,item in zip(panels,layout['pieces']):
        writer.writerow([p['id'],p['name'],f"{p['length_m']/INCH:.3f}",f"{p['width_m']/INCH:.3f}",
                         f"{p['net_area_m2']/SQFT:.3f}",json.dumps(p['vertices_m']),p['material'],p['thickness_in'],p['open_area_fraction'],f"{p['bare_steel_lb']:.2f}",
                         f"{p['handling_half_lb']:.2f}",f"{p['handling_one_lb']:.2f}",f"{p['tip_span_m']/INCH:.2f}",f"{p['stock_margin_in']:.3f}",json.dumps(p['flat_vertices_m']),
                         json.dumps(p['flat_holes_m']),json.dumps(p['folds_flat_m']),p.get('formed_angle_deg',0),
                         ', '.join(f['source'] for f in item['faces'])])
    total=sum(p['net_area_m2'] for p in panels)
    removed=sum(p['net_area_m2'] for p in original['panels'])-total
    assert 0 < removed < 1
    values={'area':f'{total:,.2f} m² ({total/SQFT:,.2f} ft²)',
            'removed':f'{removed/SQFT:.2f} ft²','pieces':str(len(panels)),
            'aluminum':f'{total*ALUMINUM:,.0f} lb','steel':f'{total*STEEL:,.0f} lb',
            'heaviest':f"{max(p['bare_steel_lb'] for p in panels):.1f} lb",
            'span':f"{max(p['tip_span_m'] for p in panels)/INCH:.1f} in",
            'folds':str(sum(bool(p['folds_m']) for p in panels))}
    values.update(stockLong=f"{max(p['length_m'] for p in panels)/INCH:.2f} in",
                  stockShort=f"{max(p['width_m'] for p in panels)/INCH:.2f} in",
                  clearance=f"{min(p['stock_margin_in'] for p in panels):.2f} in",
                  frameLight=f"{max(p['handling_half_lb'] for p in panels):.1f} lb",
                  frameHeavy=f"{max(p['handling_one_lb'] for p in panels):.1f} lb")
    materials=MATERIALS.read_text()
    for key,val in values.items():
        materials,n=re.subn(rf'(<span data-skin="{key}">).*?(</span>)',lambda m:m[1]+val+m[2],materials)
        assert n==1,key
    print(f'{len(panels)} contiguous sheets, {total:.6f} m², {values["heaviest"]} peak steel skin, {values["span"]} maximum tip span, {values["folds"]} formed blanks')
    payload=json.dumps(data,separators=(',',':'),ensure_ascii=False)
    return {WORKSHOP:(html[:block.start()]+payload+html[block.end():]).encode(),
            REGISTER:csv_text.getvalue().encode(),MATERIALS:materials.encode(),
            LAYOUT:(json.dumps(layout,separators=(',',':'),ensure_ascii=False)+'\n').encode()}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true',help='report out-of-date outputs')
    args=parser.parse_args()
    for path,output in regenerated().items():
        if args.check:
            if not path.is_file() or path.read_bytes()!=output:
                raise SystemExit(f'Run {Path(__file__).name} to update {path.name}')
        else:
            path.write_bytes(output)
