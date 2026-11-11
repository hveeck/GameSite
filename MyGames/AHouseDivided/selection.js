/* Start in observer or enter a map-based country selection phase. */
let mapCountryPick=false,pendingCountryId=null;
const countryPickerBar=document.createElement('div');countryPickerBar.className='country-pick-bar';countryPickerBar.hidden=true;
countryPickerBar.innerHTML='<div class="pick-heading">CHOOSE YOUR COUNTRY</div><p>Explore the generated map and click any country to take command.</p><div id="mapPickName">No country selected</div><label>Starting ideology<select id="mapPickIdeology"><option value="auto">Keep this country’s ideology</option></select></label><div class="pick-actions"><button id="confirmCountry" disabled>♛ Command this country</button><button id="cancelCountry">← Back</button></div>';
document.body.append(countryPickerBar);
const pickIdeology=$('mapPickIdeology');
for(const id of ideologyKeys){const opt=document.createElement('option');opt.value=id;opt.textContent=ideologies[id].label;pickIdeology.append(opt)}
function clearMapPick(){
 mapCountryPick=false;pendingCountryId=null;countryPickerBar.hidden=true;
 for(const path of countyEls)path.classList.remove('candidate-country');
}
function showMapPick(){
 if(!geomReady)return;
 clearMapPick();mapCountryPick=true;stop();
 choiceOverlay.classList.remove('visible');countryPickerBar.hidden=false;
 setPanel(null);$('mapPickName').textContent='Click any country on the map';$('confirmCountry').disabled=true;
}
const oldSelectionEntry=choiceOverlay.querySelector('#enterWorld').onclick;
choiceOverlay.querySelector('#enterWorld').onclick=()=>{
 if(choiceMode==='player'){showMapPick();return}
 clearMapPick();oldSelectionEntry();
};
const originalShowCampaignChoice=showCampaignChoice;
showCampaignChoice=function(){clearMapPick();originalShowCampaignChoice()};
document.querySelector('#map').addEventListener('click',ev=>{
 if(!mapCountryPick)return;
 const target=ev.target.closest('path[data-i]');if(!target)return;
 const territory=territories[+target.dataset.i];if(!territory)return;
 const owner=countries[territory.owner];if(!owner||!countryStats(owner).holdings.length)return;
 pendingCountryId=owner.id;
 const pop=countryStats(owner).pop;
 $('mapPickName').textContent=owner.name+' · '+pop.toFixed(2)+'M people · '+countryStats(owner).holdings.length+' counties';
 $('confirmCountry').disabled=false;
 for(let i=0;i<countyEls.length;i++)countyEls[i].classList.toggle('candidate-country',territories[i].owner===pendingCountryId);
 setPanel(null);
});
$('confirmCountry').onclick=()=>{
 if(!mapCountryPick||pendingCountryId===null)return;
 const id=pendingCountryId,chosen=pickIdeology.value;
 chooser.value=String(id);
 // The original entry handler establishes the selected country's playable
 // command state, and the optional ideology is applied after that transition.
 oldSelectionEntry();
 if(ideologies[chosen]&&countries[id]){countries[id].ideology=chosen;invalidate()}
 clearMapPick();update();setPanel('command');
};
$('cancelCountry').onclick=()=>{clearMapPick();choiceOverlay.classList.add('visible')};
