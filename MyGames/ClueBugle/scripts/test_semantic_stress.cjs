// Cross-domain adversarial checks for broad-category leakage. The game should
// prefer a direct human association over an arbitrary same-topic neighbor.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({console,Math,globalThis:{},document:{querySelector:()=>({})},localStorage:{getItem:()=>null,setItem:()=>{}}});
for(const file of ['words.js','extra-words.js','selected-vocabulary.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8').split('function render()')[0],ctx);
for(const file of ['embeddings.js','semantic.js','clue-concepts.js','strategist.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
const cases=[
  ['KEYBOARD','ALPHABET','SERVER'],['CAMERA','FOCUS','PORT'],['COMPUTER','SERVER','ALPHABET'],
  ['FOREST','TREE','KEYBOARD'],['NATURE','RIVER','CAMERA'],['MUSIC','PIANO','SERVER'],
  ['CINEMA','ACTOR','RIVER'],['CLOTHING','SHIRT','ROCKET'],['FOOD','BREAD','CAMERA'],
  ['ROYAL','KING','SERVER'],['MEDICAL','DOCTOR','HIGHWAY'],['ANIMAL','FOX','KEYBOARD'],
  ['TRAVEL','HIGHWAY','PIANO'],['SCIENCE','TELESCOPE','KITTEN'],['SPORT','TENNIS','SERVER'],
  ['PAINTING','CANVAS','SERVER'],['GARDEN','FLOWER','SERVER'],['ELECTRICITY','BATTERY','LION']
];
const failures=[];
for(const [clue,related,distractor] of cases){
  const {good,bad}=vm.runInContext(`({good:cbSimilarity(${JSON.stringify(clue)},${JSON.stringify(related)}),bad:cbSimilarity(${JSON.stringify(clue)},${JSON.stringify(distractor)})})`,ctx);
  if(good<=bad+.08)failures.push(`${clue}: ${related}=${good.toFixed(2)} vs ${distractor}=${bad.toFixed(2)}`);
}
assert.deepStrictEqual(failures,[],`Poor direct-versus-distractor separation:\n${failures.join('\n')}`);
const scenario=vm.runInContext(`(()=>{const words=['PORT','SERVER','ALPHABET','FOCUS','CLOCK','RIVER'];const g={words,keys:['red','red','blue','assassin','neutral','neutral'],revealed:words.map(()=>false),log:[],turn:'red',phase:'clue'};return cbClue(g,'red','hard')})()`,ctx);
assert.ok(!['KEYBOARD','CAMERA'].includes(scenario.word)&&scenario.n===2,`Trapped by ${scenario.word} ${scenario.n}`);
console.log(`PASS: ${cases.length} cross-category association contrasts and an adversarial clue board`);
