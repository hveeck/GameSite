/* v70: stable diplomacy targeting and always-live front assignments. */
(function(){
 'use strict';
 const $id=id=>document.getElementById(id);
 function showMessage(message){
   actionNotice=message;
   const box=$id('v70-action-feedback')||document.createElement('div');
   box.id='v70-action-feedback'; box.className='v70-action-feedback';
   box.textContent=message;
   const location=relations || $id('bilateral') || militaryPanel;
   if(!box.isConnected)location.prepend(box);
   // Keep the message until the next deliberate action, not an arbitrary time.
 }
 function ensureFrontDisplay(){
   // Do not destroy an actively opened strategy selector.
   const el=document.activeElement;
   if(el && el.matches('select,input,textarea') && frontSection.contains(el))return;
   if(gameMode==='player' && humanId!==null){
     renderNationalFront();
   }
 }
 function declareOn(id){
   const own=countries[humanId],target=countries[id];
   if(gameMode!=='player'||!own){showMessage('Choose a country to play first.');return false;}
   if(!target||!countryStats(target).holdings.length){showMessage('That country is no longer available.');return false;}
   if(own.id===target.id){showMessage('Choose another country.');return false;}
   if(atWar(own.id,target.id)){showMessage('Already at war with '+target.name+'.');ensureFrontDisplay();return false;}
   if(alliance(own.id,target.id)){showMessage('End your defense pact with '+target.name+' before declaring war.');return false;}
   if(typeof hasNonAggression==='function' && hasNonAggression(own.id,target.id)){
     showMessage('A non-aggression pact with '+target.name+' prevents war until it expires.');return false;
   }
   if(!bordering(own.id,target.id)){
     showMessage('You need a common land border with '+target.name+' to declare war.');return false;
   }
   if(own.treasury<10){showMessage('Declaring war costs 10 treasury. You currently have '+Math.round(own.treasury)+'.');return false;}
   const old=own.treasury;
   own.treasury-=10;
   own.readiness=clamp(own.readiness-5,5,100);
   const warsBefore=enemies(own.id).length;
   war(own.id,target.id);
   if(!atWar(own.id,target.id)){
     own.treasury=old;showMessage('War declaration did not go through. Please try again.');return false;
   }
   showMessage('War declared on '+target.name+'. Open Military to assign divisions with + and −.');
   if(typeof invalidate==='function')invalidate();
   if(document.activeElement?.matches('button'))document.activeElement.blur();
   update();ensureFrontDisplay();
   return true;
 }
 // The inspector's target ID must be captured at click time, never read back from a
 // dropdown that another render can replace while the simulation runs.
 const oldInvoke=invokeDiplomaticControl;
 invokeDiplomaticControl=function(action,id){
   if(action==='warBtn')return declareOn(Number(id));
   return oldInvoke(action,id);
 };
 // The older hidden control (also available in some layouts) uses the same logic.
 $id('warBtn').onclick=function(){return declareOn(Number($id('targetCountry').value));};
 // Opening the Military panel must always refresh current wars and +/− buttons.
 const oldSet=setPanel;
 setPanel=function(id){
   oldSet(id);
   if(id==='armies'){
     if(document.activeElement?.matches('button'))document.activeElement.blur();
     ensureFrontDisplay();
   }
 };
 // Independently refresh the Military panel immediately after a diplomatic
 // action. This handles the earlier UI's several nested update wrappers.
 const oldWar=war;
 war=function(a,b){
   const was=atWar(a,b);
   const result=oldWar(a,b);
   if(!was && atWar(a,b) && gameMode==='player' && (a===humanId||b===humanId)){
     // Deferring the actual DOM update is unnecessary, and risks stale controls.
     ensureFrontDisplay();
   }
   return result;
 };
 // Fix stale +/− button states after recruiting a new reserve division as well.
 const oldCreate=createArmy;
 createArmy=function(){
   const result=oldCreate.apply(this,arguments);
   if(result && gameMode==='player' && result.owner===humanId && openPanel==='armies'){
     // The recruitment click handler invokes its own render; avoid reentrancy here.
     result.v70FrontRefresh=true;
   }
   return result;
 };
})();
