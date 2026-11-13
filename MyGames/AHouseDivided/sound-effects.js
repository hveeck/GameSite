/* A House Divided: small, local, user-triggered sound effects.
   Never play for AI actions or automatic simulation advances. */
(()=>{'use strict';
 const src={click:'sfx/click.ogg',coins:'sfx/coins.ogg',rally:'sfx/rally.ogg',order:'sfx/order.ogg',policy:'sfx/policy.ogg',diplomacy:'sfx/diplomacy.ogg',treaty:'sfx/treaty.ogg'};
 const vol={click:.055,coins:.17,rally:.09,order:.12,policy:.13,diplomacy:.12,treaty:.16};
 const sounds={};let last=0,lastType='',active=0;
 Object.keys(src).forEach(t=>{try{const a=new Audio(src[t]);a.preload='auto';sounds[t]=a;}catch(_){}});
 function play(t){
  const now=Date.now();if(now-last<85||lastType===t&&now-last<190)return;
  if(active>=3)return;
  last=now;lastType=t;const base=sounds[t];if(!base)return;
  try{const a=base.cloneNode();a.volume=vol[t];active++;
   const finish=()=>{active=Math.max(0,active-1)};
   a.addEventListener('ended',finish,{once:true});a.addEventListener('error',finish,{once:true});
   const p=a.play();if(p&&p.catch)p.catch(finish);
  }catch(_){active=Math.max(0,active-1)}
 }
 document.addEventListener('click',e=>{
  const el=e.target.closest('button,[role="button"]');if(!el||el.disabled)return;
  const txt=(el.textContent||'').trim().toLowerCase(),id=(el.id||'').toLowerCase(),cls=String(el.className||'').toLowerCase();
  const words=id+' '+txt+' '+cls;
  // Navigation and simulation pacing should remain quiet.
  if(/^(play|step|zoomin|zoomout|zoomreset|reset|generate)$/.test(id)||/pause|resume|speed|next tab|back|close|cancel/.test(words))return;
  let t='click';
  if(/recruit|raise|mobiliz|enlist|train division|new division|hire troop/.test(words))t='rally';
  else if(/disband|fund|invest|buy|purchase|spend|pay |pay$|tax|upgrade|fortif|construction|budget|subsid|donat|support|transfer treasury/.test(words))t='coins';
  else if(/attack|advance|counterattack|defend|assign|order|aggressiv|cautious|balanced|move division|front stance|deploy/.test(words))t='order';
  else if(/peace|treaty|accept offer|sign agreement|ceasefire|capitulation/.test(words))t='treaty';
  else if(/alliance|diploma|relations|negotia|trade|pact|demand|declare war/.test(words))t='diplomacy';
  else if(/policy|government|decree|reform|initiative|priority|decision|approve|enact/.test(words))t='policy';
  play(t);
 },true);
 window.AHD_SFX={play};
})();
