/* A House Divided soundtrack: locally bundled public-domain musical themes.
   The background soundtrack is an enhancement and must never block gameplay. */
(()=>{'use strict';
 const peace=['music/peace_shenandoah.ogg','music/peace_america_beautiful.ogg','music/peace_yankee_doodle.ogg'];
 const war=['music/war_johnny_comes_marching.ogg','music/war_battle_hymn.ogg','music/war_mozart_serenade.ogg'];
 const eventClips={danger:'music/cue_war_declaration.ogg'};
 const BACKGROUND_LEVEL=.18,EVENT_LEVEL=.27;
 let enabled=false,current=null,mode=null,transition=null,stopping=false,lastCue=0,trackIndex={peace:0,war:0};
 let currentFile=null,mutationCounter=0;
 function isWar(){
  try{
   if(typeof gameMode!=='undefined'&&gameMode==='player'&&typeof humanId!=='undefined'&&humanId!=null&&typeof enemies==='function')return enemies(humanId).length>0;
   return typeof wars!=='undefined'&&Array.isArray(wars)&&wars.length>0;
  }catch(_){return false;}
 }
 function nextFile(key){
  const arr=key==='war'?war:peace;
  let i=trackIndex[key]++ %arr.length;
  if(arr.length>1&&currentFile===arr[i])i=trackIndex[key]++%arr.length;
  return arr[i];
 }
 function clearFade(){if(transition){clearInterval(transition);transition=null;}}
 function fadeTo(nextKey){
  if(!enabled)return;
  const file=nextFile(nextKey),next=new Audio(file);
  next.preload='auto';next.volume=0;next.loop=false;
  const previous=current;
  current=next;currentFile=file;mode=nextKey;const fadeId=++mutationCounter;
  next.addEventListener('ended',()=>{if(current===next&&enabled)fadeTo(isWar()?'war':'peace');});
  next.addEventListener('error',()=>{if(current===next){current=null;setTimeout(()=>{if(enabled&&!current)fadeTo(isWar()?'war':'peace');},2500);}});
  clearFade();
  const p=next.play();
  if(p&&p.catch)p.catch(()=>{if(current===next){current=null;enabled=false;} });
  let tick=0;
  transition=setInterval(()=>{
   if(fadeId!==mutationCounter)return clearFade();
   tick++;const f=Math.min(1,tick/23);
   next.volume=BACKGROUND_LEVEL*f;
   if(previous){previous.volume=BACKGROUND_LEVEL*(1-f);if(f===1){previous.pause();previous.src='';}}
   if(f===1)clearFade();
  },100);
 }
 function start(){if(enabled)return;enabled=true;fadeTo(isWar()?'war':'peace');}
 function cue(type){
  if(!enabled||type!=='danger'||Date.now()-lastCue<20000)return;
  lastCue=Date.now();const a=new Audio(eventClips[type]);a.volume=EVENT_LEVEL;
  // Briefly duck only; the continuous score always resumes at its current position.
  const bg=current;const orig=bg?bg.volume:0;
  if(bg)bg.volume=Math.min(bg.volume,BACKGROUND_LEVEL*.35);
  const restore=()=>{if(bg&&bg===current)bg.volume=Math.min(BACKGROUND_LEVEL,orig);};
  a.addEventListener('ended',restore,{once:true});a.addEventListener('error',restore,{once:true});
  const p=a.play();if(p&&p.catch)p.catch(restore);
 }
 // Only launch audio on deliberate entry into the simulation, to obey browser audio policy.
 document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(/^(gotIt|play|generate|startGame|beginGame|newGame|start)$/.test(b.id)||b.matches('[data-start],[data-action="start"]'))start();
 },true);
 // Keep sound running across tabs, government windows and simulation pauses.
 setInterval(()=>{if(!enabled)return;const desired=isWar()?'war':'peace';if(desired!==mode)fadeTo(desired);},1400);
 // Event cue after log is fully defined and its other wrappers have been installed.
 window.addEventListener('load',()=>{
  try{
   if(typeof log!=='function')return;
   const oldLog=log;
   log=function(message,type){const result=oldLog.apply(this,arguments);
    if(enabled&&typeof message==='string'){
     // Play a dramatic cue only for actual disasters affecting the player's country.
     // Normal division losses, other nations' wars, routine peace and capitulations stay silent.
     const own=typeof gameMode!=='undefined'&&gameMode==='player'&&typeof humanId!=='undefined'&&countries?.[humanId];
     const name=own?countries[humanId].name:'';
     if(own&&((message.includes(name)&&/capitulates|has fallen|collapses|surrenders/i.test(message))||
        (/your (capital|government|country).*?(fallen|capitulat|collaps|invasion)/i.test(message))))cue('danger');
    }
    return result;
   };
  }catch(_){/* never break the simulation */}
 });
 window.AHD_Soundtrack={isPlaying:()=>enabled,mode:()=>mode,tracks:()=>peace.length+war.length};
})();
