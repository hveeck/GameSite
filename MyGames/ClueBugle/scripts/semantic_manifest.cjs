const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..');
const files=['words.js','extra-words.js','selected-vocabulary.js'];
const definitions=files.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n');
const semantic=fs.readFileSync(path.join(root,'semantic.js'),'utf8');
const app='function aiClue(){}; function aiGuess(){}; function aiSituation(){};';
const ctx=vm.createContext({globalThis:{CB_EMBEDDINGS:null}});
vm.runInContext(definitions+'\n'+app+'\n'+semantic,ctx);
const data=vm.runInContext(`({
  words:WORDS.map(word=>({word,senses:[...new Set([...Object.entries(CATEGORIES).filter(([,list])=>list.includes(word)).map(([k])=>k),...(EXTRA_SENSES[word]||[])])].map(tag=>({
    text:word.toLowerCase()+' meaning associated with '+tag.replace(/[0-9]/g,'')+' and '+(SEMANTIC_SUPER[tag]||tag),
    weight:Object.entries(CATEGORIES).some(([k,list])=>k===tag&&list.includes(word))?1:.43
  }))})),
  clues:[...CLUE_VECTORS.keys()].map(word=>({word,senses:(()=>{
    let tag=Object.keys(CATEGORIES).find(k=>k.toUpperCase()===word||[k,...(CLUE_SYNONYMS[k]||[])].map(x=>x.toUpperCase()).includes(word));
    if(tag)return[{text:word.toLowerCase()+' meaning associated with '+tag.replace(/[0-9]/g,'')+' and '+(SEMANTIC_SUPER[tag]||tag),weight:1}];
    return [...new Set([...Object.entries(CATEGORIES).filter(([,list])=>list.includes(word)).map(([k])=>k),...(EXTRA_SENSES[word]||[])])].map(t=>({text:word.toLowerCase()+' meaning associated with '+t.replace(/[0-9]/g,'')+' and '+(SEMANTIC_SUPER[t]||t),weight:1}));
  })()}))
})`,ctx);
process.stdout.write(JSON.stringify(data));
