const assert=require('assert'),fs=require('fs'),vm=require('vm');
const requests=[];
const board=['DIG','NICKEL','FORCE','GRAVITY','PORT','SERVER','APPLE','CLOCK','SHARK','ROCKET','RIVER','FLOOR','MUFFIN','TOAST','STEAM','COTTON','WOOL','SAPPHIRE','LOCKET','FERRET','FOX','CAT','DOG','SKI','HIGHWAY'];
let payload={word:'MINE',n:2,targets:['DIG','NICKEL'],reason:'Mining connects digging and nickel.',provider:'gemini'};
const ctx=vm.createContext({
  fetch:async(url,options)=>{requests.push(JSON.parse(options.body));return{ok:true,json:async()=>payload}},
  AbortController,clearTimeout,setTimeout,console,Set,
  cbLegalClue:()=>true,aiClue:()=>({word:'FALLBACK',n:1}),
  aiGuess:()=>({i:0}),toast:()=>{},
});
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..','gemini-client.js'),'utf8'),ctx);
const g={words:board,keys:board.map((_,i)=>i<2?'red':i===8?'assassin':'blue'),revealed:board.map(()=>false),log:[],clue:{word:'PHYSICS',n:2},guesses:0};
(async()=>{
  const clue=await vm.runInContext('cbLiveClue',ctx)(g,'red','hard');
  assert.strictEqual(clue.word,'MINE');assert.strictEqual(clue.n,2);
  assert.deepStrictEqual(requests[0].keys.slice(0,2),['red','red']);
  payload={guesses:['FORCE','GRAVITY'],stopAfter:2,reason:'Both are physics.',provider:'gemini'};
  const first=await vm.runInContext('cbLiveGuess',ctx)(g,'red','hard');
  assert.strictEqual(board[first.choice.i],'FORCE');
  assert.ok(!Object.prototype.hasOwnProperty.call(requests[1],'keys'),'Guesser request leaked hidden colors');
  g.revealed[2]=true;g.guesses=1;
  const second=await vm.runInContext('cbLiveGuess',ctx)(g,'red','hard');
  assert.strictEqual(board[second.choice.i],'GRAVITY');
  assert.strictEqual(requests.length,2,'Expected one call per clue, not one per guess');
  g.revealed[3]=true;g.guesses=2;
  const stop=await vm.runInContext('cbLiveGuess',ctx)(g,'red','hard');
  assert.strictEqual(stop.choice,null);
  console.log('PASS: server clue, guesser privacy, cached plan, stop decision');
})().catch(e=>{console.error(e);process.exitCode=1});
