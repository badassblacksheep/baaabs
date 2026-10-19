"""Audit the current road-width study. --require-pass rejects a failing/incomplete design."""
from pathlib import Path
import argparse, hashlib, json, sys
from glb_bounds import bounds
ROOT=Path(__file__).resolve().parents[1];SITE=ROOT/'site';INCH=.0254

def assess(parts, maximum_m, inventory_complete):
    if not parts: raise ValueError('Road inventory is empty')
    low=min(p['min'][1] for p in parts); high=max(p['max'][1] for p in parts)
    width=high-low
    if width>maximum_m: status='FAIL'
    elif not inventory_complete: status='INCOMPLETE'
    else: status='PASS'
    return {'status':status,'width_m':round(width,7),'width_in':round(width/INCH,4),'excess_in':round(max(0,width-maximum_m)/INCH,4),'inventory_complete':inventory_complete}

def report():
    config=json.loads((SITE/'assets/project-constraints.json').read_text());constraint=config['road_width'];current=config['current_road_study']
    assert constraint['required'] and constraint['maximum_inches']==102
    assert abs(constraint['maximum_meters']-102*INCH)<1e-12
    paths={'stations':current['frame_model'],'mounting':current['mounting_model']}
    frame=bounds(SITE/paths['stations']);mount=bounds(SITE/paths['mounting'])
    stations=[n for n in frame if n['extras'].get('component') in ['stations','mounts']]
    assert len([n for n in stations if n['name'].endswith('-UP')])==12
    bus=[n for n in frame if n['extras'].get('component')=='bus' and not n['extras'].get('source_object','').startswith('Mirror')]
    # Stationary pads/sleeves/nuts stay attached. Mirror the local driver-side
    # concept for a conservative bilateral envelope; not a complete hardware inventory.
    dock=[n for n in mount if n['extras'].get('mount_group')=='dock']
    assert dock
    mirrored=[{**n,'name':n['name']+' mirrored estimate','min':[n['min'][0],-n['max'][1],n['min'][2]],'max':[n['max'][0],-n['min'][1],n['max'][2]]} for n in dock]
    limit=constraint['maximum_meters']
    assert current['retained_inventory_complete'] is False, 'Replace the local mirrored hardware estimate with a complete road assembly before marking inventory complete'
    retained=assess(bus+stations+dock+mirrored,limit,False)
    return {'requirement':constraint['id'],'maximum_inches':constraint['maximum_inches'],
      'stations_only':assess(stations,limit,True),
      'bus_stations_and_mirrored_dock_estimate':retained,
      'road_width_accepted':retained['status']=='PASS',
      'basis':'Current digital study; donor rub-rail projection is approximate. Nominal 96-inch exterior specification may already include rub rails. Not a field measurement.',
      'unresolved':['Current stations exceed the hard width limit','All retained fittings and installation/movement allowances must be inventoried','Verify the real donor exterior and rub-rail envelope'],
      'model_sha256':{k:hashlib.sha256((SITE/v).read_bytes()).hexdigest() for k,v in paths.items()}}

def banner(r):
    status=r['bus_stations_and_mirrored_dock_estimate']['status']
    label={'FAIL':'Current study does not meet it','INCOMPLETE':'Road inventory incomplete','PASS':'Model width check passes'}[status]
    action={'FAIL':'This study must be revised before it can be accepted for road use.','INCOMPLETE':'Complete the retained hardware inventory before accepting the road width.','PASS':'A model width check does not establish structural suitability or other road requirements.'}[status]
    return f'''<!-- ROAD-WIDTH-STATUS:START -->
<section id="road-width-requirement" style="margin:16px 0;padding:16px;border:1px solid #e8bf91;border-radius:10px" aria-label="Road width requirement"><strong>Road width: 102 in maximum · {label}</strong><p>Road mode retains the bus, six station pairs and every fitting left attached. The deck/frame, sheep panels, projecting arms, speakers and event equipment come off. Current stations alone: <strong>{r['stations_only']['width_in']:.1f} in</strong>; with mirrored docking pads: approximately <strong>{r['bus_stations_and_mirrored_dock_estimate']['width_in']:.1f} in</strong>. This is a model result; donor measurements and the complete retained hardware inventory remain unresolved.</p><p>The 102-in limit is a hard project requirement. {action} <a href="assets/road-width-status.json">Width check</a> · <a href="assets/project-constraints.json">Project requirement</a> · <a href="https://app.leg.wa.gov/rcw/default.aspx?cite=46.44.010">Washington rule</a></p></section>
<!-- ROAD-WIDTH-STATUS:END -->'''

def write(r):
    (SITE/'assets/road-width-status.json').write_text(json.dumps(r,indent=2)+'\n')
    for name in ['panels.html','subframe.html','panel-mounting.html']:
        path=SITE/name;s=path.read_text();start='<!-- ROAD-WIDTH-STATUS:START -->';end='<!-- ROAD-WIDTH-STATUS:END -->'
        if start in s:
            a=s.index(start);b=s.index(end,a)+len(end);s=s[:a]+banner(r)+s[b:]
        else:s=s.replace('</header>',banner(r)+'</header>',1)
        path.write_text(s)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--write',action='store_true');parser.add_argument('--require-pass',action='store_true');args=parser.parse_args()
    r=report()
    if args.write:write(r)
    print(json.dumps(r,indent=2))
    if args.require_pass and not r['road_width_accepted']:sys.exit(1)
