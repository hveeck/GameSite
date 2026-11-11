// Run `node scripts/test_ai.cjs` to sample random boards with real embeddings.
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const memory=new Map();
const ctx=vm.createContext({console,Math,globalThis:{},document:{querySelector:()=>({})},localStorage:{getItem:k=>memory.get(k)||'',setItem:(k,v)=>memory.set(k,v)}});
for(const name of ['words.js','extra-words.js','selected-vocabulary.js'])vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),ctx,{filename:name});
let app=fs.readFileSync(path.join(root,'app.js'),'utf8');
app=app.slice(0,app.indexOf('function render()'));
vm.runInContext(app,ctx,{filename:'app.js'});
vm.runInContext(fs.readFileSync(path.join(root,'embeddings.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(root,'semantic.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(root,'clue-concepts.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(root,'strategist.js'),'utf8'),ctx);
const total=Number(process.argv[2]||100);
let counts={},valid=0,firstCorrect=0,firstThree=0,assassinFirst=0;
for(let i=0;i<total;i++){
  const sample=vm.runInContext(`(()=>{let g=newGame();let c=aiClue(g,g.turn,'hard');let ranked=cbRank(g,c.word).map(x=>({w:x.word,i:x.i,k:x.key,score:x.s}));return{c,ranked,team:g.turn}})()`,ctx);
  counts[sample.c.n]=(counts[sample.c.n]||0)+1;
  const top=sample.ranked.slice(0,sample.c.n);
  if(top.every(x=>x.k===sample.team))valid++;
  if(top[0]?.k===sample.team)firstCorrect++;
  if(sample.c.n>=3&&top.every(x=>x.k===sample.team))firstThree++;
  if(top[0]?.k==='assassin')assassinFirst++;
  if(i<5)console.log('Sample',i+1,sample.c,top.map(x=>`${x.w}:${x.k}:${x.score.toFixed(2)}`));
}
console.log(JSON.stringify({total,clueNumbers:counts,allPromisedTopCardsFriendly:valid,firstGuessFriendly:firstCorrect,cleanThreeOrMore:firstThree,assassinFirst},null,2));
