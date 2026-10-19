"""Interior individual-mast concept evidence. Geometry and load allocation only."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
A=ROOT/'site/assets'

def build():
    p=json.loads((A/'subframe-parameters-v5.json').read_text())
    x={s['id']:s['x_m'] for s in p['stations']}
    length=p['deck']['length_m']
    def layout(id,name,positions,posts_per_station):
        boundaries=[-length/2,*[(a+b)/2 for a,b in zip(positions,positions[1:])],length/2]
        fractions=[(b-a)/length for a,b in zip(boundaries,boundaries[1:])]
        spans=[b-a for a,b in zip(positions,positions[1:])]
        return {'id':id,'name':name,'x_m':positions,'posts_per_station':posts_per_station,
                'post_count':len(positions)*posts_per_station,'spans_m':spans,'max_span_m':max(spans),
                'end_overhangs_m':[positions[0]+length/2,length/2-positions[-1]],
                'tributary_fractions':fractions,
                'uniform_static_load_per_post_lb':[13000*f/posts_per_station for f in fractions],
                'peak_uniform_static_load_per_post_lb':13000*max(fractions)/posts_per_station}
    layouts=[layout('three','Three individual interior posts',[x['A'],(x['A']+x['F'])/2,x['F']],1),
             layout('four','Four individual interior posts',[x[k] for k in ['A','C','D','F']],1),
             layout('six-reference','Six exterior station pairs',[s['x_m'] for s in p['stations']],2)]
    reference=layouts[2]['max_span_m']
    for l in layouts:
        l['unchanged_beam_moment_ratio']=(l['max_span_m']/reference)**2
        l['unchanged_beam_deflection_ratio']=(l['max_span_m']/reference)**4
    return {'revision':'interior-mast-study-1','status':'Concept investigation; not sized, load-rated, field-verified or accepted for road use',
      'observation':{'source':'User description of BAAAHS','confirmed':'Three individual posts within the cabin, not paired wall posts and cross-bus portals',
                     'unknown':'Exact locations, offsets, sections, roof framing and chassis attachments; no verified drawings or load ratings'},
      'brief':'frame-design-brief.json','geometry':{'donor_length_m':p['donor']['length_m'],
        'donor_outer_width_in':p['donor']['width_m']/.0254,'deck_length_m':length,
        'deck_width_in':p['deck']['width_m']/.0254,'deck_surface_height_m':p['deck']['surface_z_m'],
        'donor_roof_height_m':p['donor']['height_m'],
        'nominal_roof_to_deck_surface_in':(p['deck']['surface_z_m']-p['donor']['height_m'])/.0254,
        'rail_half_spacing_in':p['donor']['rail_center_y_m']/.0254,
        'reference_exterior_post_offset_in':p['upright_y_m']/.0254,
        'axle_x_m':[p['donor']['front_axle_x_m'],p['donor']['rear_axle_x_m']]},
      'defaults':{'layout':'four','placement':'rail','clear_interior_width_in':90,'post_width_in':4,'finish_allowance_each_side_in':1,'centered_aisle_band_in':30},
      'assumptions':['Cabin width and aisle band are unmeasured layout inputs, not legal minimums.',
        'Square post size is a space reservation only: material and wall thickness are not selected.',
        'All posts share one transverse offset in this first comparison. Staggered posts require a different roof-frame analysis.',
        'Three-post longitudinal positions are an evenly spaced trial between existing A and F, not BAAAHS measurements.',
        'Four-post longitudinal positions retain A/C/D/F only as a comparison; access and clashes are unresolved.',
        'The existing body receives no assumed dance-floor support capacity.'],
      'load_basis':{'people_lb':4500,'dead_load_scenario_lb':8500,'total_lb':13000,
        'method':'Uniform static load allocated by midpoint tributary lengths, divided equally between posts at a paired station. Not a solved roof grillage.',
        'limits':'Same unmeasured dead-load scenario for all layouts, not rebalanced for new frame mass. Excludes crowd clustering, dynamics, wind, eccentric equipment and connection moments. No allowable capacity is calculated.'},
      'layouts':layouts,'mass_status':'Unknown: roof grillage/trusses, transverse bending/torsion restraint, connections and foundations are unsized. Fewer posts do not establish a lighter complete design.',
      'preferred_next_test':'Four individual interior posts, near chassis-rail lines where integration with furniture is possible, with an independently designed roof grillage and chassis-connected bases. Compare three posts after checking span and concentrated-load penalties.',
      'width_status':'Inboard posts can avoid adding side width if every retained fitting remains inside the existing exterior. No complete candidate geometry audit exists; current v5 exterior reference still fails.',
      'sources':['https://centralstatesbus.com/wp-content/uploads/2010Manuals/D3FE/ServiceManual/ChassisFrame.pdf',
                 'https://centralstatesbus.com/wp-content/uploads/2010Manuals/D3FE/ServiceManual/BodyStructure.pdf']}

if __name__=='__main__':
    data=build();(A/'interior-support-study.json').write_text(json.dumps(data,indent=2)+'\n')
    for l in data['layouts']:
        print(l['id'],f"{l['max_span_m']/.3048:.2f} ft",f"{l['peak_uniform_static_load_per_post_lb']:.0f} lb/post")
