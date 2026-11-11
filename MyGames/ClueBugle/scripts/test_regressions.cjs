const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),data=new Map();
const ctx=vm.createContext({console,Math,globalThis:{},document:{querySelector:()=>({})},localStorage:{getItem:k=>data.get(k)||'',setItem:(k,v)=>data.set(k,v)}});
for(const file of ['words.js','extra-words.js','selected-vocabulary.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8').split('function render()')[0],ctx);
for(const file of ['embeddings.js','semantic.js','clue-concepts.js','strategist.js','analysis.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
const evaluate=code=>vm.runInContext(code,ctx);
assert.strictEqual(evaluate('WORDS.length'),900,'Expected expanded 900-word solo pool');
// Taxonomy is genuinely broad enough to group related animals.
const animal=evaluate(`(()=>{const words=['FOX','KITTEN','CLOCK','BREAD','ROCKET'];const g={words,keys:['red','red','neutral','blue','assassin'],revealed:words.map(()=>false)};return cbRank(g,'ANIMAL').slice(0,2).map(x=>x.word)})()`);
assert.deepStrictEqual(Array.from(animal),['FOX','KITTEN']);
const pairClue=evaluate(`(()=>{const words=['FOX','KITTEN','CLOCK','BREAD','ROCKET','CHAIR'];const g={words,keys:['red','red','neutral','blue','assassin','blue'],revealed:words.map(()=>false),log:[],turn:'red',phase:'clue'};return aiClue(g,'red','hard')})()`);
assert.ok(pairClue.n>=2,`Expected a two-card animal clue, received ${pairClue.word} ${pairClue.n}`);
const bridge=evaluate(`(()=>{const words=['HIGHWAY','SKI','CLOCK','BREAD','ROCKET','CHAIR'];const g={words,keys:['red','red','neutral','blue','assassin','blue'],revealed:words.map(()=>false),log:[],turn:'red',phase:'clue'};return{clue:aiClue(g,'red','hard'),rank:cbRank(g,'TOURING')}})()`);
assert.ok(bridge.clue.n>=2,`Expected HIGHWAY and SKI connection, got ${bridge.clue.word} ${bridge.clue.n}`);
assert.deepStrictEqual(Array.from(bridge.rank.slice(0,2).map(x=>x.word)),['HIGHWAY','SKI']);
assert.ok(!bridge.clue.word.includes('-'),'Classic rules forbid hyphenated clues');
// Multi-domain links must exist before the board is generated, not be fitted
// to a bug report after the fact. Mining connects an action and a material.
const mining=evaluate(`(()=>{const words=['DIG','NICKEL','BINOCULARS','CLOCK','STEAM','SAPPHIRE','FORCE','ROCKET'];const g={words,keys:['red','red','blue','neutral','assassin','blue','neutral','neutral'],revealed:words.map(()=>false),log:[],turn:'red',phase:'clue'};return{clue:aiClue(g,'red','hard'),mine:cbRank(g,'MINE'),mineScores:[cbSimilarity('MINE','DIG'),cbSimilarity('MINE','NICKEL')]}})()`);
assert.strictEqual(mining.clue.n,2,`DIG + NICKEL needs one shared clue, got ${mining.clue.word} ${mining.clue.n}`);
assert.ok(['MINE','MINING','ORE','EXTRACT'].includes(mining.clue.word),`Expected recognizable mining connection, got ${mining.clue.word}`);
assert.deepStrictEqual(Array.from(mining.mine.slice(0,2).map(x=>x.word)),['DIG','NICKEL']);
assert.ok(mining.mineScores.every(s=>s>=.90),'MINE must strongly connect both senses');
const muffin=evaluate(`(()=>{const words=['MUFFIN','CLOCK','RIVER','STEAM','ROCKET'];const g={words,keys:['red','neutral','blue','neutral','assassin'],revealed:words.map(()=>false),log:[],turn:'red',phase:'clue'};return{dessert:cbSimilarity('DESSERT','MUFFIN'),breakfast:cbSimilarity('BREAKFAST','MUFFIN'),floorShape:cbSimilarity('SHAPE','FLOOR'),floorGround:cbSimilarity('GROUND','FLOOR')}})()`);
assert.ok(muffin.breakfast>muffin.dessert+.5,'MUFFIN must fit BREAKFAST much better than DESSERT');
assert.ok(muffin.floorGround>muffin.floorShape+.4,'FLOOR should suggest GROUND, not SHAPE');
const noBadIntended=evaluate(`(()=>{const words=['EXCAVATION','CRANE','CLOCK','RIVER','ROCKET'];const g={words,keys:['red','blue','neutral','neutral','assassin'],revealed:words.map(()=>false),log:[],turn:'red',phase:'clue',round:1};cbRecordAIClue(g,'red',{word:'CONSTRUCTION',n:2});return g.review[0]})()`);
assert.ok(noBadIntended.targets.every(x=>x.key==='red'),'Review must not call an opposing card intended');
assert.ok(noBadIntended.predictedRisks.some(x=>x.key==='blue'),'Review should expose nonteam as danger');
const fabric=evaluate(`(()=>{const words=['WOOL','COTTON','CLOTHES','CLOCK','ROCKET','JUDGE'];const g={words,keys:['red','red','red','neutral','assassin','blue'],revealed:words.map(()=>false),log:[],turn:'red',phase:'clue'};return{rank:cbRank(g,'FABRIC'),clue:aiClue(g,'red','hard')}})()`);
assert.deepStrictEqual(Array.from(fabric.rank.slice(0,3).map(x=>x.word)).sort(),['WOOL','COTTON','CLOTHES'].sort());
assert.ok(fabric.clue.n>=3,`Expected a 3-card fabric connection, got ${fabric.clue.word} ${fabric.clue.n}`);
// A technology tag alone must not convince the spymaster that KEYBOARD or
// CAMERA is a good clue for PORT+SERVER with ALPHABET and FOCUS as traps.
const techTraps=evaluate(`(()=>{const words=['PORT','SERVER','ALPHABET','FOCUS','CLOCK','RIVER','COTTON','ROCKET'];const g={words,keys:['red','red','blue','assassin','neutral','neutral','blue','neutral'],revealed:words.map(()=>false),log:[],turn:'red',phase:'clue'};return{clue:aiClue(g,'red','hard'),keyboard:cbRank(g,'KEYBOARD'),camera:cbRank(g,'CAMERA'),computer:cbRank(g,'COMPUTER')}})()`);
assert.ok(['COMPUTER','COMPUTING','NETWORK','TECHNOLOGY','ELECTRONICS','HOSTING','DATACENTER','PROTOCOL','CONNECTION','SOFTWARE','FIREWALL'].includes(techTraps.clue.word),`Expected a sensible computing clue, got ${techTraps.clue.word}`);
assert.strictEqual(techTraps.clue.n,2);
assert.strictEqual(techTraps.keyboard[0].word,'ALPHABET');
assert.strictEqual(techTraps.camera[0].word,'FOCUS');
assert.deepStrictEqual(Array.from(techTraps.computer.slice(0,2).map(x=>x.word)),['PORT','SERVER']);
const jewelry=evaluate(`(()=>{const words=['LOCKET','SAPPHIRE','CLOCK','BINOCULARS','ROCKET','COTTON'];const g={words,keys:['red','red','neutral','blue','assassin','neutral'],revealed:words.map(()=>false),log:[],turn:'red',phase:'clue'};return{clue:aiClue(g,'red','hard'),rank:cbRank(g,'JEWELRY')}})()`);
assert.deepStrictEqual(Array.from(jewelry.rank.slice(0,2).map(x=>x.word)),['LOCKET','SAPPHIRE']);
assert.ok(jewelry.clue.n>=2,`LOCKET and SAPPHIRE should connect, got ${jewelry.clue.word} ${jewelry.clue.n}`);
const streakJewelry=evaluate(`(()=>{const words=['LOCKET','SAPPHIRE','CLOCK','BINOCULARS','ROCKET','COTTON'];const g={words,keys:['red','red','neutral','blue','assassin','neutral'],revealed:words.map(()=>false),log:['RED clue: FIRST 1','BLUE guessed CLOCK — NEUTRAL','RED clue: SECOND 1','RED clue: OLD 2'],turn:'red',phase:'clue'};return aiClue(g,'red','hard')})()`);
assert.ok(streakJewelry.n>=2,`After two recent singles, AI should pursue the obvious jewelry pair, got ${streakJewelry.word} ${streakJewelry.n}`);
const pottery=evaluate(`(()=>{const words=['POTTERY','BINOCULARS','CLOCK','RIVER','ROCKET'];const g={words,keys:['red','blue','neutral','neutral','assassin'],revealed:words.map(()=>false),log:[],turn:'red',phase:'clue'};return{clue:aiClue(g,'red','hard'),discovery:cbRank(g,'DISCOVERY'),vase:cbRank(g,'VASE')}})()`);
assert.strictEqual(pottery.discovery[0].word,'BINOCULARS');
assert.strictEqual(pottery.vase[0].word,'POTTERY');
assert.ok(!['DISCOVERY','EXPLORER','EXPLORATION'].includes(pottery.clue.word),`Misleading pottery clue: ${pottery.clue.word}`);
const humanPhysics=evaluate(`(()=>{const words=['FORCE','GRAVITY','CAMERA','ROCKET','COTTON'];const g={words,keys:['red','red','neutral','assassin','blue'],revealed:words.map(()=>false),log:[],turn:'red',phase:'clue',round:1};giveClue(g,'PHYSICS',2);const first=aiGuess(g,'red','hard');guess(g,first.i);const second=aiGuess(g,'red','hard');return{first:words[first.i],second:words[second.i],continue:aiShouldContinue(g,'red','hard',second),scores:cbRank({words,keys:g.keys,revealed:words.map(()=>false)},'PHYSICS')}})()`);
assert.deepStrictEqual([humanPhysics.first,humanPhysics.second].sort(),['FORCE','GRAVITY']);
assert.ok(humanPhysics.continue,'Bot must continue to the second physics word under PHYSICS 2');
const humanRodent=evaluate(`(()=>{const words=['GERBIL','SKUNK','CAMERA','ROCKET','COTTON'];const g={words,keys:['red','red','neutral','assassin','blue'],revealed:words.map(()=>false),log:[],turn:'red',phase:'clue',round:1};giveClue(g,'RODENT',2);const first=aiGuess(g,'red','hard');guess(g,first.i);const second=aiGuess(g,'red','hard');return{first:words[first.i],second:words[second.i],continue:aiShouldContinue(g,'red','hard',second),score:second.sim}})()`);
assert.strictEqual(humanRodent.first,'GERBIL');
assert.strictEqual(humanRodent.second,'SKUNK');
assert.ok(humanRodent.continue,'Bot should attempt SKUNK as plausible second association for RODENT 2');
const humanEdible=evaluate(`(()=>{const words=['TOAST','STEAM','CLOCK','ROCKET','PENCIL'];const g={words,keys:['red','neutral','blue','assassin','neutral'],revealed:words.map(()=>false),log:[],turn:'red',phase:'clue',round:1};giveClue(g,'EDIBLE',1);const choice=aiGuess(g,'red','hard');return{word:words[choice.i],toast:cbSimilarity('EDIBLE','TOAST'),steam:cbSimilarity('EDIBLE','STEAM')}})()`);
assert.strictEqual(humanEdible.word,'TOAST','EDIBLE must not choose STEAM over TOAST');
assert.ok(humanEdible.toast>humanEdible.steam+.5);
// A single FERRET should get an unambiguous animal-class clue, not another
// animal such as DOG or CAT (which suggests WAG and other board words).
const ferret=evaluate(`(()=>{const words=['FERRET','WAG','HIGHWAY','RIVER','CLOCK','ROCKET','COTTON'];const g={words,keys:['red','neutral','blue','neutral','blue','assassin','neutral'],revealed:words.map(()=>false),log:[],turn:'red',phase:'clue'};return{clue:aiClue(g,'red','hard'),mammal:cbRank(g,'MAMMAL')[0],dog:cbRank(g,'DOG')[0]}})()`);
assert.ok(['PET','PETS','COMPANION','DOMESTIC','MAMMAL','MAMMALS','MAMMALIAN','ANIMAL','ANIMALS','FAUNA'].includes(ferret.clue.word),`Expected a clear ferret category, got ${ferret.clue.word}`);
assert.strictEqual(ferret.clue.n,1);
assert.strictEqual(ferret.mammal.word,'FERRET');
assert.strictEqual(ferret.dog.word,'WAG');
assert.strictEqual(evaluate("cbLegalClue('SKI',new Set(['SKI','HIGHWAY']))"),false);
assert.strictEqual(evaluate("cbLegalClue('TOURING',new Set(['SKI','HIGHWAY']))"),true);
// Comeback spymaster must offer enough guesses to clear three cards.
const emergency=evaluate(`(()=>{const g=newGame();g.turn='red';const own=g.keys.map((k,i)=>k==='red'?i:-1).filter(i=>i>=0);const enemy=g.keys.map((k,i)=>k==='blue'?i:-1).filter(i=>i>=0);own.slice(3).forEach(i=>g.revealed[i]=true);enemy.slice(1).forEach(i=>g.revealed[i]=true);return aiClue(g,'red','hard')})()`);
assert.strictEqual(emergency.n,3);
const twoToOne=evaluate(`(()=>{const g=newGame();g.turn='red';const own=g.keys.map((k,i)=>k==='red'?i:-1).filter(i=>i>=0);const enemy=g.keys.map((k,i)=>k==='blue'?i:-1).filter(i=>i>=0);own.slice(2).forEach(i=>g.revealed[i]=true);enemy.slice(1).forEach(i=>g.revealed[i]=true);return aiClue(g,'red','hard')})()`);
assert.strictEqual(twoToOne.n,2,`At 2–1, AI gave ${twoToOne.word} ${twoToOne.n}`);
// Carryover counts uncollected clue cards and extends the new turn's allowance.
const carry=evaluate(`(()=>{let g=newGame();g.phase='clue';g.turn='red';g.carryEnabled=true;giveClue(g,'SPYMYSTERY',3);endTurn(g);g.turn='red';giveClue(g,'SPYSECRET',2);return{bank:g.clue.bonus,limit:guessLimit(g)}})()`);
assert.strictEqual(carry.bank,3);
assert.strictEqual(carry.limit,6);
// Shuffle bag gives 25 unique words per game and no immediate repeats.
const overlap=evaluate(`(()=>{let a=soloBoard().words,b=soloBoard().words;return a.filter(w=>b.includes(w)).length})()`);
assert.strictEqual(overlap,0);
const repeat=evaluate(`(()=>{const g=newGame();const first=aiClue(g,g.turn,'hard');localStorage.setItem('cb_recent_clues',JSON.stringify([first.word]));const second=aiClue(g,g.turn,'hard');return[first.word,second.word]})()`);
assert.notStrictEqual(repeat[0],repeat[1],`Repeated recent clue ${repeat[0]}`);
const assassinReport=evaluate(`(()=>{const g=newGame();g.turn='red';g.phase='clue';cbRecordAIClue(g,'red',{word:'DANGER',n:2});giveClue(g,'DANGER',2);guess(g,g.keys.indexOf('assassin'));return{winner:g.winner,report:cbPostgame(g,true),recorded:g.review[0].guesses.length}})()`);
assert.strictEqual(assassinReport.winner,'blue');
assert.ok(assassinReport.report.includes('assassin')&&assassinReport.report.includes('DANGER'));
assert.strictEqual(assassinReport.recorded,1);
assert.ok(assassinReport.report.includes('Every round with a wrong guess')&&assassinReport.report.includes('Numbers behind this decision'));
const everyWrongRound=evaluate(`(()=>{const g=newGame();g.turn='red';g.phase='clue';giveClue(g,'SPYSECRET',2);const neutral=g.keys.indexOf('neutral');guess(g,neutral);giveClue(g,'SPYMYSTERY',1);guess(g,g.keys.indexOf('assassin'));return {rounds:g.roundReview.length,wrong:g.roundReview.filter(r=>r.guesses.some(x=>x.key!==r.team)).length,html:cbPostgame(g,true)}})()`);
assert.strictEqual(everyWrongRound.rounds,2);
assert.strictEqual(everyWrongRound.wrong,2);
assert.ok(everyWrongRound.html.includes('Round 1')&&!everyWrongRound.html.includes('Round 2'),'Solo review should only show the human RED team');
assert.ok(everyWrongRound.html.includes('match ')&&everyWrongRound.html.includes('/100'),'Wrong guesses must display match scores out of 100');
const labels=evaluate(`(()=>{const g=newGame();g.winner='blue';g.review=[
{team:'red',word:'MAMMAL',n:2,round:1,targets:[{word:'FOX',key:'red',score:.8},{word:'CAT',key:'red',score:.7}],danger:[],guesses:[{word:'FOX',key:'red'},{word:'CAT',key:'red'}],options:[],leftOut:[]},
{team:'red',word:'NATURE',n:2,round:3,targets:[{word:'TREE',key:'red',score:.8},{word:'RIVER',key:'red',score:.7}],danger:[],guesses:[{word:'TREE',key:'red'},{word:'MOUNTAIN',key:'red'}],options:[],leftOut:[]},
{team:'red',word:'TECH',n:2,round:5,targets:[{word:'PORT',key:'red',score:.8},{word:'SERVER',key:'red',score:.7}],danger:[],guesses:[{word:'ALPHABET',key:'blue'}],options:[],leftOut:[]},
{team:'blue',word:'OPPONENT',n:1,round:6,targets:[{word:'CLOCK',key:'blue',score:.8}],danger:[],guesses:[],options:[],leftOut:[]}];return cbPostgame(g,true)})()`);
assert.ok(labels.includes('All intended cards')&&labels.includes('Friendly swap')&&labels.includes('Missed target'));
assert.ok(!labels.includes('OPPONENT'),'Only the human team should appear in the analysis');
const winReport=evaluate(`(()=>{const g=newGame();g.turn='red';g.phase='clue';const own=g.keys.map((k,i)=>k==='red'?i:-1).filter(i=>i>=0);own.slice(1).forEach(i=>g.revealed[i]=true);cbRecordAIClue(g,'red',{word:'VICTORY',n:1});giveClue(g,'VICTORY',1);guess(g,own[0]);return{winner:g.winner,report:cbPostgame(g,true)}})()`);
assert.strictEqual(winReport.winner,'red');
assert.ok(winReport.report.includes('VICTORY')&&winReport.report.includes('uncovered every'));
console.log('PASS: categories, 900 words, clues, endgame, carryover, postgame numbers, every wrong round, nonrepeating boards');
