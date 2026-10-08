import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brainSchema, resultSchema, demoResult, defaultConfig, correlation, csv, ROIS } from '../lib/neurosim.ts';
const asset=brainSchema.parse(JSON.parse(readFileSync(new URL('../public/brain/fsaverage5.json',import.meta.url),'utf8')));
test('demo exports remain explicitly synthetic and match atlas labels',()=>{
 const result=resultSchema.parse(demoResult(asset,defaultConfig));
 assert.equal(result.source,'demo');
 assert.equal(result.times.length,30);
 assert.equal(result.regions.length,12);
 for(const roi of ROIS)assert.equal(asset.labels[roi.id],roi.label);
 assert.match(result.provenance.model,/synthetic/);
 assert.equal(csv(result).split('\n').length,13);
 assert.match(csv(result),/"demo"/);
});
test('constant correlations are undefined and inverse signals are negative',()=>{
 assert.equal(correlation([1,1,1],[1,2,3]),null);
 assert.equal(correlation([1,2,3],[3,2,1]),-1);
});
test('result validation rejects wrong surface shape and unaligned series',()=>{
 const result=demoResult(asset,defaultConfig);
 assert.equal(resultSchema.safeParse({...result,surface_a:[0]}).success,false);
 result.regions[0].series_a.pop();
 assert.equal(resultSchema.safeParse(result).success,false);
});
