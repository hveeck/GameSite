const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync(require('path').join(__dirname,'..','military.js'),'utf8');
assert(src.includes('Math.max(2,Math.ceil(baseDesired*({easy:.57,medium:.55,hard:1.13})[setting]))'),'routine recruitment uses challenge-specific target');
assert(src.includes('Math.max(2,Math.ceil(baseDesired*({easy:.57,medium:.55,hard:1.13})[challenge]))'),'emergency recruitment uses challenge-specific target');
assert.strictEqual(Math.max(2,Math.ceil(16*.55)),9);
assert.strictEqual(Math.max(2,Math.ceil(28*.55)),16);
assert(src.includes("const maxRecruit=threatened?(typeof aiChallenge!=='undefined'&&aiChallenge==='hard'?3:2):1"),'Easy and Regular AI emergency recruitment is limited to two per cycle');
assert(src.includes('setting===\'hard\'?22:setting===\'easy\'?9:16'));
console.log('PASS: Regular AI division targets reduced ~45% in both recruitment paths');
