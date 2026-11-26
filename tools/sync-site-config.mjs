// Regenerate static configuration projections; keep no-JS navigation and checkout.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { DRIVE_CONFIG, speedLimitWords } from '../site/test-drive/drive-config.mjs';

import { buildCostPages, costLedger } from './build-cost-pages.mjs';

const root = fileURLToPath(new URL('../site/', import.meta.url));
const read = p => readFileSync(resolve(root,p),'utf8');
const nav = JSON.parse(read('assets/navigation.json'));
const structuralTabs = JSON.parse(read('structural/navigation.json'));
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const changes = new Map();
const source = p => changes.get(p) ?? read(p);
function replace(p, pattern, replacement) {
  const html = source(p);
  if (!pattern.test(html)) throw Error(p + ': generated region not found: ' + pattern);
  changes.set(p,html.replace(pattern,()=>replacement));
}
function mainNavigation(page) {
  const links = nav.links.map(({href,label,external,page:target})=>{
    const url = external || href.startsWith('/') ? href : posix.relative(posix.dirname(page),href);
    return '<a href="'+escape(url)+'"'+((target ?? href)===page?' aria-current="page"':'')+(external?' target="_blank" rel="noopener"':'')+'>'+escape(label)+'</a>';
  }).join('');
  return '<nav aria-label="Main navigation">'+links+'</nav>';
}
for (const page of nav.pages) {
  replace(page,/<nav aria-label="Main navigation">[\s\S]*?<\/nav>/,mainNavigation(page));
}
for (const [page, html] of buildCostPages(costLedger, mainNavigation)) {
  changes.set(page, html);
}
// Historical report data stay untouched; only the shared navigation is generated.
for (const [page] of structuralTabs) {
  const links = structuralTabs.map(([href,label])=>'<a href="'+href+'"'+(href===page?' aria-current="page"':'')+'>'+label+'</a>').join('');
  replace('structural/'+page,/<nav class="design-tabs" aria-label="Structural design iterations">[\s\S]*?<\/nav>/,
    '<nav class="design-tabs" aria-label="Structural design iterations">'+links+'</nav>');
}

const skin = JSON.parse(read('assets/panel-skin.json'));
replace('the_build.html', /<a data-panel-material[^>]*>/,
  '<a data-panel-material data-finish="'+escape(skin.name)+'" href="assets/'+escape(skin.reference)+'">');

const sandbox = {window:{}, module:{exports:{}}, URL};
runInNewContext(read('assets/patch-config.js'),sandbox);
runInNewContext(read('assets/patch.js'),sandbox);
const patch = sandbox.window.BAAABS_PATCH;
const checkout = sandbox.module.exports.checkoutLink(patch,false,'baaabs');
if (![patch.widthInches,patch.heightInches].every(n=>Number.isFinite(n)&&n>0)) throw Error('Invalid patch dimensions');
const price = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:2}).format(patch.priceUsd);
const dimensions = patch.widthInches+'″ wide × '+patch.heightInches+'″ tall';
const fallback = (label)=>checkout?'<a class="button" href="'+escape(checkout)+'">'+label+'</a>':'<span>Checkout unavailable</span>';
replace('index.html',/(?:<a class="button" href="https:\/\/buy\.stripe\.com\/[^"]+">Buy the patch · [^<]+<\/a>|<span>Checkout unavailable<\/span>)/,fallback('Buy the patch · '+price+' shipped'));
replace('patch.html',/(?:<a class="button" href="https:\/\/buy\.stripe\.com\/[^"]+">Buy the patch ↗<\/a>|<span>Checkout unavailable<\/span>)/,fallback('Buy the patch ↗'));
replace('patch.html',/<p class="price">[^<]+<span>USD · US shipping included<\/span><\/p>/,'<p class="price">'+price+' <span>USD · US shipping included</span></p>');
replace('patch.html',/<figcaption>The patch measures [^<]+\. Lighter shown for scale\.<\/figcaption>/,'<figcaption>The patch measures '+dimensions+'. Lighter shown for scale.</figcaption>');
replace('patch.html',/<li>[\d.]+″ wide × [\d.]+″ tall<\/li>/,'<li>'+dimensions+'</li>');
replace('patch.html',/<p id="shipping-detail">[^<]*<\/p>/,'<p id="shipping-detail">'+escape(patch.fulfillmentSummary)+'</p>');

const drive = 'test-drive/index.html', mph=DRIVE_CONFIG.speedLimitMph;
replace(drive,/<small>MPH &nbsp;\/&nbsp; LIMIT [\d.]+<\/small>/,'<small>MPH &nbsp;/&nbsp; LIMIT '+mph+'</small>');
replace(drive,/<span><kbd>5<\/kbd> Cruise at [\d.]+<\/span>/,'<span><kbd>5</kbd> Cruise at '+mph+'</span>');
replace(drive,/<button data-key="Digit5" id="cruise-button" aria-label="Cruise at [\d.]+ mph" aria-pressed="false">Cruise [\d.]+<\/button>/,'<button data-key="Digit5" id="cruise-button" aria-label="Cruise at '+mph+' mph" aria-pressed="false">Cruise '+mph+'</button>');
replace(drive,/<p id="copy">One black sheep\. Two rear poofers\.<br>Keep it at [^<]+ miles an hour\.<\/p>/,'<p id="copy">One black sheep. Two rear poofers.<br>Keep it at '+speedLimitWords+' miles an hour.</p>');
for(const property of ['og','twitter']){
  const attribute=property==='og'?'property':'name';
  const pattern=new RegExp('<meta '+attribute+'="'+property+':description" content="Drive baaabs across deep playa, fire the poofers, and keep it at [^"]+ miles an hour\\.">');
  replace(drive,pattern,'<meta '+attribute+'="'+property+':description" content="Drive baaabs across deep playa, fire the poofers, and keep it at '+speedLimitWords+' miles an hour.">');
}

const write=process.argv.includes('--write');
let stale=0;
for(const [p,html] of changes){
  const target = resolve(root,p);
  if(existsSync(target) && html===read(p))continue;
  stale++;
  if(write){
    mkdirSync(dirname(target),{recursive:true});
    writeFileSync(target,html);
  }
  console.log((write?'Updated ':'Stale ')+p);
}
if(stale&&!write){console.error('Run node tools/sync-site-config.mjs --write and commit the generated pages.');process.exitCode=1;}
else console.log('Site configuration projections verified.');
