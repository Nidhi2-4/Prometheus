// Run: node scripts/check-rppg.ts
import assert from 'node:assert';
import { estimateBpm } from '../src/services/rppg.ts';

const fps = 30;
const pulse = Array.from({ length: fps * 25 }, (_, n) => 110 + 0.4 * Math.sin((2 * Math.PI * 72 * n) / 60 / fps) + n * 0.01 + (Math.random() - 0.5) * 0.3);
const r = estimateBpm(pulse, fps, 120);
assert.ok(r.bpm !== null && Math.abs(r.bpm - 72) <= 2, `expected ~72, got ${r.bpm}`);
assert.notEqual(r.quality, 'poor');

const noise = Array.from({ length: fps * 25 }, () => 110 + (Math.random() - 0.5) * 4);
assert.equal(estimateBpm(noise, fps, 120).bpm, null);
assert.equal(estimateBpm(pulse, fps, 20).quality, 'poor');
console.log('rppg ok', r);
