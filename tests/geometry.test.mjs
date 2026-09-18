import test from 'node:test';
import assert from 'node:assert/strict';
import {createPieces, DIFFICULTIES, shuffled, formatTime} from '../puzzle.js';
for(const [key,d] of Object.entries(DIFFICULTIES)) test(`${key}: count and complementary interlocking edges`,()=>{
 const pieces=createPieces(d.cols,d.rows,18);
 assert.equal(pieces.length,{easy:12,normal:24,hard:54}[key]);
 for(const p of pieces){
  if(p.c<d.cols-1)assert.equal(p.sides[1],-pieces[p.id+1].sides[3]);else assert.equal(p.sides[1],0);
  if(p.r<d.rows-1)assert.equal(p.sides[2],-pieces[p.id+d.cols].sides[0]);else assert.equal(p.sides[2],0);
  if(!p.c)assert.equal(p.sides[3],0);if(!p.r)assert.equal(p.sides[0],0);
 }
 assert.deepEqual(pieces,createPieces(d.cols,d.rows,18));
});
test('shuffle preserves every piece',()=>{const a=Array.from({length:54},(_,i)=>i);assert.deepEqual(shuffled(a).sort((a,b)=>a-b),a)});
test('time formatting and invalid grids',()=>{assert.equal(formatTime(65.9),'01:05');assert.equal(formatTime(-10),'00:00');assert.throws(()=>createPieces(0,6));});
