import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { amount, dollars, money, share } from '../site/costs/format.mjs';

const base = new URL('../site/costs/', import.meta.url);
export const costLedger = JSON.parse(readFileSync(new URL('ledger.json', base), 'utf8'));
export const costPath = slug => `/costs/${slug}/breakdown/`;
const styleVersion = createHash('sha256').update(readFileSync(new URL('costs.css', base))).digest('hex').slice(0, 12);
const day = new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'});
const month = new Intl.DateTimeFormat('en-US', {month: 'long', year: 'numeric', timeZone: 'UTC'});
const basisLabels = {documented: 'Documented payment', reported: 'Amount confirmed by owner', estimated: 'Owner estimate'};

function dateLabel(date) {
  return date.length === 7 ? month.format(new Date(date + '-01T12:00:00Z')) : day.format(new Date(date + 'T12:00:00Z'));
}
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const dateTag = date => `<time datetime="${esc(date)}">${dateLabel(date)}</time>`;

export function summarizeCosts(ledger) {
  const groups = new Map();
  for (const category of ledger.categories) {
    if (!/^[a-z][a-z0-9-]*$/.test(category.slug) || category.slug === 'total' || groups.has(category.slug)) {
      throw Error('Invalid or repeated cost category: ' + category.slug);
    }
    if (!/^#[0-9a-f]{6}$/i.test(category.color)) throw Error('Invalid cost category color');
    groups.set(category.slug, {...category, items: [], cents: 0, estimated: 0});
  }
  let total = 0, estimated = 0;
  for (const item of ledger.items) {
    const group = groups.get(item.category);
    if (!group || !Object.hasOwn(basisLabels, item.basis) || !Number.isSafeInteger(item.cents) || item.cents <= 0) {
      throw Error('Invalid spending entry: ' + item.label);
    }
    group.items.push(item);
    group.cents += item.cents;
    total += item.cents;
    if (item.basis === 'estimated') {
      group.estimated += item.cents;
      estimated += item.cents;
    }
  }
  const groupsBySpend = [...groups.values()].filter(group => group.items.length).sort((a, b) => b.cents - a.cents);
  return {groups: groupsBySpend, total, estimated};
}

// Use the same opaque image for each segment and its legend key. Page themes may
// replace CSS background colors, but the data colors belong to the graphic.
function swatchPath(group) {
  return 'assets/costs/' + group.slug + '-' + group.color.slice(1).toLowerCase() + '.svg';
}

function swatchSvg(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20" preserveAspectRatio="none">
  <defs><linearGradient id="light"><stop stop-color="white" stop-opacity="0"/><stop offset="1" stop-color="white" stop-opacity=".18"/></linearGradient></defs>
  <rect width="100" height="20" fill="${color}"/><rect width="100" height="20" fill="url(#light)"/>
</svg>
`;
}

function chart(groups, total) {
  const segments = groups.map(g => `<a href="${costPath(g.slug)}" data-segment="${g.slug}" style="flex:${g.cents}" aria-label="${esc(g.name)}, ${amount(g.cents,g.estimated)}, ${share(g.cents,total)}"><img src="/${swatchPath(g)}" alt="" width="100" height="20"></a>`).join('');
  const rows = groups.map(g => `<li data-category="${g.slug}" data-cents="${g.cents}" data-estimated="${g.estimated}" style="--ink:${g.color}">
    <details id="purchases-${g.slug}" name="purchases"><summary class="cost-row">
    <img class="swatch" src="/${swatchPath(g)}" alt="" width="14" height="14"><span class="row-copy"><strong>${esc(g.name)}</strong><span>${esc(g.description)}</span></span>
    <span class="row-value">${amount(g.cents,g.estimated)}</span><span class="row-percent">${share(g.cents,total)}</span>
    <span class="chevron" aria-hidden="true"></span></summary>
    <div class="row-detail">${purchases(g)}<a href="${costPath(g.slug)}">Open category page</a></div></details></li>`).join('');
  const axis = [0, .25, .5, .75, 1].map(f => `<span>${dollars.format(f*total/100)}</span>`).join('');
  return `<section class="breakdown" id="explorer" aria-labelledby="split-heading">
    <h2 id="split-heading">Explore the spending</h2>
    <p>Choose a color or open a category to see what we bought.</p>
    <div class="chart-tools" hidden>
      <fieldset class="units"><legend class="sr-only">Chart units</legend>
        <label><input type="radio" name="chart-units" value="spent" checked><span>Dollars spent</span></label>
        <label><input type="radio" name="chart-units" value="hundred"><span>Per $100</span></label>
      </fieldset>
      ${groups.some(g=>g.slug==='vehicle') && groups.length>1 ? '<label class="bus-filter"><input type="checkbox" data-bus checked> Include bus purchase</label>' : ''}
    </div>
    <div class="scale"><div class="bar" aria-label="Spending by category">${segments}</div>
    <div class="ticks" aria-hidden="true">${axis}</div></div>
    <p class="chart-readout" aria-live="polite" aria-atomic="true" hidden></p>
    <ul class="cost-rows" aria-label="Spending categories, amounts and shares">${rows}</ul></section>`;
}

function purchases(group) {
  const items = [...group.items].sort((a,b)=>b.date.localeCompare(a.date));
  return `<ul class="item-list">${items.map(item => `<li><div class="item-copy"><span class="item-date">${dateTag(item.date)}</span>
      <h3>${esc(item.label)}</h3><p>${esc(item.detail)}</p></div>
      <div class="item-amount"><strong>${amount(item.cents, item.basis === 'estimated')}</strong><span>${basisLabels[item.basis]}</span></div></li>`).join('')}</ul>`;
}
function itemList(group) {
  return `<section class="breakdown" aria-labelledby="items-heading"><h2 id="items-heading">What we paid for</h2>${purchases(group)}</section>`;
}


export function buildCostPages(ledger, navigation) {
  const {groups, total, estimated} = summarizeCosts(ledger);
  const estimateItems = ledger.items.filter(item => item.basis === 'estimated');
  const estimateDescription = estimateItems.length === 1 ? 'for ' + esc(estimateItems[0].label.toLowerCase()) : 'in estimated spending';
  const pages = new Map(groups.map(group => [swatchPath(group), swatchSvg(group.color)]));
  for (const group of [null, ...groups]) {
    const slug = group?.slug ?? 'total';
    const route = costPath(slug);
    const file = route.slice(1) + 'index.html';
    const photo = group ?? ledger.overview;
    const cents = group?.cents ?? total, approx = group?.estimated ?? estimated;
    const title = group ? group.name : 'What we’ve spent';
    const description = group ? group.description : 'Follow the money behind the black sheep art bus, from buying Earl to stitching the fundraiser patches.';
    const amountNote = approx ? `${money.format((cents - approx) / 100)} in exact payments plus about ${dollars.format(approx / 100)} ${estimateDescription}.` : 'Total of recorded payments.';
    const crumb = group ? `<a href="${costPath('total')}">All spending</a><span aria-hidden="true">/</span>${esc(group.name)}` : 'Project costs';
    const details = group ? itemList(group) : chart(groups, total);
    const sectionLinks = group ? `<nav class="other-cats" aria-label="Other spending categories"><a class="back" href="${costPath('total')}">All spending</a>${groups.filter(g=>g!==group).map(g=>`<a href="${costPath(g.slug)}">${esc(g.name)}</a>`).join('')}</nav>` : '';
    pages.set(file, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Project costs · BAAABS</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="https://baaabs.org${route}"><meta name="theme-color" content="#0c0a10">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)} · BAAABS"><meta property="og:description" content="${esc(description)}"><meta property="og:image" content="https://baaabs.org${esc(photo.image)}"><meta property="og:url" content="https://baaabs.org${route}">
<link rel="stylesheet" href="/assets/typography.css"><link rel="stylesheet" href="/assets/flock-nav.css"><link rel="stylesheet" href="/costs/costs.css?v=${styleVersion}">${group ? '' : '<script type="module" src="/costs/explore.mjs"></script>'}</head>
<body><a class="skip" href="#main">Skip to content</a><header class="flock-header"><a class="flock-home" href="/" aria-label="BAAABS home"><img src="/assets/baaabs-wordmark-glow.svg" alt="BAAABS" width="150" height="37"></a>${navigation(file)}</header>
<main id="main"><div class="topline"><div class="crumb">${crumb}</div><span>As of ${dateTag(ledger.asOf)}</span></div>
<div class="hero"${group ? ` style="--accent:${group.color}"` : ''}><div class="hero-copy"><h1>${esc(title)}</h1>
<p class="big-value" aria-label="${approx ? 'About ' + dollars.format(cents / 100) : money.format(cents / 100)}">${amount(cents, approx)}</p>
<p class="hero-detail">${group ? esc(description) : 'Building <span class="sheep-name">BAAABS</span>, a black sheep art bus for Black Rock City.'}</p>
<p class="hero-note">${group ? '<strong>' + share(cents, total) + '</strong> of all project spending.' : amountNote}</p></div>
<figure class="hero-photo hero-${slug}"><img src="${esc(photo.image)}" alt="${esc(photo.alt)}" fetchpriority="high"><figcaption>${esc(photo.caption)}</figcaption></figure></div>
${details}${sectionLinks}
<footer class="ledger-footer"><p>${group ? 'Amounts are in US dollars.' : 'This running total includes purchases recorded through ' + dateLabel(ledger.asOf) + '. Amounts show spending before any patch sales or donations.'}</p><a href="/journal/">Read the build journal</a></footer></main></body></html>
`);
  }
  return pages;
}
