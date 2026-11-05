"""Create standalone review HTML with embedded styling, images and video.
Run from the repository root. These are review files, never production inputs.
"""
from pathlib import Path
import base64,mimetypes,re,json
ROOT=Path(__file__).resolve().parents[1]
SITE=ROOT/'site'; OUT=ROOT/'review';OUT.mkdir(exist_ok=True)
def uri(relative):
 p=SITE/relative
 return 'data:'+mimetypes.guess_type(p.name)[0]+';base64,'+base64.b64encode(p.read_bytes()).decode()
for source,dest in [('index.html','home-preview.html'),('patch.html','patch-preview.html')]:
 html=(SITE/source).read_text()
 html=html.replace('<link rel="stylesheet" href="assets/launch.css">','<style>'+(SITE/'assets/launch.css').read_text()+'</style>')
 scripts=re.findall(r'<script src="([^"]+)" defer></script>',html)
 html=re.sub(r'<script src="[^"]+" defer></script>','',html)
 def embed(m):return m[1]+'="'+uri(m[2])+'"'
 html=re.sub(r'(src|data-src|poster)="(assets/[^\"]+)"',embed,html)
 html=html.replace('href="./"','href="home-preview.html"').replace('href="patch.html"','href="patch-preview.html"')
 html=html.replace('href="panels.html"','href="https://baaabs.org/panels.html"').replace('href="frame-comparison.html"','href="https://baaabs.org/frame-comparison.html"')
 js='\n'.join((SITE/p).read_text() for p in scripts)
 if source=='index.html':
  # This review artifact has no module/model dependencies. Retain the production
  # interactive viewer in the site; review links to the hosted build workshop.
  js=js[:js.index('  const details =')]+'})();'
  html=html.replace('<div id="model-slot"><p>Loading the interactive model…</p></div>','<div id="model-slot"><p><a href="https://baaabs.org/panels.html">Open the interactive build model ↗</a></p></div>')
 html=html.replace('</body>','<script>'+js+'</script></body>')
 (OUT/dest).write_text(html)
 local=re.findall(r'(?:src|poster)="(?!data:|https:)([^\"]+)"',html)
 assert not local,local
 assert '<style>' in html and '<script src=' not in html
 print(dest,len(html.encode()),'bytes; styles and media embedded')
