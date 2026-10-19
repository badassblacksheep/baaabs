"""Idealized section comparison, not allowable loads or a member selection."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1];SITE=ROOT/'site';I=.0254
rows=[]
for revision in ['v4','v5']:
 p=json.loads((SITE/f'assets/subframe-parameters-{revision}.json').read_text());w,d,t=p['sections_m']['upright'];count=len(p['stations'])*2
 bottom=p['donor']['rail_center_z_m']-p['donor']['rail_section_m'][0]/2;length=p['permanent_top_z_m']-bottom
 area=w*d-(w-2*t)*(d-2*t)
 side=(d*w**3-(d-2*t)*(w-2*t)**3)/12
 fore=(w*d**3-(w-2*t)*(d-2*t)**3)/12
 rows.append({'revision':revision,'transverse_in':w/I,'fore_aft_in':d/I,'wall_in':t/I,'post_count':count,'post_length_m':length,'total_post_mass_lb':area*length*count*7850*2.20462,'side_to_side_I_in4':side/I**4,'fore_aft_I_in4':fore/I**4,'station_width_in':(2*p['upright_y_m']+w)/I})
a,b=rows
r={'basis':'Nominal 1/8-inch steel wall, sharp corners, 7850 kg/m3. Idealized elastic section properties only; actual HSS corner radii, design wall thickness, local buckling, connections and bracing require engineering. No allowable load or safety factor is calculated.','sections':rows,'post_mass_change_lb':b['total_post_mass_lb']-a['total_post_mass_lb'],'post_mass_ratio':b['total_post_mass_lb']/a['total_post_mass_lb'],'side_to_side_stiffness_ratio':b['side_to_side_I_in4']/a['side_to_side_I_in4'],'fore_aft_stiffness_ratio':b['fore_aft_I_in4']/a['fore_aft_I_in4'],'reference':'https://steeltubeinstitute.org/resources/astm-a500/'}
(SITE/'assets/upright-comparison-v5.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2))
