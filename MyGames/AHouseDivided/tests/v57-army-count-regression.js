const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync(require('path').join(__dirname,'..','military.js'),'utf8');
const count=(src.match(/Math\.max\(2,Math\.ceil\(baseDesired\*\.55\)\)/g)||[]).length;
assert.strictEqual(count,2,'both routine and emergency recruitment use reduced Regular target');
assert.strictEqual(Math.max(2,Math.ceil(16*.55)),9);
assert.strictEqual(Math.max(2,Math.ceil(28*.55)),16);
assert(src.includes("const maxRecruit=threatened?(typeof aiChallenge!=='undefined'&&aiChallenge==='medium'?2:3):1"),'Regular AI emergency recruitment is limited to two per cycle');
assert(src.includes('setting===\'hard\'?22:setting===\'easy\'?9:16'));
console.log('PASS: Regular AI division targets reduced ~45% in both recruitment paths');
