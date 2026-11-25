import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {costLedger, costPath, summarizeCosts, buildCostPages} from '../tools/build-cost-pages.mjs';
import {localReferenceExists} from './site-links.mjs';

test('reported payments are exact, estimated expenses are counted once', () => {
  const ledger = { ...costLedger, items: [
    {category: 'road', label:'Fuel', date:'2026-11', basis:'estimated', cents:2500},
    {category: 'road', label:'Tags', date:'2026-11', basis:'reported', cents:1250},
    {category: 'vehicle', label:'Auction', date:'2026-11-23', basis:'documented', cents:10001}
  ] };
  const summary = summarizeCosts(ledger);
  assert.equal(summary.total, 13751);
  assert.equal(summary.estimated, 2500);
  assert.deepEqual(summary.groups.map(g=>[g.slug,g.cents,g.estimated]), [['vehicle',10001,0],['road',3750,2500]]);
  ledger.items[0] = {...ledger.items[0], basis:'documented', cents:2582};
  const pages = buildCostPages(ledger, ()=>'');
  const totalPage = pages.get('costs/total/breakdown/index.html');
  assert.match(totalPage, /\$138\.33/);
  assert.doesNotMatch(totalPage, /≈/);
  assert.match(pages.get('costs/road/breakdown/index.html'), /\$38\.32/);
});

test('unknown categories and invalid cents cannot silently enter the total', () => {
  const item = costLedger.items[0];
  for (const change of [{category:'missing'}, {cents:0}, {cents:10.5}, {basis:'quote'}]) {
    assert.throws(() => summarizeCosts({...costLedger, items:[{...item, ...change}]}));
  }
});

test('every cost URL has a static page with reachable project assets and navigation', () => {
  const site = fileURLToPath(new URL('../site/', import.meta.url));
  const slugs = ['total', ...summarizeCosts(costLedger).groups.map(g=>g.slug)];
  for (const slug of slugs) {
    const path = costPath(slug).slice(1) + 'index.html';
    const html = readFileSync(site + path, 'utf8');
    assert.ok(html.includes('href="https://baaabs.org' + costPath(slug) + '"'));
    assert.match(html, /<nav aria-label="Main navigation">/);
    for (const [, ref] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (!ref.startsWith('https:') && !ref.startsWith('#')) assert.ok(localReferenceExists(site, path, ref), path + ' → ' + ref);
    }
  }
  const overview = readFileSync(site + costPath('total').slice(1) + 'index.html','utf8');
  for (const slug of slugs.slice(1)) assert.ok(overview.includes('href="' + costPath(slug) + '"'));
});
