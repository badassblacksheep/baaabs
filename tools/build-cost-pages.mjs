import { readFileSync } from 'node:fs';

const base = new URL('../site/costs/', import.meta.url);
export const costLedger = JSON.parse(readFileSync(new URL('ledger.json', base), 'utf8'));
export const costPath = slug => `/costs/${slug}/breakdown/`;
const money = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'});
const dollars = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0});
const day = new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'});
const month = new Intl.DateTimeFormat('en-US', {month: 'long', year: 'numeric', timeZone: 'UTC'});
const basisLabels = {documented: 'Documented payment', reported: 'Amount confirmed by owner', estimated: 'Owner estimate'};

function dateLabel(date) {
  return date.length === 7 ? month.format(new Date(date + '-01T12:00:00Z')) : day.format(new Date(date + 'T12:00:00Z'));
}
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const pct = (part, total) => total ? 100 * part / total : 0;
const share = (part, total) => pct(part, total).toLocaleString('en-US', {maximumFractionDigits: 1}) + '%';
const amount = (cents, approx) => approx ? '≈' + dollars.format(cents / 100) : money.format(cents / 100);
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

function chart(groups, total) {
  const segments = groups.map(g => `<span style="flex:${g.cents};background:${g.color}"></span>`).join('');
  const rows = groups.map(g => `<li><a class="cost-row" href="${costPath(g.slug)}" style="--ink:${g.color}">
    <span class="swatch" aria-hidden="true"></span><span class="row-copy"><strong>${esc(g.name)}</strong><span>${esc(g.description)}</span></span>
    <span class="row-value">${amount(g.cents, g.estimated)}</span><span class="row-percent">${share(g.cents, total)}</span>
    <span class="chevron" aria-hidden="true"></span></a></li>`).join('');
  return `<section class="breakdown" aria-labelledby="split-heading">
    <h2 id="split-heading">Where each $100 goes</h2>
    <p>Each color shows one category’s share. Select a category to see the purchases.</p>
    <div class="scale" aria-hidden="true"><div class="bar">${segments}</div>
    <div class="ticks"><span>$0</span><span>$25</span><span>$50</span><span>$75</span><span>$100</span></div></div>
    <ul class="cost-rows" aria-label="Spending categories, amounts and shares">${rows}</ul></section>`;
}

function itemList(group) {
  const items = [...group.items].sort((a, b) => b.date.localeCompare(a.date));
  return `<section class="breakdown" aria-labelledby="items-heading"><h2 id="items-heading">What we paid for</h2>
    <ul class="item-list">${items.map(item => `<li><div class="item-copy"><span class="item-date">${dateTag(item.date)}</span>
      <h3>${esc(item.label)}</h3><p>${esc(item.detail)}</p></div>
      <div class="item-amount"><strong>${amount(item.cents, item.basis === 'estimated')}</strong><span>${basisLabels[item.basis]}</span></div></li>`).join('')}</ul></section>`;
}

export function buildCostPages(ledger, navigation) {
  const {groups, total, estimated} = summarizeCosts(ledger);
  const pages = new Map();
  for (const group of [null, ...groups]) {
    const slug = group?.slug ?? 'total';
    const route = costPath(slug);
    const file = route.slice(1) + 'index.html';
    const photo = group ?? ledger.overview;
    const cents = group?.cents ?? total, approx = group?.estimated ?? estimated;
    const title = group ? group.name : 'What we’ve spent';
    const description = group ? group.description : 'Follow the money behind the black sheep art bus, from buying Earl to stitching the fundraiser patches.';
    const amountNote = approx ? `${money.format((cents - approx) / 100)} in exact payments plus about ${dollars.format(approx / 100)} in estimated spending.` : 'Total of recorded payments.';
    const crumb = group ? `<a href="${costPath('total')}">All spending</a><span aria-hidden="true">/</span>${esc(group.name)}` : 'Project costs';
    const details = group ? itemList(group) : chart(groups, total);
    const sectionLinks = group ? `<nav class="other-cats" aria-label="Other spending categories"><a class="back" href="${costPath('total')}">All spending</a>${groups.filter(g=>g!==group).map(g=>`<a href="${costPath(g.slug)}">${esc(g.name)}</a>`).join('')}</nav>` : '';
    pages.set(file, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Project costs · BAAABS</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="https://baaabs.org${route}"><meta name="theme-color" content="#0c0a10">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)} · BAAABS"><meta property="og:description" content="${esc(description)}"><meta property="og:image" content="https://baaabs.org${esc(photo.image)}"><meta property="og:url" content="https://baaabs.org${route}">
<link rel="stylesheet" href="/assets/typography.css"><link rel="stylesheet" href="/assets/flock-nav.css"><link rel="stylesheet" href="/costs/costs.css"></head>
<body><a class="skip" href="#main">Skip to content</a><header class="flock-header"><a class="flock-home" href="/" aria-label="BAAABS home"><img src="/assets/baaabs-wordmark-glow.svg" alt="BAAABS" width="150" height="37"></a>${navigation(file)}</header>
<main id="main"><div class="topline"><div class="crumb">${crumb}</div><span>As of ${dateTag(ledger.asOf)}</span></div>
<div class="hero" style="--accent:${group?.color ?? '#ffca65'}"><div class="hero-copy"><h1>${esc(title)}</h1>
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
