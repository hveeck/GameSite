// End-to-end bot-vs-bot smoke and distribution test.
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const memory=new Map();
const ctx=vm.createContext({console,Math,globalThis:{},document:{querySelector:()=>({})},localStorage:{getItem:k=>memory.get(k)||'',setItem:(k,v)=>memory.set(k,v)}});
for(const f of ['words.js','extra-words.js','selected-vocabulary.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8').split('function render()')[0],ctx);
for(const f of ['embeddings.js','semantic.js','clue-concepts.js','strategist.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx);
const count=Number(process.argv[2]||20);
const data=vm.runInContext(`(()=>{let counts={},firstClueNumbers={},won={red:0,blue:0},correct=0,wrong=0,turns=0,assassins=0,failures=[],maxSingleStreak=0,maxSingleStreakWithMultiple=0;
  for(let x=0;x<${count};x++){
    let g=newGame(),cycles=0,streaks={red:0,blue:0},multipleStreaks={red:0,blue:0};
    while(!g.winner&&cycles++<160){
      const team=g.turn;
      if(g.phase==='clue'){
        let c=aiClue(g,team,'hard');counts[c.n]=(counts[c.n]||0)+1;
        streaks[team]=c.n===1?streaks[team]+1:0;
        maxSingleStreak=Math.max(maxSingleStreak,streaks[team]);
        multipleStreaks[team]=c.n===1&&remaining(g,team)>=2?multipleStreaks[team]+1:0;
        maxSingleStreakWithMultiple=Math.max(maxSingleStreakWithMultiple,multipleStreaks[team]);
        if(g.round===1)firstClueNumbers[c.n]=(firstClueNumbers[c.n]||0)+1;
        try{giveClue(g,c.word,c.n)}catch(e){failures.push(e.message);break;}
      }else{
        let c=aiGuess(g,team,'hard');
        if(c&&(g.guesses===0||aiShouldContinue(g,team,'hard',c))){
          let k=g.keys[c.i];if(k===team)correct++;else{wrong++;if(k==='assassin')assassins++}
          guess(g,c.i);
        }else endTurn(g);
      }
    }
    if(g.winner)won[g.winner]++;else failures.push('Game did not complete');
    turns+=g.round;
  }
  return{games:${count},firstClueNumbers,clueNumbers:counts,maxSingleStreak,maxSingleStreakWithMultiple,correctGuesses:correct,wrongGuesses:wrong,assassins,won,avgRounds:turns/${count},failures};})()`,ctx);
console.log(JSON.stringify(data,null,2));
