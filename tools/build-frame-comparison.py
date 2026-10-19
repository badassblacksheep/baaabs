"""Derive comparison evidence from the unchanged v5 member schedule."""
import csv
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'site/assets'
LB=2.20462262185

def build():
    p=json.loads((ASSETS/'subframe-parameters-v5.json').read_text())
    brief=json.loads((ASSETS/'frame-design-brief.json').read_text())
    with (ASSETS/'subframe-members-v5.csv').open() as source:
        rows=list(csv.DictReader(source))
    def mass(predicate):return sum(float(r['approx_kg']) for r in rows if predicate(r))*LB
    floor=p['deck']['length_m']*p['deck']['width_m']*p['deck']['plywood_thickness_m']*600*LB
    categories=[
        {'id':'stations','label':'Posts, lower beams, caps & headers','lb':mass(lambda r:bool(r['station']))},
        {'id':'joists','label':'37 floor joists','lb':mass(lambda r:r['id'].startswith('DECK-J'))},
        {'id':'floor','label':'Plywood floor','lb':floor},
        {'id':'longitudinals','label':'Longitudinal roof beams','lb':mass(lambda r:r['id'].startswith('DECK-') and '-L' in r['id'])},
        {'id':'bracing','label':'Side & roof diagonals','lb':mass(lambda r:r['id'].startswith('BR-'))}]
    assert abs(sum(c['lb'] for c in categories)-mass(lambda r:True)-floor)<.001
    positions={s['id']:s['x_m'] for s in p['stations']}
    concepts=[]
    for c in brief['concepts']:
        selected=[positions[i] for i in c['station_ids']]
        spans=[b-a for a,b in zip(selected,selected[1:])]
        removed=[i for i in positions if i not in c['station_ids']]
        concepts.append({**c,'station_x_m':selected,'spans_m':spans,'maximum_span_m':max(spans),
                         'removed_station_ids':removed,'gross_removed_station_mass_lb':mass(lambda r:r['station'] in removed)})
    ratio=concepts[1]['maximum_span_m']/concepts[0]['maximum_span_m']
    return {'revision':'lightweight-comparison-1','brief':brief,'reference':'subframe-study-v5',
      'mass_basis':'Current schedule: nominal sharp-corner steel at 7850 kg/m³; plywood at 600 kg/m³. Rounded source member masses. No structural adequacy implied.',
      'excluded_mass':['connections and fasteners','guardrails','panels and panel subframes','head','speakers and other equipment'],
      'categories':categories,'baseline_lb':sum(c['lb'] for c in categories),'concepts':concepts,
      'span_sensitivity':{'moment_ratio':ratio**2,'deflection_ratio':ratio**4,
        'basis':'Simply supported beam, same uniform line load and unchanged section/EI. This is a span sensitivity, not a truss analysis or whole-frame response.'},
      'diagram':{'donor_length_m':p['donor']['length_m'],'donor_height_m':p['donor']['height_m'],
        'deck_length_m':p['deck']['length_m'],'deck_width_m':p['deck']['width_m'],
        'deck_height_m':p['deck']['surface_z_m'],'station_base_m':p['donor']['rail_center_z_m']-p['donor']['rail_section_m'][0]/2,
        'axles_x_m':[p['donor']['front_axle_x_m'],p['donor']['rear_axle_x_m']],
        'stations':p['stations']},
      'budget_basis':'User-controlled mass targets only. Shared reductions apply equally to both concepts. Four-station extra steel/joints is a NET allowance relative to the retained v5 members, including all reinforcement, replacements and differential fittings. Unlisted common systems remain excluded. No resulting value is a sized design or total vehicle weight.'}

if __name__=='__main__':
    data=build()
    (ASSETS/'frame-comparison.json').write_text(json.dumps(data,indent=2)+'\n')
    print(f"Reference {data['baseline_lb']:.1f} lb; four-station gross removal {data['concepts'][1]['gross_removed_station_mass_lb']:.1f} lb")
