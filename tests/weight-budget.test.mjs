import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateBudget,defaults} from '../site/assets/weight-budget.mjs';
test('planning baseline counts frame, other build and every occupant exactly once',()=>{
 const b=calculateBudget(defaults);assert.equal(b.stripped,20000);assert.equal(b.capacity,14200);assert.equal(b.occupants,4725);assert.equal(b.added,12748);assert.equal(b.gross,32748);assert.equal(b.remaining,1452);assert.equal(b.planningRemaining,-548);assert.equal(b.state,'reserve');
});
test('seat credit is equivalent to entering an already stripped scale weight with zero credit',()=>{
 const a=calculateBudget(defaults),b=calculateBudget({wetBus:20000,seats:0});for(const k of ['stripped','capacity','gross','remaining'])assert.equal(a[k],b[k]);
});
test('one additional occupant reduces headroom by the configured per-person allowance',()=>{
 const a=calculateBudget({people:20}),b=calculateBudget({people:21});assert.equal(a.remaining-b.remaining,225);assert.equal(a.capacity,b.capacity);
});
test('zero occupants does not retain the driver as a hidden addition',()=>{assert.equal(calculateBudget({people:0}).occupants,0)});
test('an overload stays visible rather than being clamped to a full meter',()=>{
 const b=calculateBudget({other:10000});assert.equal(b.remaining,-4548);assert.ok(b.percent>100);assert.equal(b.state,'over');
});
test('reserve is a planning buffer and does not change rated payload',()=>{
 const a=calculateBudget({reserve:0}),b=calculateBudget({reserve:5000});assert.equal(a.capacity,b.capacity);assert.equal(a.remaining,b.remaining);assert.equal(a.state,'within');assert.equal(b.state,'reserve');
});
test('a bus already at its assumed GVWR has no positive payload percentage',()=>{
 const b=calculateBudget({gvwr:20000});assert.equal(b.capacity,0);assert.equal(b.percent,null);assert.equal(b.state,'over');
});
test('invalid estimates are rejected instead of producing misleading arithmetic',()=>{
 for(const input of [{seats:22000},{gvwr:0},{other:-1},{people:1.5},{wetBus:NaN},{frame:Infinity}])assert.throws(()=>calculateBudget(input));
});
