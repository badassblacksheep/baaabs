const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const site=path.resolve(__dirname,'../site');
class El{
 constructor(){this.children=[];this.events={};this.dataset={};this.value='';this.checked=true;this.classes=new Set();this.classList={add:k=>this.classes.add(k),remove:k=>this.classes.delete(k)};this.model={materials:[]};}
 addEventListener(t,f,o={}){const entries=this.events[t]??=[];entries.push(f);o.signal?.addEventListener('abort',()=>this.events[t]=entries.filter(x=>x!==f))}
 append(e){e.parent=this;this.children.push(e)}
 remove(){this.parent.children=this.parent.children.filter(x=>x!==this)}
 replaceChildren(){this.children=[]}
 querySelectorAll(s){return s==='input'?this.children:this.children.filter(x=>x.className==='station-label')}
 querySelector(s){return this.children.find(x=>x.dataset.group===s.match(/group=(\w+)/)?.[1])}
 getAttribute(k){return this[k]}
 setAttribute(k,v){this[k]=v;if(k==='src')queueMicrotask(()=>{this.loaded=true;for(const f of [...this.events.load||[]])f({detail:{url:v}})})}
}
async function scenario(search){
 const els=new Map();const el=k=>{if(!els.has(k))els.set(k,new El());return els.get(k)};
 const doc={querySelector:el,querySelectorAll:()=>[],createElement:()=>new El(),baseURI:'https://example.test/'};
 for(const g of ['stations','deckframe','bracing','mounts','skin','head','body','chassis','deck','rails','equipment','masts']){const input=new El();input.dataset.group=g;el('#layers').append(input)}
 const budget=[];const context=vm.createContext({document:doc,console,URL,URLSearchParams,AbortController,queueMicrotask,customElements:{whenDefined:async()=>{}},matchMedia:()=>({matches:false,addEventListener(){}}),location:{search},budgetController:{setFrameEstimate:(...args)=>budget.push(args)},fetch:async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(site,url.split('?')[0]),'utf8'))})});
 const source=fs.readFileSync(path.join(site,'assets/subframe-study.mjs'),'utf8').replace(/^import[^\n]+\n/,'');
 await vm.runInContext('(async()=>{'+source+'})()',context);
 assert.equal(el('#status').classes.has('error'),false);
 return {el,budget};
}
(async()=>{
 const {el,budget}=await scenario('');
 assert.equal(el('#frame-layout').value,'six');assert.match(el('#study').src,/v3.glb/);assert.equal(el('#stations').children.length,6);assert.equal(budget.at(-1)[0],4309);assert.match(el('#layout-description').textContent,/First contender/);
 const row=el('#frame-comparison').children[2];assert.equal(row.children[1].textContent,'4,309 lb');assert.equal(row.children[2].textContent,'4,023 lb');assert.equal(row.children[3].textContent,'-286 lb');assert.equal(row.children[1].classes.has('active-column'),true);
 el('#frame-layout').value='five';await el('#frame-layout').events.change[0]();assert.match(el('#study').src,/v2.glb/);assert.equal(el('#stations').children.length,5);assert.equal(budget.at(-1)[0],4023);assert.match(el('#download-members').href,/v2.csv/);
 const five=await scenario('?layout=five');assert.equal(five.el('#frame-layout').value,'five');
 const invalid=await scenario('?layout=unknown');assert.equal(invalid.el('#frame-layout').value,'six');
 console.log('PASS six-station default, comparison values, five-station switch/downloads, explicit link and invalid-link fallback');
})().catch(error=>{console.error(error);process.exitCode=1});
