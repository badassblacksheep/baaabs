#!/usr/bin/env python3
"""Build the fabrication register from the flat, removable exterior panels."""
import argparse
import csv
import io
import itertools
import json
import math
from pathlib import Path
import re
import numpy as np

from convex_panel_layout import redesign
from dj_booth import PANEL_IDS, panel_loops
from flat_panels import use_stored_fit
from panel_patterns import adjacent, area, flat, piece, points, validate_outline, value

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
BASE = ROOT / 'reference/panels/earl-before-dj.json'
SEAMS = ROOT / 'tools/earl-panel-seams.json'
FITTED = ROOT / 'reference/panels/earl-flat-seam-fit.json'
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


def finish(panel):
    uv=np.asarray(panel['flat_vertices_m'])
    validate_outline(uv,panel['id'])
    try:
        rot,shift,dims=pattern_orientation(uv)
    except ValueError as err:
        raise ValueError(f"{panel['id']}: {err}") from err
    old_axes=np.array([panel['u_axis'],panel['v_axis']])
    axes=rot.T@old_axes
    holes=[points(flat(panel,np.array(loop))@rot-shift) for loop in panel['holes_m']]
    xyz=np.asarray(panel['vertices_m'])
    centered=xyz-xyz.mean(axis=0)
    _,_,face_axes=np.linalg.svd(centered,full_matrices=False)
    validate_outline(centered@face_axes[:2].T,panel['id']+' installed face')
    assert all(np.linalg.norm(a-b)>1e-7 for a,b in itertools.combinations(xyz,2)), panel['id']
    actual_area=area(uv)-sum(area(np.asarray(h)) for h in holes)
    assert abs(actual_area-panel['net_area_m2'])<1e-6,panel['id']
    panel.update(material='Provisional McNICHOLS perforated mild steel',thickness_in=.0359,open_area_fraction=.40)
    distances=[np.linalg.norm(a-b) for a,b in adjacent(xyz)]
    perimeter=sum(distances)+sum(np.linalg.norm(a-b) for h in panel['holes_m'] for a,b in adjacent(np.array(h)))
    panel.update(origin_m=points([np.array(panel['origin_m'])+shift@axes])[0],
                 u_axis=points(axes)[0],v_axis=points(axes)[1],
                 flat_vertices_m=points(uv@rot-shift),flat_holes_m=holes,
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


def build(refit=False):
    original=json.loads(BASE.read_text())
    parts={p['id']:piece(p) for p in original['panels']}
    seams=json.loads(SEAMS.read_text())
    splits=redesign(parts,seams)
    use_stored_fit(parts,FITTED,refit)
    if 'max_seam_fit_mm' in seams:
        for panel in parts.values():
            if panel['seam_fit_adjustment_mm']>seams['max_seam_fit_mm']:
                raise ValueError(f"{panel['id']} exceeds the seam fit allowance")
    layout=[];panels=[]
    for k in sorted(parts):
        p=parts[k]
        finish(p)
        faces=p.pop('source_faces')
        layout.append(dict(id=k,name=p['name'],vertices_m=p['vertices_m'],holes_m=p['holes_m'],faces=faces))
        panels.append(p)
    if 'panel_count' in seams and len(parts)!=seams['panel_count']:
        raise ValueError(f"Expected {seams['panel_count']} physical sheets, found {len(parts)}")
    sources={f['source'] for record in layout for f in record['faces']}
    original_ids={p['id'] for p in original['panels']}
    if sources!=original_ids:
        raise ValueError(f'Unmapped source facets: {sorted(sources^original_ids)}')
    aliases=seams.get('aliases',{})
    for retired,survivor in aliases.items():
        if retired in parts or survivor not in parts:
            raise ValueError(f'Invalid historical panel link {retired} → {survivor}')
        parts[survivor].setdefault('prior_ids',[]).append(retired)
    layout=dict(panel_count=len(parts),pieces=layout,splits=splits,omitted=[],aliases=aliases)
    return dict(revision='Earl · restored crown and triangular DJ window header',panel_count=len(parts),panels=panels,omitted=[],aliases=aliases),layout,original


def regenerated(refit=False):
    html=WORKSHOP.read_text()
    block=DATA_BLOCK.search(html)
    data,layout,original=build(refit)
    panels=data['panels']
    csv_text=io.StringIO(newline='')
    writer=csv.writer(csv_text,lineterminator='\n')
    writer.writerow(['Panel ID','Name','Length (in)','Width (in)','Area (sq ft)','Vertices (world meters)',
                     'Material (provisional)','Thickness (in)','Open area fraction','Bare steel (lb)','With 0.5 lb/ft edging + 2 lb fittings (lb)','With 1 lb/ft edging + 2 lb fittings (lb)','Tip span (in)','Stock margin per side (in)','Flat outline (meters)',
                     'Flat holes (meters)','Modeled plane error (mm)','Source faces','Exterior sides'])
    for p,item in zip(panels,layout['pieces']):
        writer.writerow([p['id'],p['name'],f"{p['length_m']/INCH:.3f}",f"{p['width_m']/INCH:.3f}",
                         f"{p['net_area_m2']/SQFT:.3f}",json.dumps(p['vertices_m']),p['material'],p['thickness_in'],p['open_area_fraction'],f"{p['bare_steel_lb']:.2f}",
                         f"{p['handling_half_lb']:.2f}",f"{p['handling_one_lb']:.2f}",f"{p['tip_span_m']/INCH:.2f}",f"{p['stock_margin_in']:.3f}",json.dumps(p['flat_vertices_m']),
                         json.dumps(p['flat_holes_m']),f"{p['planarity_error_mm']:.6f}",
                         ', '.join(f['source'] for f in item['faces']),len(p['vertices_m'])])
    total=sum(p['net_area_m2'] for p in panels)
    # Measure the glazing aperture on its four original driver-side facets.
    removed=0.
    for panel in original['panels']:
        if panel['id'] in PANEL_IDS:
            loops=panel_loops(panel['vertices_m'])
            removed+=panel['net_area_m2']-sum(area(flat(panel,np.asarray(loop))) for loop in loops)
    values={'area':f'{total:,.2f} m² ({total/SQFT:,.2f} ft²)',
            'removed':f'{removed/SQFT:.2f} ft²','pieces':str(len(panels)),
            'aluminum':f'{total*ALUMINUM:,.0f} lb','steel':f'{total*STEEL:,.0f} lb',
            'heaviest':f"{max(p['bare_steel_lb'] for p in panels):.1f} lb",
            'span':f"{max(p['tip_span_m'] for p in panels)/INCH:.1f} in"}
    values.update(stockLong=f"{max(p['length_m'] for p in panels)/INCH:.2f} in",
                  stockShort=f"{max(p['width_m'] for p in panels)/INCH:.2f} in",
                  clearance=f"{min(p['stock_margin_in'] for p in panels):.2f} in",
                  frameLight=f"{max(p['handling_half_lb'] for p in panels):.1f} lb",
                  frameHeavy=f"{max(p['handling_one_lb'] for p in panels):.1f} lb")
    shapes=('triangles','quadrilaterals','pentagons','hexagons')
    values['shapes']=', '.join(f'{count} {name}' for sides,name in enumerate(shapes,3)
                               if (count:=sum(len(p['vertices_m'])==sides for p in panels)))
    materials=MATERIALS.read_text()
    for key,val in values.items():
        materials,n=re.subn(rf'(<span data-skin="{key}">).*?(</span>)',lambda m:m[1]+val+m[2],materials)
        assert n==1,key
    print(f'{len(panels)} separate flat sheets, {total:.6f} m², {values["heaviest"]} peak steel skin, {values["span"]} maximum tip span')
    payload=json.dumps(data,separators=(',',':'),ensure_ascii=False)
    workshop=html[:block.start()]+payload+html[block.end():]
    workshop=re.sub(r'(<span data-panel-count>).*?(</span>)',lambda m:m[1]+str(len(panels))+m[2],workshop)
    return {WORKSHOP:workshop.encode(),
            REGISTER:csv_text.getvalue().encode(),MATERIALS:materials.encode(),
            LAYOUT:(json.dumps(layout,separators=(',',':'),ensure_ascii=False)+'\n').encode()}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group()
    mode.add_argument('--check',action='store_true',help='report out-of-date outputs')
    mode.add_argument('--refit',action='store_true',help='solve and store new flat corner positions after a seam change')
    args=parser.parse_args()
    for path,output in regenerated(args.refit).items():
        if args.check:
            if not path.is_file() or path.read_bytes()!=output:
                raise SystemExit(f'Run {Path(__file__).name} to update {path.name}')
        else:
            path.write_bytes(output)
