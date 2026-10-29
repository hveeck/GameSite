// ==================== AUDIO ====================
var AudioCtx = window.AudioContext || window.webkitAudioContext;
var audioCtx = null;
function initAudio(){
  try { if(!audioCtx && AudioCtx) audioCtx = new AudioCtx(); } catch(e){}
}
function playTone(freq,dur,type,vol){
  try {
    if(!audioCtx) return;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol || 0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + dur);
  } catch(e){}
}
function sfx(name){
  try {
    initAudio();
    if(name==='click') playTone(800,0.08,'square',0.05);
    else if(name==='vote') playTone(600,0.12,'sine',0.08);
    else if(name==='policy') playTone(400,0.3,'sawtooth',0.06);
    else if(name==='communist') playTone(200,0.5,'sawtooth',0.1);
    else if(name==='white'||name==='whi') playTone(800,0.4,'sine',0.08);
    else if(name==='win') [523,659,784,1047].forEach(function(f,i){setTimeout(function(){playTone(f,0.3,'sine',0.1)},i*150)});
    else if(name==='lose') [400,350,300,200].forEach(function(f,i){setTimeout(function(){playTone(f,0.4,'sawtooth',0.1)},i*200)});
    else if(name==='alert') playTone(1000,0.25,'square',0.12);
  } catch(e){}
}

// ==================== 20 AUTHENTIC BOT ROSTER ====================
// v1.1: 50% longer visual pauses so voting and bot actions are readable.
var BOT_DELAY = 255;
var pendingPolicyAnimation = null;
function announcePolicyAnimation(policy){
  pendingPolicyAnimation={policy:policy};
  if(typeof SIM_MODE!=='undefined'&&SIM_MODE)return;
  var screen=document.getElementById('screen-game');
  if(!screen)return;
  var old=screen.querySelector('.offline-policy-flash');
  if(old)old.remove();
  var flash=document.createElement('div');
  flash.className='offline-policy-flash '+(policy==='communist'?'red':'white');
  flash.textContent=policy==='communist'?'☭ COMMUNIST POLICY ENACTED':'★ WHITE POLICY ENACTED';
  screen.appendChild(flash);
  setTimeout(function(){flash.remove();},1550);
}
var UNIQUE_BOT_ROSTER = [
  {name:'Ivan', type:'Cautious', skill:'Intermediate', persuadability:0.85, desc:'Respects basic meta, votes for safe choices'},
  {name:'Boris', type:'Chaotic', skill:'Beginner', persuadability:1.20, desc:'Casual wildcard swayed by bold talk'},
  {name:'Yuri', type:'Analytical', skill:'Master', persuadability:1.40, desc:'Card counter who punishes powerplays and freezes conflicts'},
  {name:'Dmitri', type:'Subtle', skill:'Expert', persuadability:0.80, desc:'Quiet strategist who blends in and tracks votes'},
  {name:'Viktor', type:'Dominant', skill:'Expert', persuadability:0.60, desc:'Directs rotation and manages rotation order'},
  {name:'Anton', type:'Loyalist', skill:'Beginner', persuadability:1.35, desc:'Easily swayed by appeals to stability'},
  {name:'Nikolai', type:'Outspoken', skill:'Intermediate', persuadability:0.65, desc:'Vocal accuser who shoots into conflicts'},
  {name:'Mikhail', type:'Pragmatist', skill:'Master', persuadability:1.30, desc:'Master of choice testing and Stalin Zone maneuvering'},
  {name:'Sergei', type:'Diplomat', skill:'Beginner', persuadability:1.45, desc:'Open to persuasion to avoid chaos and gridlock'},
  {name:'Roman', type:'Shrewd', skill:'Expert', persuadability:0.90, desc:'Calculates odds and watches for bluffing'},
  {name:'Anya', type:'Analytical', skill:'Master', persuadability:1.40, desc:'Rigorous card counter who detects draw anomalies'},
  {name:'Katya', type:'Pragmatist', skill:'Master', persuadability:1.25, desc:'Calculates pure utility in the Stalin Zone'},
  {name:'Olga', type:'Loyalist', skill:'Beginner', persuadability:1.30, desc:'Trusts current government nominees'},
  {name:'Natasha', type:'Subtle', skill:'Expert', persuadability:0.85, desc:'Protects own standing and looks for signals'},
  {name:'Elena', type:'Diplomat', skill:'Intermediate', persuadability:1.20, desc:'Seeks consensus across the table'},
  {name:'Sonya', type:'Cautious', skill:'Intermediate', persuadability:0.80, desc:'Prudent voter who fears the Stalin Zone'},
  {name:'Pavel', type:'Pragmatist', skill:'Expert', persuadability:0.90, desc:'Focuses on endgame victory conditions'},
  {name:'Igor', type:'Loyalist', skill:'Beginner', persuadability:1.30, desc:'Follows majority voting momentum'},
  {name:'Denis', type:'Outspoken', skill:'Intermediate', persuadability:0.75, desc:'Quick to call out suspicious behavior'},
  {name:'Maxim', type:'Analytical', skill:'Master', persuadability:1.35, desc:'Master of deduction and conflict tracking'}
];

var roundPersuasionModifier = { active: false, speakerName: '', text: '', stance: 'ja', botModifiers: {} };
var transitionLock = false;

var game = {
  mode:'bots', botDifficulty:'random', rolePreference:'random',
  playerCount:5, players:[], roles:[], policyDeck:[], discardPile:[],
  whitePolicies:0, communistPolicies:0, electionTracker:0,
  currentPresident:0, currentChancellor:null, nominatedChancellor:null,
  lastGovernment:{president:null,chancellor:null}, vetoUnlocked:false,
  gameOver:false, winner:null, phase:'setup', powerType:null,
  playerKnownRoles:{}, humanInvestigations:{}, botInvestigations:{},
  playerRecords:[], disputes:[], confirmedNotStalin:{},
  mildSuspicionPresidents:{},
  deckCycle: { presDraws:[], claimedDemSeen:0 },
  userSuspects: [], userTrusted: [], preSpecialPresident: null,
  votingBlocs: {}, unjustifiedVotes: {},
  votes:{}, voteHistory:[], policyHistory:[], messages:[],
  drawnPolicies:[], drawnPoliciesOriginal:[], passedToChancellor:[],
  pendingVeto:false, humanPlayerIndex:0, currentRoleIndex:0, roleAssignmentPhase:false
};

function shuffle(arr){
  var a = arr.slice();
  for(var i=a.length-1;i>0;i--){
    var j = Math.floor(Math.random()*(i+1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

function getRoleDistribution(count){
  var dist = {5:{whites:3,communists:1,stalin:1},6:{whites:4,communists:1,stalin:1},
    7:{whites:4,communists:2,stalin:1},8:{whites:5,communists:2,stalin:1},
    9:{whites:5,communists:3,stalin:1},10:{whites:6,communists:3,stalin:1}};
  return dist[count];
}

function getCommunistTrack(count){
  if(count<=6) return [null,null,'peek','execution','execution','win'];
  if(count<=8) return [null,'investigate','special','execution','execution','win'];
  return ['investigate','investigate','special','execution','execution','win'];
}

function getPolicyDeck(){
  var deck = [];
  for(var i=0;i<11;i++) deck.push('communist');
  for(var i=0;i<6;i++) deck.push('white');
  return shuffle(deck);
}

function log(msg){
  var time = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  game.messages.unshift({time:time,msg:msg,isSpeech:false});
  updateLogDisplay();
}

function logSpeech(speakerName, title, text, isConflict){
  var time = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  game.messages.unshift({time:time,speaker:speakerName,title:title,text:text,isSpeech:true,isConflict:!!isConflict});
  updateLogDisplay();
}

function spectatorPct(x){ return (Math.max(0,Math.min(1,x))*100).toFixed(1)+'%'; }
function spectatorRoleLabel(r){ return r==='white' ? 'WHITE' : (r==='stalin' ? 'STALIN' : 'COMMUNIST'); }
function getTrueRoleCleanLabel(r){ return r==='white' ? '(White)' : (r==='stalin' ? '(Stalin)' : '(Communist)'); }

// ==================== SPECTATOR LIVE BOT BRAIN ====================
function updateSpectatorDashboard(){
  if(game.mode !== 'watch') return;
  var el = document.getElementById('spectator-dashboard');
  if(!el || !BRAIN) return;
  var alive = getAliveIndices(), st = brainState(), pub = brainView(-1);

  // Consensus = average view of living Whites + Stalin ONLY (never Communists, never the player themselves)
  var obsSeats = alive.filter(function(idx){ return game.roles[idx] === 'white' || game.roles[idx] === 'stalin'; });
  var avgOdds = [];
  for(var p = 0; p < game.playerCount; p++){
    var sumC = 0, sumS = 0, sumW = 0, cnt = 0;
    for(var w = 0; w < obsSeats.length; w++){
      var seat = obsSeats[w];
      if(seat === p) continue;
      var v = brainView(seat);
      sumC += v.F[p] - v.S[p];
      sumS += v.S[p];
      sumW += (1.0 - v.F[p]);
      cnt++;
    }
    avgOdds[p] = cnt > 0
      ? { w: sumW / cnt, c: sumC / cnt, s: sumS / cnt }
      : { w: 1 - pub.F[p], c: pub.F[p] - pub.S[p], s: pub.S[p] };
  }

  var html = '<div class="spectator-title">👁️ LIVE BOT BRAIN & INFERENCE <span class="spectator-sub">Consensus Odds • Expected Value • True Identities</span></div>';
  
  // Simulator Controls
  html += '<div class="sim-controls">'+
    '<div class="sim-controls-left">'+
      '<span style="font-size:.78rem;font-weight:800;color:var(--g);text-transform:uppercase">Simulate Games:</span>'+
      '<input type="number" id="sim-count-input" class="sim-input" value="100" min="1" max="1000">'+
    '</div>'+
    '<button class="sim-btn" onclick="runBatchSimulation(Number(document.getElementById(\'sim-count-input\').value || 100))">⚡ Run Simulations</button>'+
  '</div>';

  html += '<div class="spectator-summary">'+
    '<div class="spectator-stat"><b>'+game.communistPolicies+' / 6</b><span>Communist Policies</span></div>'+
    '<div class="spectator-stat"><b>'+game.whitePolicies+' / 5</b><span>White Policies</span></div></div>';

  for(var k=0; k<alive.length; k++){
    var i = alive[k], pl = game.players[i], v = brainView(i);
    var pOdds = avgOdds[i];
    var avgBadge = '<span class="spectator-consensus-pill">Avg: '+spectatorPct(pOdds.w)+' W / '+spectatorPct(pOdds.c)+' C / '+spectatorPct(pOdds.s)+' S</span>';

    // Find highest Stalin and Top 3 Communists for outline highlights (with tie support)
    var others = [];
    for(var j=0; j<game.playerCount; j++){
      if(j !== i && !game.players[j].isDead){
        others.push({ seat: j, s: v.S[j], f: v.F[j] });
      }
    }

    var maxS = -1;
    others.forEach(function(o){ if(o.s > maxS) maxS = o.s; });
    var topSSeats = others.filter(function(o){ return o.s === maxS && maxS > 0.05; }).map(function(o){ return o.seat; });

    var sortedByComm = others.slice().sort(function(a,b){ return b.f - a.f; });
    var top3FSeats = [];
    if(sortedByComm.length > 0){
      var cutoffVal = sortedByComm[Math.min(2, sortedByComm.length - 1)].f;
      top3FSeats = others.filter(function(o){ return o.f >= cutoffVal && o.f > 0.05; }).map(function(o){ return o.seat; });
    }

    html += '<div class="spectator-bot">';
    html += '<div class="spectator-bot-head">';
    html += '<div class="spectator-bot-title"><span>'+pl.name+'</span> '+avgBadge+' <span class="spectator-role '+game.roles[i]+'">'+spectatorRoleLabel(game.roles[i])+(game.decoy===i?' • 🎭 DECOY':'')+'</span></div>';
    html += '<span style="color:var(--tdd);font-size:.65rem">Frame #'+BRAIN.ver+'</span>';
    html += '</div>';

    var minis = [];
    for(var j=0; j<game.playerCount; j++){
      if(j !== i && !game.players[j].isDead){
        var isTopS = topSSeats.indexOf(j) >= 0;
        var isTopF = top3FSeats.indexOf(j) >= 0;
        var outlineClass = '';
        if(isTopS) outlineClass = 'outline-stalin';
        else if(isTopF) outlineClass = 'outline-comm';

        var trueRoleStr = getTrueRoleCleanLabel(game.roles[j]);
        minis.push('<div class="spectator-mini '+outlineClass+'">'+
          '<b>'+game.players[j].name+'</b>'+
          '<div class="true-id">'+trueRoleStr+'</div>'+
          '<div class="odds-line">'+spectatorPct(v.F[j])+' C</div>'+
          '<div class="odds-line">'+spectatorPct(v.S[j])+' S</div>'+
          '</div>');
      }
    }
    if(game.roles[i] !== 'communist'){
      var perRowSpec = minis.length <= 4 ? minis.length : Math.ceil(minis.length / 2);
      html += '<div class="spectator-grid rows">';
      for(var rs = 0; rs < minis.length; rs += perRowSpec){
        html += '<div class="spectator-row">' + minis.slice(rs, rs + perRowSpec).join('') + '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
  }

  el.innerHTML = html;
}

function updateLogDisplay(){
  var el = document.getElementById('gl');
  if(!el) return;
  el.innerHTML = game.messages.slice(0,50).map(function(m){
    if(m.isSpeech){
      var conflictClass = m.isConflict ? ' conflict' : '';
      return '<div class="log-entry log-speech' + conflictClass + '">'+
        '<div class="log-speaker">💬 ' + m.speaker + ' (' + m.title + ')</div>'+
        '<div style="color:var(--t);font-size:.84rem;margin-top:2px">"' + m.text + '"</div>'+
        '</div>';
    }
    return '<div class="log-entry"><span class="log-time">' + m.time + '</span> — ' + m.msg + '</div>';
  }).join('');
}

function showScreen(id){
  document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('active')});
  var target = document.getElementById(id);
  if(target) target.classList.add('active');
}

function getAliveIndices(){
  var alive = [];
  for(var i=0;i<game.players.length;i++) if(!game.players[i].isDead) alive.push(i);
  return alive;
}

function isWhite(role){ return role==='white'; }
function isCommunist(role){ return role==='communist' || role==='stalin'; }

function toggleSuspect(playerIdx){
  if(game.humanPlayerIndex >= 0 && playerIdx === game.humanPlayerIndex) return;
  sfx('click');
  if(!game.userSuspects) game.userSuspects = [];
  var idxInArr = game.userSuspects.indexOf(playerIdx);
  if(idxInArr >= 0){
    game.userSuspects.splice(idxInArr, 1);
    log('Cleared suspect mark from ' + game.players[playerIdx].name + '.');
  } else {
    if(game.userSuspects.length >= 4){
      log('⚠️ Limit: You can only flag up to 4 suspects simultaneously.');
      sfx('alert');
      return;
    }
    if(game.userTrusted){
      var trustIdx = game.userTrusted.indexOf(playerIdx);
      if(trustIdx >= 0) game.userTrusted.splice(trustIdx, 1);
    }
    game.userSuspects.push(playerIdx);
    log('🚨 Marked ' + game.players[playerIdx].name + ' as SUSPECT (' + game.userSuspects.length + '/4).');
  }
  renderPlayers();
}

function toggleTrust(playerIdx){
  if(game.humanPlayerIndex >= 0 && playerIdx === game.humanPlayerIndex) return;
  sfx('click');
  if(!game.userTrusted) game.userTrusted = [];
  var idxInArr = game.userTrusted.indexOf(playerIdx);
  if(idxInArr >= 0){
    game.userTrusted.splice(idxInArr, 1);
    log('Cleared trust mark from ' + game.players[playerIdx].name + '.');
  } else {
    if(game.userTrusted.length >= 5){
      log('⚠️ Limit: You can only flag up to 5 comrades as trusted simultaneously.');
      sfx('alert');
      return;
    }
    if(game.userSuspects){
      var susIdx = game.userSuspects.indexOf(playerIdx);
      if(susIdx >= 0) game.userSuspects.splice(susIdx, 1);
    }
    game.userTrusted.push(playerIdx);
    log('🤝 Marked ' + game.players[playerIdx].name + ' as TRUSTED (' + game.userTrusted.length + '/5).');
  }
  renderPlayers();
}

function getHumanCredibility(observerIdx){
  var hIdx = game.humanPlayerIndex;
  if(hIdx < 0) return 0;
  var score = 0;
  if(observerIdx >= 0 && hasDispute(observerIdx, hIdx)) score -= 3.5;
  if(observerIdx >= 0 && game.botInvestigations[observerIdx]?.[hIdx] === 'communist') score -= 4.0;
  // (removed: used investigators' PRIVATE results for every observer; public claims now flow in via the table's shared belief)
  var commEnacted = game.policyHistory.filter(function(h){ return h.chancellor === hIdx && h.policy === 'communist'; }).length;
  if(commEnacted > 0) score -= 2.5 * commEnacted;
  if(game.mildSuspicionPresidents[hIdx]) score -= 1.0;
  if(game.unjustifiedVotes && game.unjustifiedVotes[hIdx]){
    var uv = game.unjustifiedVotes[hIdx];
    if(uv.susYes > 0) score -= 0.8 * uv.susYes;
    if(uv.badNo > 0) score -= 0.8 * uv.badNo;
    if(game.communistPolicies >= 3 && uv.blocCount > 0) score -= 1.5 * uv.blocCount;
  }
  var demEnacted = game.policyHistory.filter(function(h){ return h.chancellor === hIdx && isWhite(h.policy); }).length;
  score += 1.5 * demEnacted;
  if(observerIdx >= 0 && isWhite(game.botInvestigations[observerIdx]?.[hIdx])) score += 3.0;
  if(game.confirmedNotStalin[hIdx]) score += 1.5;
  return score;
}

function drawPolicies(n){
  if(game.policyDeck.length < n) handleDeckReshuffle();
  return game.policyDeck.splice(0,n);
}

function handleDeckReshuffle(){
  var actualDemDrawn = game.deckCycle.presDraws.reduce(function(sum, d){ return sum + d.actualDem; }, 0);
  var claimedDemDrawn = game.deckCycle.presDraws.reduce(function(sum, d){ return sum + d.claimedDem; }, 0);
  var discrepancy = actualDemDrawn - claimedDemDrawn;

  if(discrepancy > 0){
    var susPresidents = [];
    game.deckCycle.presDraws.forEach(function(d){
      if(d.claimedDem === 0) susPresidents.push(d.pres);
    });
    susPresidents = Array.from(new Set(susPresidents));

    susPresidents.forEach(function(pIdx){
      brainObserveAudit(pIdx);
      game.mildSuspicionPresidents[pIdx] = (game.mildSuspicionPresidents[pIdx] || 0) + 1;
      if(game.playerRecords[pIdx]){
        game.playerRecords[pIdx].claims.push('Discrepancy: Claimed 3 Communists during deck cycle with ' + discrepancy + ' missing White card(s).');
      }
    });

    var susNames = susPresidents.map(function(i){ return game.players[i].name; }).join(', ');
    logSpeech('Audit Committee', 'Deck Reshuffle Audit', 'Reshuffle Discrepancy: ' + discrepancy + ' White card(s) unaccounted for in this cycle. Suspects: ' + susNames, true);
    log('🎴 Deck Reshuffled: ' + discrepancy + ' unaccounted White card(s) detected. Suspects: ' + susNames);
    sfx('alert');
  } else {
    log('🎴 Deck Reshuffled: All claimed White policies accounted for cleanly.');
  }

  game.policyDeck = shuffle(game.policyDeck.concat(game.discardPile));
  game.discardPile = [];
  game.deckCycle = { presDraws: [], claimedDemSeen: 0 };
  renderDeckInfo();
}

function peekNextPresident(){
  if(game.preSpecialPresident !== null && game.preSpecialPresident !== undefined){
    var returnIdx = (game.preSpecialPresident + 1) % game.playerCount;
    while(game.players[returnIdx].isDead){
      returnIdx = (returnIdx + 1) % game.playerCount;
    }
    return returnIdx;
  }
  var idx = game.currentPresident;
  do{ idx = (idx+1)%game.playerCount; } while(game.players[idx].isDead);
  return idx;
}

function nextPresident(){
  if(game.preSpecialPresident !== null && game.preSpecialPresident !== undefined){
    var returnIdx = (game.preSpecialPresident + 1) % game.playerCount;
    game.preSpecialPresident = null;
    while(game.players[returnIdx].isDead){
      returnIdx = (returnIdx + 1) % game.playerCount;
    }
    return returnIdx;
  }
  var idx = game.currentPresident;
  do{ idx = (idx+1)%game.playerCount; } while(game.players[idx].isDead);
  return idx;
}

function hasDispute(playerA, playerB){
  for(var i=0; i<game.disputes.length; i++){
    var d = game.disputes[i];
    if((d.p1 === playerA && d.p2 === playerB) || (d.p1 === playerB && d.p2 === playerA)){
      return true;
    }
  }
  return false;
}

function isInAnyConflict(playerIdx){
  for(var i=0; i<game.disputes.length; i++){
    if(game.disputes[i].p1 === playerIdx || game.disputes[i].p2 === playerIdx) return true;
  }
  return false;
}

function addDispute(p1, p2, reason, type){
  if(!hasDispute(p1, p2)){
    var dType = type || 'general';
    game.disputes.push({p1:p1, p2:p2, reason:reason, type:dType, round:game.whitePolicies + game.communistPolicies + 1});
    if(game.playerRecords[p1]) game.playerRecords[p1].disputes.push({opponent:p2, reason:reason, type:dType});
    if(game.playerRecords[p2]) game.playerRecords[p2].disputes.push({opponent:p1, reason:reason, type:dType});
  }
}

// ==================== COMPLETE 10-TIER DYNAMIC PERSUASION ENGINE ====================
function generateDynamicPersuasionOptions(){
  var presIdx = game.currentPresident;
  var chancIdx = game.nominatedChancellor;
  var presName = game.players[presIdx].name;
  var chancName = game.players[chancIdx].name;
  var nextPresIdx = peekNextPresident();
  var nextPresName = game.players[nextPresIdx].name;

  var jaOptions = [];
  var neinOptions = [];

  // 1. STATISTICAL & CHOICE-DENIAL DISPUTES
  var chancDispute = game.disputes.find(function(d){ return d.p2 === chancIdx && d.type === 'choice_denial'; });
  if(chancDispute){
    var accuserName = game.players[chancDispute.p1].name;
    neinOptions.push({
      priority: 100, stance: 'nein', id: 'stat_choice_denial',
      text: "Statistical red flag: In Round " + chancDispute.round + ", Secretary " + accuserName + " reported passing a choice, but " + chancName + " claimed receiving 2 Communists. A Secretary rarely invents a conflict when they could claim 3 Communists—statistically, " + chancName + " is lying!",
      evalLogic: function(g){ return true; }
    });
  }

  // 2. RESHUFFLE AUDIT DISCREPANCIES
  if(game.mildSuspicionPresidents[chancIdx]){
    neinOptions.push({
      priority: 96, stance: 'nein', id: 'audit_chanc_sus',
      text: "Audit Committee Alert: Following the deck reshuffle, unaccounted White policies were found in the discard. " + chancName + " claimed 3 Communists during that cycle and is under suspicion of burying White cards!",
      evalLogic: function(g){ return true; }
    });
  }
  if(game.mildSuspicionPresidents[presIdx]){
    neinOptions.push({
      priority: 91, stance: 'nein', id: 'audit_pres_sus',
      text: "Secretary " + presName + " is under suspicion from the deck audit committee for claiming 3 Communists in a cycle where White cards went missing. We cannot trust their nominee.",
      evalLogic: function(g){ return true; }
    });
  }

  var generalChancDispute = game.disputes.find(function(d){ return (d.p1 === chancIdx || d.p2 === chancIdx) && (!chancDispute || d !== chancDispute); });
  if(generalChancDispute){
    var rivalIdx = generalChancDispute.p1 === chancIdx ? generalChancDispute.p2 : generalChancDispute.p1;
    var rivalName = game.players[rivalIdx].name;
    neinOptions.push({
      priority: 95, stance: 'nein', id: 'gen_chanc_dispute',
      text: "Premier candidate " + chancName + " is locked in an active contradiction with " + rivalName + " from Round " + generalChancDispute.round + "! Game theory dictates freezing both conflicted parties until the air is cleared.",
      evalLogic: function(g){ return true; }
    });
  }

  var presDispute = game.disputes.find(function(d){ return d.p1 === presIdx || d.p2 === presIdx; });
  if(presDispute){
    var rivalIdx = presDispute.p1 === presIdx ? presDispute.p2 : presDispute.p1;
    var rivalName = game.players[rivalIdx].name;
    neinOptions.push({
      priority: 90, stance: 'nein', id: 'pres_dispute',
      text: "Secretary " + presName + " has an unresolved dispute with " + rivalName + ". A compromised Secretary cannot be trusted to pick an honest Premier.",
      evalLogic: function(g){ return true; }
    });
  }

  // 3. STALIN ZONE DYNAMICS
  if(game.communistPolicies >= 3){
    if(game.confirmedNotStalin[chancIdx]){
      jaOptions.push({
        priority: 100, stance: 'ja', id: 'sz_cns',
        text: "We are in the Stalin Zone (" + game.communistPolicies + "/6 Communist policies), but " + chancName + " is Confirmed Not Stalin (CNS)! Electing them cannot trigger an instant Stalin win.",
        evalLogic: function(g){ return true; }
      });
    } else {
      neinOptions.push({
        priority: 100, stance: 'nein', id: 'sz_not_cns',
        text: "🚨 STALIN ZONE ALERT: We have " + game.communistPolicies + " Communist policies enacted and " + chancName + " is NOT Confirmed Not Stalin! If " + chancName + " is Stalin, electing them ends democracy right now!",
        evalLogic: function(g){ return true; }
      });
    }
  }

  // 4. INVESTIGATION FINDINGS
  if(game.humanInvestigations[chancIdx] === 'communist' || (game.botInvestigations[presIdx]?.[chancIdx] === 'communist')){
    neinOptions.push({
      priority: 98, stance: 'nein', id: 'inv_chanc_comm',
      text: chancName + " was already investigated and exposed as a Communist agent! Putting an identified infiltrator into power is outright suicide.",
      evalLogic: function(g){ return true; }
    });
  } else if(isWhite(game.humanInvestigations[chancIdx]) || (isWhite(game.botInvestigations[presIdx]?.[chancIdx]))){
    jaOptions.push({
      priority: 95, stance: 'ja', id: 'inv_chanc_dem',
      text: chancName + " was officially investigated and verified as a loyal White! This is our safest possible Premier ticket.",
      evalLogic: function(g){ return true; }
    });
  }

  // 5. PREMIER POLICY RECORD
  var chancDemEnacted = game.policyHistory.filter(function(h){ return h.chancellor === chancIdx && isWhite(h.policy); });
  var chancCommEnacted = game.policyHistory.filter(function(h){ return h.chancellor === chancIdx && h.policy === 'communist'; });

  if(chancCommEnacted.length > 0){
    var lastRedRound = chancCommEnacted[0].round;
    neinOptions.push({
      priority: 85, stance: 'nein', id: 'chanc_red_enacted',
      text: chancName + " has already enacted a Communist policy as Premier (Round " + lastRedRound + "). There is zero reason to hand them legislative power again.",
      evalLogic: function(g){ return true; }
    });
  }

  if(chancDemEnacted.length > 0 && chancCommEnacted.length === 0){
    var lastBlueRound = chancDemEnacted[0].round;
    jaOptions.push({
      priority: 90, stance: 'ja', id: 'chanc_blue_enacted',
      text: chancName + " has a clean white record—they enacted a White policy in Round " + lastBlueRound + " without causing any card disputes.",
      evalLogic: function(g){ return true; }
    });
  }

  // 6. POWERPLAY / ROTATION ORDER
  if(chancIdx === nextPresIdx && game.communistPolicies < 3){
    neinOptions.push({
      priority: 80, stance: 'nein', id: 'powerplay',
      text: "Rotation check: " + chancName + " is the next Secretary in line! Giving them Premier now gives one comrade back-to-back executive power (a classic powerplay).",
      evalLogic: function(g){ return true; }
    });
  }

  // 7. ELECTION TRACKER
  if(game.electionTracker === 2){
    jaOptions.push({
      priority: 92, stance: 'ja', id: 'tracker_chaos_avoid',
      text: "The election tracker is at 2 failed votes! If we vote НЕТ, chaos triggers and a random top-deck policy is enacted blind. We must pass this to prevent chaos!",
      evalLogic: function(g){ return true; }
    });
    neinOptions.push({
      priority: 88, stance: 'nein', id: 'tracker_chaos_prefer',
      text: "Even with the election tracker at 2 fails, this pairing is far too dangerous. Topdeck chaos is safer than voluntarily giving " + chancName + " full legislative authority.",
      evalLogic: function(g){ return true; }
    });
  } else if(game.electionTracker === 0){
    neinOptions.push({
      priority: 70, stance: 'nein', id: 'tracker_safe_downvote',
      text: "The election tracker is clean at 0 fails. We have plenty of room to reject this ticket and let the secretaryship pass to " + nextPresName + ".",
      evalLogic: function(g){ return true; }
    });
  }

  // 8. CARD COUNTING & DECK ODDS
  var cardsInDeck = game.policyDeck.length;
  var demInDeck = game.policyDeck.filter(function(p){ return (p==='white'); }).length;
  var demPercent = cardsInDeck > 0 ? Math.round((demInDeck / cardsInDeck) * 100) : 35;

  if(demInDeck >= 2 && cardsInDeck <= 9 && demPercent >= 40){
    jaOptions.push({
      priority: 75, stance: 'ja', id: 'deck_favorable',
      text: "Card counting shows " + demInDeck + " White cards in the " + cardsInDeck + "-card deck (~" + demPercent + "% blue). The odds of a favorable draw right now are high—vote ДА!",
      evalLogic: function(g){ return true; }
    });
  } else if(demInDeck <= 1 && cardsInDeck <= 8){
    neinOptions.push({
      priority: 75, stance: 'nein', id: 'deck_hostile',
      text: "Card counting warning: Only " + demInDeck + " White card(s) left in the remaining " + cardsInDeck + " cards of the deck. This government will be forced to enact red—vote down to force a reshuffle!",
      evalLogic: function(g){ return true; }
    });
  }

  // 9. VICTORY MATCHPOINTS
  if(game.whitePolicies === 4){
    jaOptions.push({
      priority: 99, stance: 'ja', id: 'matchpoint_dem',
      text: "MATCH POINT FOR THE REPUBLIC: We only need ONE more White policy to win the revolution! Let's pass this government and secure victory!",
      evalLogic: function(g){ return true; }
    });
  }
  if(game.communistPolicies === 5){
    neinOptions.push({
      priority: 99, stance: 'nein', id: 'matchpoint_comm',
      text: "DEFCON 1: Communists are at 5 policies—one more red card finishes us! We cannot take even a 1% chance on " + chancName + " unless they are 100% verified.",
      evalLogic: function(g){ return true; }
    });
  }

  // 10. SOLIDARITY / TESTING
  if(presIdx === game.humanPlayerIndex){
    jaOptions.push({
      priority: 80, stance: 'ja', id: 'my_presidency',
      text: "As Secretary, I have evaluated our options and chosen " + chancName + " to give the Republic its best legislative chance. Stand with me!",
      evalLogic: function(g){ return true; }
    });
  } else if(chancIdx === game.humanPlayerIndex){
    jaOptions.push({
      priority: 85, stance: 'ja', id: 'my_chancellorship',
      text: "Comrades, give me the premiership and I will deliver a clean policy for the Republic. You can hold me accountable if I fail.",
      evalLogic: function(g){ return true; }
    });
  } else {
    jaOptions.push({
      priority: 60, stance: 'ja', id: 'solidarity_test',
      text: "Both " + presName + " and " + chancName + " have maintained clean records. Passing this government allows us to test their loyalty under real pressure.",
      evalLogic: function(g){ return true; }
    });
  }

  if(jaOptions.length < 2){
    jaOptions.push({
      priority: 50, stance: 'ja', id: 'fb_progress',
      text: "We need to get cards moving and discover where the deck lies. Continuing to stall only works in the Communists' favor.",
      evalLogic: function(g){ return true; }
    });
    jaOptions.push({
      priority: 45, stance: 'ja', id: 'fb_clean_ticket',
      text: "I see no concrete evidence of sabotage against " + presName + " or " + chancName + ". Let's unite behind this ticket.",
      evalLogic: function(g){ return true; }
    });
  }

  if(neinOptions.length < 4){
    neinOptions.push({
      priority: 50, stance: 'nein', id: 'fb_unconvinced',
      text: "The combination of " + presName + " and " + chancName + " feels questionable. We have safer rotation pairings ahead.",
      evalLogic: function(g){ return true; }
    });
    neinOptions.push({
      priority: 45, stance: 'nein', id: 'fb_trust_gap',
      text: "I do not have enough confidence in " + chancName + "'s allegiance to hand them the legislative deck. Vote НЕТ.",
      evalLogic: function(g){ return true; }
    });
    neinOptions.push({
      priority: 40, stance: 'nein', id: 'fb_rotation',
      text: "Let's vote this down and pass the secretaryship to " + nextPresName + " so we can get a cleaner perspective on the board.",
      evalLogic: function(g){ return true; }
    });
    neinOptions.push({
      priority: 35, stance: 'nein', id: 'fb_gut',
      text: "Something about this nomination smells of infiltration. I urge all loyal Whites to reject this ticket.",
      evalLogic: function(g){ return true; }
    });
  }

  jaOptions.sort(function(a,b){ return b.priority - a.priority; });
  neinOptions.sort(function(a,b){ return b.priority - a.priority; });

  return jaOptions.slice(0, 2).concat(neinOptions.slice(0, 4));
}

function selectDifficulty(diff, btn){
  game.botDifficulty = diff;
  document.querySelectorAll('#diff-select .pill-btn').forEach(function(el){ el.classList.remove('selected'); });
  btn.classList.add('selected');
  sfx('click');
}

function selectRolePref(pref, btn){
  game.rolePreference = pref;
  document.querySelectorAll('#role-pref-select .pill-btn').forEach(function(el){ el.classList.remove('selected'); });
  btn.classList.add('selected');
  sfx('click');
}

function isBotGame(){ return game.mode === 'bots' || game.mode === 'watch'; }

function selectMode(mode){
  game.mode = mode;
  document.querySelectorAll('.mode-option').forEach(function(el){el.classList.remove('selected')});
  var selectedEl = document.querySelector('[data-mode="'+mode+'"]');
  if(selectedEl) selectedEl.classList.add('selected');
  var bsp = document.getElementById('bot-settings-panel');
  if(bsp) bsp.style.display = (mode === 'bots' || mode === 'watch') ? 'block' : 'none';
  var rolePref = document.getElementById('role-pref-select');
  if(rolePref && rolePref.parentElement) rolePref.parentElement.style.display = (mode === 'watch') ? 'none' : 'block';
  if(mode === 'watch') game.rolePreference = 'random';
  sfx('click');
}

function selectCount(n, button){
  game.playerCount = n;
  document.querySelectorAll('.count-btn').forEach(function(el){el.classList.remove('selected')});
  button.classList.add('selected');
  sfx('click');
}

function showPrivacyGate(playerName, title, desc, onConfirm){
  document.getElementById('pt').textContent = 'Pass Phone';
  document.getElementById('at').textContent = 'Hand Device to ' + playerName;
  document.getElementById('ad').textContent = desc || ('Confidential government materials. Only ' + playerName + ' may view.');
  document.getElementById('ac').innerHTML = 
    '<div class="privacy-gate">'+
    '<div class="privacy-gate-icon">🔒</div>'+
    '<div class="privacy-gate-title">'+title+'</div>'+
    '<div class="privacy-gate-desc">Pass device to <strong>'+playerName+'</strong>. Make sure other players cannot see the screen.</div>'+
    '</div>'+
    '<button class="btn" id="gate-btn">I am ' + playerName + ' — Reveal</button>';
  document.getElementById('gate-btn').onclick = function(){
    sfx('click');
    onConfirm();
  };
}

function startGame(){
  sfx('click');
  initAudio();

  var dist = getRoleDistribution(game.playerCount);
  var roles = [];
  for(var i=0;i<dist.whites;i++) roles.push('white');
  for(var i=0;i<dist.communists;i++) roles.push('communist');
  roles.push('stalin');

  if(game.mode==='bots' && game.rolePreference!=='random'){
    if(game.rolePreference==='white'){
      var remRoles = [];
      var demPlaced = false;
      for(var r=0; r<roles.length; r++){
        if(!demPlaced && (roles[r]==='white')){ demPlaced = true; }
        else { remRoles.push(roles[r]); }
      }
      game.roles = ['white'].concat(shuffle(remRoles));
    } else if(game.rolePreference==='communist' || game.rolePreference==='stalin'){
      var chooseStalin = (game.rolePreference === 'stalin');
      var targetRole = chooseStalin ? 'stalin' : 'communist';
      var remRoles = [];
      var placed = false;
      for(var r=0; r<roles.length; r++){
        if(!placed && roles[r]===targetRole){ placed = true; }
        else { remRoles.push(roles[r]); }
      }
      game.roles = [targetRole].concat(shuffle(remRoles));
    }
  } else {
    game.roles = shuffle(roles);
  }

  game.policyDeck = getPolicyDeck();
  game.discardPile = [];
  game.whitePolicies = 0;
  game.communistPolicies = 0;
  game.electionTracker = 0;
  game.currentPresident = Math.floor(Math.random()*game.playerCount);
  game.currentChancellor = null;
  game.nominatedChancellor = null;
  game.lastGovernment = {president:null,chancellor:null};
  game.vetoUnlocked = false;
  game.gameOver = false;
  game.winner = null;
  
  game.playerKnownRoles = {};
  game.humanInvestigations = {};
  game.botInvestigations = {};
  game.disputes = [];
  game.playerRecords = [];
  game.confirmedNotStalin = {};
  game.mildSuspicionPresidents = {};
  game.deckCycle = { presDraws:[], claimedDemSeen:0 };
  game.userSuspects = [];
  game.userTrusted = [];
  game.preSpecialPresident = null;
  transitionLock = false;
  game.votingBlocs = {};
  game.unjustifiedVotes = {};
  roundPersuasionModifier = { active:false, speakerName:'', text:'', stance:'ja', botModifiers:{} };
  
  game.votes = {};
  game.voteHistory = [];
  game.policyHistory = [];
  game.messages = [];
  game.drawnPolicies = [];
  game.pendingVeto = false;
  game.players = [];

  var vb = document.getElementById('victory-box');
  if(vb) vb.style.display = 'none';

  if(isBotGame()){
    var botPool = shuffle(UNIQUE_BOT_ROSTER);
    var botStart = (game.mode === 'watch') ? 0 : 1;
    if(game.mode === 'watch'){
      game.humanPlayerIndex = -1;
    } else {
      game.players.push({name:'You',isHuman:true,isDead:false,personality:null});
      game.humanPlayerIndex = 0;
    }

    for(var i=botStart; i<game.playerCount; i++){
      var template = botPool[i-botStart];
      var pers = JSON.parse(JSON.stringify(template));

      if(game.botDifficulty === 'beginner'){
        pers.skill = (Math.random() < 0.6) ? 'Beginner' : 'Intermediate';
      } else if(game.botDifficulty === 'advanced'){
        pers.skill = 'Master';
      }

      game.players.push({
        name: pers.name, isHuman: false, isDead: false, personality: pers
      });
    }

    for(var k=0; k<game.playerCount; k++){
      game.playerRecords.push({
        governments:[], votes:[], disputes:[], claims:[],
        investigationsDone:[], investigationsReceived:[]
      });
      game.unjustifiedVotes[k] = { susYes:0, badNo:0, blocCount:0 };
    }

    brainInit();

    var idBar = document.getElementById('id-bar');
    var idTag = document.getElementById('id-tag');
    if(game.mode === 'watch'){
      if(idBar) idBar.style.display = 'none';
      for(var wk=0; wk<game.playerCount; wk++) game.playerKnownRoles[wk] = game.roles[wk];
    } else {
      var myRole = game.roles[0];
      game.playerKnownRoles[0] = myRole;
      if(idBar) idBar.style.display = 'flex';
    }

    if(idTag && game.mode !== 'watch'){
      if(myRole==='communist'){
        idTag.textContent = '☭ YOU: COMMUNIST (INFILTRATOR)';
        idTag.className = 'identity-tag badge-self-comm';
        for(var j=0;j<game.playerCount;j++){
          if(game.roles[j]==='stalin') game.playerKnownRoles[j] = 'stalin';
          else if(j!==0 && game.roles[j]==='communist') game.playerKnownRoles[j] = 'communist';
        }
        log('☭ You are a Communist. Protect Stalin and lead the party to victory.');
      } else if(myRole==='stalin'){
        idTag.textContent = '👤 YOU: STALIN (SECRET LEADER)';
        idTag.className = 'identity-tag badge-self-stalin';
        if(game.playerCount<=6){
          for(var j=0;j<game.playerCount;j++){
            if(game.roles[j]==='communist') game.playerKnownRoles[j] = 'communist';
          }
        }
        log('👤 You are Stalin. Blend in with the Whites and seek election in the Stalin Zone.');
      } else {
        idTag.textContent = '★ YOU: WHITE (LOYAL)';
        idTag.className = 'identity-tag badge-self-whi';
        log('★ You are a loyal White. Guard the Republic and unmask the Communists.');
      }
    }

    showScreen('screen-game');
    var sd = document.getElementById('spectator-dashboard');
    if(sd) sd.style.display = (game.mode === 'watch') ? 'block' : 'none';
    renderGameBoard();
    startRound();
    if(game.mode === 'watch'){
      if(window.sneakySpectatorTimer) clearInterval(window.sneakySpectatorTimer);
      window.sneakySpectatorTimer = setInterval(updateSpectatorDashboard, 300);
    }
  } else {
    var idBar = document.getElementById('id-bar');
    if(idBar) idBar.style.display = 'none';
    showScreen('screen-names');
    renderNameInputs();
  }
}

function renderNameInputs(){
  var container = document.getElementById('name-inputs');
  var html = '';
  for(var i=0;i<game.playerCount;i++){
    html += '<div style="margin-bottom:12px;text-align:left">'+
      '<label style="display:block;color:var(--td);font-size:.78rem;text-transform:uppercase;margin-bottom:4px">Player '+(i+1)+'</label>'+
      '<input type="text" id="name-'+i+'" value="Player '+(i+1)+'" '+
      'style="width:100%;padding:10px 14px;background:#11141d;border:1.5px solid var(--border);border-radius:6px;color:var(--t);font-size:.95rem;">'+
      '</div>';
  }
  container.innerHTML = html;
}

function confirmNames(){
  sfx('click');
  for(var i=0;i<game.playerCount;i++){
    var input = document.getElementById('name-'+i);
    var name = input.value.trim() || ('Player '+(i+1));
    game.players.push({name:name,isHuman:true,isDead:false,personality:null});
    game.playerRecords.push({governments:[],votes:[],disputes:[],claims:[],investigationsDone:[],investigationsReceived:[]});
    game.unjustifiedVotes[i] = { susYes:0, badNo:0, blocCount:0 };
  }
  game.humanPlayerIndex = -1;
  game.currentRoleIndex = 0;
  game.roleAssignmentPhase = true;
  showScreen('screen-roles');
  renderRoleAssignment();
}

function renderRoleAssignment(){
  var container = document.getElementById('rcc');
  var player = game.players[game.currentRoleIndex];
  var role = game.roles[game.currentRoleIndex];
  var isLast = game.currentRoleIndex === game.playerCount-1;

  var allyInfoHTML = '';
  if(role === 'stalin'){
    if(game.playerCount <= 6){
      var comms = [];
      for(var i=0;i<game.playerCount;i++){
        if(game.roles[i] === 'communist') comms.push(game.players[i].name);
      }
      if(comms.length > 0){
        allyInfoHTML = '<div class="role-allies"><strong>Fellow Communist:</strong><br>' + comms.join(', ') + '</div>';
      }
    } else {
      allyInfoHTML = '<div class="role-allies" style="color:var(--td);font-size:.82rem"><em>With 7+ players, Stalin does not know who teammates are.</em></div>';
    }
  } else if(role === 'communist'){
    var stalinName = '';
    var otherComms = [];
    for(var i=0;i<game.playerCount;i++){
      if(game.roles[i] === 'stalin') stalinName = game.players[i].name;
      else if(i !== game.currentRoleIndex && game.roles[i] === 'communist') otherComms.push(game.players[i].name);
    }
    allyInfoHTML = '<div class="role-allies">';
    if(stalinName){
      allyInfoHTML += '<div style="margin-bottom:4px"><span style="color:var(--g);font-weight:800">★ STALIN:</span> ' + stalinName + '</div>';
    }
    if(otherComms.length > 0){
      allyInfoHTML += '<div><strong>Fellow Communists:</strong> ' + otherComms.join(', ') + '</div>';
    }
    allyInfoHTML += '</div>';
  }

  var roleInfo = {
    white:{icon:'★',name:'White',color:'var(--whi-light)',desc:'Pass 5 White policies or find and eliminate Stalin to restore democracy.'},
    communist:{icon:'☭',name:'Communist',color:'var(--comm-red)',desc:'Pass 6 Communist policies or elect Stalin Premier after 3 policies.'},
    stalin:{icon:'👤',name:'Stalin',color:'var(--g)',desc:'Stay hidden. If elected Premier after 3 Communist policies are passed, you seize total control.'}
  };
  var info = roleInfo[role];

  container.innerHTML = '<div style="background:var(--panel);border:1.5px solid var(--border);border-radius:12px;padding:24px 20px">'+
    '<h3 style="color:var(--g);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px">'+player.name+'</h3>'+
    '<div class="privacy-gate" id="reveal-area" style="cursor:pointer" '+
    'onmousedown="startReveal()" onmouseup="endReveal()" onmouseleave="endReveal()" '+
    'ontouchstart="startReveal()" ontouchend="endReveal()">'+
    '<div id="hidden-label" style="font-weight:700;letter-spacing:1px;color:var(--td)">👁 HOLD TO REVEAL</div>'+
    '<div id="secret-content" style="display:none">'+
    '<div style="font-size:3rem;margin-bottom:8px;color:'+info.color+'">'+info.icon+'</div>'+
    '<div style="font-size:1.5rem;font-weight:900;text-transform:uppercase;color:'+info.color+';margin-bottom:6px">'+info.name+'</div>'+
    '<div style="font-size:.85rem;color:var(--td);line-height:1.4">'+info.desc+'</div>'+
    allyInfoHTML+
    '</div></div>'+
    '<button class="btn" onclick="nextRole()">'+(isLast?'Start Game':'Next Comrade')+'</button>'+
    '</div>';
}

function startReveal(){
  var lbl = document.getElementById('hidden-label');
  var sec = document.getElementById('secret-content');
  if(lbl) lbl.style.display = 'none';
  if(sec) sec.style.display = 'block';
}
function endReveal(){
  var lbl = document.getElementById('hidden-label');
  var sec = document.getElementById('secret-content');
  if(lbl) lbl.style.display = 'block';
  if(sec) sec.style.display = 'none';
}
function nextRole(){
  sfx('click');
  game.currentRoleIndex++;
  if(game.currentRoleIndex >= game.playerCount){
    game.roleAssignmentPhase = false;
    showScreen('screen-game');
    var sd = document.getElementById('spectator-dashboard');
    if(sd) sd.style.display = (game.mode === 'watch') ? 'block' : 'none';
    renderGameBoard();
    startRound();
    if(game.mode === 'watch'){
      if(window.sneakySpectatorTimer) clearInterval(window.sneakySpectatorTimer);
      window.sneakySpectatorTimer = setInterval(updateSpectatorDashboard, 300);
    }
  } else {
    renderRoleAssignment();
  }
}

function renderGameBoard(){
  renderTracks();
  renderPlayers();
  renderDeckInfo();
  updateSpectatorDashboard();
}

function renderTracks(){
  var demTrack = document.getElementById('dt');
  var commTrack = document.getElementById('ct');
  var commTrackConfig = getCommunistTrack(game.playerCount);

  var demHTML = '';
  for(var i=0;i<5;i++){
    var isFilled = (i < game.whitePolicies);
    var filledClass = isFilled ? 'filled-white' : '';
    demHTML += '<div class="track-slot ' + filledClass + (isFilled&&pendingPolicyAnimation?.policy==='white'&&i===game.whitePolicies-1?' policy-new':'') + '">' + (isFilled ? '★' : '') + '</div>';
  }
  demTrack.innerHTML = demHTML;
  document.getElementById('dc').textContent = game.whitePolicies+' / 5';

  var commHTML = '';
  for(var i=0;i<6;i++){
    var filled = i<game.communistPolicies?'filled-communist':'';
    var power = commTrackConfig[i];
    var powerTag = power?(power==='win'?'WIN':power.substring(0,4)):'';
    commHTML += '<div class="track-slot '+filled+' '+(power?'has-power':'')+(filled&&pendingPolicyAnimation?.policy==='communist'&&i===game.communistPolicies-1?' policy-new':'')+'">'+
      (i<game.communistPolicies?'☭':'')+
      (power&&i>=game.communistPolicies?'<span class="power-tag">'+powerTag+'</span>':'')+
      '</div>';
  }
  commTrack.innerHTML = commHTML;
  pendingPolicyAnimation=null;
  document.getElementById('cc').textContent = game.communistPolicies+' / 6';

  var dots = document.querySelectorAll('#et-dots .tracker-dot');
  dots.forEach(function(dot,idx){
    if(idx < game.electionTracker) dot.classList.add('active');
    else dot.classList.remove('active');
  });

  var totalDem = 6;
  var claimedSeen = (game.deckCycle && game.deckCycle.claimedDemSeen !== undefined) ? game.deckCycle.claimedDemSeen : 0;
  var expectedLeft = Math.max(0, totalDem - claimedSeen);

  var repEl = document.getElementById('audit-reported');
  var remEl = document.getElementById('audit-remaining');
  if(repEl) repEl.textContent = claimedSeen + '/6 Whites Reported Seen';
  if(remEl) remEl.textContent = expectedLeft + ' Expected Left (Deck: ' + game.policyDeck.length + ')';
}

function renderPlayers(){
  var grid = document.getElementById('pg');
  var countersEl = document.getElementById('trust-sus-counters');
  if(countersEl) countersEl.style.display = (game.mode === 'local') ? 'none' : 'flex';
  var susCounterEl = document.getElementById('sus-counter');
  if(susCounterEl){
    var count = game.userSuspects ? game.userSuspects.length : 0;
    susCounterEl.textContent = 'Suspects: ' + count + '/4';
  }
  var trustCounterEl = document.getElementById('trust-counter');
  if(trustCounterEl){
    var tCount = game.userTrusted ? game.userTrusted.length : 0;
    trustCounterEl.textContent = 'Trusted: ' + tCount + '/5';
  }

  var cardsArr = game.players.map(function(p,i){
    var isSelf = (game.humanPlayerIndex >= 0 && i === game.humanPlayerIndex);
    var isSus = game.userSuspects && game.userSuspects.indexOf(i) >= 0;
    var isTrust = game.userTrusted && game.userTrusted.indexOf(i) >= 0;
    var uv = game.unjustifiedVotes ? game.unjustifiedVotes[i] : null;

    if(p.isDead){
      return '<div class="player-card dead ' + (isSus ? 'is-suspect' : '') + ' ' + (isTrust ? 'is-trusted' : '') + '">' +
        '<div class="player-name">' + p.name + '</div>' +
        '<div style="font-size:.7rem;color:var(--comm-red);font-weight:900;text-transform:uppercase">☠ Dead</div>' +
        (game.gameOver || game.mode === 'watch' ? '<span class="player-role-badge ' + (isWhite(game.roles[i]) ? 'badge-white' : (game.roles[i]==='stalin' ? 'badge-stalin' : 'badge-communist')) + '" style="font-weight:900;margin:3px 0">' + (isWhite(game.roles[i]) ? '★ WHITE' : (game.roles[i]==='stalin' ? '👤 STALIN' : '☭ COMMUNIST')) + '</span>' : '') +
        '<div class="player-card-actions">' +
        '<button class="dossier-btn" onclick="openDossier('+i+'); event.stopPropagation();">📁 Record</button>' +
        '</div>' +
        '</div>';
    }

    var isPres = i === game.currentPresident;
    var isChanc = i === game.currentChancellor;
    var isNom = i === game.nominatedChancellor && !isChanc;

    var classes = [];
    if(isSelf) classes.push('is-self');
    if(isPres) classes.push('secretary');
    if(isChanc) classes.push('premier');
    if(isNom) classes.push('active-turn');
    if(isSus) classes.push('is-suspect');
    if(isTrust) classes.push('is-trusted');

    if(isBotGame() && !isSelf && !game.gameOver){
      var known = game.playerKnownRoles[i];
      if(known === 'stalin') classes.push('is-stalin-teammate');
      else if(known === 'communist') classes.push('is-comm-teammate');
    }

    var govBadge = '';
    if(isPres){
      govBadge = '<span class="player-gov-badge gov-pres">👑 SECRETARY</span>';
    } else if(isChanc){
      govBadge = '<span class="player-gov-badge gov-chanc">⚖️ PREMIER</span>';
    } else if(isNom){
      govBadge = '<span class="player-gov-badge gov-nom">⚖️ CANDIDATE</span>';
    }

    var roleTag = '';
    if(game.gameOver || game.mode === 'watch'){
      var finalRole = game.roles[i];
      var rClass = isWhite(finalRole)?'badge-white':(finalRole==='stalin'?'badge-stalin':'badge-communist');
      var rName = isWhite(finalRole)?'★ WHITE':(finalRole==='stalin'?'👤 STALIN':'☭ COMMUNIST');
      roleTag = '<span class="player-role-badge '+rClass+'" style="font-weight:900;margin:3px 0">'+rName+'</span>';
    } else if(isBotGame()){
      if(isSelf){
        var myRole = game.roles[i];
        if(isWhite(myRole)){
          roleTag = '<span class="player-role-badge badge-self-whi">★ YOU: WHITE</span>';
        } else if(myRole === 'stalin'){
          roleTag = '<span class="player-role-badge badge-self-stalin">👤 YOU: STALIN</span>';
        } else {
          roleTag = '<span class="player-role-badge badge-self-comm">☭ YOU: COMMUNIST</span>';
        }
      } else {
        var known = game.playerKnownRoles[i];
        if(known === 'stalin'){
          roleTag = '<span class="player-role-badge badge-teammate-stalin">★ STALIN (LEADER)</span>';
        } else if(known === 'communist'){
          roleTag = '<span class="player-role-badge badge-teammate-comm">☭ ALLY (COMMUNIST)</span>';
        } else if(game.humanInvestigations[i]){
          var inv = game.humanInvestigations[i];
          if(isWhite(inv)){
            roleTag = '<span class="player-role-badge badge-investigated-whi">👁 CONFIRMED WHITE</span>';
          } else {
            roleTag = '<span class="player-role-badge badge-investigated-comm">🚨 EXPOSED COMM</span>';
          }
        }
      }
    }

    var voteBadge = '';
    var allVoted = getAliveIndices().every(function(a){ return game.votes[a] !== undefined; });
    if(game.votes[i] !== undefined && (game.mode !== 'local' || allVoted)){
      var vText = game.votes[i] ? 'ДА 👍' : 'НЕТ 👎';
      var vClass = game.votes[i] ? 'vote-ja' : 'vote-nein';
      voteBadge = '<span class="vote-badge ' + vClass + '">' + vText + '</span>';
    }

    var cnsTag = (game.communistPolicies >= 3 && game.confirmedNotStalin[i] && !game.gameOver) 
      ? '<span class="player-role-badge badge-cns">✓ CNS (NOT STALIN)</span>' : '';

    var susTag = (isSus && !game.gameOver && game.mode !== 'local') ? '<span class="player-role-badge badge-suspect">🚨 SUSPECT</span>' : '';
    var trustTag = (isTrust && !game.gameOver && game.mode !== 'local') ? '<span class="player-role-badge badge-trusted">🤝 TRUSTED</span>' : '';

    var disputeCount = (game.playerRecords[i] && game.playerRecords[i].disputes) ? game.playerRecords[i].disputes.length : 0;
    var feudTag = (disputeCount > 0 && !game.gameOver) ? '<span style="font-size:.62rem;color:var(--comm-red);font-weight:900">⚡ FEUD ('+disputeCount+')</span>' : '';
    var auditTag = (game.mildSuspicionPresidents[i] && !game.gameOver) ? '<span style="font-size:.6rem;color:var(--g);font-weight:900">⚠️ AUDIT FLAG</span>' : '';

    var actionsHTML = '';
    if(game.mode === 'local'){
      actionsHTML = '<button class="dossier-btn" onclick="openDossier('+i+'); event.stopPropagation();" style="width:100%;padding:4px 0;font-weight:700">📁 Record</button>';
    } else if(!p.isDead && i !== game.humanPlayerIndex && !game.gameOver){
      actionsHTML = '<button class="dossier-btn" onclick="openDossier('+i+'); event.stopPropagation();" title="View Dossier">📁</button>' +
        '<button class="trust-btn ' + (isTrust ? 'active' : '') + '" onclick="toggleTrust('+i+'); event.stopPropagation();" title="Toggle Trust">' + 
        (isTrust ? '🤝 Safe' : '🤝 Trust') + 
        '</button>' +
        '<button class="sus-btn ' + (isSus ? 'active' : '') + '" onclick="toggleSuspect('+i+'); event.stopPropagation();" title="Toggle Suspect">' + 
        (isSus ? '🚨 Sus' : '👁️ Sus') + 
        '</button>';
    } else {
      actionsHTML = '<button class="dossier-btn" onclick="openDossier('+i+'); event.stopPropagation();">📁 Record</button>';
    }

    return '<div class="player-card ' + classes.join(' ') + '">' +
      govBadge +
      '<div class="player-name">' + p.name + '</div>' +
      roleTag + cnsTag + trustTag + susTag + feudTag + auditTag + voteBadge +
      '<div class="player-card-actions">' + actionsHTML + '</div>' +
      '</div>';
  });
  var perRow = Math.ceil(cardsArr.length / 2);
  var rowsHTML = '<div class="players-row">' + cardsArr.slice(0, perRow).join('') + '</div>';
  if(cardsArr.length > perRow) rowsHTML += '<div class="players-row">' + cardsArr.slice(perRow).join('') + '</div>';
  grid.style.setProperty('--cols', perRow);
  grid.classList.toggle('dense', perRow >= 5);
  grid.innerHTML = rowsHTML;
}

function renderDeckInfo(){
  document.getElementById('di').textContent = 'Deck: ' + game.policyDeck.length + ' / 17 | Discard: ' + game.discardPile.length;
}

function openDossier(playerIdx){
  sfx('click');
  var p = game.players[playerIdx];
  var record = game.playerRecords[playerIdx] || {governments:[], votes:[], disputes:[], claims:[], investigationsDone:[], investigationsReceived:[]};
  var uv = game.unjustifiedVotes ? game.unjustifiedVotes[playerIdx] : null;
  var isSus = game.userSuspects && game.userSuspects.indexOf(playerIdx) >= 0;
  var isTrust = game.userTrusted && game.userTrusted.indexOf(playerIdx) >= 0;

  var modal = document.getElementById('dossier-modal');
  var title = document.getElementById('dossier-title');
  var body = document.getElementById('dossier-body');

  title.textContent = 'Dossier: ' + p.name + (p.isDead ? ' (Deceased)' : '');

  var susAlertHTML = '';
  if(isSus){
    susAlertHTML = '<div class="dossier-section"><div class="dossier-item" style="border-color:var(--comm-red);background:rgba(239,68,68,0.18);color:#fca5a5;font-weight:800">🚨 CURRENTLY FLAGGED AS SUSPECT BY YOU</div></div>';
  }
  if(isTrust){
    susAlertHTML = '<div class="dossier-section"><div class="dossier-item" style="border-color:#10b981;background:rgba(16,185,129,0.18);color:#86efac;font-weight:800">🤝 CURRENTLY FLAGGED AS TRUSTED BY YOU</div></div>';
  }

  var persHTML = '';
  if(p.personality){
    var persuadText = p.personality.persuadability > 1.2 ? 'High' : (p.personality.persuadability < 0.8 ? 'Stubborn / Low' : 'Moderate');
    persHTML = '<div class="dossier-section"><div class="dossier-section-title">Strategic Profile & Demeanor</div>'+
      '<div class="dossier-item" style="color:var(--g)"><strong>Skill Tier:</strong> ' + p.personality.skill + ' | <strong>Trait:</strong> ' + p.personality.type + '<br>'+
      '<strong>Persuadability:</strong> ' + persuadText + '<br><span style="color:var(--td);font-size:.75rem">'+p.personality.desc+'</span></div></div>';
  }

  var votingAuditHTML = '';
  if(uv && (uv.susYes > 0 || uv.badNo > 0)){
    votingAuditHTML = '<div class="dossier-section"><div class="dossier-section-title">KGB Voting Behavior Audit</div>'+
      '<div class="dossier-item" style="border-color:var(--comm-red);background:rgba(239,68,68,0.12)">'+
      (uv.susYes > 0 ? '⚠️️ <strong>Suspicious YES Votes:</strong> Voted ДА for suspect government ' + uv.susYes + ' time(s).<br>' : '')+
      (uv.badNo > 0 ? '⚠️ <strong>Questionable NO Votes:</strong> Voted НЕТ on a publicly well-supported ticket ' + uv.badNo + ' time(s).<br>' : '')+
      '</div></div>';
  }

  var cnsHTML = '';
  if(game.communistPolicies >= 3){
    cnsHTML = '<div class="dossier-section"><div class="dossier-section-title">Stalin Zone Standing</div>';
    if(game.confirmedNotStalin[playerIdx]){
      cnsHTML += '<div class="dossier-item" style="border-color:#10b981;background:rgba(16,185,129,0.12);color:#86efac"><strong>✓ Confirmed Not Stalin (CNS):</strong> Served as Premier in Stalin Zone without win trigger. Safe to elect!</div>';
    } else {
      cnsHTML += '<div class="dossier-item" style="color:var(--td)">⚠️️ Not verified — Candidate could potentially be Stalin!</div>';
    }
    cnsHTML += '</div>';
  }

  var auditHTML = '';
  if(game.mildSuspicionPresidents[playerIdx]){
    auditHTML = '<div class="dossier-section"><div class="dossier-section-title">Audit Committee Standing</div>'+
      '<div class="dossier-item" style="border-color:var(--g);background:rgba(245,158,11,0.12);color:#fde68a"><strong>⚠️ Mild Suspicion:</strong> Reported 3 Communists in a cycle where unaccounted White policies were buried!</div></div>';
  }

  var disputeHTML = '<div class="dossier-section"><div class="dossier-section-title">Active Contradictions & Feuds</div>';
  if(record.disputes && record.disputes.length > 0){
    disputeHTML += record.disputes.map(function(d){
      var oppName = game.players[d.opponent].name;
      var typeNotice = d.type === 'choice_denial' ? ' <span style="color:#ef4444;font-size:.75rem;font-weight:800">[Choice-Denial Conflict]</span>' : '';
      return '<div class="dossier-item" style="border-color:var(--comm-red);background:rgba(239,68,68,0.12)"><strong style="color:#fca5a5">⚡ Feud with ' + oppName + typeNotice + ':</strong> ' + d.reason + '</div>';
    }).join('');
  } else {
    disputeHTML += '<div class="dossier-item" style="color:var(--td)">No public feuds or contradictions on record.</div>';
  }
  disputeHTML += '</div>';

  var govHTML = '<div class="dossier-section"><div class="dossier-section-title">Government Terms Served</div>';
  if(record.governments && record.governments.length > 0){
    govHTML += record.governments.map(function(g){
      var partnerName = game.players[g.partner].name;
      var polColor = isWhite(g.enacted) ? 'var(--whi-light)' : 'var(--comm-red)';
      return '<div class="dossier-item"><strong>Round ' + g.round + ' (' + g.role + '):</strong> with ' + partnerName + '<br>Enacted: <span style="color:'+polColor+';font-weight:700">' + (isWhite(g.enacted) ? 'WHITE' : 'COMMUNIST') + '</span>'+(g.claim ? '<br><span style="color:var(--td);font-size:.75rem">Claimed: "' + g.claim + '"</span>' : '')+'</div>';
    }).join('');
  } else {
    govHTML += '<div class="dossier-item" style="color:var(--td)">Has not served in government yet.</div>';
  }
  govHTML += '</div>';

  var invHTML = '<div class="dossier-section"><div class="dossier-section-title">Public Investigation Record</div>';
  var hasInv = (record.investigationsDone && record.investigationsDone.length > 0) || (record.investigationsReceived && record.investigationsReceived.length > 0);
  if(hasInv){
    var items = [];
    if(record.investigationsDone){
      record.investigationsDone.forEach(function(iv){
        items.push('<div class="dossier-item">Investigated ' + game.players[iv.target].name + ' — Publicly Declared: <strong style="color:var(--g)">' + iv.declared + '</strong></div>');
      });
    }
    if(record.investigationsReceived){
      record.investigationsReceived.forEach(function(iv){
        items.push('<div class="dossier-item">Investigated by ' + game.players[iv.by].name + ' — Declared: <strong style="color:var(--g)">' + iv.declared + '</strong></div>');
      });
    }
    invHTML += items.join('');
  } else {
    invHTML += '<div class="dossier-item" style="color:var(--td)">No investigations involving this comrade.</div>';
  }
  invHTML += '</div>';

  var votesHTML = '<div class="dossier-section"><div class="dossier-section-title">Voting History</div>';
  if(record.votes && record.votes.length > 0){
    votesHTML += record.votes.map(function(v){
      var vBadge = v.vote ? '<span style="color:#86efac;font-weight:700">ДА 👍</span>' : '<span style="color:#fca5a5;font-weight:700">НЕТ 👎</span>';
      return '<div class="dossier-item" style="display:flex;justify-content:space-between;align-items:center"><span>Gov: ' + game.players[v.pres].name + ' + ' + game.players[v.chanc].name + '</span><span>' + vBadge + '</span></div>';
    }).join('');
  } else {
    votesHTML += '<div class="dossier-item" style="color:var(--td)">No votes cast yet.</div>';
  }
  votesHTML += '</div>';

  var selfCredHTML = '';
  if(game.humanPlayerIndex >= 0 && playerIdx === game.humanPlayerIndex){
    var cred = getHumanCredibility(-1);
    var credLabel = cred >= 1.5 ? 'High (Comrades believe your endorsements)' : (cred < 0 ? 'Compromised (Distrusted)' : 'Neutral');
    var credColor = cred >= 1.5 ? '#86efac' : (cred < 0 ? '#fca5a5' : 'var(--g)');
    selfCredHTML = '<div class="dossier-section"><div class="dossier-section-title">Your Table Credibility Standing</div>'+
      '<div class="dossier-item" style="color:'+credColor+'"><strong>Credibility:</strong> ' + credLabel + ' (' + (cred > 0 ? '+' : '') + cred.toFixed(1) + ')<br><span style="color:var(--td);font-size:.75rem">When credibility is high, White comrades honor your markers.</span></div></div>';
  }

  body.innerHTML = susAlertHTML + selfCredHTML + persHTML + votingAuditHTML + cnsHTML + auditHTML + disputeHTML + govHTML + invHTML + votesHTML;
  modal.classList.add('active');
}

function closeDossier(){ document.getElementById('dossier-modal').classList.remove('active'); }
function closeSimModal(){ document.getElementById('sim-modal').classList.remove('active'); }

function startRound(){
  transitionLock = false;
  if(game.gameOver) return;
  game.phase = 'nomination';
  game.currentChancellor = null;
  game.nominatedChancellor = null;
  game.votes = {};
  game.drawnPolicies = [];
  game.pendingVeto = false;
  roundPersuasionModifier = { active:false, speakerName:'', text:'', stance:'ja', botModifiers:{} };
  document.getElementById('pt').textContent = 'Nomination';
  renderGameBoard();

  var pres = game.players[game.currentPresident];
  log(pres.name+' is now Secretary.');

  document.getElementById('at').textContent = 'Nomination Phase';
  document.getElementById('ad').textContent = pres.name + ' is choosing a Premier candidate...';
  document.getElementById('ac').innerHTML = '';

  if(isBotGame() && game.currentPresident===game.humanPlayerIndex){
    showNominationUI();
  } else if(game.mode==='local'){
    showNominationUI();
  } else {
    setTimeout(botNominate, BOT_DELAY);
  }
}

function showNominationUI(){
  document.getElementById('pt').textContent = 'Nomination';
  document.getElementById('at').textContent = 'Nominate a Premier';
  document.getElementById('ad').textContent = game.players[game.currentPresident].name + ', choose a candidate for Premier:';

  var alive = getAliveIndices();
  var content = document.getElementById('ac');
  var html = '<div class="player-select-grid">';
  for(var k=0;k<alive.length;k++){
    var idx = alive[k];
    if(idx===game.currentPresident) continue;
    var disabled = '';
    if(game.lastGovernment.chancellor===idx) disabled = 'disabled';
    if(game.lastGovernment.president===idx && alive.length>5) disabled = 'disabled';
    var isSusMark = (game.userSuspects && game.userSuspects.indexOf(idx) >= 0) ? ' [SUS]' : '';
    html += '<button class="select-player-btn" onclick="nominateChancellor('+idx+')" '+disabled+'>'+game.players[idx].name+isSusMark+'</button>';
  }
  html += '</div>';
  content.innerHTML = html;
}

function nominateChancellor(idx){
  if(game.phase!=='nomination'||game.nominatedChancellor!==null)return;
  if(isBotGame()&&game.currentPresident!==game.humanPlayerIndex)return;
  if(idx===game.currentPresident||!game.players[idx]||game.players[idx].isDead)return;
  if(game.lastGovernment.chancellor===idx)return;
  if(getAliveIndices().length>5&&game.lastGovernment.president===idx)return;
  sfx('click');
  game.nominatedChancellor = idx;
  log(game.players[game.currentPresident].name+' nominated '+game.players[idx].name+' as Premier.');
  renderGameBoard();
  if(isBotGame()){
    setTimeout(startVoting, BOT_DELAY);
  } else {
    startVoting();
  }
}

function startVoting(){
  // An obsolete delayed callback may not hijack a new human nomination.
  if(game.phase!=='nomination'||game.nominatedChancellor===null)return;
  game.phase = 'voting';
  game.votes = {};
  renderGameBoard();
  document.getElementById('pt').textContent = 'Election';
  document.getElementById('at').textContent = 'Vote on Government';
  document.getElementById('ad').textContent = 'Government: ' + game.players[game.currentPresident].name + ' (Secretary) & ' + game.players[game.nominatedChancellor].name + ' (Premier)';

  if(isBotGame()){
    if(game.humanPlayerIndex>=0 && !game.players[game.humanPlayerIndex].isDead){
      renderHumanVoteScreen();
    } else {
      document.getElementById('ac').innerHTML = '<p style="color:var(--td)">Comrades are casting their ballots...</p>';
      setTimeout(botVoteNext, voteDelay());
    }
  } else {
    showLocalVotePrompt();
  }
}

function renderHumanVoteScreen(){
  var discussBtn = !roundPersuasionModifier.active ? 
    '<button class="btn secondary" onclick="openPreVoteDiscussion()" style="margin-bottom:12px;border-color:var(--g);color:var(--g)">🗣️ Address Comrades (Board Analysis)</button>' :
    '<div class="speech-card player-speech" style="margin-bottom:12px"><div class="speech-name" style="color:#38bdf8">🗣️ You addressed the comrades:</div><div class="speech-text">"'+roundPersuasionModifier.text+'"</div></div>';

  document.getElementById('ac').innerHTML =
    discussBtn +
    '<div class="vote-buttons">'+
    '<button class="vote-btn ja" onclick="castVote(true)"><span>👍</span>ДА</button>'+
    '<button class="vote-btn nein" onclick="castVote(false)"><span>👎</span>НЕТ</button>'+
    '</div>';
}

function openPreVoteDiscussion(){
  sfx('click');
  document.getElementById('at').textContent = 'Address the Comrades';
  document.getElementById('ad').textContent = 'Choose an argument tailored to the current board situation:';

  var selectedOptions = generateDynamicPersuasionOptions();
  window.currentDynamicPersuasion = selectedOptions;

  var listHTML = '<div class="persuasion-list">';
  for(var i=0; i<selectedOptions.length; i++){
    var arg = selectedOptions[i];
    var tagClass = arg.stance === 'ja' ? 'tag-ja' : 'tag-nein';
    var tagLabel = arg.stance === 'ja' ? 'Urge ДА 👍' : 'Urge НЕТ 👎';
    listHTML += '<div class="persuasion-item" onclick="deliverDynamicPersuasion('+i+')"><span class="persuasion-tag '+tagClass+'">'+tagLabel+'</span><div class="persuasion-quote">"'+arg.text+'"</div></div>';
  }
  listHTML += '</div><button class="btn secondary" onclick="renderHumanVoteScreen()">Cancel / Vote Directly</button>';
  document.getElementById('ac').innerHTML = listHTML;
}

function deliverDynamicPersuasion(idx){
  sfx('click');
  var arg = window.currentDynamicPersuasion ? window.currentDynamicPersuasion[idx] : null;
  if(!arg) return;

  roundPersuasionModifier.active = true;
  roundPersuasionModifier.speakerName = 'You';
  roundPersuasionModifier.text = arg.text;
  roundPersuasionModifier.stance = arg.stance;
  roundPersuasionModifier.botModifiers = {};

  logSpeech('You', 'Speech', arg.text);

  var isLogicallySound = arg.evalLogic(game);
  var baseLogicBonus = isLogicallySound ? 1.5 : -0.8;
  var alive = getAliveIndices();
  var reactions = [];

  for(var k=0; k<alive.length; k++){
    var botIdx = alive[k];
    if(botIdx === game.humanPlayerIndex) continue;

    var bot = game.players[botIdx];
    var pers = bot.personality || {skill:'Intermediate', persuadability:1.0};
    var persuadFactor = pers.persuadability || 1.0;
    var trustBonus = 0;

    if(hasDispute(botIdx, game.humanPlayerIndex)) trustBonus -= 2.0;
    if(isWhite(game.humanInvestigations[botIdx])) trustBonus += 1.2;

    if(pers.skill === 'Master' || pers.skill === 'Expert'){
      trustBonus += isLogicallySound ? 1.5 : -2.5;
    }

    var impact = (baseLogicBonus * persuadFactor) + trustBonus;
    var scoreDelta = arg.stance === 'ja' ? (impact * 1.0) : (-impact * 1.0);
    roundPersuasionModifier.botModifiers[botIdx] = scoreDelta;

    if(Math.abs(scoreDelta) >= 1.2 && reactions.length < 2 && Math.random() < 0.7){
      if(scoreDelta > 0 && arg.stance === 'ja'){
        reactions.push(bot.name + ': "The statistical breakdown checks out. I will vote ДА."');
      } else if(scoreDelta < 0 && arg.stance === 'nein'){
        reactions.push(bot.name + ': "Solid deduction. We cannot pass this ticket."');
      } else if(!isLogicallySound){
        reactions.push(bot.name + ': "Your numbers don\'t add up, comrade."');
      }
    }
  }

  var reactionHTML = reactions.map(function(r){ return '<div style="color:var(--g);font-size:.78rem;font-style:italic;margin-bottom:4px">💬 ' + r + '</div>'; }).join('');

  document.getElementById('at').textContent = 'Persuasion Delivered';
  document.getElementById('ad').textContent = 'The comrades have listened to your deduction:';
  document.getElementById('ac').innerHTML =
    '<div class="speech-card player-speech"><div class="speech-name" style="color:#38bdf8">🗣️ You addressed the table:</div><div class="speech-text">"'+arg.text+'"</div></div>'+
    reactionHTML+
    '<div class="vote-buttons" style="margin-top:12px"><button class="vote-btn ja" onclick="castVote(true)"><span>👍</span>ДА</button><button class="vote-btn nein" onclick="castVote(false)"><span>👎</span>НЕТ</button></div>';
}

function showLocalVotePrompt(){
  var alive = getAliveIndices();
  var nextVoter = -1;
  var votesCast = 0;
  for(var k=0;k<alive.length;k++){
    if(game.votes[alive[k]]!==undefined) votesCast++;
    else if(nextVoter === -1) nextVoter = alive[k];
  }
  if(nextVoter===-1){ resolveVote(); return; }

  var canUnanimous = (game.communistPolicies < 3) && (votesCast === 0);
  var unanimousBtn = canUnanimous ? '<button class="btn secondary" onclick="unanimousDaVote()" style="margin-top:8px">★ Unanimous ДА (All Vote 👍)</button>' : '';

  var p = game.players[nextVoter];
  document.getElementById('at').textContent = p.name + "'s Vote";
  document.getElementById('ad').textContent = 'Cast your ballot in secret:';
  document.getElementById('ac').innerHTML =
    '<div class="vote-buttons"><button class="vote-btn ja" onclick="castLocalVote('+nextVoter+',true)"><span>👍</span>ДА</button><button class="vote-btn nein" onclick="castLocalVote('+nextVoter+',false)"><span>👎</span>НЕТ</button></div>' + unanimousBtn;
}

function unanimousDaVote(){
  sfx('vote');
  var alive = getAliveIndices();
  for(var k=0;k<alive.length;k++) game.votes[alive[k]] = true;
  renderGameBoard();
  document.getElementById('ac').innerHTML = '<p style="color:var(--g);font-weight:700">UNANIMOUS ДА PASSED 👍</p>';
  log('All players agreed to a unanimous ДА vote.');
  setTimeout(resolveVote, voteDelay());
}

function castLocalVote(playerIdx,vote){
  sfx('vote');
  game.votes[playerIdx] = vote;
  renderGameBoard();
  showLocalVotePrompt();
}

function castVote(vote){
  sfx('vote');
  game.votes[game.humanPlayerIndex] = vote;
  renderGameBoard();
  document.getElementById('ac').innerHTML = '<p style="color:var(--td)">Comrades are casting their ballots...</p>';
  setTimeout(botVoteNext, voteDelay());
}

function botVoteNext(){
  if(game.phase !== 'voting' || game.gameOver) return;
  var alive = getAliveIndices();
  var pendingBot = -1;
  for(var k=0; k<alive.length; k++){
    var idx = alive[k];
    if(idx !== game.humanPlayerIndex && game.votes[idx] === undefined){
      pendingBot = idx;
      break;
    }
  }

  if(pendingBot !== -1){
    var vote = botDecideVote(pendingBot);
    game.votes[pendingBot] = vote;
    sfx('vote');
    renderGameBoard();
    var moreBots = alive.some(function(bIdx){ return bIdx !== game.humanPlayerIndex && game.votes[bIdx] === undefined; });
    if(moreBots){
      setTimeout(botVoteNext, voteDelay());
    } else {
      setTimeout(resolveVote, voteDelay());
    }
  } else {
    setTimeout(resolveVote, voteDelay());
  }
}

function resolveVote(){
  // Snapshot beliefs BEFORE the current ballots update the public posterior.
  // Otherwise we would mark dissent as suspicious partly because of that very dissent.
  var ss51PreVotePublic = BRAIN ? brainView(-1) : null;
  brainObserveVotes(game.currentPresident, game.nominatedChancellor);
  var alive = getAliveIndices();
  var daVotes = 0, netVotes = 0;
  var daVoters = [], netVoters = [];

  for(var k=0;k<alive.length;k++){
    var pIdx = alive[k];
    var v = game.votes[pIdx];
    if(v){ daVotes++; daVoters.push(pIdx); } else { netVotes++; netVoters.push(pIdx); }
    if(game.playerRecords[pIdx]){
      game.playerRecords[pIdx].votes.unshift({
        round: game.whitePolicies + game.communistPolicies + 1,
        pres: game.currentPresident,
        chanc: game.nominatedChancellor,
        vote: v
      });
    }
  }
  var passed = daVotes > netVotes;

  // Contextual, PUBLIC-EVIDENCE voting audit. No true roles and no majority-vote test.
  // "Not publicly suspected" is *not* equivalent to "trusted/clean".
  var auditView = ss51PreVotePublic;
  var susThreshold = 0.64;
  var presSus = !!(auditView && auditView.F[game.currentPresident] >= susThreshold);
  var chancSus = !!(auditView && auditView.F[game.nominatedChancellor] >= susThreshold);
  var isGovtSus = presSus || chancSus;
  var pEvidence = typeof v29PositiveEvidence === 'function' ? v29PositiveEvidence(-1, game.currentPresident, true) : 0;
  var cEvidence = typeof v29PositiveEvidence === 'function' ? v29PositiveEvidence(-1, game.nominatedChancellor, true) : 0;
  var isGovtCredible = !!(auditView &&
    auditView.F[game.currentPresident] < .39 && auditView.F[game.nominatedChancellor] < .39 &&
    pEvidence >= 1.4 && cEvidence >= 1.4 &&
    !isInAnyConflict(game.currentPresident) && !isInAnyConflict(game.nominatedChancellor));
  for(var k=0; k<alive.length; k++){
    var voterIdx = alive[k], vChoice = game.votes[voterIdx];
    if(!game.unjustifiedVotes[voterIdx]) game.unjustifiedVotes[voterIdx] = {susYes:0,badNo:0,blocCount:0};
    if(voterIdx === game.currentPresident || voterIdx === game.nominatedChancellor) continue;
    if(vChoice === true && isGovtSus) game.unjustifiedVotes[voterIdx].susYes++;
    // Flag only a publicly well-supported ticket, never one that's merely unknown.
    // A private dispute or known red check gives the voter a good reason to dissent.
    var personalReason = hasDispute(voterIdx,game.currentPresident) || hasDispute(voterIdx,game.nominatedChancellor) ||
      ((game.botInvestigations[voterIdx]||{})[game.currentPresident] === 'communist') ||
      ((game.botInvestigations[voterIdx]||{})[game.nominatedChancellor] === 'communist');
    if(vChoice === false && game.communistPolicies >= 3 && isGovtCredible && !personalReason){
      game.unjustifiedVotes[voterIdx].badNo++;
    }
  }

  // Voting Blocs
  var minorityVoters = passed ? netVoters : daVoters;
  if(minorityVoters.length >= 2 && minorityVoters.length <= Math.floor(alive.length / 2)){
    for(var m1 = 0; m1 < minorityVoters.length; m1++){
      for(var m2 = m1 + 1; m2 < minorityVoters.length; m2++){
        var idx1 = minorityVoters[m1], idx2 = minorityVoters[m2];
        var pairKey = Math.min(idx1, idx2) + '-' + Math.max(idx1, idx2);
        game.votingBlocs[pairKey] = (game.votingBlocs[pairKey] || 0) + 1;
        if(game.communistPolicies >= 3 && game.votingBlocs[pairKey] >= 2){
          game.unjustifiedVotes[idx1].blocCount++;
          game.unjustifiedVotes[idx2].blocCount++;
        }
      }
    }
  }

  log('Vote result: '+daVotes+' ДА, '+netVotes+' НЕТ — Government '+(passed?'PASSED':'REJECTED'));
  sfx(passed?'policy':'alert');

  if(passed){
    game.electionTracker = 0;
    game.currentChancellor = game.nominatedChancellor;
    game.lastGovernment = {president:game.currentPresident,chancellor:game.currentChancellor};

    if(game.roles[game.currentChancellor]==='stalin' && game.communistPolicies>=3){
      endGame('communist','Stalin was elected Premier in the Stalin Zone! Communists seize control.');
      return;
    }

    if(game.communistPolicies >= 3){
      game.confirmedNotStalin[game.currentChancellor] = true;
      brainObserveCNS(game.currentChancellor);
      log(game.players[game.currentChancellor].name + ' is Confirmed Not Stalin (CNS)!');
    }

    renderGameBoard();
    setTimeout(startLegislativeSession, BOT_DELAY);
  } else {
    var rejectedPresName = game.players[game.currentPresident].name;
    var rejectedChancName = game.players[game.nominatedChancellor].name;

    game.electionTracker++;
    game.currentChancellor = null;
    game.nominatedChancellor = null;
    renderGameBoard();

    var nextPresIdx = peekNextPresident();
    var nextPresName = game.players[nextPresIdx].name;

    if(game.electionTracker >= 3){
      document.getElementById('at').textContent = '⚡ 3 FAILED ELECTIONS';
      document.getElementById('ad').textContent = 'The Council has reached gridlock. Chaos triggers!';
      document.getElementById('ac').innerHTML = 
        '<div class="dispute-box"><div class="dispute-title">⚡ CHAOS IN THE REPUBLIC!</div><div class="dispute-desc">3 consecutive governments were rejected. Top policy enacted automatically!</div></div>'+
        '<button class="btn" onclick="handleChaos(this)">Enact Top Policy from Deck →</button>';
    } else {
      document.getElementById('at').textContent = '🗳️ Government Rejected';
      document.getElementById('ad').textContent = 'Vote failed: ' + daVotes + ' ДА vs ' + netVotes + ' НЕТ.';
      document.getElementById('ac').innerHTML = 
        '<div class="speech-card outrage" style="margin:10px 0;text-align:center"><div class="speech-name" style="color:#fca5a5">🗳️ NOMINATION REJECTED</div><div>Ticket failed. Secretary placard passes to <strong>' + nextPresName + '</strong>.</div></div>'+
        '<button class="btn" onclick="proceedToNextPresident(this)">Continue Revolution →</button>';
    }
  }
}

function handleChaos(btn){
  if(transitionLock) return;
  transitionLock = true;
  if(btn) btn.disabled = true;
  sfx('click');

  log('⚡ CHAOS: 3 failed elections! Top policy enacted automatically.');
  var policy = drawPolicies(1)[0];
  game.lastGovernment = {president:null,chancellor:null};
  game.electionTracker = 0;

  if(policy==='communist'){
    sfx('communist');
    game.communistPolicies++;
    log('Chaos enacted a ☭ Communist policy!');
  } else {
    sfx('white');
    game.whitePolicies = (game.whitePolicies || 0) + 1;
    log('Chaos enacted a ★ White policy.');
  }

  announcePolicyAnimation(policy);
  renderGameBoard();
  checkWinConditions();
  if(!game.gameOver){
    transitionLock = false;
    var nextPresIdx = peekNextPresident();
    var nextPresName = game.players[nextPresIdx].name;
    document.getElementById('at').textContent = 'Chaos Enacted';
    document.getElementById('ad').textContent = 'A ' + policy.toUpperCase() + ' policy was enacted blind.';
    document.getElementById('ac').innerHTML = 
      '<button class="btn" onclick="proceedToNextPresident(this)">Continue Revolution →</button>';
  }
}

function startLegislativeSession(){
  game.phase = 'legislative_president';
  game.vetoRefused = false;
  game.drawnPolicies = drawPolicies(3);
  game.drawnPoliciesOriginal = game.drawnPolicies.slice();
  log(game.players[game.currentPresident].name+' drew 3 policies.');
  renderGameBoard();

  if(isBotGame() && game.currentPresident===game.humanPlayerIndex){
    showPresidentPolicyUI();
  } else if(game.mode==='local'){
    showPrivacyGate(
      game.players[game.currentPresident].name,
      'Secretary Legislative Session',
      'Draw 3 policies. Secretly discard 1, then pass 2 to Premier.',
      showPresidentPolicyUI
    );
  } else {
    setTimeout(botPresidentDiscard, BOT_DELAY);
  }
}

function showPresidentPolicyUI(){
  document.getElementById('pt').textContent = 'Legislative (Secretary)';
  document.getElementById('at').textContent = 'Discard One Policy';
  document.getElementById('ad').textContent = 'Select one policy to discard:';

  var content = document.getElementById('ac');
  var html = '<div class="policy-cards">';
  for(var i=0;i<game.drawnPolicies.length;i++){
    var policy = game.drawnPolicies[i];
    var isW = isWhite(policy);
    html += '<div class="policy-card '+(isW?'white':'communist')+'" onclick="presidentDiscard('+i+')">'+
      '<div class="card-icon">'+(isW?'★':'☭')+'</div>'+
      '<div class="card-label">'+(isW?'WHITE':'COMMUNIST')+'</div>'+
      '</div>';
  }
  html += '</div>';
  content.innerHTML = html;
}

function presidentDiscard(idx){
  sfx('click');
  var discarded = game.drawnPolicies.splice(idx,1)[0];
  game.discardPile.push(discarded);
  game.passedToChancellor = game.drawnPolicies.slice();
  log(game.players[game.currentPresident].name+' discarded a policy and passed 2 to Premier.');
  renderGameBoard();
  setTimeout(startChancellorSession, BOT_DELAY);
}

function startChancellorSession(){
  game.phase = 'legislative_chancellor';
  renderGameBoard();

  if(isBotGame() && game.currentChancellor===game.humanPlayerIndex){
    showChancellorPolicyUI();
  } else if(game.mode==='local'){
    showPrivacyGate(
      game.players[game.currentChancellor].name,
      'Premier Legislative Session',
      'Choose 1 policy to enact into law.',
      showChancellorPolicyUI
    );
  } else {
    setTimeout(botChancellorDiscard, BOT_DELAY);
  }
}

function showChancellorPolicyUI(){
  document.getElementById('pt').textContent = 'Legislative (Premier)';
  document.getElementById('at').textContent = 'Enact One Policy';
  document.getElementById('ad').textContent = 'Choose one policy to enact:';

  var content = document.getElementById('ac');
  var html = '<div class="policy-cards">';
  for(var i=0;i<game.drawnPolicies.length;i++){
    var policy = game.drawnPolicies[i];
    var isW = isWhite(policy);
    html += '<div class="policy-card '+(isW?'white':'communist')+'" onclick="chancellorEnact('+i+')">'+
      '<div class="card-icon">'+(isW?'★':'☭')+'</div>'+
      '<div class="card-label">'+(isW?'WHITE':'COMMUNIST')+'</div>'+
      '</div>';
  }
  html += '</div>';
  if(game.vetoUnlocked && !game.vetoRefused){
    html += '<button class="btn secondary" onclick="proposeVeto()" style="margin-top:8px">🚫 Propose Veto</button>';
  }
  content.innerHTML = html;
}

function chancellorEnact(idx){
  sfx('click');
  var otherIdx = idx===0?1:0;
  var discarded = game.drawnPolicies.splice(otherIdx,1)[0];
  game.discardPile.push(discarded);
  var enacted = game.drawnPolicies[0];
  game.drawnPolicies = [];
  enactPolicy(enacted);
}

function enactPolicy(policy){
  var currentRound = game.whitePolicies + game.communistPolicies + 1;
  game.policyHistory.push({
    president:game.currentPresident, chancellor:game.currentChancellor, policy:policy, round:currentRound
  });

  if(game.playerRecords[game.currentPresident]){
    game.playerRecords[game.currentPresident].governments.unshift({
      round: currentRound, role: 'Secretary', partner: game.currentChancellor, enacted: policy, claim: ''
    });
  }
  if(game.playerRecords[game.currentChancellor]){
    game.playerRecords[game.currentChancellor].governments.unshift({
      round: currentRound, role: 'Premier', partner: game.currentPresident, enacted: policy, claim: ''
    });
  }

  if(policy==='communist'){
    game.communistPolicies++;
    sfx('communist');
    log('☭ COMMUNIST policy enacted by Premier '+game.players[game.currentChancellor].name+'!');
  } else {
    game.whitePolicies = (game.whitePolicies || 0) + 1;
    sfx('white');
    log('★ White policy enacted by Premier '+game.players[game.currentChancellor].name+'.');
  }

  announcePolicyAnimation(policy);
  renderGameBoard();
  checkWinConditions();

  if(!game.gameOver){
    conductPolicyDebrief(policy, function(){
      var track = getCommunistTrack(game.playerCount);
      var power = track[game.communistPolicies-1];
      if(policy==='communist' && power && power!=='win'){
        game.powerType = power;
        setTimeout(triggerPower, BOT_DELAY);
      } else {
        game.currentPresident = nextPresident();
        setTimeout(startRound, BOT_DELAY);
      }
    });
  }
}

// ==================== DEBRIEF (DIRECT 1-CLICK PROGRESSION) ====================
function conductPolicyDebrief(enactedPolicy, onDone){
  var presIdx = game.currentPresident;
  var chancIdx = game.currentChancellor;

  if(game.mode === 'local'){
    var lPresName = game.players[presIdx].name;
    var lChancName = game.players[chancIdx].name;
    document.getElementById('at').textContent = 'Policy Enacted';
    document.getElementById('ad').textContent = 'The policy has been placed on the board.';
    document.getElementById('ac').innerHTML = 
      '<div class="speech-card" style="text-align:center;padding:18px">'+
      '<div style="font-size:1.15rem;font-weight:700;color:var(--g)">🗣️ Open Discussion</div>'+
      '<div class="speech-text">Secretary <strong>'+lPresName+'</strong> and Premier <strong>'+lChancName+'</strong>: discuss what was drawn and passed out loud in real life.</div>'+
      '</div>'+
      '<button class="btn" onclick="finishDebriefStep(this)" style="margin-top:14px">Continue →</button>';
    window.finishDebriefStep = function(btn){
      if(btn) btn.disabled = true;
      transitionLock = false;
      sfx('click');
      onDone();
    };
    return;
  }

  var presName = game.players[presIdx].name;
  var chancName = game.players[chancIdx].name;
  var presRole = game.roles[presIdx];
  var chancRole = game.roles[chancIdx];
  var currentRound = game.whitePolicies + game.communistPolicies;

  var drawn = game.drawnPoliciesOriginal || [];
  var dDrawn = drawn.filter(function(p){return p==='white';}).length;
  var passed = game.passedToChancellor || [];
  var dPassed = passed.filter(function(p){return p==='white';}).length;
  var cPassed = passed.filter(function(p){return p==='communist'}).length;

  var presClaimedPassedDem = false;
  var presClaimedDemCount = 0;
  var presClaimedPa = 0;   // how many Whites the Secretary CLAIMED to pass (0, 1 = a choice, 2)
  var presQuote = '';

  if(isWhite(presRole)){
    if(dDrawn === 0){
      presClaimedDemCount = 0;
      presQuote = 'I drew: 3 Communist. My hands were tied—passed two Communists to Premier ' + chancName + '.';
    } else if(dDrawn === 3){
      presClaimedPassedDem = true;
      presClaimedDemCount = 3;
      presQuote = 'I drew: 3 White. Passed two Whites to Premier ' + chancName + '.';
    } else if(dDrawn === 2){
      presClaimedPassedDem = true;
      presClaimedDemCount = 2;
      presQuote = (dPassed === 1) ? 'I drew: 2 White, 1 Communist. Passed a choice to Premier ' + chancName + '.' : 'I drew: 2 White, 1 Communist. Passed two Whites to Premier ' + chancName + '.';
    } else {
      presClaimedPassedDem = true;
      presClaimedDemCount = 1;
      presQuote = 'I drew: 1 White, 2 Communist. Passed a choice to Premier ' + chancName + '.';
    }
    presClaimedPa = dPassed;
  } else {
    var _pc = brainPresClaim(presIdx, chancIdx, enactedPolicy, drawn, passed);
    presClaimedDemCount = _pc.cd;
    presClaimedPassedDem = _pc.pf;
    presClaimedPa = (_pc.pa === undefined ? (_pc.pf ? 1 : 0) : _pc.pa);
    presQuote = _pc.quote;
  }

  function resolveDebriefDialogue(finalPresQuote, presClaimedDem, claimedDemCount, claimedPassedWhite, skipConfirmation){
    logSpeech(presName, 'Secretary', finalPresQuote);
    if(game.playerRecords[presIdx] && game.playerRecords[presIdx].governments[0]){
      game.playerRecords[presIdx].governments[0].claim = finalPresQuote;
    }

    if(!game.deckCycle) game.deckCycle = { presDraws:[], claimedDemSeen:0 };
    game.deckCycle.presDraws.push({
      pres: presIdx, round: currentRound, claimedDem: claimedDemCount, actualDem: dDrawn
    });
    game.deckCycle.claimedDemSeen += claimedDemCount;
    brainCheckClaimPlausibility(presIdx);
    renderTracks();

    var chancQuote = '';
    var chancClaimsReceivedTwoComm = false;

    if(chancIdx !== game.humanPlayerIndex){
      var _cc = brainChancClaim(chancIdx, presIdx, enactedPolicy, cPassed, dPassed, presClaimedDem);
      chancClaimsReceivedTwoComm = _cc.t2;
      chancQuote = _cc.quote;
    } else {
      chancClaimsReceivedTwoComm = (cPassed === 2);
      chancQuote = 'I enacted the policy for the Republic.';
    }

    brainObserveGovernment(presIdx, chancIdx, enactedPolicy, {
      cd: claimedDemCount, pf: presClaimedDem,
      pa: (claimedPassedWhite === null || claimedPassedWhite === undefined ? (presClaimedDem ? 1 : 0) : claimedPassedWhite),
      t2: chancClaimsReceivedTwoComm, truthA: dPassed
    });

    if(game.playerRecords[chancIdx] && game.playerRecords[chancIdx].governments[0]){
      game.playerRecords[chancIdx].governments[0].claim = chancQuote;
    }

    var hasContradiction = false;
    if(presClaimedDem && chancClaimsReceivedTwoComm){
      hasContradiction = true;
      addDispute(presIdx, chancIdx, 'Contradiction: Secretary claims passed White choice, Premier claims received 2 Communists', 'choice_denial');
    }

    if(hasContradiction){
      sfx('alert');
      logSpeech(chancName, 'Premier', chancQuote, true);
    } else {
      logSpeech(chancName, 'Premier', chancQuote, false);
    }

    if(skipConfirmation){
      onDone();
      return;
    }

    var conflictCard = hasContradiction ? ' outrage' : '';
    var disputeHtml = hasContradiction ? 
      '<div class="dispute-box"><div class="dispute-title">🚨 CHOICE-DENIAL CONTRADICTION!</div><div class="dispute-desc">Conflicting accounts heard at the table!</div></div>' : '';

    var actionHtml = '<div style="margin:4px 0">'+
      '<div class="speech-card pres"><div class="speech-name">👑 '+presName+' (Secretary) declares:</div><div class="speech-text">"'+finalPresQuote+'"</div></div>'+
      '<div class="speech-card chanc'+conflictCard+'"><div class="speech-name">⚖️ '+chancName+' (Premier) replies:</div><div class="speech-text">"'+chancQuote+'"</div></div>'+
      disputeHtml+
      baSuggestButtonHtml()+'<button class="btn" onclick="finishDebriefStep(this)" style="margin-top:10px">Continue Revolution →</button>'+
      '</div>';

    document.getElementById('at').textContent = hasContradiction ? '🚨 HEATED DISPUTE' : 'Policy Debrief';
    document.getElementById('ad').textContent = 'Comrades report on the legislative draw:';
    document.getElementById('ac').innerHTML = actionHtml;

    window.finishDebriefStep = function(btn){
      if(transitionLock) return;
      transitionLock = true;
      if(btn) btn.disabled = true;
      sfx('click');
      onDone();
    };
  }

  // HUMAN SECRETARY (1-Click Progression)
  if(isBotGame() && presIdx === game.humanPlayerIndex){
    document.getElementById('at').textContent = 'Address the Table';
    document.getElementById('ad').textContent = 'Declare what you drew and passed to the Premier:';

    var claimOptions = [];
    if(isWhite(presRole)){
      claimOptions = [{ dw: dDrawn, dc: 3 - dDrawn, pw: dPassed, pc: 2 - dPassed }];
    } else {
      claimOptions = [
        {dw:0,dc:3,pw:0,pc:2},
        {dw:1,dc:2,pw:1,pc:1},
        {dw:2,dc:1,pw:1,pc:1},
        {dw:2,dc:1,pw:2,pc:0},
        {dw:3,dc:0,pw:2,pc:0}
      ];
    }

    function cardWord(n, s, p){ return n + ' ' + (n === 1 ? s : p); }

    var humanPresHtml = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;width:100%;max-width:440px;margin:0 auto;text-align:center">';
    for(var hco = 0; hco < claimOptions.length; hco++){
      var co = claimOptions[hco];
      var drawText = cardWord(co.dc, 'Communist', 'Communists') + (co.dw ? ', ' + cardWord(co.dw, 'White', 'Whites') : '');
      var passText = cardWord(co.pc, 'Communist', 'Communists') + (co.pw ? ', ' + cardWord(co.pw, 'White', 'Whites') : '');
      var claimText = 'Drew ' + drawText + ', passed ' + passText;
      humanPresHtml += '<button type="button" class="btn secondary human-pres-claim" data-claim-index="' + hco + '" style="font-size:.84rem;padding:10px 12px;width:100%;margin:0;align-self:center;text-align:center">' + claimText + '</button>';
    }
    humanPresHtml += '</div>';
    document.getElementById('ac').innerHTML = humanPresHtml;

    document.querySelectorAll('.human-pres-claim').forEach(function(btn){
      btn.addEventListener('click', function(){
        var co = claimOptions[Number(this.getAttribute('data-claim-index'))];
        if(!co) return;
        var drawText = cardWord(co.dc, 'Communist', 'Communists') + (co.dw ? ', ' + cardWord(co.dw, 'White', 'Whites') : '');
        var passText = cardWord(co.pc, 'Communist', 'Communists') + (co.pw ? ', ' + cardWord(co.pw, 'White', 'Whites') : '');
        var claimText = 'Drew ' + drawText + ', passed ' + passText;
        sfx('click');
        resolveDebriefDialogue(claimText, co.pw > 0, co.dw, co.pw, true);
      });
    });
  } 
  // HUMAN PREMIER (1-Click Progression)
  else if(isBotGame() && chancIdx === game.humanPlayerIndex){
    if(!game.deckCycle) game.deckCycle = { presDraws:[], claimedDemSeen:0 };
    game.deckCycle.presDraws.push({ pres:presIdx, round:currentRound, claimedDem:presClaimedDemCount, actualDem:dDrawn });
    game.deckCycle.claimedDemSeen += presClaimedDemCount;
    brainCheckClaimPlausibility(presIdx);
    renderTracks();
    logSpeech(presName, 'Secretary', presQuote);

    document.getElementById('at').textContent = 'Address the Table';
    document.getElementById('ad').textContent = 'Declare what you received from Secretary ' + presName + ':';

    var actualReceived = cPassed === 2 ? 'Received 2 Communists' : (dPassed === 2 ? 'Received 2 Whites' : 'Received 1 White, 1 Communist');
    var receivedClaims = [];
    if(isWhite(chancRole)){
      receivedClaims = [{ text: actualReceived, t2: (cPassed === 2) }];
    } else {
      receivedClaims = [
        { text: 'Received 2 Communists', t2: true },
        { text: 'Received 1 White, 1 Communist', t2: false },
        { text: 'Received 2 Whites', t2: false }
      ];
    }

    var chancHtml = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;width:100%;max-width:380px;margin:0 auto;text-align:center">';
    for(var hcc = 0; hcc < receivedClaims.length; hcc++){
      var rcq = receivedClaims[hcc];
      chancHtml += '<button type="button" class="btn secondary human-chanc-claim" data-claim-index="' + hcc + '" style="font-size:.88rem;padding:11px 12px;width:100%;margin:0;align-self:center;text-align:center">' + rcq.text + '</button>';
    }
    chancHtml += '</div>';
    document.getElementById('ac').innerHTML = chancHtml;

    document.querySelectorAll('.human-chanc-claim').forEach(function(btn){
      btn.addEventListener('click', function(){
        var rcq = receivedClaims[Number(this.getAttribute('data-claim-index'))];
        if(!rcq) return;
        sfx('click');
        var wasConflict = (rcq.text !== actualReceived) || (presClaimedPassedDem && rcq.t2);
        logSpeech('You', 'Premier', rcq.text, wasConflict);
        if(presClaimedPassedDem && rcq.t2){
          addDispute(presIdx, chancIdx, 'Contradiction: Secretary claims passed White choice, Premier claims received 2 Communists', 'choice_denial');
        }
        brainObserveGovernment(presIdx, chancIdx, enactedPolicy, {
          cd: presClaimedDemCount, pf: presClaimedPassedDem, pa: presClaimedPa, t2: rcq.t2, truthA: dPassed
        });
        onDone();
      });
    });
  } else {
    resolveDebriefDialogue(presQuote, presClaimedPassedDem, presClaimedDemCount, presClaimedPa, false);
  }
}

// ==================== VETO POWER ====================
function proposeVeto(){
  if(game.phase !== 'legislative_chancellor' || !game.vetoUnlocked || game.vetoRefused) return;
  game.phase = 'veto';
  var presIdx = game.currentPresident, chancIdx = game.currentChancellor;
  var presName = game.players[presIdx].name, chancName = game.players[chancIdx].name;
  sfx('alert');
  log('🚫 Premier ' + chancName + ' proposes a VETO!');
  document.getElementById('pt').textContent = 'Veto';
  var presIsHuman = (game.mode === 'local') || (presIdx === game.humanPlayerIndex);
  if(presIsHuman){
    document.getElementById('at').textContent = 'Veto Proposed';
    document.getElementById('ad').textContent = 'Premier ' + chancName + ' proposes a veto. Secretary ' + presName + ', consent?';
    document.getElementById('ac').innerHTML =
      '<div class="vote-buttons"><button class="vote-btn ja" onclick="resolveVeto(true)"><span>👍</span>ДА</button><button class="vote-btn nein" onclick="resolveVeto(false)"><span>👎</span>НЕТ</button></div>';
  } else {
    setTimeout(function(){ resolveVeto(botPresidentConsents()); }, BOT_DELAY * 2);
  }
}

function resolveVeto(consent){
  if(game.phase !== 'veto') return;
  sfx('click');
  var presIdx = game.currentPresident, chancIdx = game.currentChancellor;
  var presName = game.players[presIdx].name, chancName = game.players[chancIdx].name;

  if(consent){
    game.phase = 'vetoed';
    game.discardPile = game.discardPile.concat(game.drawnPolicies);
    game.drawnPolicies = [];
    game.electionTracker++;
    game.currentChancellor = null;
    game.nominatedChancellor = null;
    log('✅ Secretary ' + presName + ' consented to Veto.');
    renderGameBoard();
    if(game.electionTracker >= 3){
      handleChaos();
    } else {
      var nextName = game.players[peekNextPresident()].name;
      document.getElementById('ac').innerHTML =
        '<div class="speech-card outrage" style="text-align:center">🚫 VETO CONSENTED</div>' +
        '<button class="btn" onclick="proceedToNextPresident(this)">Pass to ' + nextName + ' →</button>';
    }
  } else {
    game.vetoRefused = true;
    game.phase = 'legislative_chancellor';
    log('⛔ Secretary ' + presName + ' refused the veto.');
    if(chancIdx === game.humanPlayerIndex) showChancellorPolicyUI();
    else setTimeout(botChancellorDiscard, BOT_DELAY);
  }
}

// ==================== EXECUTIVE POWERS ====================
function triggerPower(){
  transitionLock = false;
  game.phase = 'power';
  var presIdx = game.currentPresident;
  var power = game.powerType;
  renderGameBoard();

  if(power==='investigate'){
    if(isBotGame() && presIdx===game.humanPlayerIndex) showInvestigateUI();
    else setTimeout(botInvestigate, BOT_DELAY);
  } else if(power==='special'){
    if(isBotGame() && presIdx===game.humanPlayerIndex) showSpecialElectionUI();
    else setTimeout(botSpecialElection, BOT_DELAY);
  } else if(power==='peek'){
    var peek = drawPolicies(3);
    game.policyDeck = peek.concat(game.policyDeck);
    if(isBotGame() && presIdx===game.humanPlayerIndex) showPeekUI(peek);
    else setTimeout(function(){ game.currentPresident=nextPresident(); startRound(); }, BOT_DELAY);
  } else if(power==='execution'){
    if(isBotGame() && presIdx===game.humanPlayerIndex) showExecutionUI();
    else setTimeout(botExecute, BOT_DELAY);
  }
}

function showInvestigateUI(){
  document.getElementById('pt').textContent = 'Executive Power';
  document.getElementById('at').textContent = 'Investigate Loyalty';
  document.getElementById('ad').textContent = 'Select a comrade:';

  var alive = getAliveIndices();
  var content = document.getElementById('ac');
  var html = '<div class="player-select-grid">';
  for(var k=0;k<alive.length;k++){
    var idx = alive[k];
    if(idx===game.currentPresident) continue;
    html += '<button class="select-player-btn" onclick="investigatePlayer('+idx+')">'+game.players[idx].name+'</button>';
  }
  html += '</div>';
  content.innerHTML = html;
}

function investigatePlayer(idx){
  sfx('click');
  var role = game.roles[idx];
  var team = isWhite(role)?'white':'communist';
  var targetName = game.players[idx].name;
  game.humanInvestigations[idx] = team;

  // Whites can only tell the truth; Communist/Stalin get both buttons (lie or truth)
  var humanIsWhite = isWhite(game.roles[game.humanPlayerIndex]);
  var btnW = '<button class="btn secondary" onclick="humanDeclareInvestigation('+idx+', \'White\')">Declare: Loyal White</button>';
  var btnC = '<button class="btn secondary" onclick="humanDeclareInvestigation('+idx+', \'Communist\')" style="margin-top:6px">Declare: Communist</button>';
  var declareButtons = humanIsWhite ? (team==='white' ? btnW : btnC) : (btnW + btnC);

  var resultHTML = '<div class="privacy-gate">'+
    '<div style="font-size:1.1rem;font-weight:700">'+targetName+'</div>'+
    '<div style="font-size:1.8rem;font-weight:900;text-transform:uppercase;margin:8px 0;color:'+(team==='white'?'var(--whi-light)':'var(--comm-red)')+'">'+
    (team==='white'?'★ WHITE':'☭ COMMUNIST')+
    '</div>'+
    declareButtons+
    '</div>';
  document.getElementById('ac').innerHTML = resultHTML;
}

function humanDeclareInvestigation(idx, declaredTeam){
  sfx('click');
  brainObserveInvestigation(game.humanPlayerIndex, idx, declaredTeam);
  var targetName = game.players[idx].name;
  var claimText = 'I investigated ' + targetName + '. They are a ' + (declaredTeam==='White'?'loyal White!':'Communist agent!');
  logSpeech('You', 'Secretary', claimText);
  var nextPresName = game.players[peekNextPresident()].name;
  document.getElementById('ac').innerHTML = 
    '<div class="speech-card pres"><div class="speech-name">👑 Announcement</div><div class="speech-text">"'+claimText+'"</div></div>'+
    '<button class="btn" onclick="finishPower(this)">Pass Secretaryship to ' + nextPresName + ' →</button>';
}

function showSpecialElectionUI(){
  document.getElementById('pt').textContent = 'Executive Power';
  document.getElementById('at').textContent = 'Special Election';
  document.getElementById('ad').textContent = 'Select next Secretary:';

  var alive = getAliveIndices();
  var content = document.getElementById('ac');
  var html = '<div class="player-select-grid">';
  for(var k=0;k<alive.length;k++){
    if(alive[k]===game.currentPresident) continue;
    html += '<button class="select-player-btn" onclick="specialElect('+alive[k]+')">'+game.players[alive[k]].name+'</button>';
  }
  html += '</div>';
  content.innerHTML = html;
}

function specialElect(idx){
  sfx('click');
  log(game.players[game.currentPresident].name+' picked '+game.players[idx].name+' via Special Election!');
  if(game.preSpecialPresident === null) game.preSpecialPresident = game.currentPresident;
  game.currentPresident = idx;
  game.powerType = null;
  startRound();
}

function showPeekUI(policies){
  document.getElementById('pt').textContent = 'Executive Power';
  document.getElementById('at').textContent = 'Policy Peek';
  document.getElementById('ad').textContent = 'Top 3 policies:';

  var html = '<div class="peek-cards">';
  for(var i=0;i<policies.length;i++){
    var isW = policies[i]==='white';
    html += '<div class="peek-card '+(isW?'white':'communist')+'">'+(isW?'★':'☭')+'</div>';
  }
  html += '</div>';
  html += '<button class="btn" onclick="finishPower(this)">Continue →</button>';
  document.getElementById('ac').innerHTML = html;
}

function showExecutionUI(){
  document.getElementById('pt').textContent = 'Executive Power';
  document.getElementById('at').textContent = 'Order Execution';
  document.getElementById('ad').textContent = 'Select a comrade to execute:';

  var alive = getAliveIndices();
  var content = document.getElementById('ac');
  var html = '<div class="player-select-grid">';
  for(var k=0;k<alive.length;k++){
    var idx = alive[k];
    if(idx===game.currentPresident) continue;
    html += '<button class="select-player-btn" onclick="executePlayer('+idx+')" style="border-color:var(--r);color:var(--comm-red)">'+game.players[idx].name+'</button>';
  }
  html += '</div>';
  content.innerHTML = html;
}

function executePlayer(idx){
  sfx('communist');
  game.players[idx].isDead = true;
  log('💀 '+game.players[game.currentPresident].name+' executed '+game.players[idx].name+'!');

  if(game.roles[idx]==='stalin'){
    endGame('white','Stalin was executed! Whites restore freedom!');
    return;
  }
  renderGameBoard();
  finishPower();
}

function finishPower(btn){
  if(btn) btn.disabled = true;
  transitionLock = false;
  sfx('click');
  game.powerType = null;
  game.currentPresident = nextPresident();
  startRound();
}

function proceedToNextPresident(btn){
  if(btn) btn.disabled = true;
  transitionLock = false;
  sfx('click');
  game.currentPresident = nextPresident();
  startRound();
}

function checkWinConditions(){
  if(game.communistPolicies>=5 && !game.vetoUnlocked){ game.vetoUnlocked = true; log('🚫 VETO UNLOCKED.'); }
  if(game.whitePolicies>=5){
    endGame('white','5 White policies enacted! Whites prevail!');
    return;
  }
  if(game.communistPolicies>=6){
    endGame('communist','6 Communist policies enacted! Revolution complete!');
    return;
  }
}

function endGame(winner,reason){
  game.gameOver = true;
  game.winner = winner;
  sfx((winner==='white')?'win':'lose');
  log('GAME OVER: '+reason);

  var vBox = document.getElementById('victory-box');
  if(vBox){
    vBox.style.display = 'block';
    document.getElementById('v-emblem').textContent = (winner==='white')?'★':'☭';
    document.getElementById('v-emblem').style.color = (winner==='white')?'var(--whi-light)':'var(--comm-red)';
    document.getElementById('v-title').textContent = winner==='white'?'WHITES WIN!':'COMMUNISTS WIN!';
    document.getElementById('v-title').style.color = (winner==='white')?'var(--whi-light)':'var(--comm-red)';
    document.getElementById('v-reason').textContent = reason;
  }
  renderGameBoard();
  document.getElementById('at').textContent = 'Revolution Concluded';
  document.getElementById('ad').textContent = 'All secret allegiances unmasked.';
  document.getElementById('ac').innerHTML = '<button class="btn" onclick="location.reload()" style="max-width:280px;margin:6px auto 0">Play Again</button>';
}

function initDeviceView(){
  var saved = null;
  try { saved = localStorage.getItem('sneakyStalinViewMode'); } catch(e){}
  var defaultMode = (window.innerWidth >= 900) ? 'desktop' : 'mobile';
  applyDeviceView(saved || defaultMode);
}

function applyDeviceView(mode){
  var isDesktop = (mode === 'desktop');
  document.body.classList.toggle('force-desktop', isDesktop);
  document.body.classList.toggle('force-mobile', !isDesktop);
  var btn = document.getElementById('viewToggleBtn');
  if(btn){
    btn.innerHTML = isDesktop ? '📱 SWITCH TO MOBILE (1080x1920)' : '🖥️ SWITCH TO DESKTOP (1920x1080)';
  }
  try { localStorage.setItem('sneakyStalinViewMode', mode); } catch(e){}
}

function toggleDeviceView(){
  sfx('click');
  applyDeviceView(document.body.classList.contains('force-desktop') ? 'mobile' : 'desktop');
}

document.addEventListener('DOMContentLoaded', initDeviceView);
initDeviceView();

// ==================== COMPLETE BAYESIAN BOT BRAIN ====================
var BRAIN = null;
var BRAIN_FRAME = 0.18;
var BRAIN_SKILL = {
  Beginner:     {gamma:0.45, noise:1.10, lapse:0.09, lie:0.60},
  Intermediate: {gamma:0.72, noise:0.55, lapse:0.03, lie:0.85},
  Expert:       {gamma:0.92, noise:0.22, lapse:0.008, lie:1.0},
  Master:       {gamma:1.00, noise:0.06, lapse:0.0,  lie:1.0}
};

function brainParams(idx){
  var pl = game.players[idx];
  var pers = pl && pl.personality;
  var base = BRAIN_SKILL[(pers && pers.skill) || 'Intermediate'] || BRAIN_SKILL.Intermediate;
  var t = (pers && pers.type) || '';
  var o = {gamma:base.gamma, noise:base.noise, lapse:base.lapse, yesBias:0, zoneCaution:0, boldness:0};
  if(t==='Cautious'){ o.zoneCaution = 0.30; o.yesBias = -0.08; }
  else if(t==='Chaotic'){ o.noise *= 1.8; o.lapse += 0.04; o.boldness = 0.25; }
  else if(t==='Loyalist'){ o.yesBias = 0.30; }
  else if(t==='Diplomat'){ o.yesBias = 0.22; }
  else if(t==='Analytical'){ o.gamma = Math.min(1, o.gamma + 0.06); }
  else if(t==='Outspoken'){ o.boldness = 0.20; }
  else if(t==='Dominant'){ o.boldness = 0.10; }
  else if(t==='Subtle'){ o.boldness = -0.12; o.lapse *= 0.5; }
  else if(t==='Shrewd'){ o.gamma = Math.min(1, o.gamma + 0.03); }
  return o;
}

function brainRoleCode(r){ return r==='white' ? 0 : (r==='communist' ? 1 : 2); }
function brainClamp(x,a,b){ return x<a ? a : (x>b ? b : x); }
function brainC(n,k){ if(k<0||k>n) return 0; var r=1; for(var i=1;i<=k;i++) r = r*(n-k+i)/i; return r; }
function brainRand(){ return (Math.random()+Math.random()+Math.random()+Math.random()-2)*0.9; }
function brainLogistic(x){ return 1/(1+Math.exp(-x)); }

function brainInit(){
  BRAIN = null;
  if(!isBotGame()) return;
  var n = game.playerCount, k = getRoleDistribution(n).communists;
  var hRole = [], hStalin = [];
  for(var s=0; s<n; s++){
    var others = [];
    for(var i=0;i<n;i++) if(i!==s) others.push(i);
    var chosen = [];
    (function rec(start){
      if(chosen.length === k){
        var r = new Uint8Array(n); r[s] = 2;
        for(var c=0;c<chosen.length;c++) r[chosen[c]] = 1;
        hRole.push(r); hStalin.push(s); return;
      }
      for(var a=start; a<others.length; a++){ chosen.push(others[a]); rec(a+1); chosen.pop(); }
    })(0);
  }
  var H = hRole.length, trueH = -1;
  for(var h=0; h<H && trueH<0; h++){
    var ok = true;
    for(var j=0;j<n;j++){ if(hRole[h][j] !== brainRoleCode(game.roles[j])){ ok=false; break; } }
    if(ok) trueH = h;
  }
  BRAIN = {n:n, H:H, hRole:hRole, hStalin:hStalin, trueH:trueH, pub:new Float64Array(H), bot:{}, mask:{}, cache:{}, ver:0};
  for(var q=0;q<H;q++) BRAIN.pub[q] = 1/H;
  for(var b=0;b<n;b++){
    if(game.players[b].isHuman) continue;
    var m = brainMask(b);
    BRAIN.mask[b] = m;
    var w = new Float64Array(H), sum = 0;
    for(var z=0;z<H;z++){ w[z] = m[z]; sum += m[z]; }
    for(var y=0;y<H;y++) w[y] /= sum;
    BRAIN.bot[b] = w;
  }
}

function brainMask(i){
  var B = BRAIN, n = B.n, role = game.roles[i], m = new Float64Array(B.H);
  for(var h=0; h<B.H; h++){
    var r = B.hRole[h], ok;
    if(role === 'white') ok = (r[i] === 0);
    else if(role === 'communist') ok = (h === B.trueH);
    else ok = (r[i] === 2) && (n > 6 || h === B.trueH);
    m[h] = ok ? 1 : 0;
  }
  return m;
}

function brainMul(w, Lh, g, owner){
  var H = w.length, s = 0, h, v;
  for(h=0; h<H; h++){
    v = w[h];
    if(v > 0){ v *= (g === 1 ? Lh[h] : Math.pow(Lh[h], g)); w[h] = v; s += v; }
  }
  if(!(s > 1e-250)){
    var base = owner >= 0 ? BRAIN.mask[owner] : null;
    s = 0;
    for(h=0; h<H; h++){ w[h] = base ? base[h] : 1; s += w[h]; }
  }
  var inv = 1/s;
  for(h=0; h<H; h++) w[h] *= inv;
}

function brainApplyVec(Lh, humanActor){
  var B = BRAIN; if(!B) return;
  var t = humanActor ? 0.6 : 1;
  brainMul(B.pub, Lh, t, -1);
  for(var i in B.bot) brainMul(B.bot[i], Lh, brainParams(+i).gamma * t, +i);
  B.ver++;
}

function brainEliminate(pred, onlyBot){
  var B = BRAIN; if(!B) return;
  function run(w, owner){
    var s = 0, backup = null;
    for(var h=0; h<B.H; h++){ if(w[h] > 0 && pred(B.hRole[h], h)){ if(!backup) backup = w.slice(); w[h] = 0; } s += w[h]; }
    if(s > 0){ for(var g=0; g<B.H; g++) w[g] /= s; }
    else if(backup){ for(var q=0; q<B.H; q++) w[q] = backup[q]; }
  }
  if(onlyBot === undefined){
    run(B.pub, -1);
    for(var i in B.bot) run(B.bot[i], +i);
  } else if(B.bot[onlyBot]) run(B.bot[onlyBot], onlyBot);
  B.ver++;
}

function brainState(adj){
  adj = adj || {r:0, w:0};
  var r = game.communistPolicies + adj.r, w = game.whitePolicies + adj.w;
  var wPool = Math.max(0, 6 - w), rPool = Math.max(0, 11 - r), N = wPool + rPool;
  var pd = [0,0,0,0];
  if(N >= 3){
    var tot = brainC(N,3);
    for(var d=0; d<=3; d++) pd[d] = brainC(wPool,d) * brainC(rPool,3-d) / tot;
  } else { pd = [0.24,0.49,0.24,0.03]; }
  var st = {
    r:r, w:w, zone:(r>=3), brink:(w===4), tracker:game.electionTracker, pd:pd, qPass:0.85,
    pChaosRed: (N>0 ? rPool/N : 0.65),
    Rc: [1.0,1.15,1.9,1.7,3.0,14][Math.min(r,5)],
    Wg: [0.8,0.9,1.0,1.2,14][Math.min(w,4)],
    Rg: [0.9,1.0,1.7,1.5,3.0,14][Math.min(r,5)],
    Wc: [0.7,0.8,0.9,1.1,14][Math.min(w,4)],
    Kz: 11,
    alive: getAliveIndices()
  };
  st.redTab = [[0,0,0],[0,0,0],[0,0,0]];
  for(var a=0;a<3;a++) for(var b=0;b<3;b++) st.redTab[a][b] = brainRedProb(a,b,st);
  return st;
}

function brainPresBranches(rp, d, st, rc){
  if(rp !== 1) return [[Math.min(d,2), 1]];
  var q = st.r >= 5 ? 1 : st.qPass;
  if(d === 0) return [[0,1]];
  if(d === 1) return [[0,q],[1,1-q]];
  if(d === 2){
    if(st.r >= 5) return [[1,1]];
    // v16: with 2 Whites in hand, passing W+R only helps a Communist if the Secretary is a Communist who will enact
    // the red. A White (or Stalin, who plays White) Secretary enacts the white from W+R anyway, so passing W+W then
    // costs nothing and is a cheap way to look clean -- it is therefore weak evidence of innocence, not proof.
    if(rc !== undefined && rc !== 1 && typeof V16 !== 'undefined' && V16.coverPass) return [[1,1-V16.coverWW],[2,V16.coverWW]];
    return [[1,0.9],[2,0.1]];
  }
  return [[2,1]];
}

function brainChancRedProb(rc, rp, a, st){
  if(a === 0) return 1;
  if(a === 2) return 0;
  if(rc === 0) return 0;
  if(rc === 2) return st.r >= 5 ? 1 : 0;
  if(st.r >= 5) return 1;
  if(rp === 1) return 0.92;
  if(rp === 2) return 0.25;
  return st.r >= 4 ? 0.7 : (st.r >= 2 ? 0.42 : 0.3);
}

function brainRedProb(rp, rc, st){
  var s = 0;
  for(var d=0; d<=3; d++){
    var pd = st.pd[d]; if(!pd) continue;
    var br = brainPresBranches(rp, d, st, rc);
    for(var i=0;i<br.length;i++) s += pd * br[i][1] * brainChancRedProb(rc, rp, br[i][0], st);
  }
  return s;
}

function brainPresClaimProb(rp, rc, d, a, eRed, obs){
  var pa=obs.pa===undefined?(obs.pf?1:0):obs.pa;
  if(rp!==1 || !eRed) return obs.cd===d && pa===a ? 1 : 0;
  // A Communist can claim a choice to frame a Premier, or claim a forced red draw.
  // Integrating this into the Bayesian likelihood keeps both explanations alive.
  // A White Premier is the usual frame target; a burned comrade can also be framed.
  var frame=rc===0?.17:rc===1?.13:0.08; // v45: fabricated choice claims are possible, but less likely than a Premier hiding a real choice
  if(!(obs.cd>=0 && obs.cd<=3 && pa>=0 && pa<=2 && pa<=obs.cd && 2-pa<=3-obs.cd)) return 0;
  // Six physically valid draw/pass claims; a small normalized legacy/human floor.
  var probability=.01;
  if(obs.cd===Math.max(1,d) && pa===1) probability+=.94*frame;
  if(obs.cd===0 && pa===0) probability+=.94*(1-frame);
  return probability;
}

function brainChancClaimProb(rc, a, eRed, obs){
  var truth = (a === 0);
  if(rc !== 1) return (obs.t2 === truth) ? 1 : 0;
  if(eRed && a === 1) return obs.t2 ? 0.95 : 0.05;
  return (obs.t2 === truth) ? 1 : 0;
}

function brainGovLik(rp, rc, obs, st){
  var eRed = (obs.e === 'communist'), tot = 0;
  for(var d=0; d<=3; d++){
    var pd = st.pd[d]; if(!pd) continue;
    var br = brainPresBranches(rp, d, st, rc);
    for(var i=0;i<br.length;i++){
      var a = br[i][0], pa = br[i][1];
      var pr = brainChancRedProb(rc, rp, a, st);
      var pe = eRed ? pr : 1 - pr; if(pe <= 0) continue;
      var pc = brainPresClaimProb(rp, rc, d, a, eRed, obs); if(pc <= 0) continue;
      var ct = brainChancClaimProb(rc, a, eRed, obs); if(ct <= 0) continue;
      tot += pd * pa * pe * pc * ct;
    }
  }
  return tot;
}

function brainTabToVec(tab, iA, iB){
  var B = BRAIN, mx = 0, a, b;
  for(a=0;a<3;a++) for(b=0;b<3;b++) if(tab[a][b] > mx) mx = tab[a][b];
  var floor = Math.max(1e-12, 0.04 * mx);
  var Lh = new Float64Array(B.H);
  for(var h=0; h<B.H; h++){
    var v = tab[B.hRole[h][iA]][B.hRole[h][iB]];
    Lh[h] = v < floor ? floor : v;
  }
  return Lh;
}

function brainObserveGovernment(presIdx, chancIdx, enacted, cl){
  if(!BRAIN) return;
  var st = brainState(enacted === 'communist' ? {r:-1,w:0} : {r:0,w:-1});
  var obs = {e:enacted, cd:cl.cd, pa:(cl.pa === undefined ? (cl.pf ? 1 : 0) : cl.pa), pf:!!cl.pf, t2:!!cl.t2};
  var tab = [[0,0,0],[0,0,0],[0,0,0]];
  for(var a=0;a<3;a++) for(var b=0;b<3;b++) tab[a][b] = brainGovLik(a,b,obs,st);
  var human = (presIdx === game.humanPlayerIndex || chancIdx === game.humanPlayerIndex);
  brainApplyVec(brainTabToVec(tab, presIdx, chancIdx), human);

  // Human claims use the SAME public likelihood and card-check pipeline as bot claims.
  // No separate human-only exposure penalty: secret actual cards cannot be public proof.

  var truthA = cl.truthA;
  if(truthA !== undefined){
    if(game.players[presIdx] && !game.players[presIdx].isHuman && game.roles[presIdx] === 'white'){
      if(!!cl.t2 !== (truthA === 0)) brainEliminate(function(r){ return r[chancIdx] === 0; }, presIdx);
    }
    if(game.players[chancIdx] && !game.players[chancIdx].isHuman && game.roles[chancIdx] === 'white'){
      if((cl.pa === undefined ? !!cl.pf : cl.pa > 0) !== (truthA > 0)) brainEliminate(function(r){ return r[presIdx] === 0; }, chancIdx);
    }
  }
}

function brainVoteYesProb(rv, rp, rc, st, n){
  var fOn = (rp !== 0) || (rc !== 0), sC = (rc === 2), p;
  var whiteLike = (rv === 0) || (rv === 2 && n >= 7);
  if(whiteLike){
    if(st.zone) p = sC ? 0.42 : (fOn ? 0.5 : 0.62);
    else p = fOn ? 0.72 : 0.9;
  } else {
    if(st.zone && sC) p = 0.99;
    else if(st.zone) p = fOn ? 0.85 : 0.4;
    else p = fOn ? 0.95 : 0.62;
  }
  return brainClamp(p, 0.03, 0.97);
}

function brainObserveVotes(presIdx, chancIdx){
  if(!BRAIN) return;
  var B = BRAIN, st = brainState(), alive = getAliveIndices();
  var Lh = new Float64Array(B.H);
  for(var h=0; h<B.H; h++) Lh[h] = 1;
  for(var k=0; k<alive.length; k++){
    var j = alive[k];
    if(j === presIdx || j === chancIdx) continue;
    var yes = (game.votes[j] === true);
    var ex = (j === game.humanPlayerIndex) ? 0.45 : (voteSwayed(j, yes) ? 0.15 : 0.8);   // a vote the human's speech pushed says little about the voter
    for(h=0; h<B.H; h++){
      var r = B.hRole[h];
      var py = brainVoteYesProb(r[j], r[presIdx], r[chancIdx], st, B.n);
      Lh[h] *= Math.pow(yes ? py : 1 - py, ex);
    }
  }
  brainApplyVec(Lh, false);
}

function brainObserveCNS(c){ brainEliminate(function(r){ return r[c] === 2; }); }
function brainObserveExecution(t){
  var B = BRAIN; if(!B) return;
  brainEliminate(function(r, h){ return B.hStalin[h] === t; });
}
function brainObserveAudit(p){
  var B = BRAIN; if(!B) return;
  var Lh = new Float64Array(B.H);
  for(var h=0; h<B.H; h++) Lh[h] = (B.hRole[h][p] !== 0) ? 1.6 : 1;
  brainApplyVec(Lh, false);
}

function brainInvLik(ri, rt, claimF){
  var pf;
  if(ri === 0) return claimF ? (rt !== 0 ? 1 : 0) : (rt === 0 ? 1 : 0);
  if(ri === 1) pf = (rt === 0) ? 0.35 : (rt === 1 ? 0.04 : 0.02);
  else pf = (rt === 0) ? 0.25 : 0.04;
  return claimF ? pf : 1 - pf;
}
function brainInvVec(presIdx, target, claimF){
  var B = BRAIN, tab = [[0,0,0],[0,0,0],[0,0,0]];
  for(var a=0;a<3;a++) for(b=0;b<3;b++) tab[a][b] = brainInvLik(a,b,claimF);
  return brainTabToVec(tab, presIdx, target);
}
function brainObserveInvestigation(presIdx, target, declaredTeam){
  if(!BRAIN) return;
  brainApplyVec(brainInvVec(presIdx, target, declaredTeam === 'Communist'), presIdx === game.humanPlayerIndex);
}
function brainPrivateInvestigate(o, target, team){
  if(!BRAIN) return;
  var isF = (team === 'communist');
  brainEliminate(function(r){ return (r[target] !== 0) !== isF; }, o);
}

function brainMarksSig(o){
  var sus = game.userSuspects || [], tr = game.userTrusted || [];
  if(!sus.length && !tr.length) return '';
  var c = 0; try { c = Math.round(getHumanCredibility(o) * 2); } catch(e){}
  return sus.join(',') + '/' + tr.join(',') + '/' + c;
}

function brainEffWeights(w, o){
  var hI = game.humanPlayerIndex;
  if(hI < 0 || o === hI) return w;
  var sus = game.userSuspects || [], tr = game.userTrusted || [];
  var cred = 0; try { cred = getHumanCredibility(o); } catch(e){}
  var B = BRAIN, eff = null;

  if(cred !== 0){
    var mult = Math.exp(-0.4 * cred);
    eff = new Float64Array(B.H);
    for(var h0=0; h0<B.H; h0++){
      var v0 = w[h0]; if(!v0){ eff[h0] = 0; continue; }
      eff[h0] = v0 * (B.hRole[h0][hI] !== 0 ? mult : 1);
    }
    w = eff;
  }

  if(!sus.length && !tr.length) return w;
  var fF = {}, fW = {}, any = false, j;
  if(cred >= 0.5) for(var a=0;a<sus.length;a++){ j = sus[a]; fF[j] = (fF[j]||1) * 1.30; fW[j] = (fW[j]||1) * 0.85; any = true; }
  if(cred >= 1.0) for(var b=0;b<tr.length;b++){ j = tr[b]; fF[j] = (fF[j]||1) * 0.90; fW[j] = (fW[j]||1) * 1.08; any = true; }
  else if(cred <= -1.5) for(var c=0;c<tr.length;c++){ j = tr[c]; fF[j] = (fF[j]||1) * 1.25; fW[j] = (fW[j]||1) * 0.90; any = true; }
  if(!any) return w;
  eff = new Float64Array(B.H);
  for(var h=0; h<B.H; h++){
    var v = w[h]; if(!v){ eff[h] = 0; continue; }
    var r = B.hRole[h], m = 1;
    for(var k in fF){ m *= (r[k] !== 0) ? fF[k] : fW[k]; }
    eff[h] = v * m;
  }
  return eff;
}

function brainView(o){
  var B = BRAIN, key = B.ver + '|' + brainMarksSig(o);
  var ck = B.cache[o];
  if(ck && ck.key === key) return ck;
  var w = (o >= 0 && B.bot[o]) ? B.bot[o] : B.pub;
  var eff = brainEffWeights(w, o);
  var n = B.n, F = new Float64Array(n), S = new Float64Array(n), tot = 0;
  for(var h=0; h<B.H; h++){
    var v = eff[h]; if(!v) continue;
    tot += v;
    var r = B.hRole[h];
    for(var j=0;j<n;j++) if(r[j]) F[j] += v;
    S[B.hStalin[h]] += v;
  }
  if(tot > 0){ for(var i=0;i<n;i++){ F[i] /= tot; S[i] /= tot; } }
  var out = {key:key, w:eff, tot:tot, F:F, S:S};
  B.cache[o] = out;
  return out;
}

function brainPubF(j){ return BRAIN ? brainView(-1).F[j] : 0.4; }

function brainTeamBelief(actorIdx, targetIdx){
  if(actorIdx === targetIdx || !BRAIN) return null;
  var view = brainView(actorIdx), pStalin = view.S[targetIdx], pFascist = view.F[targetIdx];
  if(pStalin > 0.75) return 'stalin';
  if(pFascist - pStalin > 0.75) return 'communist';
  return null;
}

function isPlayerVerySus(observerIdx, targetIdx){
  if(observerIdx === targetIdx || !BRAIN) return false;
  return brainView(observerIdx).F[targetIdx] >= 0.6;
}

function hasDecentReasonToDistrust(voterIdx, targetIdx){
  if(voterIdx === targetIdx || !BRAIN) return false;
  return brainView(voterIdx).F[targetIdx] >= 0.5;
}

function brainTicket(view, P, C, st){
  var B = BRAIN, w = view.w, sR = 0, sS = 0, tot = view.tot || 1;
  for(var h=0; h<B.H; h++){
    var v = w[h]; if(!v) continue;
    var r = B.hRole[h], rc = r[C];
    sR += v * st.redTab[r[P]][rc];
    if(rc === 2) sS += v;
  }
  return {eRed: sR/tot, pS: sS/tot};
}

function brainWYesValue(view, P, C, st, params){
  var B = BRAIN, w = view.w, tot = view.tot || 1, y = 0;
  var Kz = st.Kz * (1 + params.zoneCaution);
  for(var h=0; h<B.H; h++){
    var v = w[h]; if(!v) continue;
    var r = B.hRole[h], rc = r[C];
    if(st.zone && rc === 2) y -= v * Kz;
    else { var rd = st.redTab[r[P]][rc]; y += v * (st.Wg * (1-rd) - st.Rc * rd); }
  }
  return y/tot;
}

function brainAvgGov(view, st, excl){
  var s = 0, c = 0;
  for(var k=0;k<st.alive.length;k++){ var j = st.alive[k]; if(j === excl) continue; s += (view.F[j] - view.S[j]); c++; }
  var a = c ? s/c : 0.25, T = st.redTab;
  return (1-a)*(1-a)*T[0][0] + (1-a)*a*T[0][1] + a*(1-a)*T[1][0] + a*a*T[1][1];
}

function brainWNoValue(view, v, st, params){
  if(st.tracker >= 2) return st.Wg * (1 - st.pChaosRed) - st.Rc * st.pChaosRed - 0.25;
  var eR = brainAvgGov(view, st, v);
  var avg = st.Wg * (1 - eR) - st.Rc * eR;
  if(st.zone){
    var minS = 1, sumS = 0, c = 0;
    for(var k=0;k<st.alive.length;k++){ var j = st.alive[k]; if(j === v) continue; minS = Math.min(minS, view.S[j]); sumS += view.S[j]; c++; }
    var pAlt = 0.35 * minS + 0.65 * 0.55 * (c ? sumS/c : 0);
    var Kz = st.Kz * (1 + params.zoneCaution);
    return -Kz * pAlt + (1 - pAlt) * avg - 0.2 - 0.15 * st.tracker;
  }
  return 0.9 * avg - 0.1 - 0.1 * st.tracker;
}

function brainFValues(view, P, C, st){
  var B = BRAIN, w = view.w, tot = view.tot || 1, vp = 0, pWhiteWin = 0;
  for(var h=0; h<B.H; h++){
    var v = w[h]; if(!v) continue;
    var r = B.hRole[h], rc = r[C];
    if(st.zone && rc === 2) vp += v * 30;
    else {
      var rd = st.redTab[r[P]][rc];
      vp += v * (st.Rg * rd - st.Wc * (1-rd));
      if(st.brink) pWhiteWin += v * (1 - rd);
    }
  }
  vp /= tot; pWhiteWin /= tot;
  var vf = (st.tracker >= 2) ? (st.Rg * st.pChaosRed - st.Wc * (1 - st.pChaosRed)) : -0.25;
  return {vp:vp, vf:vf, pWhiteWin:pWhiteWin};
}

function brainIsF(i){ return game.roles[i] !== 'white'; }

function brainPredictVotes(o, P, C, st){
  var out = {}, view = brainView(o), oIsF = brainIsF(o);
  var pubView = brainView(-1);
  for(var k=0;k<st.alive.length;k++){
    var j = st.alive[k];
    if(j === o){ continue; }
    if(j === P || j === C){ out[j] = 1; continue; }
    var pj = brainParams(j), scale = 0.35 * pj.noise + 0.08, py;
    if(j === game.humanPlayerIndex){
      var d0 = brainWYesValue(pubView, P, C, st, {zoneCaution:0}) - brainWNoValue(pubView, j, st, {zoneCaution:0});
      py = 0.5 + 0.5 * (brainLogistic(d0 / 0.6) - 0.5) * 2 * 0.8;
    } else if(oIsF){
      if(brainIsF(j)){
        var fv = brainFValues(brainView(j), P, C, st);
        py = brainLogistic((fv.vp - fv.vf) / 0.3);
      } else {
        var dw = brainWYesValue(pubView, P, C, st, pj) - brainWNoValue(pubView, j, st, pj) + pj.yesBias;
        py = brainLogistic(dw / scale);
      }
    } else {
      var fOn = 1 - (1 - view.F[P]) * (1 - view.F[C]);
      var pW = brainLogistic((brainWYesValue(view, P, C, st, pj) - brainWNoValue(view, j, st, pj) + pj.yesBias) / scale);
      var pF = 0.6 + 0.3 * fOn;
      py = (1 - view.F[j]) * pW + view.F[j] * pF;
    }
    out[j] = py;
  }
  return out;
}

function brainPassDist(preds, exclude, st){
  var dist = [1];
  for(var k=0;k<st.alive.length;k++){
    var j = st.alive[k]; if(j === exclude) continue;
    var p = preds[j]; if(p === undefined) p = 0.5;
    var nd = new Array(dist.length + 1);
    for(var z=0; z<nd.length; z++) nd[z] = 0;
    for(var y=0; y<dist.length; y++){ nd[y] += dist[y] * (1-p); nd[y+1] += dist[y] * p; }
    dist = nd;
  }
  return dist;
}

function brainPassProbFrom(dist, extraYes, alive){
  var need = Math.floor(alive/2) + 1, p = 0;
  for(var y=0; y<dist.length; y++) if(y + extraYes >= need) p += dist[y];
  return p;
}

function brainVoteDiff(v, P, C, st, params, delta){
  var view = brainView(v), isF = brainIsF(v);
  if(!isF){
    var yes = brainWYesValue(view, P, C, st, params);
    var no = brainWNoValue(view, v, st, params);
    return yes - no + params.yesBias + 0.5 * delta;
  }
  var fv = brainFValues(view, P, C, st);
  if(st.brink && fv.pWhiteWin > 0.35){
    return -25 * fv.pWhiteWin + 0.25 * delta;
  }
  var preds = brainPredictVotes(v, P, C, st);
  var dist = brainPassDist(preds, v, st);
  var A = st.alive.length;
  var pY = brainPassProbFrom(dist, 1, A), pN = brainPassProbFrom(dist, 0, A);
  var pubMe = brainPubF(v);
  var kappa = (st.zone ? 1.1 : 0.85) * (0.6 + 0.8 * (1 - pubMe));
  var evY = pY * fv.vp + (1-pY) * fv.vf - kappa * (1 - pY);
  var evN = pN * fv.vp + (1-pN) * fv.vf - kappa * pN;
  return evY - evN + 0.25 * delta;
}

function botDecideVote(botIdx){
  var P = game.currentPresident, C = game.nominatedChancellor;
  if(botIdx === P || botIdx === C) return true;
  if(!BRAIN) return true;
  var st = brainState(), params = brainParams(botIdx);
  var delta = (roundPersuasionModifier.active && roundPersuasionModifier.botModifiers[botIdx]) ? roundPersuasionModifier.botModifiers[botIdx] : 0;
  var diff = brainVoteDiff(botIdx, P, C, st, params, delta);
  var vote = (diff + params.noise * brainRand() * 0.6) > 0;
  if(Math.random() < params.lapse) vote = !vote;
  return vote;
}

function botNominate(){
  var presIdx = game.currentPresident, alive = getAliveIndices();
  var candidates = [];
  for(var k=0;k<alive.length;k++){
    var i = alive[k];
    if(i === presIdx) continue;
    if(i === game.lastGovernment.chancellor) continue;
    if(alive.length > 5 && i === game.lastGovernment.president) continue;
    candidates.push(i);
  }
  if(candidates.length === 0){ for(var k2=0;k2<alive.length;k2++) if(alive[k2] !== presIdx) candidates.push(alive[k2]); }

  var st = brainState(), params = brainParams(presIdx), view = brainView(presIdx), isF = brainIsF(presIdx);
  var scored = [];
  for(var c=0;c<candidates.length;c++){
    var cand = candidates[c];
    var preds = brainPredictVotes(presIdx, presIdx, cand, st);
    preds[presIdx] = 1;
    var dist = brainPassDist(preds, cand, st);
    var pass = brainPassProbFrom(dist, 1, st.alive.length);
    var U;
    if(!isF){
      var yes = brainWYesValue(view, presIdx, cand, st, params);
      var no = brainWNoValue(view, presIdx, st, params);
      U = pass * yes + (1 - pass) * no;
    } else {
      var fv = brainFValues(view, presIdx, cand, st);
      var vf = fv.vf;
      var teamBelief = brainTeamBelief(presIdx, cand);
      if(st.zone && teamBelief === 'stalin') vf -= 6;
      else if(st.zone && view.S[cand] > 0.2) vf -= 6 * view.S[cand];
      U = pass * fv.vp + (1 - pass) * vf;
      if(teamBelief === 'communist'){ U -= 0.55 * Math.max(0, brainPubF(cand) - 0.3); }
    }
    scored.push({idx:cand, U:U, pass:pass});
  }
  var temp = 0.05 + 0.5 * params.noise;
  var mx = -1e9, s;
  for(s=0;s<scored.length;s++) if(scored[s].U > mx) mx = scored[s].U;
  var wsum = 0;
  for(s=0;s<scored.length;s++){ scored[s].w = Math.exp((scored[s].U - mx) / temp); wsum += scored[s].w; }
  var pick = Math.random() * wsum, choice = scored[scored.length-1].idx;
  for(s=0;s<scored.length;s++){ pick -= scored[s].w; if(pick <= 0){ choice = scored[s].idx; break; } }

  game.nominatedChancellor = choice;
  log(game.players[presIdx].name + ' nominated ' + game.players[choice].name + ' as Premier.');
  renderGameBoard();
  setTimeout(startVoting, BOT_DELAY);
}

function brainPassRedProb(presIdx, chancIdx, st, params){
  if(st.r >= 5) return 1;
  if(brainTeamBelief(presIdx, chancIdx)) return 1;
  var base = st.r <= 1 ? 0.72 : (st.r === 2 ? 0.86 : 0.95);
  if(brainPubF(presIdx) > 0.6 && st.r <= 2) base -= 0.25;
  base += params.boldness * 0.5;
  return brainClamp(base, 0.35, 1);
}

function botPresidentDiscard(){
  var presIdx = game.currentPresident, chancIdx = game.currentChancellor;
  var myRole = game.roles[presIdx], policies = game.drawnPolicies;
  var st = brainState(), params = brainParams(presIdx);
  var dCount = policies.filter(function(p){ return p === 'white'; }).length;
  var wantRed = false;
  if(myRole === 'communist') wantRed = true;
  else if(myRole === 'stalin' && st.r >= 5) wantRed = true;
  var discardIdx;
  if(!wantRed){
    var ci = policies.indexOf('communist');
    discardIdx = ci >= 0 ? ci : 0;
  } else {
    var wi = policies.indexOf('white');
    if(wi < 0) discardIdx = 0;
    else if(dCount === 1){
      discardIdx = (Math.random() < brainPassRedProb(presIdx, chancIdx, st, params)) ? wi : policies.indexOf('communist');
    } else discardIdx = wi;
  }
  var discarded = game.drawnPolicies.splice(discardIdx, 1)[0];
  game.discardPile.push(discarded);
  game.passedToChancellor = game.drawnPolicies.slice();
  log(game.players[presIdx].name + ' discarded a policy and passed 2 to Premier.');
  renderGameBoard();
  setTimeout(startChancellorSession, BOT_DELAY);
}

function brainCommChancRedProb(chancIdx, presIdx, st, params){
  if(st.r >= 5) return 1;
  var teamBelief = brainTeamBelief(chancIdx, presIdx);
  if(teamBelief === 'stalin') return 0;
  if(teamBelief === 'communist') return 1;
  var pubP = brainPubF(presIdx), pubC = brainPubF(chancIdx);
  var blameMe = pubC / (pubC + pubP + 1e-6);
  var benefit = [0.20,0.30,0.50,0.60,0.85][Math.min(st.r,4)];
  return brainClamp(benefit * 1.35 * (1 - blameMe) + params.boldness * 0.3, 0, 0.9);
}

function botChancellorDiscard(){
  var chancIdx = game.currentChancellor, presIdx = game.currentPresident;
  var myRole = game.roles[chancIdx], policies = game.drawnPolicies;
  if(game.vetoUnlocked && !game.vetoRefused && botWantsVeto(myRole, policies)){ proposeVeto(); return; }
  var st = brainState(), params = brainParams(chancIdx);
  var enactIdx = 0;
  var wi = policies.indexOf('white'), ci = policies.indexOf('communist');
  if(wi < 0 || ci < 0){ enactIdx = 0; }
  else if(myRole === 'white'){ enactIdx = wi; }
  else if(myRole === 'stalin'){ enactIdx = (st.r >= 5) ? ci : wi; }
  else { enactIdx = (Math.random() < brainCommChancRedProb(chancIdx, presIdx, st, params)) ? ci : wi; }
  var otherIdx = enactIdx === 0 ? 1 : 0;
  var discarded = game.drawnPolicies.splice(otherIdx, 1)[0];
  game.discardPile.push(discarded);
  var enacted = game.drawnPolicies[0];
  game.drawnPolicies = [];
  enactPolicy(enacted);
}

function botWantsVeto(role, policies){
  var hasComm = policies.indexOf('communist') >= 0, hasWhite = policies.indexOf('white') >= 0;
  if(role === 'white') return !hasWhite;
  return !hasComm;
}
function botPresidentConsents(){
  var cards = game.passedToChancellor || [];
  var hasComm = cards.indexOf('communist') >= 0, hasWhite = cards.indexOf('white') >= 0;
  if(isCommunist(game.roles[game.currentPresident])) return !hasComm;
  return !hasWhite;
}

function brainShouldFrame(presIdx, chancIdx){
  var params = brainParams(presIdx);
  if(game.roles[presIdx] === 'stalin') return false;
  var pubP = brainPubF(presIdx), pubC = brainPubF(chancIdx);
  var p = BRAIN_FRAME * (pubC > pubP ? 1.6 : 0.5) + params.boldness * 0.3;
  return Math.random() < brainClamp(p, 0, 0.5);
}

function brainPresQuote(cd, a, chancName){
  var tail = ' to Premier ' + chancName + '.';
  if(cd === 0) return 'I drew: 3 Communist. My hands were tied—passed two Communists' + tail;
  if(cd === 3) return 'I drew: 3 White. Passed two Whites' + tail;
  if(cd === 2) return 'I drew: 2 White, 1 Communist. ' + (a >= 2 ? 'Passed two Whites' : 'Passed a choice (1 Whi, 1 Comm)') + tail;
  return 'I drew: 1 White, 2 Communist. Passed a choice (1 Whi, 1 Comm)' + tail;
}

function brainPresClaim(presIdx, chancIdx, enacted, drawn, passed){
  var dD = drawn.filter(function(p){ return p === 'white'; }).length;
  var dP = passed.filter(function(p){ return p === 'white'; }).length;
  var cd = dD, pf = dP > 0, a = dP;
  if(game.roles[presIdx] === 'stalin' && game._stalinTest && game._stalinTest.P === presIdx && dD === 2 && dP === 1){ cd = 1; }
  if(isCommunist(game.roles[presIdx]) && enacted === 'communist'){
    if(dD === 0){
      var chancF = isCommunist(game.roles[chancIdx]);
      if(!chancF && brainShouldFrame(presIdx, chancIdx)){
        var seen = (game.deckCycle && game.deckCycle.claimedDemSeen) || 0;
        var canClaim2 = (seen + 2) <= 6, canClaim1 = (seen + 1) <= 6;
        if(canClaim2 && (!canClaim1 || Math.random() < 0.4)){ cd = 2; pf = true; a = 1; }
        else if(canClaim1){ cd = 1; pf = true; a = 1; }
        else { cd = 0; pf = false; a = 0; }
      }
      else { cd = 0; pf = false; a = 0; }
    } else { cd = 0; pf = false; a = 0; }
  }
  return {cd:cd, pf:pf, pa:a, quote:brainPresQuote(cd, a, game.players[chancIdx].name)};
}

function brainChancClaim(chancIdx, presIdx, enacted, cPassed, dPassed, presClaimedPf){
  var presName = game.players[presIdx].name;
  var truth2 = (cPassed === 2), t2 = truth2;
  var myRole = game.roles[chancIdx], presRole = game.roles[presIdx], q;
  if(myRole === 'communist' && enacted === 'communist' && dPassed === 1) t2 = true;
  if(t2){
    if(!truth2){
      q = isCommunist(presRole)
        ? 'Yes, Secretary ' + presName + ' passed me two Communist cards as stated.'
        : 'Secretary ' + presName + ' passed me two Communist cards! Don\'t let them lie to frame me!';
    } else if(presClaimedPf){
      q = 'WHAT?! That is an absolute lie! You gave me TWO Communist cards! You\'re trying to frame me!';
    } else {
      q = (myRole === 'white') ? 'Can confirm. I was handed two Communist policies, had no choice.'
        : 'Secretary ' + presName + ' handed me two Communist cards. My hands were tied.';
    }
  } else if(dPassed === 2){
    q = 'Secretary passed me two White cards. Clean decision for the Republic.';
  } else if(myRole === 'stalin'){
    q = 'I was given a choice and enacted White for the people.';
  } else {
    q = 'I was given a choice (1 Whi, 1 Comm) and gladly enacted the White policy.';
  }
  return {t2:t2, quote:q};
}

function brainInvestigationUtility(presIdx, target, claimF){
  var B = BRAIN, pubW = B.pub, Lh = brainInvVec(presIdx, target, claimF);
  var n = B.n, F = new Float64Array(n), tot = 0, S = new Float64Array(n);
  for(var h=0; h<B.H; h++){
    var v = pubW[h] * Lh[h]; if(!v) continue;
    tot += v; var r = B.hRole[h];
    for(var j=0;j<n;j++) if(r[j]) F[j] += v;
  }
  var st = brainState(), U = 0;
  for(var k=0;k<st.alive.length;k++){
    var j2 = st.alive[k], f = F[j2] / (tot || 1), role = game.roles[j2];
    if(role === 'stalin') U -= (2.5 + (st.r >= 2 ? 1.5 : 0)) * f;
    else if(role === 'communist') U -= 0.8 * f;
    else U += 0.55 * f;
  }
  return U;
}

function brainPickInvestigation(presIdx, candidates){
  var st = brainState(), role = game.roles[presIdx], params = brainParams(presIdx);
  var nextPres = peekNextPresident();
  var informed = (role === 'communist') || (role === 'stalin' && game.playerCount <= 6);
  var best = null, bestU = -1e9;
  var view = brainView(presIdx);
  for(var c=0;c<candidates.length;c++){
    var t = candidates[c], truthF = (game.roles[t] !== 'white');
    if(role === 'white'){
      var p = view.F[t];
      var U = 4 * p * (1 - p) + (t === nextPres ? 0.25 : 0) + 0.15 * brainRand() * Math.max(0.2, params.noise);
      if(U > bestU){ bestU = U; best = {target:t, declared: truthF ? 'Communist' : 'White'}; }
    } else if(!informed){
      var pguess = view.F[t];
      var infoU = 4 * pguess * (1 - pguess) + (t === nextPres ? 0.25 : 0);
      if(truthF){
        var protectComrade = (Math.random() < 0.8);
        var U3 = infoU + (protectComrade ? 3 : -2) + 0.15 * brainRand();
        if(U3 > bestU){ bestU = U3; best = {target:t, declared: protectComrade ? 'White' : 'Communist'}; }
      } else {
        var U4 = infoU + 0.15 * brainRand() * Math.max(0.2, params.noise);
        if(U4 > bestU){ bestU = U4; best = {target:t, declared:'White'}; }
      }
    } else {
      for(var cf=0; cf<2; cf++){
        var claimF = (cf === 1);
        var U2 = brainInvestigationUtility(presIdx, t, claimF) + 0.25 * brainRand() * Math.max(0.3, params.noise);
        if(claimF && game.roles[t] === 'communist') U2 -= 4;
        if(claimF && game.roles[t] === 'stalin') U2 -= 8;
        if(role === 'stalin' && claimF) U2 -= 1.2;
        if(U2 > bestU){ bestU = U2; best = {target:t, declared: claimF ? 'Communist' : 'White'}; }
      }
    }
  }
  return best;
}

function botInvestigate(){
  var presIdx = game.currentPresident, alive = getAliveIndices(), candidates = [];
  for(var k=0; k<alive.length; k++){
    var i = alive[k];
    if(i === presIdx) continue;
    if(i === game.currentChancellor) continue;
    if(game.botInvestigations[presIdx] && game.botInvestigations[presIdx][i]) continue;
    candidates.push(i);
  }
  if(candidates.length === 0){
    for(var k2=0; k2<alive.length; k2++){
      var i2 = alive[k2];
      if(i2 !== presIdx && !(game.botInvestigations[presIdx] && game.botInvestigations[presIdx][i2])) candidates.push(i2);
    }
  }
  if(candidates.length === 0){
    log('No one left to investigate.');
    setTimeout(function(){ game.currentPresident = nextPresident(); startRound(); }, BOT_DELAY);
    return;
  }
  var pick = brainPickInvestigation(presIdx, candidates);
  var target = pick.target, declaredTeam = pick.declared;
  var actualRole = game.roles[target];
  var actualTeam = isWhite(actualRole) ? 'white' : 'communist';
  if(!game.botInvestigations[presIdx]) game.botInvestigations[presIdx] = {};
  game.botInvestigations[presIdx][target] = actualTeam;
  var presName = game.players[presIdx].name, targetName = game.players[target].name;
  brainPrivateInvestigate(presIdx, target, actualTeam);
  brainObserveInvestigation(presIdx, target, declaredTeam);
  return brainInvestigationReport(presIdx, target, declaredTeam);
}

function brainCheckClaimPlausibility(presIdx){
  var seen = (game.deckCycle && game.deckCycle.claimedDemSeen) || 0;
  if(seen <= 6) return;
  var over = seen - 6;
  log('🧮 CARD COUNT IMPOSSIBLE: claimed White policies drawn this cycle (' + seen + ') exceed the 6 that exist in the deck by ' + over + '. ' + game.players[presIdx].name + ' is mathematically proven to be lying!');
  logSpeech('Audit Committee', 'Card Count', 'Impossible claim detected — ' + game.players[presIdx].name + ' cannot have drawn that many White policies.', true);
  addDispute(presIdx, presIdx, 'Claimed draw history is mathematically impossible given the deck composition', 'impossible_claim');
  brainEliminate(function(r){ return r[presIdx] === 0; });
  if(game.playerRecords[presIdx]) game.playerRecords[presIdx].claims.push('EXPOSED: impossible White-card claim (cycle total ' + seen + '/6).');
  sfx('alert');
}

function brainInvestigationReport(presIdx, target, declaredTeam){
  var presName = game.players[presIdx].name, targetName = game.players[target].name;
  var claimText = 'I investigated ' + targetName + '. They are a ' + (declaredTeam==='White' ? 'loyal White!' : 'Communist agent!');
  log(presName + ' investigated ' + targetName + '.');
  logSpeech(presName, 'Secretary', claimText);

  if(game.playerRecords[presIdx]) game.playerRecords[presIdx].investigationsDone.push({target:target, declared:declaredTeam});
  if(game.playerRecords[target]) game.playerRecords[target].investigationsReceived.push({by:presIdx, declared:declaredTeam});

  var html = '<div class="speech-card pres">'+
    '<div class="speech-name" style="color:var(--g)">👑 '+presName+' (Secretary) announces:</div>'+
    '<div class="speech-text">"'+claimText+'"</div>'+
    '</div>';

  if(declaredTeam === 'Communist'){
    addDispute(presIdx, target, 'Secretary publicly declared comrade to be a Communist', 'investigation_accuse');
    var isHumanTarget = (target === game.humanPlayerIndex);
    var outrageText = isHumanTarget ? 'OUTRAGEOUS! ' + presName + ' is lying! I am a loyal White!' : 'LIES! ' + presName + ' is lying to frame me!';
    html += '<div class="speech-card chanc outrage">'+
      '<div class="speech-name" style="color:var(--comm-red)">⚠️ '+targetName+' protests:</div>'+
      '<div class="speech-text">"'+outrageText+'"</div>'+
      '</div>'+
      '<div class="dispute-box"><div class="dispute-title">🚨 PUBLIC ACCUSATION & DISPUTE</div><div class="dispute-desc">Secretary ' + presName + ' accused ' + targetName + ' of being a Communist!</div></div>';
    logSpeech(targetName, 'Accused', outrageText, true);
    sfx('alert');
  } else {
    var clearText = 'Thank you, comrade Secretary, for confirming my standing with the Republic.';
    html += '<div class="speech-card chanc"><div class="speech-name" style="color:var(--whi-light)">'+targetName+' replies:</div><div class="speech-text">"'+clearText+'"</div></div>';
    logSpeech(targetName, 'Cleared', clearText, false);
  }

  transitionLock = false;
  var nextPresIdx = peekNextPresident(), nextPresName = game.players[nextPresIdx].name;
  html += '<button class="btn" onclick="finishPower(this)" style="margin-top:10px">Pass Secretaryship to ' + nextPresName + ' →</button>';
  document.getElementById('at').textContent = 'Investigation Debrief';
  document.getElementById('ad').textContent = 'Public report delivered to the comrades:';
  document.getElementById('ac').innerHTML = html;
}

function botSpecialElection(){
  var presIdx = game.currentPresident, alive = getAliveIndices();
  var candidates = alive.filter(function(i){ return i !== presIdx; });
  var st = brainState(), role = game.roles[presIdx], view = brainView(presIdx), best = null, bestU = -1e9;
  for(var c=0;c<candidates.length;c++){
    var t = candidates[c], U;
    if(role === 'white') U = -view.F[t] + 0.1 * brainRand();
    else {
      var teamBelief = brainTeamBelief(presIdx, t);
      if(teamBelief) U = -3;
      else U = view.F[t] < 0.4 ? 1.5 : 0.4;
    }
    U += 0.1 * brainRand();
    if(U > bestU){ bestU = U; best = t; }
  }
  var choice = best !== null ? best : candidates[Math.floor(Math.random()*candidates.length)];
  log(game.players[presIdx].name+' chose '+game.players[choice].name+' as next Secretary via Special Election!');
  if(game.preSpecialPresident === null) game.preSpecialPresident = game.currentPresident;
  game.currentPresident = choice;
  game.powerType = null;
  setTimeout(startRound, BOT_DELAY);
}

function botExecute(){
  var presIdx = game.currentPresident, alive = getAliveIndices(), candidates = [];
  for(var k=0;k<alive.length;k++) if(alive[k] !== presIdx) candidates.push(alive[k]);
  var st = brainState(), role = game.roles[presIdx], view = brainView(presIdx), params = brainParams(presIdx);
  var target, best = null, bestU = -1e9;
  if(role !== 'white'){
    var whites = candidates.filter(function(i){ return !brainTeamBelief(presIdx, i); });
    var pool = whites.length ? whites : candidates;
    for(var c=0;c<pool.length;c++){
      var t = pool[c], U = (1 - brainPubF(t)) + 0.2 * brainRand();
      if(U > bestU){ bestU = U; best = t; }
    }
  } else {
    for(var c2=0;c2<candidates.length;c2++){
      var t2 = candidates[c2];
      var U2 = 3.0 * view.S[t2] + 0.9 * (view.F[t2] - view.S[t2]) + params.boldness * 0.3 * brainRand() + 0.15 * brainRand();
      if(U2 > bestU){ bestU = U2; best = t2; }
    }
  }
  target = best !== null ? best : candidates[Math.floor(Math.random()*candidates.length)];

  game.players[target].isDead = true;
  log('💀 '+game.players[presIdx].name+' executed '+game.players[target].name+'!');
  brainObserveExecution(target);

  if(game.roles[target] === 'stalin'){
    setTimeout(function(){ endGame('white','Stalin was executed! Whites restore freedom!'); }, BOT_DELAY);
    return;
  }
  renderGameBoard();
  setTimeout(function(){ game.currentPresident = nextPresident(); startRound(); }, BOT_DELAY);
}

// ==================== GENUINE FULL-BRAIN HEADLESS BATCH SIMULATOR ====================
function runBatchSimulation(count){
  count = Math.max(1, Math.min(1000, count || 100));
  var n = game.playerCount;
  var whiteWins = 0, commWins = 0;
  var reasons = {
    'white_policies': 0,
    'stalin_executed': 0,
    'comm_policies': 0,
    'stalin_elected': 0
  };
  var totalRounds = 0;

  var savedGame = JSON.stringify(game);
  var savedBrain = BRAIN;

  for(var sim = 0; sim < count; sim++){
    var dist = getRoleDistribution(n);
    var rList = [];
    for(var i=0; i<dist.whites; i++) rList.push('white');
    for(var j=0; j<dist.communists; j++) rList.push('communist');
    rList.push('stalin');
    
    game.playerCount = n;
    game.roles = shuffle(rList);
    game.policyDeck = getPolicyDeck();
    game.discardPile = [];
    game.whitePolicies = 0;
    game.communistPolicies = 0;
    game.electionTracker = 0;
    game.currentPresident = Math.floor(Math.random() * n);
    game.lastGovernment = {president:null, chancellor:null};
    game.vetoUnlocked = false;
    game.gameOver = false;
    game.winner = null;
    game.confirmedNotStalin = {};
    game.mildSuspicionPresidents = {};
    game.deckCycle = { presDraws:[], claimedDemSeen:0 };
    game.botInvestigations = {};
    game.disputes = [];
    game.playerRecords = [];
    game.votingBlocs = {};
    game.unjustifiedVotes = {};
    game.humanPlayerIndex = -1;
    game.players = [];

    for(var p=0; p<n; p++){
      game.players.push({
        name: UNIQUE_BOT_ROSTER[p % UNIQUE_BOT_ROSTER.length].name,
        isHuman: false,
        isDead: false,
        personality: UNIQUE_BOT_ROSTER[p % UNIQUE_BOT_ROSTER.length]
      });
      game.playerRecords.push({ governments:[], votes:[], disputes:[], claims:[] });
      game.unjustifiedVotes[p] = { susYes:0, badNo:0, blocCount:0 };
    }

    brainInit();

    var simWinner = null, simReason = '';
    var rCount = 0;

    while(!simWinner && rCount < 50){
      rCount++;
      var alive = getAliveIndices();
      var presIdx = game.currentPresident;

      // 1. Genuine Bot Nomination
      var candidates = [];
      for(var k=0; k<alive.length; k++){
        var candIdx = alive[k];
        if(candIdx === presIdx) continue;
        if(candIdx === game.lastGovernment.chancellor) continue;
        if(alive.length > 5 && candIdx === game.lastGovernment.president) continue;
        candidates.push(candIdx);
      }
      if(candidates.length === 0){
        for(var k2=0; k2<alive.length; k2++) if(alive[k2] !== presIdx) candidates.push(alive[k2]);
      }

      var st = brainState(), params = brainParams(presIdx), view = brainView(presIdx), isF = brainIsF(presIdx);
      var scored = [];
      for(var c=0; c<candidates.length; c++){
        var cand = candidates[c];
        var preds = brainPredictVotes(presIdx, presIdx, cand, st);
        preds[presIdx] = 1;
        var dist = brainPassDist(preds, cand, st);
        var pass = brainPassProbFrom(dist, 1, alive.length);
        var U = !isF ? (pass * brainWYesValue(view, presIdx, cand, st, params) + (1-pass) * brainWNoValue(view, presIdx, st, params))
                     : (pass * brainFValues(view, presIdx, cand, st).vp + (1-pass) * brainFValues(view, presIdx, cand, st).vf);
        scored.push({idx:cand, U:U});
      }
      scored.sort(function(a,b){ return b.U - a.U; });
      var chancIdx = scored[0].idx;
      game.nominatedChancellor = chancIdx;

      // 2. Full Bot Voting with Brain State
      game.votes = {};
      var daCount = 0, netCount = 0;
      for(var v=0; v<alive.length; v++){
        var voter = alive[v];
        var vote = (voter === presIdx || voter === chancIdx) ? true : botDecideVote(voter);
        game.votes[voter] = vote;
        if(vote) daCount++; else netCount++;
      }
      brainObserveVotes(presIdx, chancIdx);

      // 3. Resolve Vote
      if(daCount > netCount){
        game.electionTracker = 0;
        game.currentChancellor = chancIdx;
        game.lastGovernment = {president:presIdx, chancellor:chancIdx};

        if(game.roles[chancIdx] === 'stalin' && game.communistPolicies >= 3){
          simWinner = 'communist'; simReason = 'stalin_elected'; break;
        }
        if(game.communistPolicies >= 3){
          game.confirmedNotStalin[chancIdx] = true;
          brainObserveCNS(chancIdx);
        }

        // Draw and Legislative Pass
        var drawn = drawPolicies(3);
        game.drawnPolicies = drawn.slice();
        game.drawnPoliciesOriginal = drawn.slice();
        
        botPresidentDiscard();
        var enacted = game.passedToChancellor[0]; // Chancellor enacts top or chooses
        var chancRole = game.roles[chancIdx];
        if(game.passedToChancellor.length === 2){
          var wi = game.passedToChancellor.indexOf('white');
          var ci = game.passedToChancellor.indexOf('communist');
          if(wi >= 0 && ci >= 0){
            enacted = (chancRole === 'white' || (chancRole === 'stalin' && game.communistPolicies < 5)) ? 'white' : 'communist';
          }
        }

        if(enacted === 'communist') game.communistPolicies++; else game.whitePolicies++;

        // Observation update
        var cPassed = game.passedToChancellor.filter(function(p){ return p==='communist'; }).length;
        var dPassed = game.passedToChancellor.filter(function(p){ return p==='white'; }).length;
        var _pc = brainPresClaim(presIdx, chancIdx, enacted, drawn, game.passedToChancellor);
        var _cc = brainChancClaim(chancIdx, presIdx, enacted, cPassed, dPassed, _pc.pf);
        brainObserveGovernment(presIdx, chancIdx, enacted, { cd:_pc.cd, pf:_pc.pf, pa:dPassed, t2:_cc.t2, truthA:dPassed });

        if(game.whitePolicies >= 5){ simWinner = 'white'; simReason = 'white_policies'; break; }
        if(game.communistPolicies >= 6){ simWinner = 'communist'; simReason = 'comm_policies'; break; }

        // Powers: Execution Check
        var track = getCommunistTrack(n);
        var pow = track[game.communistPolicies - 1];
        if(enacted === 'communist' && pow === 'execution'){
          var killPool = alive.filter(function(seat){ return seat !== presIdx; });
          var victim = killPool[Math.floor(Math.random() * killPool.length)];
          game.players[victim].isDead = true;
          brainObserveExecution(victim);
          if(game.roles[victim] === 'stalin'){ simWinner = 'white'; simReason = 'stalin_executed'; break; }
        }
      } else {
        game.electionTracker++;
        if(game.electionTracker >= 3){
          game.electionTracker = 0;
          var cPol = drawPolicies(1)[0];
          if(cPol === 'communist') game.communistPolicies++; else game.whitePolicies++;
          if(game.whitePolicies >= 5){ simWinner = 'white'; simReason = 'white_policies'; break; }
          if(game.communistPolicies >= 6){ simWinner = 'communist'; simReason = 'comm_policies'; break; }
        }
      }

      game.currentPresident = nextPresident();
    }

    if(!simWinner) simWinner = (game.whitePolicies > game.communistPolicies) ? 'white' : 'communist';
    totalRounds += rCount;
    if(simWinner === 'white') whiteWins++; else commWins++;
    if(reasons[simReason] !== undefined) reasons[simReason]++;
  }

  // Restore current live match state
  var restored = JSON.parse(savedGame);
  for(var k in restored) game[k] = restored[k];
  BRAIN = savedBrain;

  var wPct = ((whiteWins / count) * 100).toFixed(1);
  var cPct = ((commWins / count) * 100).toFixed(1);
  var avgRounds = (totalRounds / count).toFixed(1);

  var outHTML = 
    '<div class="dossier-section">'+
      '<div style="text-align:center;padding:12px;background:#11141d;border-radius:8px;border:1.5px solid var(--border);margin-bottom:12px">'+
        '<div style="font-size:1.8rem;font-weight:900;letter-spacing:1px;color:#fff">'+wPct+'% ★ vs '+cPct+'% ☭</div>'+
        '<div style="font-size:.78rem;color:var(--td);text-transform:uppercase;margin-top:2px">Headless Bayesian Simulations: '+count+' ('+n+' Players)</div>'+
      '</div>'+
      '<div class="dossier-section-title">Win Conditions Breakdown</div>'+
      '<div class="dossier-item" style="display:flex;justify-content:space-between"><span>★ 5 White Policies Enacted:</span><b>'+reasons.white_policies+' ('+((reasons.white_policies/count)*100).toFixed(1)+'%)</b></div>'+
      '<div class="dossier-item" style="display:flex;justify-content:space-between"><span>★ Stalin Executed:</span><b>'+reasons.stalin_executed+' ('+((reasons.stalin_executed/count)*100).toFixed(1)+'%)</b></div>'+
      '<div class="dossier-item" style="display:flex;justify-content:space-between"><span>☭ 6 Communist Policies Enacted:</span><b>'+reasons.comm_policies+' ('+((reasons.comm_policies/count)*100).toFixed(1)+'%)</b></div>'+
      '<div class="dossier-item" style="display:flex;justify-content:space-between"><span>☭ Stalin Elected Premier (Stalin Zone):</span><b>'+reasons.stalin_elected+' ('+((reasons.stalin_elected/count)*100).toFixed(1)+'%)</b></div>'+
      '<div class="dossier-item" style="display:flex;justify-content:space-between"><span>Average Game Duration:</span><b>'+avgRounds+' Rounds</b></div>'+
    '</div>';

  document.getElementById('sim-body').innerHTML = outHTML;
  document.getElementById('sim-modal').classList.add('active');
}

// =====================================================================
// ==================== BOT PATCHES v1 (appended) ======================
// Later declarations override the earlier ones above.
// =====================================================================
var SIM_MODE = false;

// --- Silence UI/log/audio while the headless simulator runs ---
['log','logSpeech','sfx','renderDeckInfo','renderGameBoard','updateLogDisplay','renderTracks'].forEach(function(n){
  var o = window[n];
  window[n] = function(){ if(SIM_MODE) return; return o.apply(this, arguments); };
});

// --- Skill/personality params: wire in `lie`, add bandwagon + Pragmatist ---
var __bp = window.brainParams;
window.brainParams = function(idx){
  var o = __bp(idx), pl = game.players[idx], pers = pl && pl.personality, t = (pers && pers.type) || '';
  var base = BRAIN_SKILL[(pers && pers.skill) || 'Intermediate'] || BRAIN_SKILL.Intermediate;
  o.lie = base.lie; o.bandwagon = 0;
  if(t === 'Loyalist') o.bandwagon = 0.5;
  else if(t === 'Diplomat') o.bandwagon = 0.35;
  else if(t === 'Pragmatist'){ o.gamma = Math.min(1, o.gamma + 0.04); o.zoneCaution = 0.12; }
  return o;
};

// --- Belief update: never wipe a bot's memory on underflow (keep old beliefs) ---
function brainMul(w, Lh, g, owner){
  var H = w.length, t = new Float64Array(H), s = 0, h, v;
  for(h=0; h<H; h++){
    v = w[h];
    if(v > 0){ v *= (g === 1 ? Lh[h] : Math.pow(Lh[h], g)); t[h] = v; s += v; }
  }
  if(!(s > 1e-250)) return;
  var inv = 1/s;
  for(h=0; h<H; h++) w[h] = t[h] * inv;
}

// --- Leaked global `b` fix ---
function brainInvVec(presIdx, target, claimF){
  var tab = [[0,0,0],[0,0,0],[0,0,0]];
  for(var a=0;a<3;a++) for(var b=0;b<3;b++) tab[a][b] = brainInvLik(a,b,claimF);
  return brainTabToVec(tab, presIdx, target);
}

// --- Voting with bandwagon (Loyalist/Diplomat follow visible vote momentum) ---
function botDecideVote(botIdx){
  var P = game.currentPresident, C = game.nominatedChancellor;
  if(botIdx === P || botIdx === C) return true;
  if(!BRAIN) return true;
  var st = brainState(), params = brainParams(botIdx);
  var delta = (roundPersuasionModifier.active && roundPersuasionModifier.botModifiers[botIdx]) ? roundPersuasionModifier.botModifiers[botIdx] : 0;
  if(params.bandwagon){
    var y = 0, nn = 0;
    for(var k in game.votes){
      var kk = +k; if(kk === botIdx || kk === P || kk === C) continue;
      if(game.votes[k] === true) y++; else if(game.votes[k] === false) nn++;
    }
    if(y + nn > 0) delta += params.bandwagon * 3 * (y - nn) / (y + nn);
  }
  var diff = brainVoteDiff(botIdx, P, C, st, params, delta);
  var vote = (diff + params.noise * brainRand() * 0.6) > 0;
  if(Math.random() < params.lapse) vote = !vote;
  return vote;
}

// --- Deception now scales with the skill `lie` value ---
function brainShouldFrame(presIdx, chancIdx){
  var params = brainParams(presIdx);
  if(game.roles[presIdx] === 'stalin') return false;
  var pubP = brainPubF(presIdx), pubC = brainPubF(chancIdx);
  var p = BRAIN_FRAME * (pubC > pubP ? 1.6 : 0.5) + params.boldness * 0.3;
  return Math.random() < brainClamp(p, 0, 0.5) * (params.lie === undefined ? 1 : params.lie);
}

function brainChancClaim(chancIdx, presIdx, enacted, cPassed, dPassed, presClaimedPf){
  var presName = game.players[presIdx].name;
  var truth2 = (cPassed === 2), t2 = truth2;
  var myRole = game.roles[chancIdx], presRole = game.roles[presIdx], q;
  var lie = brainParams(chancIdx).lie;
  if(myRole === 'communist' && enacted === 'communist' && dPassed === 1 && Math.random() < (lie === undefined ? 1 : lie)) t2 = true;
  if(t2){
    if(!truth2){
      q = isCommunist(presRole)
        ? 'Yes, Secretary ' + presName + ' passed me two Communist cards as stated.'
        : 'Secretary ' + presName + ' passed me two Communist cards! Don\'t let them lie to frame me!';
    } else if(presClaimedPf){
      q = 'WHAT?! That is an absolute lie! You gave me TWO Communist cards! You\'re trying to frame me!';
    } else {
      q = (myRole === 'white') ? 'Can confirm. I was handed two Communist policies, had no choice.'
        : 'Secretary ' + presName + ' handed me two Communist cards. My hands were tied.';
    }
  } else if(dPassed === 2){
    q = 'Secretary passed me two White cards. Clean decision for the Republic.';
  } else if(myRole === 'stalin'){
    q = 'I was given a choice and enacted White for the people.';
  } else {
    q = 'I was given a choice (1 Whi, 1 Comm) and gladly enacted the White policy.';
  }
  return {t2:t2, quote:q};
}

// --- Deck audit: correct per-cycle white ceiling + proportional suspicion ---
function cycleWhiteCeiling(){
  var s = (game.deckCycle && game.deckCycle.startWhite) || 0;
  return Math.max(0, 6 - s);
}

function handleDeckReshuffle(){
  var draws = (game.deckCycle && game.deckCycle.presDraws) || [];
  var actual = 0, claimed = 0;
  draws.forEach(function(d){ actual += d.actualDem; claimed += d.claimedDem; });
  var au = reshuffleAudit(), disc = au.missing;

  if(disc > 0){
    var sus = [];
    draws.forEach(function(d){ if(d.claimedDem === 0 && sus.indexOf(d.pres) < 0) sus.push(d.pres); });
    if(sus.length){
      var w = Math.min(1, disc / sus.length) * au.lie;
      // v16: pulling 3 reds is normal (24% of draws). Several people claimed it, so it is only a mild
      // data point. It becomes real suspicion only when the audit PROVES a lie and exactly one person fits.
      var sure1 = (au.lie >= 0.99), one1 = (sus.length === 1), soft = (typeof V16 !== 'undefined' && V16.soft3R);
      var kk = !soft ? 0.6 : (one1 ? (sure1 ? V16.auditOne : 0.3) : (sure1 ? V16.auditMany : 0.06));
      if(BRAIN){
        var Lh = new Float64Array(BRAIN.H);
        for(var h=0; h<BRAIN.H; h++){
          var m = 1;
          for(var s=0; s<sus.length; s++) if(BRAIN.hRole[h][sus[s]] !== 0) m *= (1 + kk * w);
          Lh[h] = m;
        }
        brainApplyVec(Lh, false);
      }
      sus.forEach(function(pIdx){
        if(w >= 0.5 && (!soft || (one1 && sure1))) game.mildSuspicionPresidents[pIdx] = (game.mildSuspicionPresidents[pIdx] || 0) + 1;
        if(game.playerRecords[pIdx]) game.playerRecords[pIdx].claims.push('Discrepancy: Claimed 3 Communists during deck cycle with ' + disc + ' missing White card(s).');
      });
      var names = sus.map(function(i){ return game.players[i].name; }).join(', ');
      logSpeech('Audit Committee', 'Deck Reshuffle Audit', 'Reshuffle Discrepancy: ' + disc + ' White card(s) unaccounted for. ' + (au.lie >= 1 ? 'Only ' + au.b + ' card(s) were left at the bottom, so someone lied.' : 'They could be the ' + au.b + ' unseen bottom card(s) (' + (au.pBottom * 100).toFixed(2) + '% chance), so nobody necessarily lied.') + ' Possible culprits (claimed 3 Communists): ' + names, true);
      log('🎴 Deck Reshuffled: ' + disc + ' unaccounted White card(s). Possible culprits: ' + names);
      sfx('alert');
    } else {
      log('🎴 Deck Reshuffled: ' + disc + ' unaccounted White card(s), but no clear culprit.');
    }
  } else {
    log('🎴 Deck Reshuffled: All claimed White policies accounted for cleanly.');
  }

  game.policyDeck = shuffle(game.policyDeck.concat(game.discardPile));
  game.discardPile = [];
  game.deckCycle = { presDraws: [], claimedDemSeen: 0, startWhite: game.whitePolicies, startComm: game.communistPolicies, chaosWhite: 0 };
  renderDeckInfo();
}

// Soft, one-time-per-cycle evidence instead of hard-eliminating the last speaker
function brainCheckClaimPlausibility(presIdx){
  var dc = game.deckCycle; if(!dc) return;
  var cap = cycleWhiteCeiling(), seen = dc.claimedDemSeen || 0;
  if(seen <= cap || dc.overFlagged) return;
  dc.overFlagged = true;
  var claimers = [];
  dc.presDraws.forEach(function(d){ if(d.claimedDem > 0 && claimers.indexOf(d.pres) < 0) claimers.push(d.pres); });
  log('🧮 CARD COUNT IMPOSSIBLE: claimed White draws this cycle (' + seen + ') exceed the ' + cap + ' that could exist. Someone lied!');
  logSpeech('Audit Committee', 'Card Count', 'Claims total ' + seen + ' White cards but only ' + cap + ' were possible this cycle. At least one claimer is lying.', true);
  if(BRAIN && claimers.length){
    var Lh = new Float64Array(BRAIN.H);
    for(var h=0; h<BRAIN.H; h++){
      var m = 1;
      for(var c=0; c<claimers.length; c++) if(BRAIN.hRole[h][claimers[c]] !== 0) m *= 2.0;
      Lh[h] = m;
    }
    brainApplyVec(Lh, false);
  }
  claimers.forEach(function(i){
    if(game.playerRecords[i]) game.playerRecords[i].claims.push('Part of an impossible White-card claim total (' + seen + '/' + cap + ').');
  });
  sfx('alert');
}

var __rt = window.renderTracks;
window.renderTracks = function(){
  __rt();
  var cap = cycleWhiteCeiling(), seen = (game.deckCycle && game.deckCycle.claimedDemSeen) || 0;
  var repEl = document.getElementById('audit-reported'), remEl = document.getElementById('audit-remaining');
  if(repEl) repEl.textContent = seen + '/' + cap + ' Whites Reported Seen';
  if(remEl) remEl.textContent = Math.max(0, cap - seen) + ' Expected Left (Deck: ' + game.policyDeck.length + ')';
};

// --- Persuasion menu: no more real-deck leak, fluff arguments are unsound ---
var __gdp = window.generateDynamicPersuasionOptions;
window.generateDynamicPersuasionOptions = function(){
  var fluff = {fb_unconvinced:1, fb_trust_gap:1, fb_rotation:1, fb_gut:1, fb_progress:1, fb_clean_ticket:1, solidarity_test:1};
  var opts = __gdp().filter(function(o){ return o.id !== 'deck_favorable' && o.id !== 'deck_hostile'; });
  opts.forEach(function(o){ if(fluff[o.id]) o.evalLogic = function(){ return false; }; });
  return opts;
};

// --- Shared, pure decision helpers (used by BOTH live game and simulator) ---
function pickNominationCore(presIdx){
  var alive = getAliveIndices(), candidates = [];
  for(var k=0;k<alive.length;k++){
    var i = alive[k];
    if(i === presIdx) continue;
    if(i === game.lastGovernment.chancellor) continue;
    if(alive.length > 5 && i === game.lastGovernment.president) continue;
    if(BOT_RULES.consistency && botPubliclyAccused(presIdx, i)) continue;   // never nominate someone you publicly called Communist
    candidates.push(i);
  }
  if(candidates.length === 0){ for(var k2=0;k2<alive.length;k2++) if(alive[k2] !== presIdx) candidates.push(alive[k2]); }
  var st = brainState(), params = brainParams(presIdx), view = brainView(presIdx), isF = brainIsF(presIdx);
  var scored = [];
  for(var c=0;c<candidates.length;c++){
    var cand = candidates[c];
    var preds = brainPredictVotes(presIdx, presIdx, cand, st);
    preds[presIdx] = 1;
    var dist = brainPassDist(preds, cand, st);
    var pass = brainPassProbFrom(dist, 1, st.alive.length);
    var U;
    if(!isF){
      U = pass * brainWYesValue(view, presIdx, cand, st, params) + (1 - pass) * brainWNoValue(view, presIdx, st, params);
    } else {
      var fv = brainFValues(view, presIdx, cand, st), vf = fv.vf;
      var teamBelief = brainTeamBelief(presIdx, cand);
      if(st.zone && teamBelief === 'stalin') vf -= 6;
      else if(st.zone && view.S[cand] > 0.2) vf -= 6 * view.S[cand];
      U = pass * fv.vp + (1 - pass) * vf;
      if(teamBelief === 'communist') U -= 0.55 * Math.max(0, brainPubF(cand) - 0.3);
    }
    U += involvementBonus(presIdx, cand);
    scored.push({idx:cand, U:U});
  }
  var temp = 0.05 + 0.5 * params.noise, mx = -1e9, s;
  for(s=0;s<scored.length;s++) if(scored[s].U > mx) mx = scored[s].U;
  var wsum = 0;
  for(s=0;s<scored.length;s++){ scored[s].w = Math.exp((scored[s].U - mx) / temp); wsum += scored[s].w; }
  var pick = Math.random() * wsum, choice = scored[scored.length-1].idx;
  for(s=0;s<scored.length;s++){ pick -= scored[s].w; if(pick <= 0){ choice = scored[s].idx; break; } }
  return choice;
}

function pickPresidentDiscardIdx(presIdx, chancIdx, policies){
  var myRole = game.roles[presIdx], st = brainState(), params = brainParams(presIdx);
  var dCount = policies.filter(function(p){ return p === 'white'; }).length;
  var wantRed = (myRole === 'communist') || (myRole === 'stalin' && st.r >= 5);
  if(!wantRed){ var ci = policies.indexOf('communist'); return ci >= 0 ? ci : 0; }
  var wi = policies.indexOf('white');
  if(wi < 0) return 0;
  if(dCount === 1) return (Math.random() < brainPassRedProb(presIdx, chancIdx, st, params)) ? wi : policies.indexOf('communist');
  return wi;
}

function pickChancellorEnactIdx(chancIdx, presIdx, policies){
  var myRole = game.roles[chancIdx], st = brainState(), params = brainParams(chancIdx);
  var wi = policies.indexOf('white'), ci = policies.indexOf('communist');
  if(wi < 0 || ci < 0) return 0;
  if(myRole === 'white') return wi;
  if(myRole === 'stalin') return (st.r >= 5) ? ci : wi;
  return (Math.random() < brainCommChancRedProb(chancIdx, presIdx, st, params)) ? ci : wi;
}

function pickExecutionTarget(presIdx){
  var alive = getAliveIndices(), candidates = alive.filter(function(i){ return i !== presIdx; });
  var role = game.roles[presIdx], view = brainView(presIdx), params = brainParams(presIdx);
  var best = null, bestU = -1e9, t, U;
  if(role !== 'white'){
    var whites = candidates.filter(function(i){ return !brainTeamBelief(presIdx, i); });
    var pool = whites.length ? whites : candidates;
    for(var c=0;c<pool.length;c++){ t = pool[c]; U = (1 - brainPubF(t)) + 0.2 * brainRand(); if(U > bestU){ bestU = U; best = t; } }
  } else {
    for(var c2=0;c2<candidates.length;c2++){
      t = candidates[c2];
      U = 3.0 * view.S[t] + 0.9 * (view.F[t] - view.S[t]) + params.boldness * 0.3 * brainRand() + 0.15 * brainRand();
      if(U > bestU){ bestU = U; best = t; }
    }
  }
  return best !== null ? best : candidates[Math.floor(Math.random()*candidates.length)];
}

// Communists in the Stalin Zone now actually WANT a teammate in the chair
function pickSpecialTarget(presIdx){
  var alive = getAliveIndices(), candidates = alive.filter(function(i){ return i !== presIdx && !hasDispute(presIdx, i); });
  if(!candidates.length) candidates = alive.filter(function(i){ return i !== presIdx; });
  var st = brainState(), role = game.roles[presIdx], view = brainView(presIdx), best = null, bestU = -1e9;
  for(var c=0;c<candidates.length;c++){
    var t = candidates[c], U;
    if(role === 'white') U = -view.F[t];
    else {
      var tb = brainTeamBelief(presIdx, t);
      if(tb === 'communist') U = st.zone ? 2.5 : -1.5;
      else if(tb === 'stalin') U = st.zone ? 0.5 : -1.5;
      else U = view.F[t] < 0.4 ? 1.5 : 0.4;
    }
    U += 0.2 * brainRand();
    if(U > bestU){ bestU = U; best = t; }
  }
  return best !== null ? best : candidates[Math.floor(Math.random()*candidates.length)];
}

// --- Live bot actions rewritten on top of the pure helpers ---
function botNominate(){
  if(game.phase!=='nomination'||game.nominatedChancellor!==null)return;
  if(isBotGame()&&game.currentPresident===game.humanPlayerIndex)return;
  var presIdx = game.currentPresident, choice = pickNomination(presIdx);
  game.nominatedChancellor = choice;
  log(game.players[presIdx].name + ' nominated ' + game.players[choice].name + ' as Premier.');
  renderGameBoard();
  setTimeout(startVoting, BOT_DELAY);
}

function botPresidentDiscard(){
  var presIdx = game.currentPresident, chancIdx = game.currentChancellor;
  var idx = pickPresidentDiscardIdx(presIdx, chancIdx, game.drawnPolicies);
  game.discardPile.push(game.drawnPolicies.splice(idx, 1)[0]);
  game.passedToChancellor = game.drawnPolicies.slice();
  log(game.players[presIdx].name + ' discarded a policy and passed 2 to Premier.');
  renderGameBoard();
  setTimeout(startChancellorSession, BOT_DELAY);
}

function botChancellorDiscard(){
  var chancIdx = game.currentChancellor, presIdx = game.currentPresident, policies = game.drawnPolicies;
  if(game.vetoUnlocked && !game.vetoRefused && botWantsVeto(game.roles[chancIdx], policies)){ proposeVeto(); return; }
  var enactIdx = pickChancellorEnactIdx(chancIdx, presIdx, policies);
  game.discardPile.push(game.drawnPolicies.splice(enactIdx === 0 ? 1 : 0, 1)[0]);
  var enacted = game.drawnPolicies[0];
  game.drawnPolicies = [];
  enactPolicy(enacted);
}

function botSpecialElection(){
  var presIdx = game.currentPresident, choice = pickSpecialTarget(presIdx);
  log(game.players[presIdx].name + ' chose ' + game.players[choice].name + ' as next Secretary via Special Election!');
  if(game.preSpecialPresident === null) game.preSpecialPresident = game.currentPresident;
  game.currentPresident = choice;
  game.powerType = null;
  setTimeout(startRound, BOT_DELAY);
}

function botExecute(){
  var presIdx = game.currentPresident, target = pickExecutionTarget(presIdx);
  game.players[target].isDead = true;
  log('💀 ' + game.players[presIdx].name + ' executed ' + game.players[target].name + '!');
  brainObserveExecution(target);
  if(game.roles[target] === 'stalin'){
    setTimeout(function(){ endGame('white','Stalin was executed! Whites restore freedom!'); }, BOT_DELAY);
    return;
  }
  renderGameBoard();
  setTimeout(function(){ game.currentPresident = nextPresident(); startRound(); }, BOT_DELAY);
}

// --- Spectator dashboard: only redraw on change, keep the sim input value ---
var __usd = window.updateSpectatorDashboard, __dashKey = '';
window.updateSpectatorDashboard = function(){
  if(game.mode !== 'watch' || SIM_MODE) return;
  var dead = 0; game.players.forEach(function(p){ if(p.isDead) dead++; });
  var key = [BRAIN ? BRAIN.ver : 0, game.communistPolicies, game.whitePolicies, game.electionTracker, dead, game.currentPresident, game.phase, game.gameOver].join('|');
  if(key === __dashKey && document.getElementById('sim-count-input')) return;
  __dashKey = key;
  var inp = document.getElementById('sim-count-input'), val = inp ? inp.value : null;
  __usd();
  var ni = document.getElementById('sim-count-input');
  if(ni && val) ni.value = val;
};

var __eg = window.endGame;
window.endGame = function(w, r){
  __eg(w, r);
  if(window.sneakySpectatorTimer){ clearInterval(window.sneakySpectatorTimer); window.sneakySpectatorTimer = null; }
};

// Bot pace is fixed; no speed selector is displayed.

// =====================================================================
// ============ FAITHFUL HEADLESS SIMULATOR (replaces old one) =========
// Uses the same pick* helpers, claims, audits, veto, powers and
// difficulty settings as the live game, with all UI/audio silenced.
// =====================================================================
function simSetup(n){
  game._v29BluffCounts = {};
  var dist = getRoleDistribution(n), r = [], i;
  for(i=0;i<dist.whites;i++) r.push('white');
  for(i=0;i<dist.communists;i++) r.push('communist');
  r.push('stalin');
  game.playerCount = n; game.roles = shuffle(r);
  game.policyDeck = getPolicyDeck(); game.discardPile = [];
  game.whitePolicies = 0; game.communistPolicies = 0; game.electionTracker = 0;
  game.currentPresident = Math.floor(Math.random() * n);
  game.currentChancellor = null; game.nominatedChancellor = null;
  game.lastGovernment = {president:null, chancellor:null};
  game.vetoUnlocked = false; game.vetoRefused = false; game.gameOver = false; game.winner = null;
  game.confirmedNotStalin = {}; game.mildSuspicionPresidents = {};
  game.deckCycle = {presDraws:[], claimedDemSeen:0, startWhite:0};
  game.botInvestigations = {}; game.humanInvestigations = {}; game.playerKnownRoles = {};
  game.disputes = []; game.playerRecords = []; game.votingBlocs = {}; game.unjustifiedVotes = {};
  game.policyHistory = []; game.votes = {}; game.messages = [];
  game.drawnPolicies = []; game.drawnPoliciesOriginal = []; game.passedToChancellor = [];
  game.userSuspects = []; game.userTrusted = []; game.preSpecialPresident = null;
  game.humanPlayerIndex = -1; game.players = [];
  var pool = shuffle(UNIQUE_BOT_ROSTER);
  for(var p=0; p<n; p++){
    var pers = JSON.parse(JSON.stringify(pool[p % pool.length]));
    if(game.botDifficulty === 'beginner') pers.skill = (Math.random() < 0.6) ? 'Beginner' : 'Intermediate';
    else if(game.botDifficulty === 'advanced') pers.skill = 'Master';
    game.players.push({name:pers.name, isHuman:false, isDead:false, personality:pers});
    game.playerRecords.push({governments:[], votes:[], disputes:[], claims:[], investigationsDone:[], investigationsReceived:[]});
    game.unjustifiedVotes[p] = {susYes:0, badNo:0, blocCount:0};
  }
  brainInit();
}

function simWin(){
  if(game.communistPolicies >= 5) game.vetoUnlocked = true;
  if(game.whitePolicies >= 5) return ['white', 'white_policies'];
  if(game.communistPolicies >= 6) return ['communist', 'comm_policies'];
  return null;
}
function simEnact(pol){ if(pol === 'communist') game.communistPolicies++; else game.whitePolicies++; }
function simChaos(){
  var pol = drawPolicies(1)[0];
  game.lastGovernment = {president:null, chancellor:null};
  game.electionTracker = 0;
  simEnact(pol);
  return simWin();
}

function simInvestigate(P){
  var alive = getAliveIndices(), cands = [];
  var done = game.botInvestigations[P] || {};
  alive.forEach(function(i){ if(i !== P && i !== game.currentChancellor && !done[i]) cands.push(i); });
  if(!cands.length) alive.forEach(function(i){ if(i !== P && !done[i]) cands.push(i); });
  if(!cands.length) return;
  var ps = game.preSpecialPresident;
  var pick = brainPickInvestigation(P, cands);
  game.preSpecialPresident = ps;
  var team = (game.roles[pick.target] === 'white') ? 'white' : 'communist';
  if(!game.botInvestigations[P]) game.botInvestigations[P] = {};
  game.botInvestigations[P][pick.target] = team;
  brainPrivateInvestigate(P, pick.target, team);
  brainObserveInvestigation(P, pick.target, pick.declared);
}

function simPlayOne(){
  var rounds = 0, res = null;
  while(!res && rounds < 300){
    rounds++;
    var alive = getAliveIndices(), P = game.currentPresident;
    var C = pickNomination(P);
    game.nominatedChancellor = C;
    game.votes = {};
    var da = 0, ne = 0;
    for(var v=0; v<alive.length; v++){
      var vote = botDecideVote(alive[v]);
      game.votes[alive[v]] = vote;
      if(vote) da++; else ne++;
    }
    brainObserveVotes(P, C);

    if(da > ne){
      game.electionTracker = 0; game.currentChancellor = C;
      game.lastGovernment = {president:P, chancellor:C};
      if(game.roles[C] === 'stalin' && game.communistPolicies >= 3){ res = ['communist','stalin_elected']; break; }
      if(game.communistPolicies >= 3){ game.confirmedNotStalin[C] = true; brainObserveCNS(C); }

      var drawn = drawPolicies(3);
      game.drawnPolicies = drawn.slice(); game.drawnPoliciesOriginal = drawn.slice();
      game.discardPile.push(game.drawnPolicies.splice(pickPresidentDiscardIdx(P, C, game.drawnPolicies), 1)[0]);
      game.passedToChancellor = game.drawnPolicies.slice();
      game.vetoRefused = false;

      if(game.vetoUnlocked && botWantsVeto(game.roles[C], game.drawnPolicies)){
        if(botPresidentConsents()){
          game.discardPile = game.discardPile.concat(game.drawnPolicies);
          game.drawnPolicies = []; game.electionTracker++; game.currentChancellor = null;
          if(game.electionTracker >= 3){ res = simChaos(); if(res) break; }
          game.currentPresident = nextPresident();
          continue;
        }
        game.vetoRefused = true;
      }

      var ei = pickChancellorEnactIdx(C, P, game.drawnPolicies);
      var enacted = game.drawnPolicies[ei];
      if(game.drawnPolicies.length > 1) game.discardPile.push(game.drawnPolicies[ei === 0 ? 1 : 0]);
      game.drawnPolicies = [];
      game.policyHistory.push({president:P, chancellor:C, policy:enacted, round:game.whitePolicies + game.communistPolicies + 1});
      simEnact(enacted);
      res = simWin(); if(res) break;

      var orig = game.drawnPoliciesOriginal, passed = game.passedToChancellor;
      var dD = orig.filter(function(p){ return p === 'white'; }).length;
      var dP = passed.filter(function(p){ return p === 'white'; }).length;
      var cP = passed.length - dP;
      var pc = brainPresClaim(P, C, enacted, orig, passed);
      var cc = brainChancClaim(C, P, enacted, cP, dP, pc.pf);
      game.deckCycle.presDraws.push({pres:P, round:game.whitePolicies + game.communistPolicies, claimedDem:pc.cd, actualDem:dD});
      game.deckCycle.claimedDemSeen += pc.cd;
      brainCheckClaimPlausibility(P);
      brainObserveGovernment(P, C, enacted, {cd:pc.cd, pf:pc.pf, pa:(pc.pa === undefined ? (pc.pf ? 1 : 0) : pc.pa), t2:cc.t2, truthA:dP});

      var power = (enacted === 'communist') ? getCommunistTrack(game.playerCount)[game.communistPolicies - 1] : null;
      if(power === 'investigate') simInvestigate(P);
      else if(power === 'special'){
        var t = pickSpecialTarget(P);
        if(game.preSpecialPresident === null) game.preSpecialPresident = P;
        game.currentPresident = t;
        continue;
      } else if(power === 'execution'){
        var vic = pickExecutionTarget(P);
        game.players[vic].isDead = true;
        brainObserveExecution(vic);
        if(game.roles[vic] === 'stalin'){ res = ['white','stalin_executed']; break; }
      }
      game.currentPresident = nextPresident();
    } else {
      game.electionTracker++;
      game.currentChancellor = null; game.nominatedChancellor = null;
      if(game.electionTracker >= 3){ res = simChaos(); if(res) break; }
      game.currentPresident = nextPresident();
    }
  }
  if(!res) res = [(game.whitePolicies > game.communistPolicies) ? 'white' : 'communist', 'timeout'];
  return {winner:res[0], reason:res[1], rounds:rounds};
}

function runBatchSimulation(count){
  count = Math.max(1, Math.min(1000, count || 100));
  var n = game.playerCount;
  var saved = JSON.stringify(game), savedBrain = BRAIN, savedRPM = roundPersuasionModifier, savedTL = transitionLock;
  var whiteWins = 0, commWins = 0, totalRounds = 0, timeouts = 0;
  var reasons = {white_policies:0, stalin_executed:0, comm_policies:0, stalin_elected:0};
  SIM_MODE = true;
  roundPersuasionModifier = {active:false, speakerName:'', text:'', stance:'ja', botModifiers:{}};
  try {
    game.mode = 'watch';
    for(var sim=0; sim<count; sim++){
      simSetup(n);
      var r = simPlayOne();
      totalRounds += r.rounds;
      if(r.winner === 'white') whiteWins++; else commWins++;
      if(reasons[r.reason] !== undefined) reasons[r.reason]++; else timeouts++;
    }
  } finally {
    SIM_MODE = false;
    var restored = JSON.parse(saved);
    for(var k in restored) game[k] = restored[k];
    BRAIN = savedBrain; roundPersuasionModifier = savedRPM; transitionLock = savedTL;
    __dashKey = '';
  }

  var pct = function(x){ return ((x / count) * 100).toFixed(1); };
  var row = function(label, val){ return '<div class="dossier-item" style="display:flex;justify-content:space-between"><span>' + label + '</span><b>' + val + '</b></div>'; };
  var diffLabel = {random:'Mixed', beginner:'Beginner', advanced:'Game Theory'}[game.botDifficulty] || game.botDifficulty;
  var outHTML =
    '<div class="dossier-section">' +
      '<div style="text-align:center;padding:12px;background:#11141d;border-radius:8px;border:1.5px solid var(--border);margin-bottom:12px">' +
        '<div style="font-size:1.8rem;font-weight:900;letter-spacing:1px;color:#fff">' + pct(whiteWins) + '% ★ vs ' + pct(commWins) + '% ☭</div>' +
        '<div style="font-size:.78rem;color:var(--td);text-transform:uppercase;margin-top:2px">Full-fidelity simulations: ' + count + ' (' + n + ' players, ' + diffLabel + ')</div>' +
      '</div>' +
      '<div class="dossier-section-title">Win Conditions Breakdown</div>' +
      row('★ 5 White Policies Enacted:', reasons.white_policies + ' (' + pct(reasons.white_policies) + '%)') +
      row('★ Stalin Executed:', reasons.stalin_executed + ' (' + pct(reasons.stalin_executed) + '%)') +
      row('☭ 6 Communist Policies Enacted:', reasons.comm_policies + ' (' + pct(reasons.comm_policies) + '%)') +
      row('☭ Stalin Elected Premier (Stalin Zone):', reasons.stalin_elected + ' (' + pct(reasons.stalin_elected) + '%)') +
      (timeouts ? row('Timeouts (decided by policy lead):', timeouts) : '') +
      row('Average Game Duration:', (totalRounds / count).toFixed(1) + ' Rounds') +
    '</div>';
  document.getElementById('sim-body').innerHTML = outHTML;
  document.getElementById('sim-modal').classList.add('active');
}


// =====================================================================
// ==================== BOT PATCHES v2 (appended) ======================
// Vote consistency + early-game white/Stalin voting discipline.
// =====================================================================
var BOT_RULES = {earlyYes:true, consistency:true};

function botPubliclyAccused(botIdx, targetIdx){
  var rec = game.playerRecords[botIdx];
  return !!(rec && rec.investigationsDone && rec.investigationsDone.some(function(iv){
    return iv.target === targetIdx && iv.declared === 'Communist';
  }));
}

// Concrete reason to distrust a government (not just noise or a hunch)
function govHasEvidence(botIdx, P, C){
  if(isInAnyConflict(P) || isInAnyConflict(C)) return true;
  if(game.mildSuspicionPresidents[P] || game.mildSuspicionPresidents[C]) return true;
  var priv = game.botInvestigations[botIdx];
  if(priv && (priv[P] === 'communist' || priv[C] === 'communist')) return true;
  if(BRAIN){
    var v = brainView(botIdx);
    if(v.F[P] >= 0.9 || v.F[C] >= 0.9) return true;
  }
  return false;
}

function botDecideVoteCore(botIdx){
  var P = game.currentPresident, C = game.nominatedChancellor;
  if(botIdx === P || botIdx === C) return true;
  if(!BRAIN) return true;
  var st = brainState(), params = brainParams(botIdx), role = game.roles[botIdx];
  var delta = (roundPersuasionModifier.active && roundPersuasionModifier.botModifiers[botIdx]) ? roundPersuasionModifier.botModifiers[botIdx] : 0;

  // 1) Never vote YES on someone you publicly called a Communist (lie or not).
  if(BOT_RULES.consistency && (botPubliclyAccused(botIdx, P) || botPubliclyAccused(botIdx, C))) return false;

  // 2) Early game: loyal Whites (and Stalin, blending in) approve any government
  //    with no dispute or concrete evidence against it. Only a strong human
  //    argument for NEIN can override this.
  if(BOT_RULES.earlyYes && !st.zone && (role === 'white' || role === 'stalin') && delta > -1 && !govHasEvidence(botIdx, P, C)) return true;

  if(params.bandwagon){
    var y = 0, nn = 0;
    for(var k in game.votes){
      var kk = +k; if(kk === botIdx || kk === P || kk === C) continue;
      if(game.votes[k] === true) y++; else if(game.votes[k] === false) nn++;
    }
    if(y + nn > 0) delta += params.bandwagon * 3 * (y - nn) / (y + nn);
  }
  var diff = brainVoteDiff(botIdx, P, C, st, params, delta);
  var vote = (diff + params.noise * brainRand() * 0.6) > 0;
  if(Math.random() < params.lapse) vote = !vote;
  return vote;
}

// Never nominate someone you publicly called a Communist
function pickNomination(presIdx){
  var choice, tries = 0;
  do { choice = pickNominationCore(presIdx); tries++; } while(BOT_RULES.consistency && botPubliclyAccused(presIdx, choice) && tries < 30);
  return choice;
}

// Human accusations now create a public dispute + record like bot ones do
var __hdi = window.humanDeclareInvestigation;
window.humanDeclareInvestigation = function(idx, declaredTeam){
  var h = game.humanPlayerIndex;
  if(h >= 0 && game.playerRecords[h] && game.playerRecords[idx]){
    game.playerRecords[h].investigationsDone.push({target:idx, declared:declaredTeam});
    game.playerRecords[idx].investigationsReceived.push({by:h, declared:declaredTeam});
    if(declaredTeam === 'Communist') addDispute(h, idx, 'Secretary publicly declared comrade to be a Communist', 'investigation_accuse');
  }
  return __hdi(idx, declaredTeam);
};

// Simulator: record public investigation claims + disputes like the live game
function simInvestigate(P){
  var alive = getAliveIndices(), cands = [];
  var done = game.botInvestigations[P] || {};
  alive.forEach(function(i){ if(i !== P && i !== game.currentChancellor && !done[i]) cands.push(i); });
  if(!cands.length) alive.forEach(function(i){ if(i !== P && !done[i]) cands.push(i); });
  if(!cands.length) return;
  var ps = game.preSpecialPresident;
  var pick = brainPickInvestigation(P, cands);
  game.preSpecialPresident = ps;
  var team = (game.roles[pick.target] === 'white') ? 'white' : 'communist';
  if(!game.botInvestigations[P]) game.botInvestigations[P] = {};
  game.botInvestigations[P][pick.target] = team;
  brainPrivateInvestigate(P, pick.target, team);
  brainObserveInvestigation(P, pick.target, pick.declared);
  game.playerRecords[P].investigationsDone.push({target:pick.target, declared:pick.declared});
  game.playerRecords[pick.target].investigationsReceived.push({by:P, declared:pick.declared});
  if(pick.declared === 'Communist') addDispute(P, pick.target, 'Secretary publicly declared comrade to be a Communist', 'investigation_accuse');
}

// Communists always know Stalin: never let noise/lapse make them block him in the zone
function botDecideVote(botIdx){
  var C = game.nominatedChancellor;
  if(BOT_RULES.consistency && game.roles[botIdx] === 'communist' && game.roles[C] === 'stalin' && game.communistPolicies >= 3) return true;
  return botDecideVoteCore(botIdx);
}

// Framing rate now matches what the inference model assumes (~35%, scaled by skill `lie`),
// instead of ~97%. Otherwise the communist "clears" the White instead of accusing.
var __bpi = window.brainPickInvestigation;
window.brainPickInvestigation = function(presIdx, candidates){
  var r = __bpi(presIdx, candidates);
  if(r && game.roles[presIdx] !== 'white' && game.roles[r.target] === 'white' && r.declared === 'Communist'){
    var lie = brainParams(presIdx).lie; if(lie === undefined) lie = 1;
    if(Math.random() > FRAME_P * lie) r.declared = 'White';
  }
  return r;
};


// =====================================================================
// ============= BOARD ANALYSIS OVERHAUL (Address Comrades) ============
// Uses only PUBLIC information plus what the human legitimately knows.
// =====================================================================
var BA_CSS =
'.ba-wrap{text-align:left;font-size:.8rem;width:100%}' +
'.ba-head{font-weight:900;color:var(--g);text-transform:uppercase;letter-spacing:1px;margin:2px 0 6px}' +
'.ba-board{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}' +
'.ba-chip{background:#11141d;border:1px solid var(--border);border-radius:999px;padding:3px 9px;font-size:.7rem;font-weight:700;color:var(--td)}' +
'.ba-chip.hot{border-color:var(--comm-red);color:#fca5a5}.ba-chip.ok{border-color:#10b981;color:#86efac}' +
'.ba-gov{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:8px}' +
'.ba-card{background:#11141d;border:1.5px solid var(--border);border-radius:8px;padding:8px}' +
'.ba-card-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}' +
'.ba-role{font-size:.62rem;text-transform:uppercase;letter-spacing:.8px;color:var(--td);font-weight:800}' +
'.ba-name{font-weight:900;color:var(--t);font-size:.9rem}' +
'.ba-sus{font-size:.66rem;font-weight:800;border-radius:6px;padding:1px 6px;border:1px solid var(--border)}' +
'.ba-sus.good{color:#86efac;border-color:#10b981}.ba-sus.warn{color:#fde68a;border-color:var(--g)}.ba-sus.bad{color:#fca5a5;border-color:var(--comm-red)}.ba-sus.info{color:var(--td)}' +
'.ba-fact{font-size:.72rem;line-height:1.35;margin:2px 0}' +
'.ba-fact.good{color:#86efac}.ba-fact.bad{color:#fca5a5}.ba-fact.warn{color:#fde68a}.ba-fact.info{color:var(--td)}' +
'.ba-lean{background:#11141d;border:1.5px solid var(--border);border-radius:8px;padding:8px;margin-bottom:8px}' +
'.ba-bar{height:8px;background:#242938;border-radius:4px;overflow:hidden;margin:5px 0;position:relative}' +
'.ba-bar>div{height:100%;background:var(--whi-light)}' +
'.ba-rec{border:1.5px solid var(--g);background:rgba(245,158,11,0.08);border-radius:8px;padding:8px;margin-bottom:8px}' +
'.ba-rec b.ja{color:#86efac}.ba-rec b.nein{color:#fca5a5}' +
'.ba-rec ul{margin:4px 0 0 16px;padding:0;color:var(--t)}.ba-rec li{margin:2px 0;font-size:.74rem}' +
'.ba-sec{font-size:.7rem;font-weight:800;color:var(--td);text-transform:uppercase;letter-spacing:.8px;margin:10px 0 2px}' +
'.ba-arg{border:1.5px solid var(--border);border-radius:8px;padding:8px 10px;margin:6px 0;cursor:pointer;background:var(--panel);transition:border-color .15s}' +
'.ba-arg:hover{border-color:var(--g)}' +
'.ba-arg-top{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:4px;font-size:.66rem;font-weight:800}' +
'.ba-str{border-radius:6px;padding:1px 6px;border:1px solid var(--border);text-transform:uppercase;letter-spacing:.5px}' +
'.ba-str.Strong{color:#86efac;border-color:#10b981}.ba-str.Solid{color:#fde68a;border-color:var(--g)}.ba-str.Modest{color:var(--td)}.ba-str.Bluff{color:#fca5a5;border-color:var(--comm-red)}' +
'.ba-basis{color:var(--td);font-weight:700}.ba-sway{margin-left:auto;color:var(--g)}' +
'.ba-react{color:var(--g);font-size:.78rem;font-style:italic;margin:3px 0}' +
'.ba-note{font-size:.68rem;color:var(--td);margin-top:6px}';

function baInjectStyles(){
  try {
    if(document.getElementById('ba-style') && document.getElementById('ba-style').textContent) return;
    var s = document.createElement('style'); s.id = 'ba-style'; s.textContent = BA_CSS;
    (document.head || document.body).appendChild(s);
  } catch(e){}
}
baInjectStyles();

function baEsc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function baPct(x){ return Math.round(x * 100) + '%'; }
function baName(i){ return game.players[i] ? game.players[i].name : '?'; }

function baSusInfo(p, prior){
  if(p >= prior + 0.30) return {label:'High', cls:'bad'};
  if(p >= prior + 0.12) return {label:'Elevated', cls:'warn'};
  if(p <= prior - 0.12) return {label:'Low', cls:'good'};
  return {label:'Neutral', cls:'info'};
}

// Public evidence only (no bot-private beliefs)
function baPublicEvidence(P, C){
  if(isInAnyConflict(P) || isInAnyConflict(C)) return true;
  if(game.mildSuspicionPresidents[P] || game.mildSuspicionPresidents[C]) return true;
  if(game.humanInvestigations[P] === 'communist' || game.humanInvestigations[C] === 'communist') return true;
  if(BRAIN){ var v = brainView(-1); if(v.F[P] >= 0.9 || v.F[C] >= 0.9) return true; }
  return false;
}

function baFacts(i){
  var f = [], rec = game.playerRecords[i] || {}, h = game.humanPlayerIndex;
  var wOn = 0, rOn = 0;
  game.policyHistory.forEach(function(x){ if(x.chancellor === i){ if(isWhite(x.policy)) wOn++; else rOn++; } });
  var served = (rec.governments || []).length;
  if(!served) f.push({t:'info', x:'Has not served in a government yet.'});
  else {
    if(rOn) f.push({t:'bad', x:'Enacted ☭ as Premier ×' + rOn + ' (could have been forced).'});
    if(wOn) f.push({t:'good', x:'Enacted ★ as Premier ×' + wOn + '.'});
    if(!rOn && !wOn) f.push({t:'info', x:'Served ' + served + '× as Secretary; never enacted a policy as Premier.'});
  }
  var kinds = {choice_denial:'contradicting card claims', choice_denial_rev:'contradicting card claims (reverse)', impossible_claim:'an impossible card claim', investigation_accuse:'an investigation accusation'};
  (rec.disputes || []).slice(0, 2).forEach(function(d){
    f.push({t:'bad', x:'Feud with ' + baName(d.opponent) + ' over ' + (kinds[d.type] || 'a public contradiction') + '.'});
  });
  if(game.mildSuspicionPresidents[i]) f.push({t:'warn', x:'Deck-audit flag: claimed 3 ☭ in a cycle with missing ★ cards.'});
  if(game.communistPolicies >= 3){
    if(game.confirmedNotStalin[i]) f.push({t:'good', x:'Confirmed Not Stalin (CNS).'});
    else f.push({t:'warn', x:'NOT confirmed — could be Stalin.'});
  }
  (rec.investigationsReceived || []).forEach(function(iv){
    f.push(iv.declared === 'Communist'
      ? {t:'bad', x:'Accused of being Communist by ' + baName(iv.by) + '.'}
      : {t:'good', x:'Declared White by ' + baName(iv.by) + ' (a claim, not proof).'});
  });
  (rec.investigationsDone || []).forEach(function(iv){
    if(iv.declared === 'Communist') f.push({t:'warn', x:'Publicly accused ' + baName(iv.target) + ' of being Communist.'});
  });
  var uv = game.unjustifiedVotes ? game.unjustifiedVotes[i] : null;
  if(uv && uv.susYes >= 2) f.push({t:'warn', x:'Voted ДА on suspect governments ×' + uv.susYes + '.'});
  if(h >= 0 && game.humanInvestigations[i]){
    f.push(game.humanInvestigations[i] === 'communist'
      ? {t:'bad', x:'YOUR investigation: Communist.'} : {t:'good', x:'YOUR investigation: loyal White.'});
  }
  if(game.userSuspects && game.userSuspects.indexOf(i) >= 0) f.push({t:'info', x:'You marked them SUSPECT.'});
  if(game.userTrusted && game.userTrusted.indexOf(i) >= 0) f.push({t:'info', x:'You marked them TRUSTED.'});
  return f.slice(0, 7);
}

function baBuild(){
  var P = game.currentPresident, C = game.nominatedChancellor, st = brainState();
  var pub = BRAIN ? brainView(-1) : null;
  var prior = (getRoleDistribution(game.playerCount).communists + 1) / game.playerCount;
  var A = {h:game.humanPlayerIndex, P:P, C:C, st:st, pub:pub, prior:prior, alive:getAliveIndices()};
  function person(i, label){
    var p = baRawPubF(i); if(p === null || p === undefined) p = prior;
    return {idx:i, label:label, name:baName(i), sus:p, susInfo:baSusInfo(p, prior), S:baRawPubS(i), facts:baFacts(i)};
  }
  A.people = [person(P, 'Secretary'), person(C, 'Premier')];
  A.evidence = baPublicEvidence(P, C);
  return A;
}

// Expected table lean from the PUBLIC view (no peeking at bots' private roles)
function baBotDelta(botIdx, arg){
  var pers = (game.players[botIdx] && game.players[botIdx].personality) || {skill:'Intermediate', persuadability:1};
  var expert = (pers.skill === 'Master' || pers.skill === 'Expert');
  var trust = 0;
  if(hasDispute(botIdx, game.humanPlayerIndex)) trust -= 2.0;
  if(isWhite(game.humanInvestigations[botIdx])) trust += 1.2;
  var impact = arg.val * (pers.persuadability || 1) + trust;
  if(expert) impact += arg.sound ? 0.8 : -1.8;
  if(arg.stance === 'ja' && impact < -0.9) impact = -0.9;
  return arg.stance === 'ja' ? impact : -impact;
}

function baLean(A, deltas){
  var h = A.h, P = A.P, C = A.C, st = A.st, pub = A.pub, preds = {}, exp = 0, n = 0;
  var noEv = !st.zone && !A.evidence;
  A.alive.forEach(function(j){
    if(j === h) return;
    var p;
    if(j === P || j === C) p = 1;
    else {
      var pj = brainParams(j), d = (deltas && deltas[j]) || 0;
      if(noEv && d > -1) p = 0.97;
      else {
        var diff = brainWYesValue(pub, P, C, st, pj) - brainWNoValue(pub, j, st, pj) + pj.yesBias + 0.5 * d;
        p = brainClamp(brainLogistic(diff / (0.35 * pj.noise + 0.08)), 0.03, 0.97);
      }
    }
    preds[j] = p; exp += p; n++;
  });
  var dist = brainPassDist(preds, h, st), N = A.alive.length;
  return {exp:exp, n:n, need:Math.floor(N / 2) + 1, passYes:brainPassProbFrom(dist, 1, N), passNo:brainPassProbFrom(dist, 0, N)};
}

function baRecommend(A){
  var h = A.h, P = A.P, C = A.C, st = A.st, role = game.roles[h], why = [], vote = null, conf = 'Lean';
  var pn = A.people;
  function badFacts(){
    var out = [];
    pn.forEach(function(p){ p.facts.forEach(function(f){ if(f.t === 'bad' || f.t === 'warn') out.push(p.name + ': ' + f.x); }); });
    return out;
  }
  if(h === P || h === C){
    return {vote:'ДА', conf:'Strong', why:['This is your own government — voting it down only hands the initiative away.']};
  }
  var known = game.playerKnownRoles || {};
  var isTeam = function(i){ return known[i] === 'communist' || known[i] === 'stalin'; };
  if(role !== 'white'){
    if(st.zone && game.roles[C] === 'stalin' && known[C] === 'stalin')
      return {vote:'ДА', conf:'Strong', why:['Stalin is the Premier candidate in the Stalin Zone — electing him wins the game.']};
    if(isTeam(P) || isTeam(C))
      return {vote:'ДА', conf:'Lean', why:['A teammate is on this ticket (' + (isTeam(P) ? pn[0].name : pn[1].name) + ').', 'Passing it gives your team legislative access.']};
    why.push('Blend-in play: act like a loyal White would.');
  }
  if(!st.zone && !A.evidence){
    why.push('No dispute, audit flag, accusation or investigation against this ticket.');
    why.push('Early on, loyal players approve clean tickets — blocking them just stalls the board.');
    return {vote:'ДА', conf:'Strong', why:why};
  }
  if(st.zone){
    if(game.confirmedNotStalin[C]){ why.push(pn[1].name + ' is Confirmed Not Stalin — electing them cannot end the game.'); return {vote:'ДА', conf:'Strong', why:why}; }
    var pS = A.pub ? A.pub.S[C] : 0;
    why.push('Stalin Zone: ' + pn[1].name + ' is NOT confirmed. Table estimate they are Stalin: ' + baPct(pS) + '.');
    if(st.tracker >= 2){
      why.push('Tracker is at 2 — a NEIN triggers chaos (~' + baPct(st.pChaosRed) + ' chance the top card is ☭).');
      vote = pS >= 0.25 ? 'НЕТ' : 'ДА'; conf = 'Toss-up';
    } else { vote = 'НЕТ'; conf = pS >= 0.2 ? 'Strong' : 'Lean'; }
    badFacts().slice(0, 2).forEach(function(x){ why.push(x); });
    return {vote:vote, conf:conf, why:why};
  }
  var pubV = A.pub;
  var diff = pubV ? brainWYesValue(pubV, P, C, st, {zoneCaution:0}) - brainWNoValue(pubV, h, st, {zoneCaution:0}) : 0;
  vote = diff >= 0 ? 'ДА' : 'НЕТ';
  conf = Math.abs(diff) >= 1.0 ? 'Strong' : (Math.abs(diff) >= 0.35 ? 'Lean' : 'Toss-up');
  badFacts().slice(0, 3).forEach(function(x){ why.push(x); });
  if(st.brink) why.push('Match point: one more ★ wins — but only if this ticket delivers it.');
  if(st.tracker === 2) why.push('Tracker is at 2 — a NEIN triggers a blind top-deck.');
  if(!why.length) why.push('Nothing concrete either way — the numbers slightly favor ' + vote + '.');
  return {vote:vote, conf:conf, why:why};
}

var BA_FLUFF = {fb_unconvinced:1, fb_trust_gap:1, fb_rotation:1, fb_gut:1, fb_progress:1, fb_clean_ticket:1, solidarity_test:1};
var BA_BASIS = [
  [/^stat_|^gen_|^pres_dispute/, 'Dispute on record'], [/^audit_/, 'Deck audit'], [/^sz_/, 'Stalin Zone'],
  [/^inv_/, 'Investigation'], [/^chanc_/, 'Premier record'], [/^powerplay/, 'Rotation order'],
  [/^tracker_/, 'Election tracker'], [/^matchpoint_/, 'Victory math'], [/^pub_/, 'Table read'],
  [/^my_|^solidarity/, 'Personal appeal'], [/^fb_/, 'No hard evidence']
];

function baArguments(A){
  var raw = generateDynamicPersuasionOptions().slice();
  var P = A.P, C = A.C, pn = A.people;
  var thr = 0.12;
  if(A.pub){
    if(pn[1].sus >= A.prior + thr && !A.st.zone)
      raw.push({id:'pub_sus_chanc', stance:'nein', priority:87, text:'The table\'s read on ' + pn[1].name + ' is ' + pn[1].susInfo.label.toLowerCase() + ' — their public record does not earn a legislative seat yet.'});
    if(pn[0].sus >= A.prior + thr)
      raw.push({id:'pub_sus_pres', stance:'nein', priority:84, text:'Secretary ' + pn[0].name + ' reads ' + pn[0].susInfo.label.toLowerCase() + ' on the public record. I would not trust their nominee.'});
    if(pn[0].sus <= A.prior - thr && pn[1].sus <= A.prior - thr)
      raw.push({id:'pub_clean_gov', stance:'ja', priority:82, text:'Both ' + pn[0].name + ' and ' + pn[1].name + ' read clean on the public record. This is one of our safest tickets.'});
  }
  var ja = [], nein = [];
  raw.forEach(function(o){
    var fluff = !!BA_FLUFF[o.id], pr = o.priority || 50;
    if(fluff && o.stance === 'ja' && !A.evidence) fluff = false;   // "no evidence against it" is TRUE here
    var strength = fluff ? 'Bluff' : (pr >= 90 ? 'Strong' : (pr >= 80 ? 'Solid' : 'Modest'));
    var val = {Strong:1.8, Solid:1.4, Modest:0.8, Bluff:-0.8}[strength];
    var basis = 'General'; for(var b = 0; b < BA_BASIS.length; b++) if(BA_BASIS[b][0].test(o.id)){ basis = BA_BASIS[b][1]; break; }
    var arg = {id:o.id, stance:o.stance, text:o.text, priority:pr, strength:strength, val:val, sound:!fluff, basis:basis};
    (arg.stance === 'ja' ? ja : nein).push(arg);
  });
  var byP = function(a, b){ return b.priority - a.priority; };
  ja.sort(byP); nein.sort(byP);
  return ja.slice(0, 3).concat(nein.slice(0, 4));
}

function openPreVoteDiscussion(){
  sfx('click');
  baInjectStyles();
  var A = baBuild();
  var args = baArguments(A);
  window.currentDynamicPersuasion = args;
  var lean = BRAIN ? baLean(A, null) : null;
  var rec = baRecommend(A);

  document.getElementById('at').textContent = 'Board Analysis';
  document.getElementById('ad').textContent = 'Public record, table read and your options. Pick an argument to sway the vote.';

  var st = A.st, capW = cycleWhiteCeiling(), seen = (game.deckCycle && game.deckCycle.claimedDemSeen) || 0;
  var html = '<div class="ba-wrap"><div class="ba-board">' +
    '<span class="ba-chip">★ ' + game.whitePolicies + '/5</span><span class="ba-chip' + (game.communistPolicies >= 4 ? ' hot' : '') + '">☭ ' + game.communistPolicies + '/6</span>' +
    '<span class="ba-chip' + (st.tracker >= 2 ? ' hot' : '') + '">Tracker ' + st.tracker + '/3</span>' +
    '<span class="ba-chip' + (st.zone ? ' hot' : ' ok') + '">Stalin Zone ' + (st.zone ? 'ON' : 'off') + '</span>' +
    '<span class="ba-chip' + (seen > capW ? ' hot' : '') + '">Audit ' + seen + '/' + capW + ' ★ claimed</span>' +
    (game.vetoUnlocked ? '<span class="ba-chip hot">Veto unlocked</span>' : '') + '</div>';

  html += '<div class="ba-gov">';
  A.people.forEach(function(p){
    html += '<div class="ba-card"><div class="ba-card-top"><span class="ba-role">' + p.label + '</span>' +
      '<span class="ba-sus ' + p.susInfo.cls + '" title="Public suspicion">' + p.susInfo.label + ' ' + baPct(p.sus) + '</span></div>' +
      '<div class="ba-name">' + baEsc(p.idx === A.h ? 'You' : p.name) + '</div>' +
      (st.zone && p.label === 'Premier' ? '<div class="ba-fact warn">Stalin risk (table est.): ' + baPct(p.S) + '</div>' : '') +
      p.facts.map(function(f){ return '<div class="ba-fact ' + f.t + '">• ' + baEsc(f.x) + '</div>'; }).join('') + '</div>';
  });
  html += '</div>';

  if(lean){
    var pct = Math.round(100 * lean.exp / Math.max(1, lean.n));
    html += '<div class="ba-lean"><b>Expected table lean:</b> ~' + lean.exp.toFixed(1) + ' of ' + lean.n + ' other voters ДА (majority needs ' + lean.need + ' incl. you)' +
      '<div class="ba-bar"><div style="width:' + pct + '%"></div></div>' +
      'If you vote <b style="color:#86efac">ДА</b>: ~' + baPct(lean.passYes) + ' passes &nbsp;•&nbsp; <b style="color:#fca5a5">НЕТ</b>: ~' + baPct(lean.passNo) + ' passes' +
      (Math.abs(lean.passYes - lean.passNo) < 0.05 ? '<div class="ba-note">Your vote is unlikely to change the outcome — use your speech to shape it.</div>' : '') +
      '<div class="ba-note">Estimate from the public record only — hidden roles are not used.</div></div>';
  }

  html += '<div class="ba-rec">🧭 <b>Analyst recommends: <b class="' + (rec.vote === 'ДА' ? 'ja' : 'nein') + '">' + rec.vote + '</b></b> (' + rec.conf + ')<ul>' +
    rec.why.map(function(w){ return '<li>' + baEsc(w) + '</li>'; }).join('') + '</ul></div>';

  var base = lean ? lean.exp : 0;
  html += '<div class="ba-sec">Choose what to say</div>';
  args.forEach(function(a, i){
    var sway = '';
    if(lean){
      var d = {}; A.alive.forEach(function(j){ if(j !== A.h) d[j] = baBotDelta(j, a); });
      var sw = baLean(A, d).exp - base;
      sway = Math.abs(sw) < 0.15 ? 'little effect' : ((sw > 0 ? '+' : '−') + Math.abs(sw).toFixed(1) + ' ДА votes');
    }
    html += '<div class="ba-arg" onclick="deliverDynamicPersuasion(' + i + ')"><div class="ba-arg-top">' +
      '<span class="persuasion-tag ' + (a.stance === 'ja' ? 'tag-ja' : 'tag-nein') + '">' + (a.stance === 'ja' ? 'Urge ДА 👍' : 'Urge НЕТ 👎') + '</span>' +
      '<span class="ba-str ' + a.strength + '">' + a.strength + '</span><span class="ba-basis">' + a.basis + '</span>' +
      (sway ? '<span class="ba-sway">≈ ' + sway + '</span>' : '') + '</div>' +
      '<div class="persuasion-quote">"' + a.text + '"</div></div>';
  });
  html += '<div class="ba-note">Bluffs can backfire: sharp bots call out arguments the facts do not support.</div></div>' +
    '<button class="btn secondary" onclick="renderHumanVoteScreen()">Cancel / Vote Directly</button>';
  document.getElementById('ac').innerHTML = html;
}

function baReaction(bot, impact, arg){
  var t = (bot.personality && bot.personality.type) || '';
  var agree = impact > 0;
  if(agree){
    var a = {Analytical:'The numbers back that up.', Cautious:'Better safe than sorry — I am with you.', Outspoken:'Finally someone says it out loud!',
      Loyalist:'Fair enough. Let us move together.', Diplomat:'Reasonable. Consensus it is.', Chaotic:'Bold. I like it.', Subtle:'Noted. I will weigh that quietly.',
      Shrewd:'The odds favor that.', Pragmatist:'Sound reasoning.', Dominant:'Acceptable.'};
    return a[t] || 'That is a fair point.';
  }
  var p = {Analytical:'Those numbers do not add up, comrade.', Cautious:'I am not convinced.', Outspoken:'Empty words! Show me evidence.',
    Shrewd:'Sounds like a bluff to me.', Pragmatist:'That argument has no substance.', Subtle:'Hm. Convenient.', Dominant:'You do not direct this table.'};
  return p[t] || 'I do not buy it.';
}

function deliverDynamicPersuasion(idx){
  sfx('click');
  var arg = window.currentDynamicPersuasion ? window.currentDynamicPersuasion[idx] : null;
  if(!arg) return;
  var A = baBuild(), before = BRAIN ? baLean(A, null) : null, deltas = {}, list = [];
  A.alive.forEach(function(j){
    if(j === A.h) return;
    var d = baBotDelta(j, arg); deltas[j] = d;
    var impact = arg.stance === 'ja' ? d : -d;
    list.push({j:j, d:d, impact:impact});
  });
  roundPersuasionModifier = {active:true, speakerName:'You', text:arg.text, stance:arg.stance, botModifiers:deltas};
  logSpeech('You', 'Speech', arg.text);

  list.sort(function(a, b){ return Math.abs(b.impact) - Math.abs(a.impact); });
  var reacts = list.filter(function(x){ return Math.abs(x.impact) >= 0.8; }).slice(0, 3).map(function(x){
    return '<div class="ba-react">💬 ' + baEsc(baName(x.j)) + ': "' + baReaction(game.players[x.j], x.impact, arg) + '"</div>';
  }).join('');
  var after = BRAIN ? baLean(A, deltas) : null;
  var leanHTML = (before && after)
    ? '<div class="ba-lean"><b>Table lean:</b> ~' + before.exp.toFixed(1) + ' → <b>~' + after.exp.toFixed(1) + '</b> of ' + after.n + ' ДА<div class="ba-bar"><div style="width:' +
      Math.round(100 * after.exp / Math.max(1, after.n)) + '%"></div></div>If you vote ДА: ~' + baPct(after.passYes) + ' passes • НЕТ: ~' + baPct(after.passNo) + ' passes</div>' : '';

  document.getElementById('at').textContent = 'Persuasion Delivered';
  document.getElementById('ad').textContent = 'The comrades have heard you:';
  document.getElementById('ac').innerHTML =
    '<div class="speech-card player-speech"><div class="speech-name" style="color:#38bdf8">🗣️ You addressed the table (' + arg.strength + ' • ' + arg.basis + '):</div><div class="speech-text">"' + arg.text + '"</div></div>' +
    reacts + leanHTML +
    '<div class="vote-buttons" style="margin-top:12px"><button class="vote-btn ja" onclick="castVote(true)"><span>👍</span>ДА</button><button class="vote-btn nein" onclick="castVote(false)"><span>👎</span>НЕТ</button></div>';
}


// Balanced, centered rows for the spectator odds grids (e.g. 5 + 4 instead of 8 + 1)
(function(){
  try {
    if(document.getElementById('spec-style') && document.getElementById('spec-style').textContent) return;
    var st = document.createElement('style'); st.id = 'spec-style';
    st.textContent = '.spectator-grid.rows{display:flex;flex-direction:column;gap:6px;margin-top:8px}' +
      '.spectator-row{display:flex;justify-content:center;gap:6px}' +
      '.spectator-row .spectator-mini{flex:1 1 0;min-width:0;max-width:150px}';
    (document.head || document.body).appendChild(st);
  } catch(e){}
})();

// Voting runs at 2x speed (follows the speed selector)
function voteDelay(){ return 255; }


// =====================================================================
// ===== TRUST, TABLE VIBE, INVOLVEMENT & BOARD-ANALYSIS STATS TOGGLE ===
// =====================================================================
var BOT_RULES2 = {involvement:true};

// ---- Raw PUBLIC belief helpers (no human-mark effects => no feedback loops) ----
var __rawCache = {ver:-1, F:null, S:null};
function baRawPub(){
  var B = BRAIN; if(!B) return null;
  if(__rawCache.B === B && __rawCache.ver === B.ver && __rawCache.F && __rawCache.F.length === B.n) return __rawCache;   // (v17: also key on the brain instance -- a new game could hit the previous game's cache)
  var F = new Float64Array(B.n), S = new Float64Array(B.n), t = 0;
  for(var h=0; h<B.H; h++){
    var v = B.pub[h]; if(!v) continue;
    t += v; var r = B.hRole[h];
    for(var j=0;j<B.n;j++) if(r[j]) F[j] += v;
    S[B.hStalin[h]] += v;
  }
  if(t > 0) for(var i=0;i<B.n;i++){ F[i] /= t; S[i] /= t; }
  __rawCache = {B:B, ver:B.ver, F:F, S:S};
  return __rawCache;
}
function baRawPubF(i){ var r = baRawPub(); return r ? r.F[i] : null; }
function baRawPubS(i){ var r = baRawPub(); return r ? r.S[i] : 0; }
function baPrior(){ return (getRoleDistribution(game.playerCount).communists + 1) / game.playerCount; }

// ---- The table's general trust in the human feeds their credibility ----
function baTableTrust(){
  var h = game.humanPlayerIndex;
  if(h < 0 || !BRAIN) return 0;
  var f = baRawPubF(h); if(f === null) return 0;
  return brainClamp((baPrior() - f) * 5, -2.5, 2.5);
}
var __ghc = window.getHumanCredibility;
window.getHumanCredibility = function(observerIdx){ return __ghc(observerIdx) + baTableTrust(); };

// ---- Bots believe your SUS/TRUST marks in proportion to how much they trust YOU ----
(function(){
  var src = brainEffWeights.toString();
  var a = src.indexOf("var fF = {}, fW = {}, any = false, j;");
  var b = src.indexOf("if(!any) return w;");
  if(a < 0 || b < 0) return;
  var mid = "var fF = {}, fW = {}, any = false, j;\n" +
    "  var sA = brainClamp((cred - 0.5) / 2.5, 0.3, 1), tA = brainClamp((cred - 1.0) / 2.0, 0.3, 1);\n" +
    "  if(cred >= 0.5) for(var a=0;a<sus.length;a++){ j = sus[a]; fF[j] = (fF[j]||1) * (1 + 0.30*sA); fW[j] = (fW[j]||1) * (1 - 0.15*sA); any = true; }\n" +
    "  else if(cred <= -1.5) for(var a2=0;a2<sus.length;a2++){ j = sus[a2]; fF[j] = (fF[j]||1) * 0.92; fW[j] = (fW[j]||1) * 1.04; any = true; }\n" +
    "  if(cred >= 1.0) for(var b=0;b<tr.length;b++){ j = tr[b]; fF[j] = (fF[j]||1) * (1 - 0.10*tA); fW[j] = (fW[j]||1) * (1 + 0.08*tA); any = true; }\n" +
    "  else if(cred <= -1.5) for(var c=0;c<tr.length;c++){ j = tr[c]; fF[j] = (fF[j]||1) * 1.25; fW[j] = (fW[j]||1) * 0.90; any = true; }\n  ";
  var patched = src.slice(0, a) + mid + src.slice(b);
  try { window.brainEffWeights = (new Function('return ' + patched))(); } catch(e){}
})();

// ---- Get everyone involved before the Stalin Zone ----
function baPremierTerms(i){
  var n = 0; game.policyHistory.forEach(function(x){ if(x.chancellor === i) n++; });
  return n;
}
function involvementBonus(presIdx, cand){
  if(!BOT_RULES2.involvement || game.communistPolicies >= 3) return 0;
  var alive = getAliveIndices(), minT = 99;
  alive.forEach(function(j){ if(j !== presIdx){ var t = baPremierTerms(j); if(t < minT) minT = t; } });
  var terms = baPremierTerms(cand), urgency = 1 + 0.35 * game.communistPolicies;
  var b = urgency * ((terms === 0 ? 1.0 : 0) - 0.25 * (terms - minT));
  return game.roles[presIdx] === 'communist' ? b * 0.5 : b;
}

// ---- Basic table VIBE on the board (labels only, no numbers) ----
function baVibeInfo(f){
  var p = baPrior();
  if(f >= p + 0.30) return {icon:'🔴', label:'Distrusted', cls:'bad'};
  if(f >= p + 0.12) return {icon:'🟠', label:'Doubted', cls:'warn'};
  if(f <= p - 0.12) return {icon:'🟢', label:'Trusted', cls:'good'};
  return {icon:'🟡', label:'Mixed', cls:'info'};
}
function baUpdateVibe(){
  if(SIM_MODE) return;
  try {
    var bar = document.getElementById('vibe-bar');
    if(!bar){
      var bc = document.querySelector('.board-container'); if(!bc) return;
      bar = document.createElement('div'); bar.id = 'vibe-bar'; bar.className = 'vibe-bar'; bc.appendChild(bar);
    }
    if(game.mode === 'local' || !BRAIN || !game.players.length){ bar.style.display = 'none'; return; }
    var items = [], h = game.humanPlayerIndex;
    if(h >= 0 && game.players[h] && !game.players[h].isDead) items.push(['You', h]);
    if(game.nominatedChancellor !== null && game.nominatedChancellor !== undefined && !game.gameOver){
      if(game.currentPresident !== h) items.push(['Secretary ' + baName(game.currentPresident), game.currentPresident]);
      if(game.nominatedChancellor !== h) items.push(['Premier ' + baName(game.nominatedChancellor), game.nominatedChancellor]);
    }
    if(!items.length){ bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    bar.innerHTML = '<span class="vibe-title">Table vibe</span>' + items.map(function(it){
      var f = baFeelF(it[1]); var v = baVibeInfo(f === null ? baPrior() : f);
      return '<span class="vibe-item ' + v.cls + '">' + baEsc(it[0]) + ' ' + v.icon + ' ' + v.label + '</span>';
    }).join('');
  } catch(e){}
}
var __rgbV = window.renderGameBoard;
window.renderGameBoard = function(){ var r = __rgbV.apply(this, arguments); baUpdateVibe(); return r; };

(function(){
  try {
    var st = document.getElementById('ba2-style');
    if(st && st.textContent) return;
    st = document.createElement('style'); st.id = 'ba2-style';
    st.textContent =
      '.vibe-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center;margin-top:6px;font-size:.72rem}' +
      '.vibe-title{color:var(--td);text-transform:uppercase;letter-spacing:.8px;font-weight:800;font-size:.66rem}' +
      '.vibe-item{background:#11141d;border:1px solid var(--border);border-radius:999px;padding:2px 9px;font-weight:700;color:var(--td)}' +
      '.vibe-item.good{border-color:#10b981;color:#86efac}.vibe-item.warn{border-color:var(--g);color:#fde68a}.vibe-item.bad{border-color:var(--comm-red);color:#fca5a5}' +
      '.ba-toggle{background:#11141d;border:1.5px solid var(--g);color:var(--g);border-radius:999px;padding:3px 12px;font-weight:800;font-size:.7rem;cursor:pointer}' +
      '.ba-toggle.off{border-color:var(--border);color:var(--td)}';
    (document.head || document.body).appendChild(st);
  } catch(e){}
})();

// ---- Board Analysis: stats on/off (default OFF: you weigh the facts yourself) ----
var BA_STATS = false;
try { BA_STATS = (localStorage.getItem('sneakyStalinBAStats') === '1'); } catch(e){}
function baToggleStats(){
  BA_STATS = !BA_STATS;
  try { localStorage.setItem('sneakyStalinBAStats', BA_STATS ? '1' : '0'); } catch(e){}
  openPreVoteDiscussion();
}

// Speech impact now depends on how much each bot trusts YOU
function baTrustOf(botIdx){ return brainClamp(0.5 * getHumanCredibility(botIdx), -2.5, 2.0); }
function baBotDelta(botIdx, arg){
  var pers = (game.players[botIdx] && game.players[botIdx].personality) || {skill:'Intermediate', persuadability:1};
  var expert = (pers.skill === 'Master' || pers.skill === 'Expert');
  var impact = arg.val * (pers.persuadability || 1) + baTrustOf(botIdx);
  if(expert) impact += arg.sound ? 0.8 : -1.8;
  if(arg.stance === 'ja' && impact < -0.9) impact = -0.9;
  return arg.stance === 'ja' ? impact : -impact;
}

function baReaction(bot, impact, arg, trust){
  var t = (bot.personality && bot.personality.type) || '';
  if(impact <= 0.2 && trust <= -1.2) return 'Why should we listen to you, comrade?';
  if(impact > 0){
    var a = {Analytical:'The numbers back that up.', Cautious:'Better safe than sorry — I am with you.', Outspoken:'Finally someone says it out loud!',
      Loyalist:'Fair enough. Let us move together.', Diplomat:'Reasonable. Consensus it is.', Chaotic:'Bold. I like it.', Subtle:'Noted. I will weigh that quietly.',
      Shrewd:'The odds favor that.', Pragmatist:'Sound reasoning.', Dominant:'Acceptable.'};
    return a[t] || 'That is a fair point.';
  }
  var p = {Analytical:'Those numbers do not add up, comrade.', Cautious:'I am not convinced.', Outspoken:'Empty words! Show me evidence.',
    Shrewd:'Sounds like a bluff to me.', Pragmatist:'That argument has no substance.', Subtle:'Hm. Convenient.', Dominant:'You do not direct this table.'};
  return p[t] || 'I do not buy it.';
}

function openPreVoteDiscussion(){
  sfx('click');
  baInjectStyles();
  var A = baBuild(), args = baArguments(A);
  if(!BA_STATS){
    args = shuffle(args.filter(function(a){ return a.stance === 'ja'; })).concat(shuffle(args.filter(function(a){ return a.stance !== 'ja'; })));
  }
  window.currentDynamicPersuasion = args;
  var lean = (BA_STATS && BRAIN) ? baLean(A, null) : null;
  var rec = BA_STATS ? baRecommend(A) : null;

  document.getElementById('at').textContent = 'Board Analysis';
  document.getElementById('ad').textContent = BA_STATS ? 'Public record, table read and your options. Pick an argument to sway the vote.'
    : 'The public record. Weigh the facts yourself, then pick what to say.';

  var st = A.st, capW = cycleWhiteCeiling(), seen = (game.deckCycle && game.deckCycle.claimedDemSeen) || 0;
  var html = '<div class="ba-wrap"><div style="text-align:right;margin-bottom:6px"><button class="ba-toggle' + (BA_STATS ? '' : ' off') + '" onclick="baToggleStats()">📊 Stats: ' + (BA_STATS ? 'ON' : 'OFF') + '</button></div>' +
    '<div class="ba-board">' +
    '<span class="ba-chip">★ ' + game.whitePolicies + '/5</span><span class="ba-chip' + (game.communistPolicies >= 4 ? ' hot' : '') + '">☭ ' + game.communistPolicies + '/6</span>' +
    '<span class="ba-chip' + (st.tracker >= 2 ? ' hot' : '') + '">Tracker ' + st.tracker + '/3</span>' +
    '<span class="ba-chip' + (st.zone ? ' hot' : ' ok') + '">Stalin Zone ' + (st.zone ? 'ON' : 'off') + '</span>' +
    '<span class="ba-chip' + (seen > capW ? ' hot' : '') + '">Audit ' + seen + '/' + capW + ' ★ claimed</span>' +
    (game.vetoUnlocked ? '<span class="ba-chip hot">Veto unlocked</span>' : '') + '</div>';

  html += '<div class="ba-gov">';
  A.people.forEach(function(p){
    html += '<div class="ba-card"><div class="ba-card-top"><span class="ba-role">' + p.label + '</span>' +
      (BA_STATS ? '<span class="ba-sus ' + p.susInfo.cls + '" title="Public suspicion">' + p.susInfo.label + ' ' + baPct(p.sus) + '</span>' : '') + '</div>' +
      '<div class="ba-name">' + baEsc(p.idx === A.h ? 'You' : p.name) + '</div>' +
      (BA_STATS && st.zone && p.label === 'Premier' ? '<div class="ba-fact warn">Stalin risk (table est.): ' + baPct(p.S) + '</div>' : '') +
      p.facts.map(function(f){ return '<div class="ba-fact ' + f.t + '">• ' + baEsc(f.x) + '</div>'; }).join('') + '</div>';
  });
  html += '</div>';

  if(lean){
    var pct = Math.round(100 * lean.exp / Math.max(1, lean.n));
    html += '<div class="ba-lean"><b>Expected table lean:</b> ~' + lean.exp.toFixed(1) + ' of ' + lean.n + ' other voters ДА (majority needs ' + lean.need + ' incl. you)' +
      '<div class="ba-bar"><div style="width:' + pct + '%"></div></div>' +
      'If you vote <b style="color:#86efac">ДА</b>: ~' + baPct(lean.passYes) + ' passes &nbsp;•&nbsp; <b style="color:#fca5a5">НЕТ</b>: ~' + baPct(lean.passNo) + ' passes' +
      (Math.abs(lean.passYes - lean.passNo) < 0.05 ? '<div class="ba-note">Your vote is unlikely to change the outcome — use your speech to shape it.</div>' : '') +
      '<div class="ba-note">Estimate from the public record only — hidden roles are not used.</div></div>';
  }
  if(rec){
    html += '<div class="ba-rec">🧭 <b>Analyst recommends: <b class="' + (rec.vote === 'ДА' ? 'ja' : 'nein') + '">' + rec.vote + '</b></b> (' + rec.conf + ')<ul>' +
      rec.why.map(function(w){ return '<li>' + baEsc(w) + '</li>'; }).join('') + '</ul></div>';
  }

  var base = lean ? lean.exp : 0;
  html += '<div class="ba-sec">Choose what to say</div>';
  args.forEach(function(a, i){
    var sway = '';
    if(lean){
      var d = {}; A.alive.forEach(function(j){ if(j !== A.h) d[j] = baBotDelta(j, a); });
      var sw = baLean(A, d).exp - base;
      sway = Math.abs(sw) < 0.15 ? 'little effect' : ((sw > 0 ? '+' : '−') + Math.abs(sw).toFixed(1) + ' ДА votes');
    }
    html += '<div class="ba-arg" onclick="deliverDynamicPersuasion(' + i + ')"><div class="ba-arg-top">' +
      '<span class="persuasion-tag ' + (a.stance === 'ja' ? 'tag-ja' : 'tag-nein') + '">' + (a.stance === 'ja' ? 'Urge ДА 👍' : 'Urge НЕТ 👎') + '</span>' +
      (BA_STATS ? '<span class="ba-str ' + a.strength + '">' + a.strength + '</span>' : '') + '<span class="ba-basis">' + a.basis + '</span>' +
      (sway ? '<span class="ba-sway">≈ ' + sway + '</span>' : '') + '</div>' +
      '<div class="persuasion-quote">"' + a.text + '"</div></div>';
  });
  html += (BA_STATS
      ? '<div class="ba-note">Bluffs can backfire: sharp bots call out arguments the facts do not support.</div>'
      : '<div class="ba-note">Stats are off. Bots that distrust you will discount what you say — check the Table vibe on the board. Turn stats on for odds and recommendations.</div>') +
    '</div><button class="btn secondary" onclick="renderHumanVoteScreen()">Cancel / Vote Directly</button>';
  document.getElementById('ac').innerHTML = html;
}

function deliverDynamicPersuasion(idx){
  sfx('click');
  var arg = window.currentDynamicPersuasion ? window.currentDynamicPersuasion[idx] : null;
  if(!arg) return;
  var A = baBuild(), before = (BA_STATS && BRAIN) ? baLean(A, null) : null, deltas = {}, list = [];
  A.alive.forEach(function(j){
    if(j === A.h) return;
    var d = baBotDelta(j, arg); deltas[j] = d;
    list.push({j:j, d:d, impact:(arg.stance === 'ja' ? d : -d), trust:baTrustOf(j)});
  });
  roundPersuasionModifier = {active:true, speakerName:'You', text:arg.text, stance:arg.stance, botModifiers:deltas};
  logSpeech('You', 'Speech', arg.text);

  list.sort(function(a, b){ return Math.abs(b.impact) - Math.abs(a.impact); });
  var reacts = list.filter(function(x){ return Math.abs(x.impact) >= 0.8 || x.trust <= -1.2; }).slice(0, 3).map(function(x){
    return '<div class="ba-react">💬 ' + baEsc(baName(x.j)) + ': "' + baReaction(game.players[x.j], x.impact, arg, x.trust) + '"</div>';
  }).join('');
  var after = before ? baLean(A, deltas) : null;
  var leanHTML = (before && after)
    ? '<div class="ba-lean"><b>Table lean:</b> ~' + before.exp.toFixed(1) + ' → <b>~' + after.exp.toFixed(1) + '</b> of ' + after.n + ' ДА<div class="ba-bar"><div style="width:' +
      Math.round(100 * after.exp / Math.max(1, after.n)) + '%"></div></div>If you vote ДА: ~' + baPct(after.passYes) + ' passes • НЕТ: ~' + baPct(after.passNo) + ' passes</div>' : '';

  document.getElementById('at').textContent = 'Persuasion Delivered';
  document.getElementById('ad').textContent = 'The comrades have heard you:';
  document.getElementById('ac').innerHTML =
    '<div class="speech-card player-speech"><div class="speech-name" style="color:#38bdf8">🗣️ You addressed the table' + (BA_STATS ? ' (' + arg.strength + ' • ' + arg.basis + ')' : '') + ':</div><div class="speech-text">"' + arg.text + '"</div></div>' +
    reacts + leanHTML +
    '<div class="vote-buttons" style="margin-top:12px"><button class="vote-btn ja" onclick="castVote(true)"><span>👍</span>ДА</button><button class="vote-btn nein" onclick="castVote(false)"><span>👎</span>НЕТ</button></div>';
}


// =====================================================================
// ====== v6: TRIPLE CARD CHECK + COMMUNIST PLAYBOOK (deep logic) ======
// =====================================================================
var FRAME_P = 0.7;
var COMM_PLAYS = {decoy:true, infight:true, stalinRecord:true};
var TRIPLE = {on:true};

// ---------- per-game state + red-herring selection ----------
var __bi6 = window.brainInit;
window.brainInit = function(){
  __bi6.apply(this, arguments);
  game.decoy = null; game.claimStats = {}; game.cardChecks = []; game.cycleId = 0; game.cycleBlame = {};
  if(!COMM_PLAYS.decoy || !BRAIN) return;
  // no one is assigned: an already-outted communist VOLUNTEERS later (see decoyUpdate)
};

// ---------- RED HERRING: the decoy plays loud, obvious communist ----------
var __ppd6 = window.pickPresidentDiscardIdx;
window.pickPresidentDiscardIdx = function(p, c, pol){
  var i = __ppd6(p, c, pol);
  if(COMM_PLAYS.decoy && game.decoy === p && game.roles[p] === 'communist' && pol.filter(function(x){ return x === 'white'; }).length === 1 && Math.random() < 0.95)
    return pol.indexOf('white');           // always pass two reds when possible
  return i;
};
var __pce6 = window.pickChancellorEnactIdx;
window.pickChancellorEnactIdx = function(ch, p, pol){
  var i = __pce6(ch, p, pol);
  if(COMM_PLAYS.decoy && game.decoy === ch && game.roles[ch] === 'communist' && pol.length === 2 && pol.indexOf('white') >= 0 && pol.indexOf('communist') >= 0 && Math.random() < 0.85)
    return pol.indexOf('communist');       // enacts red without hiding it
  return i;
};

// ---------- GOOD PLAY: build Stalin's clean record before the zone ----------
var __ib6 = window.involvementBonus;
window.involvementBonus = function(p, c){
  var b = __ib6(p, c);
  if(COMM_PLAYS.stalinRecord && game.roles[p] === 'communist' && game.roles[c] === 'stalin' && game.communistPolicies <= 2 && baPremierTerms(c) === 0) b += 0.9;
  return b;
};

// ---------- COMMUNIST INFIGHTING ----------
// (a) Distancing votes: vote NO on a publicly-suspicious teammate's government (never Stalin's) when it will pass anyway.
var __bdv6 = window.botDecideVote;
window.botDecideVote = function(botIdx){
  var v = __bdv6(botIdx);
  if(!COMM_PLAYS.infight || !v || !BRAIN || game.roles[botIdx] === 'white') return v;
  var P = game.currentPresident, C = game.nominatedChancellor;
  if(botIdx === P || botIdx === C || game.communistPolicies >= 3) return v;
  var mates = [P, C].filter(function(x){ return brainTeamBelief(botIdx, x) === 'communist'; });
  var stalinOn = [P, C].some(function(x){ return brainTeamBelief(botIdx, x) === 'stalin' || game.roles[x] === 'stalin'; });
  if(!mates.length || stalinOn) return v;
  var hot = mates.some(function(x){ return baRawPubF(x) >= 0.6 || game.decoy === x; });
  if(!hot || baRawPubF(botIdx) > 0.55) return v;                       // only distance if I look clean myself
  var st = brainState(), preds = brainPredictVotes(botIdx, P, C, st);
  var passIfNo = brainPassProbFrom(brainPassDist(preds, botIdx, st), 0, st.alive.length);
  if(passIfNo < 0.6) return v;                                          // don't sink my own team's ticket
  var lie = brainParams(botIdx).lie; if(lie === undefined) lie = 1;
  return Math.random() < 0.5 * lie ? false : v;
};

// (b) Sacrifice / loud-decoy accusations at investigation time.
var __bpi6 = window.brainPickInvestigation;
window.brainPickInvestigation = function(presIdx, candidates){
  var r = __bpi6(presIdx, candidates);
  if(!r) return r;
  var role = game.roles[presIdx], knows = (role === 'communist') || (role === 'stalin' && game.playerCount <= 6);
  if(COMM_PLAYS.decoy && game.decoy === presIdx && r.declared === 'White' && game.roles[r.target] === 'white' && Math.random() < 0.3) r.declared = 'Communist';
  if(COMM_PLAYS.infight && knows && role !== 'white'){
    var burn = null, best = 0;
    candidates.forEach(function(t){
      if(game.roles[t] !== 'communist') return;
      var f = baRawPubF(t), s = (game.decoy === t ? 0.3 : 0) + (f >= 0.6 ? f - 0.5 : 0);
      if((f >= 0.6 || game.decoy === t) && s > best){ best = s; burn = t; }
    });
    var lie = brainParams(presIdx).lie; if(lie === undefined) lie = 1;
    if(burn !== null && Math.random() < 0.35 * lie) r = {target:burn, declared:'Communist'};   // burn the obvious teammate to look honest
  }
  return r;
};

// (c) Staged claim fight: a clean-looking communist Secretary tells the TRUTH about a choice, exposing a lying communist Premier.
function brainPresClaim(presIdx, chancIdx, enacted, drawn, passed){
  var dD = drawn.filter(function(p){ return p === 'white'; }).length;
  var dP = passed.filter(function(p){ return p === 'white'; }).length;
  var cd = dD, pf = dP > 0, a = dP;
  if(isCommunist(game.roles[presIdx]) && enacted === 'communist'){
    var burn = COMM_PLAYS.infight && game.roles[presIdx] === 'communist' && game.roles[chancIdx] === 'communist' && dD > 0 && dP === 1 &&
      (game.decoy === chancIdx || baRawPubF(chancIdx) >= baRawPubF(presIdx) - 0.05) && Math.random() < 0.5;
    if(burn){ /* truthful claim: cd = dD, pf, a stay as drawn */ }
    else if(dD === 0){
      var chancF = isCommunist(game.roles[chancIdx]);
      if(!chancF && brainShouldFrame(presIdx, chancIdx)){
        var seen = (game.deckCycle && game.deckCycle.claimedDemSeen) || 0, cap = cycleWhiteCeiling();
        var canClaim2 = (seen + 2) <= cap, canClaim1 = (seen + 1) <= cap;
        if(canClaim2 && (!canClaim1 || Math.random() < 0.4)){ cd = 2; pf = true; a = 1; }
        else if(canClaim1){ cd = 1; pf = true; a = 1; }
        else { cd = 0; pf = false; a = 0; }
      } else { cd = 0; pf = false; a = 0; }
    } else { cd = 0; pf = false; a = 0; }
  }
  return {cd:cd, pf:pf, pa:a, quote:brainPresQuote(cd, a, game.players[chancIdx].name)};
}

// =====================================================================
// ==================== TRIPLE CARD CHECK ==============================
// 1st check : cross-check Secretary vs Premier (both directions + impossibilities)
// 2nd check : audit the CHECKER - who is more credible? (claim frequency, deck math,
//             past check record) -> blame split, most likely liar
// 3rd check : reconcile at the deck reshuffle (under/over-claims) and re-judge
// =====================================================================
function tcInit(){ if(!game.claimStats) game.claimStats = {}; if(!game.cardChecks) game.cardChecks = []; if(!game.cycleBlame) game.cycleBlame = {}; }
function tcStat(i){ tcInit(); if(!game.claimStats[i]) game.claimStats[i] = {pres:[], chanc:[], lost:0, won:0}; return game.claimStats[i]; }
function tcTail(k, m, p){ var s = 0; for(var x=k; x<=m; x++) s += brainC(m, x) * Math.pow(p, x) * Math.pow(1 - p, m - x); return s; }

function tcReliability(i, role, pd0){
  var s = tcStat(i), r = 0.7, notes = [];
  if(role === 'Secretary'){
    var m = s.pres.length, k = s.pres.filter(function(c){ return c.cd === 0; }).length;
    if(m >= 2){ var tl = tcTail(k, m, Math.max(0.15, pd0)); if(tl < 0.2){ r -= 0.3 * (1 - tl / 0.2); notes.push('3☭-draw claims ×' + k + '/' + m); } }
    var last = s.pres[s.pres.length - 1];
    if(last && last.cd === 0 && pd0 < 0.12){ r -= 0.25 * (1 - pd0 / 0.12); notes.push('3☭ draw unlikely at this deck state'); }
    if(((game.deckCycle && game.deckCycle.claimedDemSeen) || 0) > cycleWhiteCeiling()){ r -= 0.35; notes.push('★ claims exceed the deck'); }
  } else {
    var m2 = s.chanc.length, k2 = s.chanc.filter(function(c){ return c.t2; }).length;
    if(m2 >= 2){ var tl2 = tcTail(k2, m2, 0.4); if(tl2 < 0.2){ r -= 0.3 * (1 - tl2 / 0.2); notes.push('2☭-received claims ×' + k2 + '/' + m2); } }
  }
  r += -0.12 * s.lost + 0.08 * s.won;
  return {r:brainClamp(r, 0.05, 0.95), notes:notes};
}

function tcApply(blames, k){
  if(!BRAIN) return;
  var ids = Object.keys(blames).filter(function(x){ return blames[x] > 0; });
  if(!ids.length) return;
  var B = BRAIN, Lh = new Float64Array(B.H);
  for(var h=0; h<B.H; h++){
    var m = 1;
    for(var q=0; q<ids.length; q++) if(B.hRole[h][+ids[q]] !== 0) m *= 1 + k * blames[ids[q]];
    Lh[h] = m;
  }
  brainApplyVec(Lh, false);
}

function tripleCardCheck(P, C, enacted, cl){
  if(!TRIPLE.on || !BRAIN) return;
  tcInit();
  var round = game.whitePolicies + game.communistPolicies;
  var pa = (cl.pa === undefined) ? (cl.pf ? 1 : 0) : cl.pa, t2 = !!cl.t2;
  tcStat(P).pres.push({cd:cl.cd, pa:pa, round:round});
  tcStat(C).chanc.push({t2:t2, round:round});

  // ---- CHECK 1: cross-check ----
  var status = 'consistent', why = '', type = null;
  var forced = null;   // who MUST be lying when a claim is impossible given the enacted policy
  if(!Number.isInteger(Number(cl.cd)) || Number(cl.cd)<0 || Number(cl.cd)>3 ||
     !Number.isInteger(Number(pa)) || Number(pa)<0 || Number(pa)>2 ||
     Number(pa)>Number(cl.cd) || 2-Number(pa)>3-Number(cl.cd)){
    status='impossible'; forced=P; why='Secretary claimed a draw/pass combination that cannot physically occur'; type='impossible_claim';
  }
  else if(pa === 2 && enacted === 'communist'){ status = 'conflict'; forced = null; why = 'Secretary says two ★ were passed, yet a ☭ was enacted'; type = 'impossible_claim'; }
  else if(enacted === 'white' && t2){ status = 'impossible'; forced = C; why = 'Premier says 2 ☭ were received, yet a ★ was enacted'; type = 'impossible_claim'; }
  else if(enacted === 'white' && pa === 0){ status = 'impossible'; forced = P; why = 'Secretary says 2 ☭ were passed, yet a ★ was enacted'; type = 'impossible_claim'; }
  else if(pa > 0 && t2){ status = 'conflict'; why = 'Secretary says a ★ was passed, Premier says 2 ☭ were received'; type = 'choice_denial'; }
  else if(pa === 0 && !t2){ status = 'conflict_rev'; why = 'Secretary says 2 ☭ were passed, Premier says a ★ was received'; type = 'choice_denial_rev'; }
  game.cardChecks.push({round:round, cycle:game.cycleId || 0, P:P, C:C, status:status});
  if(status === 'consistent') return;
  addDispute(P, C, 'Contradiction: ' + why, type);

  // ---- CHECK 2: audit the checker(s) ----
  var st = brainState(enacted === 'communist' ? {r:-1, w:0} : {r:0, w:-1}), pd0 = st.pd[0] || 0.24;
  var rs = tcReliability(P, 'Secretary', pd0), rp = tcReliability(C, 'Premier', pd0);
  var fP = baRawPubF(P), fC = baRawPubF(C); if(fP === null) fP = 0.4; if(fC === null) fC = 0.4;
  // How plausible is each kind of lie for THIS conflict type (only non-Whites lie)
  var lieS = (status === 'conflict') ? 0.30 : 0.60, lieP = (status === 'conflict') ? 0.88 : 0.60; // v45: denial of a claimed choice usually favors Secretary, unless independent evidence disagrees
  var wS = fP * lieS * (1 + 2 * (0.7 - rs.r)), wP = fC * lieP * (1 + 2 * (0.7 - rp.r));
  if(forced === P) wS = 1e3; if(forced === C) wP = 1e3;
  if(!(wS > 0)) wS = 1e-6; if(!(wP > 0)) wP = 1e-6;
  // Unverified credibility is evidence, not a verdict. Keep both alternatives live.
  var blameS = brainClamp(wS / (wS + wP), forced === null ? 0.20 : 0, forced === null ? 0.80 : 1), blameP = 1 - blameS;
  var check = game.cardChecks[game.cardChecks.length - 1];
  check.blameS=blameS; check.blameP=blameP; check.claim={cd:cl.cd,pa:pa,t2:t2};
  check.resolved=false; check.forced=forced;
  var liar = blameS > blameP ? P : C, liarBlame = Math.max(blameS, blameP);
  tcApply((function(){ var o = {}; o[P] = blameS; o[C] = blameP; return o; })(), 1.4);
  game.cycleBlame[P] = (game.cycleBlame[P] || 0) + blameS;
  game.cycleBlame[C] = (game.cycleBlame[C] || 0) + blameP;
  // Do not award wins/losses for an unresolved accusation: that feeds its own bias.

  var nm = function(i){ return game.players[i].name; };
  logSpeech('Card Auditors', 'Triple Card Check',
    '① Cross-check: ' + why + '. ' +
    '② Checker check: Secretary ' + nm(P) + ' credibility ' + Math.round(rs.r * 100) + '%' + (rs.notes.length ? ' (' + rs.notes.join('; ') + ')' : '') +
    ' vs Premier ' + nm(C) + ' ' + Math.round(rp.r * 100) + '%' + (rp.notes.length ? ' (' + rp.notes.join('; ') + ')' : '') +
    ' → provisional blame: Secretary ' + Math.round(blameS * 100) + '%, Premier ' + Math.round(blameP * 100) + '%. Both remain under suspicion. ' +
    '③ Cycle reconciliation follows at the next reshuffle.', true);
}
var __bog6 = window.brainObserveGovernment;
window.brainObserveGovernment = function(P, C, e, cl){
  var r = __bog6(P, C, e, cl);
  try { tripleCardCheck(P, C, e, cl); } catch(err){}
  return r;
};

// ---- CHECK 3: cycle reconciliation at the reshuffle ----
var __hdr6 = window.handleDeckReshuffle;
window.handleDeckReshuffle = function(){
  var cyc = game.cycleId || 0, draws = (game.deckCycle && game.deckCycle.presDraws) || [];
  var au = reshuffleAudit(), disc = au.W - au.claimed;   // + = whites missing, - = extra whites claimed
  var recs = (game.cardChecks || []).filter(function(c){ return c.cycle === cyc && c.status !== 'consistent'; });
  var cycBlame = game.cycleBlame || {};
  __hdr6();
  game.cycleId = cyc + 1; game.cycleBlame = {};
  if(!TRIPLE.on || !recs.length || !BRAIN) return;

  var bl = {}, verdict;
  recs.forEach(function(rc){
    var c = tcStat(rc.P).pres.filter(function(x){ return true; });
    var claim = null; tcStat(rc.P).pres.forEach(function(x){ if(x.round === rc.round) claim = x; });
    if(!claim) return;
    if(disc > 0 && claim.cd === 0) bl[rc.P] = Math.min(1, (bl[rc.P] || 0) + 0.5 * au.lie);
    else if(disc < 0 && claim.cd > 0) bl[rc.P] = Math.min(1, (bl[rc.P] || 0) + 0.5);
    // Matching totals cannot prove a pass claim; offsetting lies remain possible.
    rc.audit={missing:au.missing,bottom:au.b,lie:au.lie,discrepancy:disc};
  });
  verdict = disc > 0 ? disc + ' ★ missing from claims → Secretaries who claimed 3☭ in disputed governments are re-judged as likelier liars'
          : (disc < 0 ? (-disc) + ' extra ★ claimed → Secretaries who claimed ★ draws in disputed governments are re-judged as likelier liars'
                      : 'draw totals reconcile, but passed-card claims remain unverified; neither participant is cleared');
  tcApply(bl, 1.0);
  Object.keys(bl).forEach(function(k){ cycBlame[k] = (cycBlame[k] || 0) + bl[k]; });
  var top = null, tv = 0;
  Object.keys(cycBlame).forEach(function(k){ if(cycBlame[k] > tv){ tv = cycBlame[k]; top = +k; } });
  logSpeech('Card Auditors', 'Triple Card Check ③',
    '③ Cycle reconciliation (' + recs.length + ' disputed government' + (recs.length > 1 ? 's' : '') + '): ' + verdict + '.' +
    (top !== null ? ' Most likely liar this cycle: ' + game.players[top].name + '.' : ''), true);
};

// ---- Card-check facts in the Board Analysis dossier ----
var __bf6 = window.baFacts;
window.baFacts = function(i){
  var f = __bf6(i), s = game.claimStats && game.claimStats[i];
  if(s){
    var m = s.pres.length, k = s.pres.filter(function(c){ return c.cd === 0; }).length;
    if(m >= 2 && k >= 2) f.push({t:'warn', x:'Claimed "3☭ drawn" ×' + k + ' of ' + m + ' terms as Secretary.'});
    var m2 = s.chanc.length, k2 = s.chanc.filter(function(c){ return c.t2; }).length;
    if(m2 >= 2 && k2 >= 2) f.push({t:'warn', x:'Reported "2☭ received" ×' + k2 + ' of ' + m2 + ' terms as Premier.'});
    if(s.lost) f.push({t:'bad', x:'Judged the less credible party in ' + s.lost + ' card-claim conflict' + (s.lost > 1 ? 's' : '') + '.'});
    if(s.won) f.push({t:'good', x:'Judged the more credible party in ' + s.won + ' card-claim conflict' + (s.won > 1 ? 's' : '') + '.'});
  }
  return f.slice(0, 9);
};


// =====================================================================
// ======= v7: VICTORY-DRIVEN VOTING, FEUDS, VOLUNTEER DECOY, HISTORY ====
// =====================================================================
var VOTE_LOGIC = {on:true};

// ---------- Volunteer decoy: nobody is assigned; an already-outted communist takes the heat ----------
function decoyUpdate(){
  if(!COMM_PLAYS.decoy || !BRAIN) return;
  if(game.decoy !== null && game.decoy !== undefined && game.players[game.decoy] && !game.players[game.decoy].isDead) return;
  game.decoy = null;
  var best = null, bs = 0, prior = baPrior();
  getAliveIndices().forEach(function(i){
    if(game.roles[i] !== 'communist') return;
    var f = baRawPubF(i), rec = game.playerRecords[i] || {};
    var accused = (rec.investigationsReceived || []).filter(function(x){ return x.declared === 'Communist'; }).length;
    var heat = (f - prior) + 0.15 * (rec.disputes || []).length + 0.25 * accused;
    if(f >= Math.max(0.5, prior + 0.15) && heat > bs){ bs = heat; best = i; }        // only someone already "somewhat outted"
  });
  if(best !== null && Math.random() < 0.25 + 0.6 * Math.min(1, bs)){ game.decoy = best; game.decoySince = game.whitePolicies + game.communistPolicies; }
}
var __bov7 = window.brainObserveVotes;
window.brainObserveVotes = function(p, c){ try { decoyUpdate(); } catch(e){} return __bov7(p, c); };

// ---------- Victory-driven vote guardrails (whites + communists) ----------
// Calibration fact (measured): in the Stalin Zone a nominee the bots rate at 0.2%-20% "Stalin"
// is really Stalin 10-36% of the time, because communist Secretaries nominate him on purpose.
// Only estimates < 0.2% (provably not Stalin) are trustworthy, so everything else gets a risk floor.
function zoneStalinRisk(pS){ return pS < 0.002 ? pS : Math.max(pS, 0.25); }

var __bdv7 = window.botDecideVote;
window.botDecideVote = function(b){
  var v = __bdv7(b);
  if(!BRAIN || !VOTE_LOGIC.on) return v;
  var P = game.currentPresident, C = game.nominatedChancellor;
  if(b === P || b === C) return v;
  var role = game.roles[b], st = brainState(), r = st.r, w = st.w, tr = st.tracker, zone = st.zone;

  // ---- COMMUNIST VICTORY RULES (win condition beats feud consistency) ----
  if(zone && game.roles[C] === 'stalin' && role === 'communist') return true;           // elect Stalin = win
  var knows = (role === 'communist') || (role === 'stalin' && game.playerCount <= 6);
  if(knows){
    var pW = game.roles[P] === 'white', cW = game.roles[C] === 'white';
    if(w === 4 && tr < 2 && pW && cW) return false;                                     // never hand Whites their 5th policy
    if(r >= 5 && tr < 2 && (!pW || !cW) && !(hasDispute(b, P) || hasDispute(b, C))) return true;                                   // a comrade on the ticket: finish with a 6th ☭
  }

  // ---- FEUDS: never vote YES for a Secretary/Premier you are publicly in a feud with ----
  if(tr < 2 && (hasDispute(b, P) || hasDispute(b, C))) return false;

  if(role === 'white'){
    var view = brainView(b), tk = brainTicket(view, P, C, st);
    var unconfirmed = zone && !game.confirmedNotStalin[C];
    var risk = unconfirmed ? zoneStalinRisk(view.S[C]) : 0;
    if(r >= 5 && tr >= 2) return (tk.eRed + risk) < st.pChaosRed;                       // chaos at 5 reds = ☭ top-deck loses the game
    if(unconfirmed && risk >= 0.02) return false;                                       // never elect a Premier who could be Stalin
    if(r >= 5 && tr < 2 && tk.eRed > 0.25) return false;                                // one more ☭ loses: no risky tickets
    return v;
  }
  if(knows){
    var pW2 = game.roles[P] === 'white', cW2 = game.roles[C] === 'white';
    if(zone && tr < 2 && pW2 && cW2 && Math.random() < 0.85) return false;             // don't confirm a White as "not Stalin"
  }
  return v;
};

// ---------- Nomination: never nominate someone you are in a feud with ----------
(function(){
  var src = pickNominationCore.toString();
  var a = "if(BOT_RULES.consistency && botPubliclyAccused(presIdx, i)) continue;";
  if(src.indexOf(a) < 0) return;
  try { window.pickNominationCore = (new Function('return ' + src.replace(a, a + " if(hasDispute(presIdx, i)) continue;")))(); } catch(e){}
})();

// ---------- Board Analysis: what each player enacted / claimed in government ----------
var __bf7 = window.baFacts;
window.baFacts = function(i){
  var f = __bf7(i), rec = game.playerRecords[i];
  var gov = (rec && rec.governments) || [];
  if(gov.length){
    f.push({t:'info', x:'📜 Government history (newest first):'});
    gov.slice(0, 4).forEach(function(g){
      var pol = isWhite(g.enacted) ? '★' : '☭', tone = isWhite(g.enacted) ? 'good' : 'bad', claim = g.claim || '', txt;
      if(g.role === 'Premier'){
        var how = !claim ? 'claim not recorded'
          : (/choice/i.test(claim) ? 'said they HAD A CHOICE'
          : (/two communist|2 communist|tied|handed me two/i.test(claim) ? 'said hands tied (received 2☭)'
          : (/two white|2 white/i.test(claim) ? 'said they received 2★' : 'claim: ' + claim)));
        txt = 'Rnd ' + g.round + ' Premier w/ ' + baName(g.partner) + ': enacted ' + pol + ' — ' + how + '.';
      } else {
        txt = 'Rnd ' + g.round + ' Secretary w/ ' + baName(g.partner) + ': enacted ' + pol + ' — ' +
          (claim ? 'said "' + claim.replace(/ to Premier [^.]+\./, '.').slice(0, 120) + '"' : 'claim not recorded');
      }
      f.push({t:tone, x:txt});
    });
  }
  return f;
};

// ---------- Clearer spectator label ----------
(function(){
  try {
    var el = document.getElementById('spectator-dashboard');   // label lives in the dashboard template; patched below in source
  } catch(e){}
})();


// =====================================================================
// ===== v8: INVESTIGATION TRUST LOGIC (no hidden-truth leaks, calibrated) =====
// =====================================================================

// ---- Blind Stalin (7+ players) must pick by BELIEF, not by secretly knowing who is Communist ----
var __bpi8 = window.brainPickInvestigation;
window.brainPickInvestigation = function(presIdx, candidates){
  var r = __bpi8(presIdx, candidates);
  if(game.roles[presIdx] === 'stalin' && game.playerCount > 6 && candidates.length){
    var view = brainView(presIdx), best = null, bu = -1e9;
    candidates.forEach(function(t){ var p = view.F[t], u = 4 * p * (1 - p) + 0.3 * brainRand(); if(u > bu){ bu = u; best = t; } });
    var truthF = game.roles[best] !== 'white', lie = brainParams(presIdx).lie; if(lie === undefined) lie = 1;
    var declared;
    if(truthF) declared = (Math.random() < 0.8) ? 'White' : 'Communist';        // he SEES the card after choosing: protects a comrade
    else declared = (Math.random() < 0.15 * lie) ? 'Communist' : 'White';       // rarely frames a White
    r = {target:best, declared:declared};
  }
  return r;
};

// ---- Claimer standing helpers ----
function baClaimerStanding(by){
  var rec = game.playerRecords[by] || {}, acc = 0, clr = 0;
  (rec.investigationsReceived || []).forEach(function(iv){ if(iv.declared === 'Communist') acc++; else clr++; });
  return (acc ? '; themself accused ×' + acc : '') + (clr ? '; themself cleared ×' + clr : '');
}

// ---- Persuasion: investigation arguments come from PUBLIC claims, weighted by the claimer's standing ----
var __gdp8 = window.generateDynamicPersuasionOptions;
window.generateDynamicPersuasionOptions = function(){
  var opts = __gdp8().filter(function(o){ return o.id !== 'inv_chanc_comm' && o.id !== 'inv_chanc_dem'; });
  var P = game.currentPresident, C = game.nominatedChancellor;
  [P, C].forEach(function(i){
    var rec = game.playerRecords[i]; if(!rec) return;
    (rec.investigationsReceived || []).forEach(function(iv){
      var f = baRawPubF(iv.by); if(f === null || f === undefined) f = baPrior();
      var w = brainClamp((1 - f) * 1.6, 0.3, 1.3), vibe = baVibeInfo(f).label.toLowerCase(), st = baClaimerStanding(iv.by);
      var pr = Math.round(60 + 30 * Math.min(1, w / 1.3));
      if(iv.declared === 'Communist')
        opts.push({id:'inv_claim_comm_' + iv.by + '_' + i, stance:'nein', priority:pr,
          text:baName(iv.by) + ' publicly investigated ' + baName(i) + ' and declared them a Communist. ' + baName(iv.by) + ' reads ' + vibe + ' at this table' + st + ' — weigh that claim accordingly.'});
      else
        opts.push({id:'inv_claim_dem_' + iv.by + '_' + i, stance:'ja', priority:pr,
          text:baName(iv.by) + ' publicly investigated ' + baName(i) + ' and declared them a loyal White. ' + baName(iv.by) + ' reads ' + vibe + ' at this table' + st + ' — a clear is worth what the clearer is worth.'});
    });
  });
  return opts;
};

// ---- Board Analysis facts: every check shows WHO made it and how much that person is trusted ----
var __bf8 = window.baFacts;
window.baFacts = function(i){
  var f = __bf8(i).filter(function(x){ return !/^(Accused of being Communist by|Declared White by) /.test(x.x); });
  var rec = game.playerRecords[i] || {}, add = [];
  (rec.investigationsReceived || []).forEach(function(iv){
    var fr = baRawPubF(iv.by), v = baVibeInfo(fr === null || fr === undefined ? baPrior() : fr), st = baClaimerStanding(iv.by);
    var weak = (v.label === 'Doubted' || v.label === 'Distrusted');
    if(iv.declared === 'Communist') add.push({t:weak ? 'warn' : 'bad', x:'Accused of being Communist by ' + baName(iv.by) + ' (' + v.label + st + ')' + (weak ? ' — a doubted accuser: discount it.' : '.')});
    else add.push({t:weak ? 'info' : 'good', x:'Declared White by ' + baName(iv.by) + ' (' + v.label + st + ')' + (weak ? ' — a doubted voucher: worth little.' : ' — a claim, not proof.')});
  });
  (rec.investigationsDone || []).forEach(function(iv){
    if(iv.declared === 'White') add.push({t:'info', x:'Vouched for ' + baName(iv.target) + ' as White.'});
  });
  return add.concat(f);
};

// ---- Spectator: drop the superfluous chaos stat ----
(function(){
  try {
    var st = document.getElementById('spec2-style');
    if(st && st.textContent) return;
    st = document.createElement('style'); st.id = 'spec2-style';
    st.textContent = '.spectator-summary{grid-template-columns:repeat(2,1fr) !important}';
    (document.head || document.body).appendChild(st);
  } catch(e){}
})();


// =====================================================================
// ===== v9: EVIDENCE-BASED ZONE TRUST + LATE-DECK SIGNAL + COMM PLANNING =====
// =====================================================================
var ZONE_QS = 0.5;        // P(a communist Secretary nominates Stalin | Stalin eligible, in the zone)
var ZONE_THETA = 0.10;    // whites say YES when the nomination-aware Stalin risk is at or below this

// REAL-EVIDENCE Stalin risk for a nominee in the zone. (Measured: numeric Stalin estimates carry almost no skill, so the
// risk starts at the honest base rate ~1/#unconfirmed and moves ONLY on concrete evidence.)
// Each white judges through THEIR OWN beliefs + temperament, so a table splits instead of voting as one block.
function zoneRiskDet(b, P, C, view){
  if(view.S[C] < 0.002) return view.S[C];                        // provably not Stalin (own investigation)
  var alive = getAliveIndices(), E = 0, prior = baPrior();
  alive.forEach(function(j){ if(j !== b && !game.confirmedNotStalin[j]) E++; });
  var R = 1 / Math.max(2, E);
  var fC = view.F[C], fP = view.F[P];                            // MY read of the nominee and of who nominated them
  var rec = game.playerRecords[C] || {}, whites = 0;
  game.policyHistory.forEach(function(x){ if(x.chancellor === C && x.policy === 'white') whites++; });
  R *= Math.pow(0.88, Math.min(2, whites));                      // tested record as Premier
  (rec.investigationsReceived || []).forEach(function(iv){        // clears/accusations, weighted by the claimer's standing
    var f = baRawPubF(iv.by); if(f === null || f === undefined) f = prior;
    var w = brainClamp((1 - f) * 1.6, 0.3, 1.3) / 1.3;
    R *= (iv.declared === 'White') ? (1 - 0.25 * w) : (1 + 0.6 * w);
  });
  if(game.lateWhite) R *= Math.pow(0.8, Math.min(2, game.lateWhite[P] || 0)) * Math.pow(0.9, Math.min(2, game.lateWhite[C] || 0));
  R *= fP <= prior - 0.12 ? 0.8 : (fP >= prior + 0.30 ? 1.8 : (fP >= prior + 0.15 ? 1.4 : 1));
  R *= fC <= prior - 0.12 ? 0.85 : (fC >= prior + 0.20 ? 1.4 : 1);
  if(isInAnyConflict(C)) R *= 1.5;
  if(game.confirmedNotStalin[P]) R *= 0.9;
  return Math.min(0.95, R);
}
function zoneTemperament(b){
  var pr = brainParams(b);
  return {bias:Math.exp(-pr.yesBias * 1.2) * (1 + pr.zoneCaution), sigma:0.15 + 0.35 * pr.noise};
}
// stochastic: what this particular white actually perceives right now
function zonePostS(b, P, C, view){
  var R = zoneRiskDet(b, P, C, view);
  if(R < 0.002) return R;
  var t = zoneTemperament(b);
  return Math.min(0.95, R * t.bias * Math.exp(t.sigma * brainRand() / 0.52));
}

// Whites replace the blunt "never elect anyone unconfirmed" rule with real, evidence-based risk.
(function(){
  var src = window.botDecideVote.toString();
  var a = src.indexOf("var risk = unconfirmed ? zoneStalinRisk(view.S[C]) : 0;");
  var b = src.indexOf("return v;\n  }\n  if(knows){");
  if(a < 0 || b < 0) return;
  var mid = "var risk = unconfirmed ? zonePostS(b, P, C, view) : 0;\n" +
    "    if(r >= 5 && tr >= 2) return (tk.eRed + risk) < st.pChaosRed;\n" +
    "    if(unconfirmed && risk > ZONE_THETA * (1 + 0.25 * tr)) return false;   // the bar loosens as failed governments pile up                        // a Premier who could plausibly be Stalin\n" +
    "    if(r >= 5 && tr < 2 && tk.eRed > 0.25) return false;                      // one more red loses\n" +
    "    if(zone) return tk.eRed <= 0.45;                                          // trusted Secretary + trusted Premier: approve\n    ";
  try { window.botDecideVote = (new Function('return ' + src.slice(0, a) + mid + src.slice(b)))(); } catch(e){}
})();

// Communists plan nominations against how Whites will REALLY vote in the zone.
function whiteZoneYesProb(j, P, C, st, view){
  if(game.confirmedNotStalin[C]) return 0.9;
  var R = zoneRiskDet(j, P, C, view);
  if(R < 0.002) return 0.9;
  var t = zoneTemperament(j);
  var z = (Math.log(ZONE_THETA * (1 + 0.25 * st.tracker)) - Math.log(Math.max(1e-4, R * t.bias))) / (t.sigma * 0.6);
  return brainClamp(1 / (1 + Math.exp(-z)), 0.03, 0.95);
}
var __bpv9 = window.brainPredictVotes;
window.brainPredictVotes = function(o, P, C, st){
  var out = __bpv9(o, P, C, st);
  if(st.zone && BRAIN && game.roles[o] !== 'white'){
    var pub = brainView(-1);
    st.alive.forEach(function(j){
      if(j === o || j === P || j === C || game.roles[j] !== 'white') return;
      out[j] = whiteZoneYesProb(j, P, C, st, pub);
    });
  }
  return out;
};

// ---- Late-deck white pass = costly signal (a Secretary who passes a ★ when ★ cards are scarce) ----
var __bog9 = window.brainObserveGovernment;
window.brainObserveGovernment = function(P, C, e, cl){
  var r = __bog9(P, C, e, cl);
  try {
    if(e === 'white' && BRAIN && game.policyDeck.length <= 5){
      var B = BRAIN, Lh = new Float64Array(B.H);
      for(var h=0; h<B.H; h++) Lh[h] = (B.hRole[h][P] !== 0 ? 0.65 : 1) * (B.hRole[h][C] !== 0 ? 0.85 : 1);
      brainApplyVec(Lh, false);
      if(!game.lateWhite) game.lateWhite = {};
      game.lateWhite[P] = (game.lateWhite[P] || 0) + 1;
    }
  } catch(err){}
  return r;
};
var __bf9 = window.baFacts;
window.baFacts = function(i){
  var f = __bf9(i);
  if(game.lateWhite && game.lateWhite[i]) f.unshift({t:'good', x:'Passed a ★ late in the deck ×' + game.lateWhite[i] + ' — a costly signal (★ cards were scarce).'});
  return f;
};
var __bi9 = window.brainInit;
window.brainInit = function(){ __bi9.apply(this, arguments); game.lateWhite = {}; };

// =====================================================================
// ===== Communist play: clean early, RUTHLESS once Whites are close =====
// =====================================================================
var COMM_TUNE = {urgency:true, passBoost:0, chancBoost:0};
var __bprp9 = window.brainPassRedProb;
window.brainPassRedProb = function(presIdx, chancIdx, st, params){
  var p = Math.min(1, __bprp9(presIdx, chancIdx, st, params) + COMM_TUNE.passBoost);
  if(COMM_TUNE.urgency){ if(st.w >= 4) p = 1; else if(st.w >= 3) p = Math.max(p, 0.92); }   // Whites near their 5th: always pass two reds
  return p;
};
var __bcc9 = window.brainCommChancRedProb;
window.brainCommChancRedProb = function(chancIdx, presIdx, st, params){
  var p = Math.min(1, __bcc9(chancIdx, presIdx, st, params) + COMM_TUNE.chancBoost);
  if(COMM_TUNE.urgency){ if(st.w >= 4) p = 1; else if(st.w >= 3) p = Math.max(p, 0.7); }   // never hand Whites the 5th policy
  return p;
};

// =====================================================================
// ===== Communist EVIDENCE ENGINEERING: invest early so the zone vote can pass =====
// =====================================================================
COMM_TUNE.recordBonus = 1.6;   // keep nominating Stalin until he has a tested ★ record
COMM_TUNE.invest = true;       // spend a ★ late in the deck to buy trust (costly signal)
function baWhitesAsPremier(i){ var n = 0; game.policyHistory.forEach(function(x){ if(x.chancellor === i && x.policy === 'white') n++; }); return n; }

var __ib9 = window.involvementBonus;
window.involvementBonus = function(p, c){
  var b = __ib9(p, c);
  if(COMM_PLAYS.stalinRecord && game.roles[p] === 'communist' && game.roles[c] === 'stalin' && game.communistPolicies <= 2 && baWhitesAsPremier(c) < 2)
    b += COMM_TUNE.recordBonus * (2 - baWhitesAsPremier(c)) / 2;
  return b;
};

var __ppd9 = window.pickPresidentDiscardIdx;
window.pickPresidentDiscardIdx = function(p, c, pol){
  var i = __ppd9(p, c, pol);
  if(COMM_TUNE.invest && game.roles[p] === 'communist' && game.communistPolicies <= 2 && game.policyDeck.length <= 5 &&
     game.roles[c] === 'stalin' && baWhitesAsPremier(c) < 2 && pol.indexOf('white') >= 0 && pol.indexOf('communist') >= 0)
    return pol.indexOf('communist');            // discard a red, keep a ★ choice for Stalin: his record AND my "late ★ pass" improve
  return i;
};

// ---- Inference gain: how strongly evidence moves beliefs (1.0 = perfectly calibrated to the bots' own behaviour = unreal omniscience) ----
// Per-table-size BALANCE DIAL. The communist team is always one short of a majority, so they must fool ONE white at odd
// tables but TWO at even tables. Even tables therefore need Whites that read people less sharply, odd tables more.
var INFER = {gain:1.5, byN:{}};   // one uniform setting: trust now comes from evidence, so no per-table-size dial is needed
var __bm9 = window.brainMul;
window.brainMul = function(w, Lh, g, owner){ var k = (BRAIN && INFER.byN && INFER.byN[BRAIN.n] !== undefined) ? INFER.byN[BRAIN.n] : INFER.gain; return __bm9(w, Lh, g * k, owner); };

// Evidence-engineering plays measured as net-negative are off by default (kept for experimentation)
COMM_PLAYS.stalinRecord = false; COMM_TUNE.invest = false; COMM_TUNE.recordBonus = 0;

// =====================================================================
// ===== Calibrated investigation likelihoods (measured from the bots' real behaviour) =====
// P(an investigator of this kind PICKS this specific target AND declares X). Whites are truthful; Communists mostly
// clear Stalin (the classic "vouch for the leader" play) and rarely touch teammates; blind Stalin picks by belief.
// =====================================================================
var INV_CAL = {
  W:  {w:[0.139, 0.000], c:[0.000, 0.156], s:[0.000, 0.155]},
  C:  {w:[0.055, 0.093], c:[0.005, 0.042], s:[0.340, 0.000]},
  Sb: {w:[0.115, 0.020], c:[0.144, 0.030], s:[0.001, 0.001]}
};
function brainInvLik(ri, rt, claimF){
  var cls = (ri === 0) ? 'W' : ((ri === 1 || (BRAIN && BRAIN.n <= 6)) ? 'C' : 'Sb');
  var v = INV_CAL[cls][rt === 0 ? 'w' : (rt === 1 ? 'c' : 's')][claimF ? 1 : 0];
  return Math.max(v, 1e-4);
}


// =====================================================================
// ===== v10 LOGIC: everyone checked, bold communists, voting bloc, judgment record =====
// =====================================================================
var COMM_BOLD = {on:true};

// ---------- per-game state ----------
var __bi10 = window.brainInit;
window.brainInit = function(){
  __bi10.apply(this, arguments);
  game.voteLog = []; game.calls = []; game.rep = {}; game.userFascistGuess = [];
};

// ---------- (1) EVERYONE CHECKED before the zone ----------
function baServed(i){ var s = false; game.policyHistory.forEach(function(x){ if(x.president === i || x.chancellor === i) s = true; }); return s; }
function baTurnsUntilPresident(i){
  var n = game.playerCount, idx = game.currentPresident, d = 0;
  for(var step=1; step<=n; step++){ idx = (idx + 1) % n; if(game.players[idx].isDead) continue; d++; if(idx === i) return d; }
  return 99;
}
var __ib10 = window.involvementBonus;
window.involvementBonus = function(p, c){
  var b = __ib10(p, c);
  if(game.communistPolicies >= 3 || !BOT_RULES2.involvement) return b;
  if(baServed(c) || isInAnyConflict(c) || hasDispute(p, c)) return b;                 // dispute/feud: not forced
  try { if(BRAIN && brainView(p).F[c] >= 0.85) return b; } catch(e){}                  // never force a known communist
  // someone who will be Secretary soon gets checked anyway: spend the Premier slot on someone who would not be
  return b + (baTurnsUntilPresident(c) <= 3 ? -0.8 : 2.2 + 0.4 * game.communistPolicies);
};

// ---------- (2) BOLD COMMUNISTS: pass reds, enact reds, bluff afterwards ----------
var __bprp10 = window.brainPassRedProb;
window.brainPassRedProb = function(presIdx, chancIdx, st, params){
  var p = __bprp10(presIdx, chancIdx, st, params);
  if(!COMM_BOLD.on) return p;
  return Math.max(p, (st.r >= 2 || st.w >= 2) ? 0.98 : 0.92);        // almost always pass two reds when able, especially later
};
var __bcc10 = window.brainCommChancRedProb;
window.brainCommChancRedProb = function(chancIdx, presIdx, st, params){
  var p = __bcc10(chancIdx, presIdx, st, params);
  if(!COMM_BOLD.on || brainTeamBelief(chancIdx, presIdx) === 'stalin') return p;
  // not afraid of feuds or blame: red on the board is the goal (and the claim afterwards is the bluff)
  return Math.max(p, (st.r >= 3 || st.w >= 3) ? 1.0 : ((st.r >= 2 || st.w >= 2) ? 0.95 : 0.78));
};

// ---------- (3) VOTING BLOC: visible, and factored into the White vote ----------
function blocTally(){
  var m = {};
  (game.voteLog || []).forEach(function(e){
    if(!e.zone || e.passed) return;                                    // yes-voters on governments the table rejected, in the zone
    Object.keys(e.votes).forEach(function(k){ k = +k; if(k !== e.pres && k !== e.chanc && e.votes[k]) m[k] = (m[k] || 0) + 1; });
  });
  return m;
}
function blocMembers(){ var m = blocTally(); return Object.keys(m).filter(function(k){ return m[k] >= 2; }).map(Number); }

var __bov10 = window.brainObserveVotes;
window.brainObserveVotes = function(P, C){
  try { recordVoteLog(P, C); } catch(e){}
  var r = __bov10(P, C);
  try { resolveCalls(); } catch(e){}
  return r;
};
function recordVoteLog(P, C){
  if(!game.voteLog) game.voteLog = [];
  var alive = getAliveIndices(), da = 0, votes = {};
  alive.forEach(function(j){ votes[j] = !!game.votes[j]; if(game.votes[j]) da++; });
  var passed = da > alive.length - da, zone = game.communistPolicies >= 3;
  var vi = game.voteLog.length;
  game.voteLog.push({pres:P, chanc:C, votes:votes, passed:passed, zone:zone, round:game.whitePolicies + game.communistPolicies});
  if(zone && !passed && BRAIN){                                          // repeat yes-voters on rejected zone governments look like a bloc
    var m = blocTally(), B = BRAIN, who = alive.filter(function(j){ return j !== P && j !== C && votes[j] && m[j] >= 2; });
    if(who.length){
      var Lh = new Float64Array(B.H);
      for(var h=0; h<B.H; h++){ var x = 1; who.forEach(function(j){ if(B.hRole[h][j] !== 0) x *= Math.pow(2.2, Math.min(3, m[j] - 1)); }); Lh[h] = x; }
      brainApplyVec(Lh, false);
    }
  }
  // every vote is a call: YES trusts the ticket, NO distrusts its more suspicious half
  var pub = BRAIN ? brainView(-1) : null;
  alive.forEach(function(j){
    if(j === P || j === C) return;
    if(votes[j]){ recordCall(j, P, true, 0.1, 'vote', vi); recordCall(j, C, true, 0.1, 'vote', vi); }
    else if(pub){ recordCall(j, pub.F[P] >= pub.F[C] ? P : C, false, 0.12, 'vote', vi); }
  });
}

// White voters weigh the bloc: bloc members voting YES on this nominee = a bloc candidate; bloc voting NO = probably clean
(function(){
  var src = zoneRiskDet.toString();
  var a = "return Math.min(0.95, R);";
  if(src.lastIndexOf(a) < 0) return;
  var i = src.lastIndexOf(a);
  var add = "var _m = blocTally(), _by = 0, _bn = 0;\n" +
    "  Object.keys(game.votes || {}).forEach(function(k){ k = +k; if(k === P || k === C || k === b || !(_m[k] >= 2)) return; if(game.votes[k] === true) _by++; else if(game.votes[k] === false) _bn++; });\n" +
    "  R *= (1 + 0.6 * _by) * Math.pow(0.7, _bn);\n  ";
  try { window.zoneRiskDet = (new Function('return ' + src.slice(0, i) + add + src.slice(i)))(); } catch(e){}
})();

// Communists hide the bloc when the vote is doomed anyway
var __bdv10 = window.botDecideVote;
window.botDecideVote = function(b){
  var v = __bdv10(b);
  if(!v || !BRAIN || !COMM_BOLD.on || game.roles[b] === 'white') return v;
  var P = game.currentPresident, C = game.nominatedChancellor;
  if(b === P || b === C || game.communistPolicies < 3) return v;
  var st = brainState(), preds = brainPredictVotes(b, P, C, st), dist = brainPassDist(preds, b, st), A = st.alive.length;
  var pYes = brainPassProbFrom(dist, 1, A), pNo = brainPassProbFrom(dist, 0, A);
  if(pYes < BAL.doomP && pYes - pNo < BAL.doomGap) return Math.random() < 0.2 ? v : false;     // my YES would only expose the bloc
  return v;
};

// ---------- (4) JUDGMENT RECORD: votes, marks, arguments and checks are CALLS that get judged ----------
function recordCall(by, target, trust, w, kind, vi){
  if(by === target || by === undefined || target === undefined) return;
  if(!game.calls) game.calls = [];
  game.calls.push({by:by, target:target, trust:trust, w:w, kind:kind, vi:(vi === undefined ? (game.voteLog || []).length : vi), done:false});
}
function resolveCalls(){
  if(!game.calls || !BRAIN || !game.calls.length) return;
  var prior = baPrior(), L = (game.voteLog || []).length, adj = {}, any = false;
  if(!game.rep) game.rep = {};
  game.calls.forEach(function(c){
    if(c.done) return;
    if(L - c.vi > 14){ c.done = true; return; }
    if(L - c.vi < 2) return;                                             // wait for the table to learn more
    var f = baRawPubF(c.target); if(f === null || f === undefined) return;
    var good = c.trust ? (f <= prior - 0.18) : (f >= prior + 0.22);
    var bad = c.trust ? (f >= prior + 0.22) : (f <= prior - 0.18);
    if(!good && !bad) return;
    c.done = true; c.right = good; any = true;
    var r = game.rep[c.by] || (game.rep[c.by] = {r:0, w:0});
    if(good) r.r += c.w; else r.w += c.w;
    adj[c.by] = (adj[c.by] || 0) + (good ? -1 : 1) * c.w;
  });
  if(!any) return;
  var B = BRAIN, ids = Object.keys(adj), Lh = new Float64Array(B.H);
  for(var h=0; h<B.H; h++){
    var x = 1;
    ids.forEach(function(k){ if(B.hRole[h][+k] !== 0) x *= brainClamp(Math.exp(0.14 * adj[k]), 0.6, 1.7); });
    Lh[h] = x;
  }
  brainApplyVec(Lh, false);
}
// bots' own public checks are calls too
var __boi10 = window.brainObserveInvestigation;
window.brainObserveInvestigation = function(presIdx, target, declaredTeam){
  try { recordCall(presIdx, target, declaredTeam !== 'Communist', 0.8, 'check'); } catch(e){}
  return __boi10(presIdx, target, declaredTeam);
};
// the human's marks and speech
var __ts10 = window.toggleSuspect;
window.toggleSuspect = function(i){ var had = (game.userSuspects || []).indexOf(i) >= 0; var r = __ts10(i); if(!had && (game.userSuspects || []).indexOf(i) >= 0) recordCall(game.humanPlayerIndex, i, false, 1.0, 'mark'); return r; };
var __tt10 = window.toggleTrust;
window.toggleTrust = function(i){ var had = (game.userTrusted || []).indexOf(i) >= 0; var r = __tt10(i); if(!had && (game.userTrusted || []).indexOf(i) >= 0) recordCall(game.humanPlayerIndex, i, true, 1.0, 'mark'); return r; };
var __dp10 = window.deliverDynamicPersuasion;
window.deliverDynamicPersuasion = function(idx){
  var arg = window.currentDynamicPersuasion ? window.currentDynamicPersuasion[idx] : null, h = game.humanPlayerIndex;
  if(arg && h >= 0){
    recordCall(h, game.nominatedChancellor, arg.stance === 'ja', 0.6, 'speech');
    if(arg.stance === 'ja') recordCall(h, game.currentPresident, true, 0.4, 'speech');
  }
  return __dp10(idx);
};

// ---------- facts: bloc + judgment record ----------
var __bf10 = window.baFacts;
window.baFacts = function(i){
  var f = __bf10(i), m = blocTally(), r = game.rep && game.rep[i];
  if(r && (r.r + r.w) >= 1.2) f.unshift({t:(r.r >= r.w ? 'good' : 'bad'), x:'Judgment record: ' + r.r.toFixed(1) + ' calls proved right / ' + r.w.toFixed(1) + ' wrong (votes, marks, arguments, checks).'});
  return f;
};
// Voting-bloc patterns remain available to the bot inference engine, without public labels.


// =====================================================================
// ===== v10 UI: dramatic final card, Stalin guess, reshuffle screen, dossier =====
// =====================================================================
(function(){
  try {
    if(document.getElementById('ui10-style') && document.getElementById('ui10-style').textContent) return;
    var st = document.createElement('style'); st.id = 'ui10-style';
    st.textContent =
      '.drama-overlay{position:fixed;inset:0;z-index:10000;background:rgba(5,6,10,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;transition:opacity 1s}' +
      '.drama-overlay.reveal{opacity:0}' +
      '.drama-card{width:130px;height:190px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:4.5rem;border:3px solid #fff;animation:dramaDrop 1.3s cubic-bezier(.2,1.4,.4,1) both}' +
      '.drama-card.white{background:linear-gradient(160deg,#1e3a8a,#3b82f6);color:#fff}.drama-card.comm{background:linear-gradient(160deg,#7f1d1d,#ef4444);color:#fff}' +
      '.drama-text{margin-top:22px;font-weight:900;letter-spacing:3px;color:#fff;text-transform:uppercase;font-size:1.05rem;animation:dramaFade 1.6s both}' +
      '@keyframes dramaDrop{0%{transform:translateY(-120vh) rotate(-25deg) scale(1.4);opacity:0}70%{transform:translateY(0) rotate(3deg) scale(1)}85%{transform:translateY(-12px)}100%{transform:translateY(0) rotate(0)}}' +
      '@keyframes dramaFade{0%,55%{opacity:0}100%{opacity:1}}' +
      '.track-slot.slam{animation:slamSlot 1.2s ease-out}@keyframes slamSlot{0%{transform:scale(1.8);box-shadow:0 0 40px #fff}100%{transform:scale(1)}}' +
      '.shuffle-overlay{position:fixed;inset:0;z-index:10000;background:rgba(5,6,10,.95);display:flex;align-items:center;justify-content:center;padding:14px}' +
      '.shuffle-box{max-width:460px;width:100%;max-height:92vh;overflow:auto;background:var(--panel);border:2px solid var(--g);border-radius:14px;padding:16px;text-align:left}' +
      '.shuffle-box h2{color:var(--g);text-transform:uppercase;letter-spacing:1.5px;margin:0 0 8px;text-align:center}' +
      '.shuffle-stat{font-size:1.05rem;font-weight:800;text-align:center;margin:6px 0}.shuffle-row{font-size:.8rem;margin:3px 0;color:var(--t)}.shuffle-row.warn{color:#fde68a}.shuffle-row.bad{color:#fca5a5}' +
      '.fasc-btn{background:#11141d;border:1px solid var(--border);color:var(--td);border-radius:6px;font-size:.62rem;padding:3px 5px;cursor:pointer}.fasc-btn.active{border-color:#a855f7;color:#d8b4fe}' +
      '.badge-guess{background:rgba(168,85,247,.18);border:1px solid #a855f7;color:#d8b4fe}';
    (document.head || document.body).appendChild(st);
  } catch(e){}
})();

// ---- Dramatic final policy ----
var __eg11 = window.endGame;
window.endGame = function(winner, reason){
  if(SIM_MODE || !/policies enacted/.test(reason || '') || game.gameOver) return __eg11(winner, reason);
  game.gameOver = true; game.winner = winner;                          // freeze the game while the card lands
  var white = (winner === 'white'), n = white ? game.whitePolicies : game.communistPolicies, ov;
  try {
    ov = document.createElement('div'); ov.className = 'drama-overlay';
    ov.innerHTML = '<div class="drama-card ' + (white ? 'white' : 'comm') + '">' + (white ? '★' : '☭') + '</div><div class="drama-text">' + (white ? 'White' : 'Communist') + ' policy #' + n + ' is placed on the board…</div>';
    document.body.appendChild(ov); sfx('policy');
  } catch(e){ ov = null; }
  setTimeout(function(){
    if(ov) ov.className += ' reveal';
    try { var slots = document.querySelectorAll(white ? '#dt .track-slot' : '#ct .track-slot'); if(slots.length) slots[Math.min(n, slots.length) - 1].className += ' slam'; } catch(e){}
  }, 1900);
  setTimeout(function(){ try { if(ov && ov.parentNode) ov.parentNode.removeChild(ov); } catch(e){} game.gameOver = false; __eg11(winner, reason); }, 3500);
};

// ---- Stalin: private "my fascists" guesses (never read by any bot, never shown to anyone else) ----
function toggleFascistGuess(i){
  sfx('click');
  if(!game.userFascistGuess) game.userFascistGuess = [];
  var k = game.userFascistGuess.indexOf(i);
  if(k >= 0) game.userFascistGuess.splice(k, 1);
  else if(game.userFascistGuess.length < getRoleDistribution(game.playerCount).communists) game.userFascistGuess.push(i);
  else sfx('alert');
  renderPlayers();
}
function baStalinGuessInject(){
  try {
    if(game.mode !== 'bots' || game.humanPlayerIndex < 0 || game.roles[game.humanPlayerIndex] !== 'stalin' || game.gameOver) return;
    document.querySelectorAll('.player-card').forEach(function(card){
      var btn = card.querySelector('.trust-btn'); if(!btn) return;
      var m = (btn.getAttribute('onclick') || '').match(/toggleTrust\((\d+)\)/); if(!m) return;
      var i = +m[1], acts = card.querySelector('.player-card-actions'); if(!acts || acts.querySelector('.fasc-btn')) return;
      var on = (game.userFascistGuess || []).indexOf(i) >= 0, b = document.createElement('button');
      b.className = 'fasc-btn' + (on ? ' active' : ''); b.textContent = on ? '🎭 Fasc?' : '🎭 Guess';
      b.setAttribute('onclick', 'toggleFascistGuess(' + i + '); event.stopPropagation();'); acts.appendChild(b);
      if(on){ var tag = document.createElement('span'); tag.className = 'player-role-badge badge-guess'; tag.textContent = '🎭 YOUR GUESS (private)'; card.insertBefore(tag, acts); }
    });
  } catch(e){}
}
var __rp11 = window.renderPlayers;
window.renderPlayers = function(){ var r = __rp11.apply(this, arguments); baStalinGuessInject(); return r; };

// ---- Deck reshuffle announcement (before the next vote) ----
function buildReshuffleInfo(){
  var dc = game.deckCycle || {presDraws:[]}, draws = dc.presDraws || [], actual = 0, claimed = 0;
  draws.forEach(function(d){ actual += d.actualDem; claimed += d.claimedDem; });
  var au = reshuffleAudit(), disc = au.W - au.claimed, could = [], contra = [];
  draws.forEach(function(d){
    var room = disc > 0 ? 3 - d.claimedDem : (disc < 0 ? d.claimedDem : 0);
    if(room > 0) could.push(baName(d.pres) + ' (claimed ' + d.claimedDem + '★; could be off by up to ' + room + ')');
  });
  (game.cardChecks || []).forEach(function(c){ if(c.cycle === (game.cycleId || 0) && c.status !== 'consistent') contra.push(baName(c.C) + ' contradicted Secretary ' + baName(c.P)); });
  return {au:au, cap:cycleWhiteCeiling(), claimed:claimed, disc:disc, draws:draws, could:could, contra:contra, left:game.policyDeck.length};
}
function showReshuffleOverlay(info, done){
  var fin = false, ov = null;
  function go(){ if(fin) return; fin = true; try { if(ov && ov.parentNode) ov.parentNode.removeChild(ov); } catch(e){} done(); }
  try {
    var rows = info.draws.map(function(d){ return '<div class="shuffle-row">Rnd ' + d.round + ' · Secretary ' + baEsc(baName(d.pres)) + ' reported drawing ' + d.claimedDem + '★</div>'; }).join('') || '<div class="shuffle-row">No Secretary reports this cycle.</div>';
    var verdict = info.disc > 0 ? (info.au.lie >= 1
      ? '<div class="shuffle-row bad">' + info.disc + ' ★ unaccounted for, but only ' + info.au.b + ' card(s) were left at the bottom, so someone definitely lied.</div>'
      : '<div class="shuffle-row warn">' + info.disc + ' ★ unaccounted for. They could be the ' + info.au.b + ' unseen bottom card(s) (' + (info.au.pBottom * 100).toFixed(2) + '% chance). Nobody necessarily lied, but there is a ~' + Math.round(info.au.lie * 100) + '% chance someone did.</div>')
      : (info.disc < 0 ? '<div class="shuffle-row bad">' + (-info.disc) + ' more ★ were claimed than existed — someone invented white cards.</div>'
      : '<div class="shuffle-row">Every reported ★ reconciles with the deck.</div>');
    ov = document.createElement('div'); ov.className = 'shuffle-overlay';
    ov.innerHTML = '<div class="shuffle-box"><h2>🎴 Deck Reshuffle</h2><div class="shuffle-row" style="text-align:center">Only ' + info.left + ' policies were left — the discard pile is shuffled back in.</div>' +
      '<div class="shuffle-stat">★ accounted for: ' + info.claimed + ' of ' + info.cap + '</div>' + verdict +
      '<div class="ba-sec">Secretary reports this cycle</div>' + rows +
      '<div class="ba-sec">Who could have lied</div>' + (info.could.concat(info.contra).map(function(x){ return '<div class="shuffle-row warn">⚠ ' + baEsc(x) + '</div>'; }).join('') || '<div class="shuffle-row">Nobody is forced to have lied.</div>') +
      '<button class="btn" id="shuffle-go" style="margin-top:12px">Continue</button></div>';
    document.body.appendChild(ov);
    var b = document.getElementById('shuffle-go'); if(b) b.onclick = go;
    if(game.mode === 'watch') setTimeout(go, 5000);
  } catch(e){ go(); }
}
var __sr11 = window.startRound;
window.startRound = function(){
  if(SIM_MODE || game.gameOver || game.policyDeck.length >= 3) return __sr11();
  var info = buildReshuffleInfo();
  handleDeckReshuffle();                                               // rule: shuffle the moment fewer than 3 policies remain
  showReshuffleOverlay(info, function(){ __sr11(); });
};

// ---- Dossier: which numbered policy each term enacted + WHY the table trusts/distrusts ----
var __ep11 = window.enactPolicy;
window.enactPolicy = function(policy){
  var ord = (policy === 'communist' ? game.communistPolicies : game.whitePolicies) + 1, P = game.currentPresident, C = game.currentChancellor;
  var r = __ep11(policy);
  try { [P, C].forEach(function(i){ var g = game.playerRecords[i] && game.playerRecords[i].governments[0]; if(g) g.ord = ord; }); } catch(e){}
  return r;
};
function humanCredBreakdown(){
  var h = game.humanPlayerIndex, out = [], uv = game.unjustifiedVotes && game.unjustifiedVotes[h], add = function(v, x){ if(v) out.push((v > 0 ? '+' : '') + v.toFixed(1) + '  ' + x); };
  var cr = 0, dw = 0;
  game.policyHistory.forEach(function(x){ if(x.chancellor === h){ if(x.policy === 'communist') cr++; else dw++; } });
  add(-2.5 * cr, 'enacted ☭ as Premier ×' + cr); add(1.5 * dw, 'enacted ★ as Premier ×' + dw);
  if(game.mildSuspicionPresidents[h]) add(-1, 'deck-audit flag');
  if(uv){ add(-0.8 * uv.susYes, 'voted ДА on suspect governments ×' + uv.susYes); add(-0.8 * uv.badNo, 'voted НЕТ on publicly supported governments ×' + uv.badNo); if(game.communistPolicies >= 3) add(-1.5 * uv.blocCount, 'minority-bloc votes ×' + uv.blocCount); }
  if(game.confirmedNotStalin[h]) add(1.5, 'Confirmed Not Stalin');
  add(baTableTrust(), 'the table\'s shared belief about you (checks, votes, claims, judgment record all feed this)');
  return out;
}
function explainTrustHTML(i){
  if(!BRAIN || !game.players[i]) return '';
  var f = baRawPubF(i); if(f === null || f === undefined) return '';
  var prior = baPrior(), v = baVibeInfo(f), me = (i === game.humanPlayerIndex), items = [];
  items.push('Table read: <b>' + v.icon + ' ' + v.label + '</b> — suspicion ' + Math.round(f * 100) + '% against a ' + Math.round(prior * 100) + '% baseline.');
  baFacts(i).filter(function(x){ return !/Government history|^Rnd /.test(x.x); }).slice(0, 10).forEach(function(x){
    items.push('<span style="color:' + (x.t === 'good' ? '#86efac' : (x.t === 'bad' ? '#fca5a5' : (x.t === 'warn' ? '#fde68a' : 'var(--td)'))) + '">• ' + baEsc(x.x) + '</span>');
  });
  var html = '<div class="dossier-section"><div class="dossier-section-title">Why the table ' + (v.cls === 'good' ? 'trusts' : (v.cls === 'info' ? 'is unsure about' : 'distrusts')) + ' ' + (me ? 'you' : baEsc(baName(i))) + '</div>' +
    items.map(function(x){ return '<div class="dossier-item" style="font-size:.76rem">' + x + '</div>'; }).join('');
  if(me) html += '<div class="dossier-item" style="font-size:.74rem;color:var(--td)">This one table read is everything: bots believe your Sus/Trust marks and arguments in proportion to it.</div>';
  return html + '</div>';
}
var __od11 = window.openDossier;
window.openDossier = function(i){
  __od11(i);
  try {
    var body = document.getElementById('dossier-body'); if(!body) return;
    var html = body.innerHTML.replace(/<div class="dossier-section"><div class="dossier-section-title">Your Table Credibility Standing<\/div>[\s\S]*?<\/div><\/div>/, ''), gov = (game.playerRecords[i] && game.playerRecords[i].governments) || [], k = 0, s = html.indexOf('Government Terms Served');
    if(s >= 0) html = html.slice(0, s) + html.slice(s).replace(/(Enacted: <span[^>]*>)(WHITE|COMMUNIST)(<\/span>)/g, function(all, a, w, c){
      var g = gov[k++], ord = g && g.ord;
      return a + w + c + (ord ? ' <span style="color:var(--td);font-size:.72rem">(#' + ord + ' ' + (w === 'WHITE' ? '★' : '☭') + ' on the board)</span>' : '');
    });
    body.innerHTML = html + explainTrustHTML(i);
  } catch(e){}
};



// =====================================================================
// ===== v11: believable Stalin nominations, split comm votes, fairer white approval =====
// =====================================================================
var BAL = {stalinGate:30, splitProb:0.55, baseK:0.95, rejectMult:1.4, passMin:0.65, doomP:0.5, doomGap:0.2, maxGiveaway:1.5};

// (1) Communists nominate Stalin only when it will really pass (otherwise: push reds, build trust, wait).
var __ib12 = window.involvementBonus;
window.involvementBonus = function(p, c){
  var b = __ib12(p, c);
  if(!BRAIN || game.communistPolicies < 3 || game.roles[p] !== 'communist' || game.roles[c] !== 'stalin') return b;
  var st = brainState(), pr = brainPredictVotes(p, p, c, st); pr[p] = 1;
  var pass = brainPassProbFrom(brainPassDist(pr, c, st), 1, st.alive.length);
  var prior = baPrior(), f = baRawPubF(c); if(f === null || f === undefined) f = prior;
  var zoneVotes = 0; (game.voteLog || []).forEach(function(e){ if(e.zone) zoneVotes++; });
  var pen = BAL.stalinGate * (1 - pass) + (pass < BAL.passMin ? 4 + 10 * (BAL.passMin - pass) : 0);
  if(!baServed(c) || f > prior + 0.12 || isInAnyConflict(c)) pen += 6;        // no clean track record yet: not believable
  if(zoneVotes === 0 && pass < 0.75) pen += 6;                                  // patience: never the very first move in the zone
  // MIXED STRATEGY: never make "Stalin gets nominated" readable. Cap how much more often than chance he is the pick
  // (almost-certain wins excepted), decided once per nomination so retries cannot raise it.
  var key = (game.voteLog || []).length + ':' + p;
  if(!game._skipKey || game._skipKey !== key){
    var alive = getAliveIndices(), elig = alive.filter(function(j){ return j !== p && j !== game.lastGovernment.chancellor && !(alive.length > 5 && j === game.lastGovernment.president); }).length;
    var allowed = Math.min(1, (1 / Math.max(1, elig)) * BAL.maxGiveaway * (0.4 + 1.2 * pass));
    game._skipKey = key; game._skipStalin = Math.random() > allowed;
  }
  if(game._skipStalin) pen += 60;
  return b - pen;                                                               // an unbelievable Stalin nomination is a giveaway
};

// (2) Whites: approve anyone without adverse evidence (bar scales with the honest base risk), and a nominee the
//     table already rejected in the zone is a warning sign.
var __zrd12 = window.zoneRiskDet;
window.zoneRiskDet = function(b, P, C, view){
  var R = __zrd12(b, P, C, view);
  if(R < 0.002) return R;
  var rej = 0;
  (game.voteLog || []).forEach(function(e){ if(e.zone && !e.passed && e.chanc === C) rej++; });
  R *= Math.pow(BAL.rejectMult, Math.min(3, rej));
  var E = 0; getAliveIndices().forEach(function(j){ if(j !== b && !game.confirmedNotStalin[j]) E++; });
  var th = Math.max(ZONE_THETA, BAL.baseK / Math.max(2, E));
  return Math.min(0.95, R * ZONE_THETA / th);
};

// (3) Communist votes are NOT automatic: when the vote passes (or is doomed) without them, some dissent.
var __bdv12 = window.botDecideVote;
window.botDecideVote = function(b){
  var v = __bdv12(b);
  if(!v || !BRAIN || !COMM_BOLD.on || game.roles[b] === 'white') return v;
  var P = game.currentPresident, C = game.nominatedChancellor;
  if(b === P || b === C || game.communistPolicies < 3) return v;
  var st = brainState(), pr = brainPredictVotes(b, P, C, st), A = st.alive.length;
  var pNo = brainPassProbFrom(brainPassDist(pr, b, st), 0, A);
  if(pNo >= 0.7) return Math.random() < BAL.splitProb ? false : v;       // not needed: vote like an independent White would
  return v;
};


// =====================================================================
// ===== v12: capitalise on the bloc, red-herring awareness, Stalin tests, ONE trust measure =====
// =====================================================================
var STALIN_TEST = {on:true, p:0.6};

// ---- Whites turn a visible bloc into a RULE, and allow for an obvious (decoy) communist ----
var __zrd13 = window.zoneRiskDet;
window.zoneRiskDet = function(b, P, C, view){
  var R = __zrd13(b, P, C, view);
  if(R < 0.002) return R;
  var kF = getRoleDistribution(game.playerCount).communists + 1, alive = getAliveIndices();
  var unconf = alive.filter(function(j){ return j !== b && !game.confirmedNotStalin[j]; });
  var obvious = unconf.filter(function(j){ var f = baRawPubF(j); return f !== null && f !== undefined && f >= 0.85; });   // Stalin hides: the obvious communist is NOT him
  if(obvious.indexOf(C) >= 0) return Math.min(0.95, R * 2);
  var pool = unconf.filter(function(j){ return obvious.indexOf(j) < 0; }), oldBase = 1 / Math.max(2, unconf.length), base;
  var bloc = blocMembers().filter(function(j){ return alive.indexOf(j) >= 0 && j !== b && !game.confirmedNotStalin[j]; });
  if(bloc.length >= 2){
    var inB = Math.min(0.85, 0.8 * bloc.length / kF), blocPool = bloc.filter(function(j){ return obvious.indexOf(j) < 0; }).length;
    base = (bloc.indexOf(C) >= 0) ? inB / Math.max(1, blocPool)                         // a bloc candidate: likely the leader
                                  : (1 - inB) / Math.max(1, pool.length - blocPool);    // outside the bloc: very likely clean -> vote YES
  } else base = 1 / Math.max(2, pool.length);
  return Math.min(0.95, R * base / oldBase);
};

// ---- ONE trust measure: the table's belief (bots use the observer's own belief; the display uses the public one) ----
function baBeliefOf(observer, idx){
  var B = BRAIN; if(!B) return null;
  var w = (observer >= 0 && B.bot[observer]) ? B.bot[observer] : B.pub, s = 0, t = 0;
  for(var h=0; h<B.H; h++){ var v = w[h]; if(!v) continue; t += v; if(B.hRole[h][idx]) s += v; }
  return t ? s / t : null;
}
window.getHumanCredibility = function(observer){
  var h = game.humanPlayerIndex; if(h < 0 || !BRAIN) return 0;
  var f = baBeliefOf(observer, h); if(f === null) return 0;
  return brainClamp((baPrior() - f) * 5, -2.5, 2.5);
};

// ---- Stalin tests his Premier with a choice, and weighs who is on his team ----
var __ppd13 = window.pickPresidentDiscardIdx;
window.pickPresidentDiscardIdx = function(p, c, pol){
  var i = __ppd13(p, c, pol);
  if(STALIN_TEST.on && game.roles[p] === 'stalin' && game.playerCount > 6 && game.communistPolicies < 3 && pol.filter(function(x){ return x === 'white'; }).length === 2 && Math.random() < STALIN_TEST.p){
    var f = baRawPubF(p);
    if(f === null || f === undefined || f <= baPrior() + 0.05){ game._stalinTest = {P:p, C:c}; return pol.indexOf('white'); }   // pass W+R: whoever enacts red is a fascist
  }
  return i;
};
var __bog13 = window.brainObserveGovernment;
window.brainObserveGovernment = function(P, C, e, cl){
  var r = __bog13(P, C, e, cl);
  try {
    var B = BRAIN; if(!B) return r;
    if(game._stalinTest && game._stalinTest.P === P && game._stalinTest.C === C){
      if(e === 'communist') brainEliminate(function(rr){ return rr[C] === 0; }, P);                    // he saw the choice: a White would have enacted the White
      else { var Lh = new Float64Array(B.H); for(var h=0; h<B.H; h++) Lh[h] = (B.hRole[h][C] !== 0) ? 0.8 : 1; brainMul(B.bot[P], Lh, 1, P); B.ver++; }
      game._stalinTest = null;
    }
    if(cl && cl.truthA !== undefined){                                                                  // Stalin also catches liars he can verify
      var pa = (cl.pa === undefined ? (cl.pf ? 1 : 0) : cl.pa);
      if(game.roles[C] === 'stalin' && game.playerCount > 6 && (pa > 0) !== (cl.truthA > 0)) brainEliminate(function(rr){ return rr[P] === 0; }, C);
      if(game.roles[P] === 'stalin' && game.playerCount > 6 && !!cl.t2 !== (cl.truthA === 0)) brainEliminate(function(rr){ return rr[C] === 0; }, P);
    }
  } catch(err){}
  return r;
};




// =====================================================================
// ===== v13: TRUST-ANCHOR zone logic, coordinated communist votes, clear dossier wording =====
// =====================================================================
var ZT = {T:3.0, boot:true, redOK:0.6};

// ---- Trust points: real evidence only (independent of how sharp the belief engine is) ----
function whiteTrust(b, i, pub){
  if(i === b) return 100;
  var prior = baPrior(), s = 0, pv = pub ? null : game.botInvestigations[b];
  if(pv && pv[i] === 'white') return 100;                              // my own investigation
  if(pv && pv[i] === 'communist') return -100;
  if(game.confirmedNotStalin[i]) s += 4;                               // served in the zone and the game went on
  var rec = game.playerRecords[i] || {}, f0 = baRawPubF(i); if(f0 === null || f0 === undefined) f0 = prior;
  (rec.investigationsReceived || []).forEach(function(iv){              // a declaration is worth what the declarer is worth
    var f = baRawPubF(iv.by); if(f === null || f === undefined) f = prior;
    var w = brainClamp((1 - f) * 1.6, 0.3, 1.3) / 1.3;
    s += (iv.declared === 'White') ? 1.8 * w : -2.5 * w;
  });
  var wc = 0, wp = 0;
  game.policyHistory.forEach(function(x){ if(x.policy === 'white'){ if(x.chancellor === i) wc++; if(x.president === i) wp++; } });
  s += Math.min(3, wc) * 1.0 + Math.min(3, wp) * 0.8;                 // ★ enacted as Premier / passed as Secretary
  s += 1.5 * Math.min(2, (game.lateWhite && game.lateWhite[i]) || 0);  // ★ passed late in the deck
  if(isInAnyConflict(i)) s -= 2;
  if(blocTally()[i] >= 2) s -= 4;                                      // voting-bloc pattern
  var cs = game.claimStats && game.claimStats[i]; if(cs) s += 0.7 * Math.min(2, cs.won) - 1.0 * Math.min(3, cs.lost);
  var rp = game.rep && game.rep[i]; if(rp) s += brainClamp(0.5 * (rp.r - rp.w), -1.5, 1.5);
  var F = pub ? f0 : brainView(b).F[i];
  s += brainClamp((prior - F) * 6, -3, 3);
  return s;
}
function zoneRiskFromScore(b, i, s){
  var E = 0; getAliveIndices().forEach(function(j){ if(j !== b && !game.confirmedNotStalin[j]) E++; });
  return Math.min(0.95, (1 / Math.max(2, E)) * Math.exp(-0.45 * s));
}
// In the zone a White says NO until the ticket is made of people they have reason to trust, then ROLLS with them.
function zoneWhiteVote(b, P, C, st, pub){
  var tr = st.tracker, r = st.r, view = pub || brainView(b), tk = brainTicket(view, P, C, st);
  if(tr < 2 && (hasDispute(b, P) || hasDispute(b, C))) return false;
  var sC = whiteTrust(b, C, pub), sP = whiteTrust(b, P, pub), cns = !!game.confirmedNotStalin[C];
  var risk = cns ? 0 : zoneRiskFromScore(b, C, sC);
  if(r >= 5 && tr >= 2) return (tk.eRed + risk) < st.pChaosRed;         // chaos at 5 reds loses: take the best ticket
  if(r >= 5 && tr < 2 && tk.eRed > 0.25) return false;
  var f = baRawPubF(P); if(sP <= -1.5 || (f !== null && f !== undefined && f >= 0.85)) return false;   // a suspect Secretary
  if(cns) return tk.eRed <= 0.7;                                        // cannot be Stalin: roll with it
  if(sC >= ZT.T) return tk.eRed <= ZT.redOK;                            // enough real evidence: roll with it
  if(ZT.boot && tr >= 1){                                               // somebody has to be trusted first: take the best we have
    var anchors = 0, best = -1e9;
    getAliveIndices().forEach(function(j){ if(j === b || j === P) return; if(game.confirmedNotStalin[j]){ anchors++; return; } var s = whiteTrust(b, j, pub); if(s >= ZT.T) anchors++; if(j !== C && s > best) best = s; });
    if(anchors === 0 && sC > 0 && sC >= best - 0.5) return tk.eRed <= 0.7;
  }
  return false;
}
window.whiteZoneYesProb = function(j, P, C, st, view){ return zoneWhiteVote(j, P, C, st, view) ? 0.9 : 0.05; };

// ---- Communists vote as a COORDINATED team: the fewest, least-suspicious yes votes; never a doomed bloc ----
function commCoordVote(b, v){
  var P = game.currentPresident, C = game.nominatedChancellor;
  if(!v || b === P || b === C) return v;
  var st = brainState(), pr = brainPredictVotes(b, P, C, st), A = st.alive.length, maj = Math.floor(A / 2) + 1, base = 0, Ew = 0, comm = [];
  st.alive.forEach(function(j){
    if(j === P || j === C){ base++; return; }
    if(game.roles[j] === 'communist' || (game.roles[j] === 'stalin' && game.playerCount <= 6)) comm.push(j);
    else Ew += (pr[j] === undefined ? 0.5 : pr[j]);
  });
  var need = maj - base - Ew;
  if(need <= 0) return Math.random() < 0.25;                            // not needed: vote like an independent White
  if(need > comm.length) return false;                                  // doomed: nobody exposes themselves
  comm.sort(function(a, c){ return (baRawPubF(a) - baRawPubF(c)) || (a - c); });
  var k = Math.ceil(need + 0.3), idx = comm.indexOf(b);
  return idx >= 0 && idx < k;                                           // the least-suspicious comrades carry it
}
var __bdv14 = window.botDecideVote;
window.botDecideVote = function(b){
  if(BRAIN && VOTE_LOGIC.on){
    var P = game.currentPresident, C = game.nominatedChancellor;
    if(b !== P && b !== C){
      var st = brainState();
      if(st.zone && game.roles[b] === 'white') return zoneWhiteVote(b, P, C, st, null);
      if(st.zone && game.roles[b] !== 'white' && COMM_BOLD.on) return commCoordVote(b, __bdv14(b));
    }
  }
  return __bdv14(b);
};

// ---- whites "roll with" confirmed players when THEY nominate ----
var __ib14 = window.involvementBonus;
window.involvementBonus = function(p, c){
  var b = __ib14(p, c);
  if(BRAIN && game.communistPolicies >= 3 && game.roles[p] === 'white' && game.confirmedNotStalin[c] && !hasDispute(p, c) && baRawPubF(c) < 0.8) b += 2.5;
  return b;
};

// ---- Clear wording: "X declared that Y's card is COMMUNIST / LIBERAL" ----
function baDeclText(by, target, declared){ return baName(by) + ' declared that ' + baName(target) + '\'s card is ' + (declared === 'Communist' ? 'COMMUNIST' : 'LIBERAL (White)') + '.'; }
var __od14 = window.openDossier;
window.openDossier = function(i){
  __od14(i);
  try {
    var body = document.getElementById('dossier-body'); if(!body) return;
    var html = body.innerHTML;
    ['Active Contradictions &amp; Feuds', 'Active Contradictions & Feuds', 'Public Investigation Record'].forEach(function(t){
      html = html.replace(new RegExp('<div class="dossier-section"><div class="dossier-section-title">' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</div>[\\s\\S]*?</div></div>'), '');
    });
    var rec = game.playerRecords[i] || {}, rows = [];
    (rec.investigationsDone || []).forEach(function(iv){ rows.push([iv.declared === 'Communist' ? '#fca5a5' : '#86efac', baDeclText(i, iv.target, iv.declared)]); });
    (rec.investigationsReceived || []).forEach(function(iv){ rows.push([iv.declared === 'Communist' ? '#fca5a5' : '#86efac', baDeclText(iv.by, i, iv.declared)]); });
    (game.disputes || []).forEach(function(d){
      if((d.p1 !== i && d.p2 !== i) || d.type === 'investigation_accuse') return;
      rows.push(['#fde68a', d.type === 'impossible_claim'
        ? baName(d.p1) + '\'s account of the cards is impossible given the policy that was enacted — someone lied.'
        : 'Secretary ' + baName(d.p1) + ' and Premier ' + baName(d.p2) + ' gave conflicting accounts of the cards — one of them lied.']);
    });
    var sec = '<div class="dossier-section"><div class="dossier-section-title">Declarations & Card Disputes</div>' +
      (rows.length ? rows.map(function(r){ return '<div class="dossier-item" style="color:' + r[0] + '">' + baEsc(r[1]) + '</div>'; }).join('') : '<div class="dossier-item" style="color:var(--td)">No declarations or card disputes involve this player.</div>') + '</div>';
    var k = html.indexOf('<div class="dossier-section"><div class="dossier-section-title">Government Terms Served');
    body.innerHTML = (k >= 0) ? html.slice(0, k) + sec + html.slice(k) : html + sec;
  } catch(e){}
};
var __bf14 = window.baFacts;
window.baFacts = function(i){
  var out = [];
  __bf14(i).forEach(function(f){
    var x = f.x, m;
    if(/^Feud with .* over an investigation accusation\.$/.test(x)) return;
    if((m = x.match(/^Accused of being Communist by (.+?) \((.*)\)(.*)$/))) x = m[1] + ' declared that this player\'s card is COMMUNIST (' + m[2] + ')' + m[3];
    else if((m = x.match(/^Declared White by (.+?) \((.*)\)(.*)$/))) x = m[1] + ' declared that this player\'s card is LIBERAL (' + m[2] + ')' + m[3];
    else if((m = x.match(/^Publicly accused (.+) of being Communist\.$/))) x = 'Declared that ' + m[1] + '\'s card is COMMUNIST.';
    else if((m = x.match(/^Vouched for (.+) as White\.$/))) x = 'Declared that ' + m[1] + '\'s card is LIBERAL.';
    else if((m = x.match(/^Feud with (.+) over contradicting card claims.*\.$/))) x = 'Conflicting card stories with ' + m[1] + ' — one of them lied.';
    out.push({t:f.t, x:x});
  });
  return out;
};
// ===== v14: STALIN-ZONE TRUST NETWORK / COORDINATED WHITE LOGIC =====
// Whites should not freeze in the Stalin Zone. They build trust anchors,
// follow trusted players' endorsements, and stick with people who prove safe.
// =====================================================================
var SZTRUST = {
  on:true,
  minTrust:0.75,
  strongTrust:2.2,
  socialWeight:0.85,
  nominationWeight:0.55,
  provenWeight:1.10,
  confirmedBonus:4.0,
  bestGap:0.75
};

function szClamp(x,a,b){ return Math.max(a, Math.min(b,x)); }

// Public "who trusts whom" signal, filtered through THIS White's own trust
// in the people doing the trusting. No private role information is shared.
function szSocialTrust(b, target){
  var total = 0, weight = 0;
  var logs = game.voteLog || [];
  for(var q=0;q<logs.length;q++){
    var e = logs[q], votes = e.votes || {};
    if(e.chanc !== target && e.pres !== target) continue;

    // A Secretary choosing target is a public endorsement.
    if(e.pres === target){
      var pt = whiteTrust(b, e.chanc, null);
      if(pt > -2){
        var pw = szClamp((pt + 2.5) / 5, 0.08, 1.15);
        total += SZTRUST.nominationWeight * pw;
        weight += SZTRUST.nominationWeight;
      }
    }

    // Every visible YES on target is an endorsement; trust the endorser
    // more when this White already has evidence that the endorser is sound.
    for(var k in votes){
      var voter = +k;
      if(voter === target || voter === e.pres || voter === e.chanc) continue;
      if(!votes[k]) continue;
      var vt = whiteTrust(b, voter, null);
      var vw = szClamp((vt + 2.5) / 5, 0.08, 1.25);
      total += SZTRUST.socialWeight * vw;
      weight += SZTRUST.socialWeight;
    }
  }
  return weight > 0 ? total / Math.max(1, weight / 2) : 0;
}

// Extra persistence: once someone has survived as a non-Stalin government
// and especially once they repeatedly produced White policies, keep them
// in the trusted pool instead of resetting to "unknown" every round.
function szAnchorScore(b, target){
  var s = 0;
  if(game.confirmedNotStalin[target]) s += SZTRUST.confirmedBonus;

  var govs = (game.playerRecords[target] && game.playerRecords[target].governments) || [];
  var whiteTerms = 0;
  for(var i=0;i<govs.length;i++) if(govs[i].enacted === 'white') whiteTerms++;
  s += Math.min(3, whiteTerms) * SZTRUST.provenWeight;

  // If this person has repeatedly been trusted by a Secretary this White
  // itself trusted, preserve that relationship.
  s += szSocialTrust(b, target);
  return s;
}

function szWhiteTrustNetwork(b, target){
  var own = whiteTrust(b, target, null);
  if(own >= 90) return 100;
  if(own <= -90) return -100;
  return own + szAnchorScore(b, target);
}

function szCandidatesForWhite(b, P){
  var alive = getAliveIndices(), out = [];
  for(var i=0;i<alive.length;i++){
    var j = alive[i];
    if(j === P) continue;
    if(j === game.lastGovernment.chancellor) continue;
    if(alive.length > 5 && j === game.lastGovernment.president) continue;
    if(BOT_RULES.consistency && botPubliclyAccused(P, j)) continue;
    if(hasDispute(P, j)) continue;
    out.push(j);
  }
  if(!out.length){
    for(var k=0;k<alive.length;k++){
      var x = alive[k];
      if(x !== P && !hasDispute(P,x)) out.push(x);
    }
  }
  return out;
}

// Replace the old "every unconfirmed candidate is a NO" behavior.
// A White now asks: "Who do I trust, and who do the people I trust trust?"
function szCoordinatedWhiteVote(b, P, C, st){
  var view = brainView(b);
  var tk = brainTicket(view, P, C, st);
  var cns = !!game.confirmedNotStalin[C];
  var cScore = szWhiteTrustNetwork(b, C);
  var pScore = szWhiteTrustNetwork(b, P);
  var candidates = szCandidatesForWhite(b, P);
  var scores = {};

  for(var i=0;i<candidates.length;i++) scores[candidates[i]] = szWhiteTrustNetwork(b,candidates[i]);

  var best = -1e9, second = -1e9;
  for(var j=0;j<candidates.length;j++){
    var sc = scores[candidates[j]];
    if(sc > best){ second = best; best = sc; }
    else if(sc > second) second = sc;
  }

  // A known-safe anchor is the table's default coalition partner.
  if(cns && cScore > -2.0 && pScore > -2.5 && !hasDispute(b,C)){
    if(st.r < 5 || tk.eRed <= 0.78) return true;
  }

  // Never ignore a direct private accusation or a severe public contradiction.
  if((game.botInvestigations[b] && game.botInvestigations[b][C] === 'communist') ||
     (game.botInvestigations[b] && game.botInvestigations[b][P] === 'communist')) return false;
  if(hasDispute(b,P) || hasDispute(b,C)){
    if(st.tracker < 2) return false;
  }

  // At five reds, the objective changes: choose the safest ticket available,
  // rather than blindly rejecting everything and handing chaos the deck.
  if(st.r >= 5){
    if(st.tracker >= 2) return (tk.eRed + (cns ? 0 : zoneRiskFromScore(b,C,cScore))) < st.pChaosRed;
    if(tk.eRed > 0.35 && cScore < SZTRUST.strongTrust) return false;
  }

  // Confirmed people and strong anchors are deliberately easier to approve.
  if(cScore >= SZTRUST.strongTrust && pScore > -1.75 && tk.eRed <= 0.70) return true;

  // "Coordinate": if this candidate is the strongest trusted person on the
  // board, give the coalition a chance to converge on them.
  var isBest = cScore >= best - 0.35;
  if(isBest && cScore >= SZTRUST.minTrust && tk.eRed <= 0.72) return true;

  // A merely unknown candidate is not automatically Stalin. If they are
  // substantially safer than the other available candidates, roll with them.
  var risk = cns ? 0 : zoneRiskFromScore(b,C,cScore);
  if(cScore > 0 && risk < 0.28 && tk.eRed <= 0.68) return true;

  // If the table has already rejected this exact candidate, require a real
  // improvement rather than endlessly recycling the same failed ticket.
  var priorRejects = 0;
  (game.voteLog || []).forEach(function(e){
    if(e.zone && !e.passed && e.chanc === C) priorRejects++;
  });
  if(priorRejects >= 2 && cScore < best - SZTRUST.bestGap && st.tracker < 2) return false;

  // Tracker pressure: when another NO only moves toward chaos, choose the
  // least-bad trusted ticket instead of freezing.
  if(st.tracker >= 1 && cScore >= Math.max(-0.25, best - 0.65) && tk.eRed <= 0.78) return true;

  return false;
}

// Whites also nominate their trust anchors in the Stalin Zone.
// This is intentionally a soft preference, not perfect omniscience.
var __pickNomV14 = window.pickNomination;
window.pickNomination = function(presIdx){
  if(!SZTRUST.on || !BRAIN || game.communistPolicies < 3 || game.roles[presIdx] !== 'white')
    return __pickNomV14(presIdx);

  var candidates = szCandidatesForWhite(presIdx, presIdx);
  if(!candidates.length) return __pickNomV14(presIdx);

  var scored = [];
  for(var i=0;i<candidates.length;i++){
    var c = candidates[i], s = szWhiteTrustNetwork(presIdx,c);
    var view = brainView(presIdx);
    var redRisk = zoneRiskFromScore(presIdx,c,s);
    var U = 1.35*s - 2.0*redRisk + 0.45*(game.confirmedNotStalin[c] ? 1 : 0);
    // Preserve the existing brain's opinion so this is a trust correction,
    // not a total replacement of its reasoning.
    U += 0.35 * ((view.F[c] !== undefined) ? -view.F[c] : 0);
    U += 0.18 * (Math.random() - 0.5);
    scored.push({idx:c,U:U});
  }
  scored.sort(function(a,b){ return b.U-a.U; });

  // Usually take the best trusted candidate; occasionally take the second
  // best so the coalition is coordinated without becoming robotic.
  var top = scored[0];
  if(scored.length > 1 && Math.random() < 0.18){
    var second = scored[1];
    if(second.U >= top.U - 0.8) return second.idx;
  }
  return top.idx;
};

// Final vote wrapper: this comes LAST so it overrides the older Stalin-Zone
// safety patches above rather than fighting them.
var __botVoteV14 = window.botDecideVote;
window.botDecideVote = function(b){
  if(SZTRUST.on && BRAIN){
    var P = game.currentPresident, C = game.nominatedChancellor;
    if(b !== P && b !== C && game.roles[b] === 'white'){
      var st = brainState();
      if(st.zone) return szCoordinatedWhiteVote(b,P,C,st);
    }
  }
  return __botVoteV14(b);
};


// =====================================================================
// ===== Reshuffle audit: accounts for the unseen bottom cards =====
// =====================================================================
function reshuffleAudit(){
  var dc = game.deckCycle || {}, sw = dc.startWhite || 0, sc = dc.startComm || 0, ch = dc.chaosWhite || 0;
  var W = Math.max(0, 6 - sw - ch);            // whites that existed in this cycle's deck
  var T = 17 - sw - sc - ch;                   // cards in this cycle's deck
  var claimed = dc.claimedDemSeen || 0;
  var b = Math.min(2, game.policyDeck.length); // unseen cards at the bottom
  var missing = Math.max(0, W - claimed);
  var p = 1, lie = 0;
  if(missing > 0){
    if(missing > b){ p = 0; lie = 1; }         // can't fit in the bottom cards: someone lied
    else { p = brainC(W, missing) * brainC(T - W, b - missing) / brainC(T, b); lie = 1 - p; }
  }
  return {W:W, T:T, claimed:claimed, b:b, missing:missing, pBottom:p, lie:lie};
}

var __dpChaos = window.drawPolicies;
window.drawPolicies = function(n){
  var r = __dpChaos(n);
  if(n === 1 && r[0] === 'white' && game.deckCycle) game.deckCycle.chaosWhite = (game.deckCycle.chaosWhite || 0) + 1;
  return r;
};


// =====================================================================
// ===== Truthfulness guarantee: Whites never lie about cards/checks =====
// Communists and Stalin keep their existing lying behavior.
// =====================================================================
var __bpiTruth = window.brainPickInvestigation;
window.brainPickInvestigation = function(presIdx, candidates){
  var r = __bpiTruth(presIdx, candidates);
  if(r && game.roles[presIdx] === 'white') r.declared = (game.roles[r.target] === 'white') ? 'White' : 'Communist';
  return r;
};

var __bpcTruth = window.brainPresClaim;
window.brainPresClaim = function(presIdx, chancIdx, enacted, drawn, passed){
  var r = __bpcTruth(presIdx, chancIdx, enacted, drawn, passed);
  if(game.roles[presIdx] === 'white'){
    var dD = drawn.filter(function(p){ return p === 'white'; }).length;
    var dP = passed.filter(function(p){ return p === 'white'; }).length;
    r = {cd:dD, pf:dP > 0, pa:dP, quote:brainPresQuote(dD, dP, game.players[chancIdx].name)};
  }
  return r;
};

var __bccTruth = window.brainChancClaim;
window.brainChancClaim = function(chancIdx, presIdx, enacted, cPassed, dPassed, presClaimedPf){
  var r = __bccTruth(chancIdx, presIdx, enacted, cPassed, dPassed, presClaimedPf);
  if(game.roles[chancIdx] === 'white') r.t2 = (cPassed === 2);
  return r;
};

// Safety: a White human can never declare anything but the true result
var __hdiTruth = window.humanDeclareInvestigation;
window.humanDeclareInvestigation = function(idx, declaredTeam){
  var h = game.humanPlayerIndex;
  if(h >= 0 && isWhite(game.roles[h])) declaredTeam = isWhite(game.roles[idx]) ? 'White' : 'Communist';
  return __hdiTruth(idx, declaredTeam);
};


// =====================================================================
// ===== Communist Secretaries: framing is rare and situational =====
// Default play when a Communist Secretary draws 3 Communists (or can't
// safely bluff): claim "3 Communists" -- believable and draws no attention.
// Framing a White Premier (claiming a fake choice) starts a feud and puts
// the Secretary's own word on the line, so it only happens when the Premier
// already looks worse than the Secretary, and then only occasionally.
// =====================================================================
var FRAME_TUNE = {scale:0.25, minGap:0.10};
var __bsfBase = window.brainShouldFrame;
window.brainShouldFrame = function(presIdx, chancIdx){
  if(game.roles[presIdx] === 'stalin') return false;
  var pubP = brainPubF(presIdx), pubC = brainPubF(chancIdx);
  if(pubC < pubP + FRAME_TUNE.minGap) return false;          // never frame someone who looks cleaner than me
  return __bsfBase(presIdx, chancIdx) && Math.random() < FRAME_TUNE.scale;
};


// =====================================================================
// ===== TABLE READ FIXES (votes) =====
// 1. Vote likelihood calibrated to how Whites / Communists actually vote,
//    given how suspicious the ticket already looked in public.
// 2. A vote against the table on a rejected suspicious ticket is evidence.
// 3. Bots no longer wave through a Secretary/Premier they already suspect.
// 4. Votes swayed by the human's speech count for little.
// =====================================================================
INFER.gain = 0.7;

function voteSwayed(j, yes){
  if(!roundPersuasionModifier || !roundPersuasionModifier.active || !roundPersuasionModifier.botModifiers) return false;
  var d = roundPersuasionModifier.botModifiers[j];
  if(d === undefined || d === null) return false;
  return (yes && d >= 0.8) || (!yes && d <= -0.8);
}

// P(yes) by [voter class][ticket class][public suspicion bin]; ticket class 0 = no fascist, 1 = fascist, 2 = Stalin on it.
var VOTE_TAB = {
  pre:{ w:[[.98,.86,.753,.753],[.98,.744,.264,.06],[.98,.773,.234,.147]],
        f:[[.826,.657,.77,.77],[.91,.723,.394,.121],[.877,.773,.611,.672]] },
  zone:{ w:[[.729,.577,.463,.463],[.812,.653,.187,.073],[.98,.745,.117,.1]],
         f:[[.024,.02,.02,.02],[.184,.293,.174,.1],[.395,.725,.855,.884]] }
};
var __vSbin = 0;
var __bovCal = window.brainObserveVotes;
window.brainObserveVotes = function(P, C){
  var s = 0, alive = getAliveIndices(), pre = null;
  try { s = Math.max(baRawPubF(P) || 0, baRawPubF(C) || 0); } catch(e){}
  __vSbin = s < 0.5 ? 0 : (s < 0.8 ? 1 : (s < 0.93 ? 2 : 3));
  var yes = alive.filter(function(j){ return j !== P && j !== C && game.votes[j] === true; });
  var no  = alive.filter(function(j){ return j !== P && j !== C && game.votes[j] === false; });
  var da = alive.filter(function(j){ return game.votes[j] === true; }).length, passed = da > alive.length - da;
  var zone = game.communistPolicies >= 3;
  if(BRAIN){
    var rnd = game.whitePolicies + game.communistPolicies + 1;
    yes.forEach(function(j){
      if(voteSwayed(j, true)) return;                                   // a vote the human's speech pushed is not the voter's own call
      if(s >= EXPOSED.thr && game.electionTracker < 2) recordSusVote(j, 'exposed', P, C, rnd, passed, s);
      else if(!passed && s >= 0.5) recordSusVote(j, 'against', P, C, rnd, passed, s);
    });
  }
  var r = __bovCal(P, C);
  // against-the-table: yes on a rejected suspicious ticket (a no there is mild credit)
  if(BRAIN && !passed && __vSbin >= 1){
    var yesM = __vSbin === 3 ? (zone ? VOTE_AGAINST.zoneYes3 : VOTE_AGAINST.preYes3)
             : (__vSbin === 2 ? (zone ? VOTE_AGAINST.zoneYes : VOTE_AGAINST.preYes) : VOTE_AGAINST.midYes);
    var noM  = __vSbin >= 2 ? (zone ? VOTE_AGAINST.zoneNo : VOTE_AGAINST.preNo) : 1;
    var B = BRAIN, Lh = new Float64Array(B.H);
    for(var h=0; h<B.H; h++){
      var m = 1;
      yes.forEach(function(j){ if(!voteSwayed(j, true)  && B.hRole[h][j] !== 0) m *= yesM; });
      no.forEach(function(j){  if(!voteSwayed(j, false) && B.hRole[h][j] === 0) m *= (1 / noM); });
      Lh[h] = m;
    }
    brainApplyVec(Lh, false);
  }
  return r;
};
var VOTE_AGAINST = {preYes:1.7, midYes:1.25, zoneYes:1.9, preYes3:1.6, zoneYes3:1.75, preNo:1.15, zoneNo:1.0};

window.brainVoteYesProb = function(rv, rp, rc, st, n){
  var wl = (rv === 0) || (rv === 2 && n >= 7);
  var cls = (rc === 2) ? 2 : (((rp !== 0) || (rc !== 0)) ? 1 : 0);
  var t = st.zone ? VOTE_TAB.zone : VOTE_TAB.pre;
  return brainClamp(t[wl ? 'w' : 'f'][cls][__vSbin], 0.02, 0.98);
};

// A Secretary/Premier you already distrust is "evidence" enough to stop auto-approving
var GOV_EVID = {thr:0.7};
var __gheOld = window.govHasEvidence;
window.govHasEvidence = function(botIdx, P, C){
  if(__gheOld(botIdx, P, C)) return true;
  if(BRAIN){ var v = brainView(botIdx); if(v.F[P] >= GOV_EVID.thr || v.F[C] >= GOV_EVID.thr) return true; }
  return false;
};


// =====================================================================
// ===== BOT LOGIC FIXES: exposed players, doomed tickets, Stalin =====
// =====================================================================
var EXPOSED = {thr:0.85, doomedP:0.30, hideProb:0.9, publicSus:0.7};

// ---- (1) Stalin nominates like a White (blends in). He never reaches for a player the table already distrusts. ----
var __brainIsF_x = window.brainIsF, __forceWhiteSeat = -1;
window.brainIsF = function(i){ if(i === __forceWhiteSeat) return false; return __brainIsF_x(i); };
var __pickNom_x = window.pickNomination;
window.pickNomination = function(p){
  if(game.roles[p] === 'stalin'){
    __forceWhiteSeat = p;
    try { return __pickNom_x(p); } finally { __forceWhiteSeat = -1; }
  }
  return __pickNom_x(p);
};

// ---- (2) Communists don't hand the Secretary's chair-mates a publicly exposed teammate ----
var __ib_x = window.involvementBonus;
window.involvementBonus = function(p, c){
  var b = __ib_x(p, c);
  if(BRAIN && game.roles[p] !== 'white' && game.communistPolicies < 3){
    var f = baRawPubF(c);
    if(f !== null && f !== undefined && f >= EXPOSED.thr) b -= 3;
  }
  return b;
};

// ---- Suspicious-vote record ----
// 'exposed' = voted YES on a ticket the whole table already saw as Communist (and not forced by the tracker or the human's speech)
// 'against' = voted YES on a suspicious ticket that the table then rejected
function susCount(i, kind){
  var a = (game.susVotes && game.susVotes[i]) || [], n = 0;
  a.forEach(function(e){ if(!kind || e.kind === kind) n++; });
  return n;
}
function recordSusVote(j, kind, P, C, round, passed, s){
  if(!game.susVotes) game.susVotes = {};
  (game.susVotes[j] = game.susVotes[j] || []).push({kind:kind, pres:P, chanc:C, round:round, passed:passed, sus:s});
}
var __bi_sv = window.brainInit;
window.brainInit = function(){ __bi_sv.apply(this, arguments); game.susVotes = {}; };

// Bots hold it against players with a suspicious voting record
var __wt_x = window.whiteTrust;
window.whiteTrust = function(b, i, pub){
  var s = __wt_x(b, i, pub);
  if(s >= 90 || s <= -90) return s;
  return s - 2.5 * Math.min(2, susCount(i, 'exposed'));   // ('against' is shown to the human but is not predictive enough to count)
};
var __ib_sv = window.involvementBonus;
window.involvementBonus = function(p, c){
  var b = __ib_sv(p, c);
  if(BRAIN && game.roles[p] === 'white') b -= 3 * Math.min(2, susCount(c, 'exposed'));
  return b;
};

// ---- (3) Votes ----
//  Whites (and a blind Stalin) vote NO on a ticket whose Secretary or Premier they already see as a Communist,
//  or who has a suspicious voting record, unless the tracker forces the issue or the human's speech moved them.
//  Communists don't back an exposed ticket (before the zone, or in the zone unless Stalin is the Premier).
var __bdv_x = window.botDecideVote;
window.botDecideVote = function(b){
  var v = __bdv_x(b);
  if(!BRAIN) return v;
  var P = game.currentPresident, C = game.nominatedChancellor;
  if(b === P || b === C) return v;
  var st = brainState(), role = game.roles[b], n = game.playerCount;
  var knows = (role === 'communist') || (role === 'stalin' && n <= 6);

  if(!knows){
    if(st.tracker < 2){
      var d = (roundPersuasionModifier.active && roundPersuasionModifier.botModifiers[b]) || 0;
      if(d < 1.2){
        var view = brainView(b);
        var exposedNow = view.F[C] >= EXPOSED.thr || view.F[P] >= EXPOSED.thr;
        var flagged = susCount(P, 'exposed') > 0 || susCount(C, 'exposed') > 0;
        var lapse = brainParams(b).lapse;
        if(exposedNow || flagged) return Math.random() < lapse;
        // a player the WHOLE table can see is exposed is exposed for everyone, whatever their skill (only a slip lets it through)
        var pubEx = Math.max(baRawPubF(C) || 0, baRawPubF(P) || 0) >= EXPOSED.thr;
        if(pubEx) return Math.random() < 2 * lapse;
      }
    }
    return v;
  }

  if(v === true){
    var pubTox = Math.max(baRawPubF(P) || 0, baRawPubF(C) || 0);
    var lie = brainParams(b).lie; if(lie === undefined) lie = 1;
    if(st.zone){
      // in the zone a YES only makes sense to elect Stalin; backing an exposed ticket otherwise just outs the bloc
      if(game.roles[C] !== 'stalin' && pubTox >= EXPOSED.thr && Math.random() < EXPOSED.hideProb * lie) return false;
    } else if(st.tracker < 2){
      var teammateOn = (game.roles[P] !== 'white') || (game.roles[C] !== 'white');
      if(teammateOn && pubTox >= EXPOSED.publicSus){
        var pr = brainPredictVotes(b, P, C, st);
        // Whites will vote NO on a ticket that is publicly this toxic: plan against how they will really vote
        st.alive.forEach(function(j){
          if(j === b || j === P || j === C || game.roles[j] !== 'white') return;
          pr[j] = Math.min(pr[j] === undefined ? 0.5 : pr[j], pubTox >= EXPOSED.thr ? 0.08 : 0.35);
        });
        var pYes = brainPassProbFrom(brainPassDist(pr, b, st), 1, st.alive.length);
        // doomed, OR so exposed that carrying it with only the team's votes would reveal the whole bloc
        if((pYes < EXPOSED.doomedP || pubTox >= EXPOSED.thr) && Math.random() < EXPOSED.hideProb * lie) return false;
      }
    }
  }
  return v;
};


// =====================================================================
// ===== ADDRESS BOARD REWORK =====
//  - Voting-record watch list (who voted YES on tickets the whole table saw as Communist)
//  - Flag banner on the ticket + one-click "Vote НЕТ" / "НЕТ + mark SUS"
//  - Previous-ticket breakdown (who voted how, who went against the table)
//  - Voting-record arguments you can make to the table
//  - Arguments grouped into Urge НЕТ / Urge ДА
// =====================================================================
BA_BASIS.unshift([/^susvote_/, 'Voting record']);

(function(){
  try {
    var st = document.getElementById('ba3-style');
    if(st && st.textContent) return;
    st = document.createElement('style'); st.id = 'ba3-style';
    st.textContent =
      '.ba-flagbanner{border:1.5px solid var(--comm-red);background:rgba(239,68,68,.12);border-radius:8px;padding:8px 10px;margin:0 0 8px;font-size:.78rem;color:#fca5a5;text-align:left}' +
      '.ba-flagbanner b{color:#fff}.ba-flagbanner .ba-fl{margin:3px 0;color:#fecaca;font-size:.72rem}' +
      '.ba-actions{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 8px}' +
      '.ba-actions .vote-btn,.ba-actions button{flex:1 1 120px}' +
      '.ba-qbtn{background:#11141d;border:1.5px solid var(--border);color:var(--t);border-radius:8px;padding:8px 10px;font-weight:800;font-size:.76rem;cursor:pointer}' +
      '.ba-qbtn.no{border-color:var(--comm-red);color:#fca5a5}.ba-qbtn.yes{border-color:#10b981;color:#86efac}.ba-qbtn.warn{border-color:var(--g);color:var(--g)}' +
      '.ba-watch{background:#11141d;border:1.5px solid var(--border);border-radius:8px;padding:8px;margin:0 0 8px;text-align:left}' +
      '.ba-watch-row{display:flex;gap:6px;align-items:flex-start;justify-content:space-between;padding:4px 0;border-top:1px solid #1d2230}.ba-watch-row:first-of-type{border-top:0}' +
      '.ba-watch-name{font-weight:900;font-size:.82rem;color:var(--t)}.ba-watch-why{font-size:.68rem;color:var(--td);line-height:1.35}' +
      '.ba-mini{background:#11141d;border:1px solid var(--border);color:var(--td);border-radius:6px;font-size:.62rem;padding:3px 6px;cursor:pointer;margin-left:3px;white-space:nowrap}' +
      '.ba-mini.sus{border-color:var(--comm-red);color:#fca5a5}.ba-mini.trust{border-color:#10b981;color:#86efac}.ba-mini.on{background:rgba(255,255,255,.08)}' +
      '.ba-last{background:#11141d;border:1.5px solid var(--border);border-radius:8px;padding:8px;margin:0 0 8px;text-align:left;font-size:.72rem}' +
      '.ba-last .ba-vy{color:#86efac}.ba-last .ba-vn{color:#fca5a5}.ba-last .ba-vx{color:#fde68a;font-weight:800}' +
      '.ba-group{font-size:.7rem;font-weight:900;letter-spacing:.8px;text-transform:uppercase;margin:10px 0 2px}' +
      '.ba-group.no{color:#fca5a5}.ba-group.yes{color:#86efac}';
    (document.head || document.body).appendChild(st);
  } catch(e){}
})();

// ---- helpers ----
function baTicketFlags(){
  var h = game.humanPlayerIndex, out = [];
  [game.currentPresident, game.nominatedChancellor].forEach(function(i){
    if(i === null || i === undefined || i === h) return;
    var ex = (game.susVotes && game.susVotes[i] || []).filter(function(e){ return e.kind === 'exposed'; });
    if(ex.length) out.push({idx:i, ex:ex});
  });
  return out;
}
function baFlagText(e){
  return 'Round ' + e.round + ': ' + baName(e.pres) + ' + ' + baName(e.chanc) +
    (e.kind === 'exposed' ? ' (the whole table already saw it as Communist)' : ' (the table rejected it)');
}
function baFlagList(){
  var out = [];
  getAliveIndices().forEach(function(i){
    var arr = (game.susVotes && game.susVotes[i]) || [];
    if(!arr.length) return;
    out.push({idx:i, ex:arr.filter(function(e){ return e.kind === 'exposed'; }), ag:arr.filter(function(e){ return e.kind === 'against'; })});
  });
  out.sort(function(a, b){ return (b.ex.length - a.ex.length) || (b.ag.length - a.ag.length); });
  return out;
}
function baMark(i, kind){
  var arr = kind === 'sus' ? (game.userSuspects || []) : (game.userTrusted || []);
  if(arr.indexOf(i) < 0){ if(kind === 'sus') toggleSuspect(i); else toggleTrust(i); }
  openPreVoteDiscussion();
}
function baNoAndMark(){
  baTicketFlags().forEach(function(f){
    if((game.userSuspects || []).indexOf(f.idx) < 0 && (game.userSuspects || []).length < 4) toggleSuspect(f.idx);
  });
  castVote(false);
}

// ---- voting-record facts in each player's card ----
var __bf_sv = window.baFacts;
window.baFacts = function(i){
  var f = __bf_sv(i), add = [];
  ((game.susVotes && game.susVotes[i]) || []).slice().reverse().slice(0, 3).forEach(function(e){
    add.push(e.kind === 'exposed'
      ? {t:'bad', x:'🚩 Voted ДА on a ticket the table already saw as Communist — ' + baFlagText(e) + '.'}
      : {t:'warn', x:'Voted ДА against the table — ' + baFlagText(e) + '.'});
  });
  return add.concat(f);
};

// ---- voting-record arguments you can make ----
var __gdp_sv = window.generateDynamicPersuasionOptions;
window.generateDynamicPersuasionOptions = function(){
  var opts = __gdp_sv();
  var P = game.currentPresident, C = game.nominatedChancellor;
  [[P, 'Secretary'], [C, 'Premier']].forEach(function(pr){
    var i = pr[0], role = pr[1]; if(i === null || i === undefined) return;
    var arr = (game.susVotes && game.susVotes[i]) || [], nm = baName(i);
    var ex = arr.filter(function(e){ return e.kind === 'exposed'; });
    var ag = arr.filter(function(e){ return e.kind === 'against'; });
    if(ex.length){
      var e0 = ex[ex.length - 1];
      opts.push({id:'susvote_ex_' + i, stance:'nein', priority:96,
        text:role + ' ' + nm + ' voted ДА in round ' + e0.round + ' on ' + baName(e0.pres) + ' + ' + baName(e0.chanc) + ' — a ticket the whole table could see was Communist. A loyal White does not do that. We cannot hand ' + nm + ' power.'});
    } else if(ag.length){
      var a0 = ag[ag.length - 1];
      opts.push({id:'susvote_ag_' + i, stance:'nein', priority:78,
        text:role + ' ' + nm + ' voted ДА in round ' + a0.round + ' on a suspicious ticket the table rejected. They voted against the table once already — I am not willing to bet on them.'});
    }
  });
  return opts;
};

// ---- vote screen: flag banner ----
var __rhv_sv = window.renderHumanVoteScreen;
window.renderHumanVoteScreen = function(){
  var h = game.humanPlayerIndex, P = game.currentPresident, C = game.nominatedChancellor;
  var flags = baTicketFlags();
  __rhv_sv();
  try {
    var ac = document.getElementById('ac'), extra = '';
    if(flags.length) extra += '<div class="ba-flagbanner">🚩 <b>Flagged on this ticket:</b> ' + flags.map(function(f){ return baEsc(baName(f.idx)); }).join(' & ') +
      ' voted ДА on a ticket the whole table saw as Communist.</div>';
    if(extra) ac.innerHTML = extra + ac.innerHTML;
  } catch(e){}
};

// ---- the board ----
function openPreVoteDiscussion(){
  sfx('click');
  baInjectStyles();
  var A = baBuild(), args = baArguments(A), st = A.st, h = A.h;
  var flags = baTicketFlags();
  var recordArgs = args.filter(function(a){ return /^susvote_/.test(a.id); });
  var rest = args.filter(function(a){ return !/^susvote_/.test(a.id); });
  var nein = rest.filter(function(a){ return a.stance !== 'ja'; }), ja = rest.filter(function(a){ return a.stance === 'ja'; });
  if(!BA_STATS){ nein = shuffle(nein); ja = shuffle(ja); }
  args = recordArgs.concat(nein, ja);                       // hard record-based arguments first
  window.currentDynamicPersuasion = args;
  var lean = (BA_STATS && BRAIN) ? baLean(A, null) : null;
  var rec = BA_STATS ? baRecommend(A) : null;

  document.getElementById('at').textContent = 'Board Analysis';
  document.getElementById('ad').textContent = BA_STATS ? 'Public record, table read and your options. Pick an argument to sway the vote.'
    : 'The public record. Weigh the facts yourself, then pick what to say.';

  var capW = cycleWhiteCeiling(), seen = (game.deckCycle && game.deckCycle.claimedDemSeen) || 0;
  var html = '<div class="ba-wrap"><div style="text-align:right;margin-bottom:6px"><button class="ba-toggle' + (BA_STATS ? '' : ' off') + '" onclick="baToggleStats()">📊 Stats: ' + (BA_STATS ? 'ON' : 'OFF') + '</button></div>' +
    '<div class="ba-board">' +
    '<span class="ba-chip">★ ' + game.whitePolicies + '/5</span><span class="ba-chip' + (game.communistPolicies >= 4 ? ' hot' : '') + '">☭ ' + game.communistPolicies + '/6</span>' +
    '<span class="ba-chip' + (st.tracker >= 2 ? ' hot' : '') + '">Tracker ' + st.tracker + '/3</span>' +
    '<span class="ba-chip' + (st.zone ? ' hot' : ' ok') + '">Stalin Zone ' + (st.zone ? 'ON' : 'off') + '</span>' +
    '<span class="ba-chip' + (seen > capW ? ' hot' : '') + '">Audit ' + seen + '/' + capW + ' ★ claimed</span>' +
    (game.vetoUnlocked ? '<span class="ba-chip hot">Veto unlocked</span>' : '') + '</div>';

  // flag banner for this ticket
  if(flags.length){
    html += '<div class="ba-flagbanner">🚩 <b>Flagged on this ticket</b>' + flags.map(function(f){
      var e = f.ex[f.ex.length - 1];
      return '<div class="ba-fl"><b>' + baEsc(baName(f.idx)) + '</b> voted ДА on a ticket the whole table saw as Communist (' + baEsc(baFlagText(e)) + ')' + (f.ex.length > 1 ? ' — and ' + (f.ex.length - 1) + ' more time(s)' : '') + '.</div>';
    }).join('') + '</div>';
  }

  // quick actions
  var canAct = (h !== A.P && h !== A.C);
  html += '<div class="ba-actions">' +
    '<button class="ba-qbtn no" onclick="castVote(false)">👎 Vote НЕТ</button>' +
    '<button class="ba-qbtn yes" onclick="castVote(true)">👍 Vote ДА</button>' +
    (flags.length && canAct ? '<button class="ba-qbtn warn" onclick="baNoAndMark()">🚩 НЕТ + mark SUS</button>' : '') +
    '</div>';

  // government cards
  html += '<div class="ba-gov">';
  A.people.forEach(function(p){
    html += '<div class="ba-card"><div class="ba-card-top"><span class="ba-role">' + p.label + '</span>' +
      (BA_STATS ? '<span class="ba-sus ' + p.susInfo.cls + '" title="Public suspicion">' + p.susInfo.label + ' ' + baPct(p.sus) + '</span>' : '') + '</div>' +
      '<div class="ba-name">' + baEsc(p.idx === h ? 'You' : p.name) + '</div>' +
      (BA_STATS && st.zone && p.label === 'Premier' ? '<div class="ba-fact warn">Stalin risk (table est.): ' + baPct(p.S) + '</div>' : '') +
      p.facts.map(function(f){ return '<div class="ba-fact ' + f.t + '">• ' + baEsc(f.x) + '</div>'; }).join('') + '</div>';
  });
  html += '</div>';

  // watch list: everyone with a suspicious voting record
  var wl = baFlagList();
  if(wl.length){
    html += '<div class="ba-sec">🚩 Voting-record watch list</div><div class="ba-watch">' + wl.map(function(w){
      var me = (w.idx === h), isS = (game.userSuspects || []).indexOf(w.idx) >= 0, isT = (game.userTrusted || []).indexOf(w.idx) >= 0;
      var why = [];
      w.ex.slice(-2).forEach(function(e){ why.push('ДА on an exposed ticket — ' + baFlagText(e)); });
      if(w.ag.length) why.push('ДА against the table ×' + w.ag.length);
      return '<div class="ba-watch-row"><div><div class="ba-watch-name">' + baEsc(me ? 'You' : baName(w.idx)) + (w.idx === A.P ? ' · Secretary' : (w.idx === A.C ? ' · Premier' : '')) + '</div>' +
        '<div class="ba-watch-why">' + why.map(baEsc).join('<br>') + '</div></div>' +
        (me ? '<span class="ba-watch-why">bots see this too</span>' :
          '<div><button class="ba-mini sus' + (isS ? ' on' : '') + '" onclick="baMark(' + w.idx + ',\'sus\')">' + (isS ? '🚨 Marked' : '🚨 Mark SUS') + '</button>' +
          '<button class="ba-mini trust' + (isT ? ' on' : '') + '" onclick="baMark(' + w.idx + ',\'trust\')">' + (isT ? '🤝 Marked' : '🤝 Trust') + '</button></div>') + '</div>';
    }).join('') + '</div>';
  }

  // previous ticket breakdown
  var last = (game.voteLog || [])[(game.voteLog || []).length - 1];
  if(last && game.voteLog.length >= 1){
    var yes = [], no = [];
    Object.keys(last.votes).forEach(function(k){
      k = +k; var nm = (k === h ? 'You' : baName(k)), flagged = susCount(k, 'exposed') > 0 ? ' 🚩' : '';
      var against = (last.votes[k] && !last.passed) || (!last.votes[k] && last.passed);
      var item = (k === last.pres || k === last.chanc ? '<i>' + baEsc(nm) + '</i>' : baEsc(nm)) + flagged + (against && k !== last.pres && k !== last.chanc ? ' <span class="ba-vx">(against the table)</span>' : '');
      (last.votes[k] ? yes : no).push(item);
    });
    html += '<div class="ba-sec">Previous ticket</div><div class="ba-last"><b>' + baEsc(baName(last.pres)) + ' + ' + baEsc(baName(last.chanc)) + '</b> — ' +
      (last.passed ? 'PASSED' : 'REJECTED') + ' (' + yes.length + '–' + no.length + ')' +
      '<div class="ba-vy">ДА: ' + (yes.join(', ') || '—') + '</div><div class="ba-vn">НЕТ: ' + (no.join(', ') || '—') + '</div></div>';
  }

  if(lean){
    var pct = Math.round(100 * lean.exp / Math.max(1, lean.n));
    html += '<div class="ba-lean"><b>Expected table lean:</b> ~' + lean.exp.toFixed(1) + ' of ' + lean.n + ' other voters ДА (majority needs ' + lean.need + ' incl. you)' +
      '<div class="ba-bar"><div style="width:' + pct + '%"></div></div>' +
      'If you vote <b style="color:#86efac">ДА</b>: ~' + baPct(lean.passYes) + ' passes &nbsp;•&nbsp; <b style="color:#fca5a5">НЕТ</b>: ~' + baPct(lean.passNo) + ' passes' +
      (Math.abs(lean.passYes - lean.passNo) < 0.05 ? '<div class="ba-note">Your vote is unlikely to change the outcome — use your speech to shape it.</div>' : '') +
      '<div class="ba-note">Estimate from the public record only — hidden roles are not used.</div></div>';
  }
  if(rec){
    html += '<div class="ba-rec">🧭 <b>Analyst recommends: <b class="' + (rec.vote === 'ДА' ? 'ja' : 'nein') + '">' + rec.vote + '</b></b> (' + rec.conf + ')<ul>' +
      rec.why.map(function(w){ return '<li>' + baEsc(w) + '</li>'; }).join('') + '</ul></div>';
  }

  // arguments, grouped
  var base = lean ? lean.exp : 0;
  function argCard(a, i){
    var sway = '';
    if(lean){
      var d = {}; A.alive.forEach(function(j){ if(j !== h) d[j] = baBotDelta(j, a); });
      var sw = baLean(A, d).exp - base;
      sway = Math.abs(sw) < 0.15 ? 'little effect' : ((sw > 0 ? '+' : '−') + Math.abs(sw).toFixed(1) + ' ДА votes');
    }
    return '<div class="ba-arg" onclick="deliverDynamicPersuasion(' + i + ')"><div class="ba-arg-top">' +
      '<span class="persuasion-tag ' + (a.stance === 'ja' ? 'tag-ja' : 'tag-nein') + '">' + (a.stance === 'ja' ? 'Urge ДА 👍' : 'Urge НЕТ 👎') + '</span>' +
      (BA_STATS ? '<span class="ba-str ' + a.strength + '">' + a.strength + '</span>' : '') + '<span class="ba-basis">' + a.basis + '</span>' +
      (sway ? '<span class="ba-sway">≈ ' + sway + '</span>' : '') + '</div>' +
      '<div class="persuasion-quote">"' + a.text + '"</div></div>';
  }
  html += '<div class="ba-sec">Choose what to say</div>';
  var noIdx = [], yesIdx = [];
  args.forEach(function(a, i){ (a.stance === 'ja' ? yesIdx : noIdx).push(i); });
  if(noIdx.length) html += '<div class="ba-group no">👎 Arguments for НЕТ</div>' + noIdx.map(function(i){ return argCard(args[i], i); }).join('');
  if(yesIdx.length) html += '<div class="ba-group yes">👍 Arguments for ДА</div>' + yesIdx.map(function(i){ return argCard(args[i], i); }).join('');
  html += (BA_STATS
      ? '<div class="ba-note">Bluffs can backfire: sharp bots call out arguments the facts do not support.</div>'
      : '<div class="ba-note">Stats are off. Bots that distrust you will discount what you say — check the Table vibe on the board. Turn stats on for odds and recommendations.</div>') +
    '</div><button class="btn secondary" onclick="renderHumanVoteScreen()">Cancel / Vote Directly</button>';
  document.getElementById('ac').innerHTML = html;
}

// ==================== STEALTH COMMUNIST BALANCE PATCH ====================
// Preserve White inference; improve Communist concealment and timing.
// Disable the deliberately loud decoy/infighting behaviors that create
// easy-to-read public patterns, while keeping the existing White brain intact.
COMM_PLAYS.decoy = false;
COMM_PLAYS.infight = false;
COMM_PLAYS.stalinRecord = true;
COMM_TUNE.urgency = true;
COMM_TUNE.recordBonus = 2.2;

// A Communist Premier should not enact red at every possible opportunity.
// Early restraint buys credibility; urgency rises as either side nears victory.
var __stealthChancProb = window.brainCommChancRedProb;
window.brainCommChancRedProb = function(chancIdx, presIdx, st, params){
  var p = __stealthChancProb(chancIdx, presIdx, st, params);
  if(V16.skipSCC || game.roles[chancIdx] !== 'communist' || !COMM_BOLD.on) return p;
  var late = Math.max(st.r / 5, st.w / 4);
  var cover = st.r <= 1 && st.w <= 1 ? 0.48 : (st.r <= 2 && st.w <= 2 ? 0.64 : 0.78);
  var urgency = st.r >= 5 ? 1 : (st.w >= 4 ? 0.96 : 0);
  return Math.max(urgency, Math.min(p, cover + 0.18 * late));
};

// Stalin prioritizes plausible, low-suspicion governments before the zone,
// then takes a calculated shot at election rather than waiting passively.
var __stealthNomination = window.pickNominationCore;
window.pickNominationCore = function(presIdx){
  var pick = __stealthNomination(presIdx);
  if(V16.skipSNOM || game.roles[presIdx] !== 'communist' || game.communistPolicies >= 3 || !BRAIN) return pick;
  var alive = getAliveIndices(), view = brainView(presIdx), best = pick, bestScore = -1e9;
  alive.forEach(function(i){
    if(i === presIdx || i === game.lastGovernment.chancellor) return;
    if(alive.length > 5 && i === game.lastGovernment.president) return;
    var suspicion = baRawPubF(i); if(suspicion == null) suspicion = baPrior();
    var trust = view.F[i] || 0;
    var stalin = game.roles[i] === 'stalin';
    var score = (stalin ? 2.0 : 0) + 1.8 * (1 - suspicion) + 0.8 * (1 - trust);
    if(game.confirmedNotStalin[i]) score -= 0.5;
    score += Math.random() * 0.7;
    if(score > bestScore){ bestScore = score; best = i; }
  });
  // Usually choose the safest-looking candidate; periodically use the
  // underlying utility choice to avoid a repetitive targeting signature.
  return Math.random() < 0.72 ? best : pick;
};

// Coordinate the party's cover: don't pile on a teammate's government unless
// doing so is necessary to prevent a dangerous White government from passing.
var __stealthVote = window.botDecideVote;
window.botDecideVote = function(b){
  var v = __stealthVote(b);
  if(V16.skipSVOTE || game.roles[b] === 'white' || !BRAIN) return v;
  var P = game.currentPresident, C = game.nominatedChancellor;
  if(b === P || b === C) return v;
  var st = brainState();
  if(st.zone) return v; // retain the existing coordinated Stalin-zone logic
  var knownMate = game.roles[P] !== 'white' || game.roles[C] !== 'white';
  if(knownMate && v && Math.random() < 0.16) return false; // occasional natural dissent
  return v;
};

// =====================================================================
// ============ COMMUNIST STEALTH / WIN-RATE PATCH v15 =================
// Role-gated: White decision logic is untouched.
// Goal: make Communists materially stronger without creating an obvious
// voting bloc or predictable "always red" signature.
// =====================================================================
(function(){
  var CP = {
    earlyRed: 0.68,
    midRed: 0.84,
    lateRed: 0.985,
    teammateYes: 0.94,
    teammateDissent: 0.10,
    cleanYes: 0.72,
    exposedNo: 0.78,
    stalinZoneYes: 0.97
  };

  function commRole(i){
    return game.roles && (game.roles[i] === 'communist' || game.roles[i] === 'stalin');
  }
  function isComm(i){ return game.roles && game.roles[i] === 'communist'; }
  function isStalin(i){ return game.roles && game.roles[i] === 'stalin'; }
  function suspicion(i){
    var f = null;
    try { f = baRawPubF(i); } catch(e){}
    if(f === null || f === undefined || !isFinite(f)){
      try { f = brainPubF(i); } catch(e2){}
    }
    return (f === null || f === undefined || !isFinite(f)) ? baPrior() : f;
  }
  function publicClean(i){ return suspicion(i) < 0.28; }
  function publicExposed(i){ return suspicion(i) > 0.62 || isInAnyConflict(i) || !!game.mildSuspicionPresidents[i]; }
  function pressure(){
    var r = (brainState() || {}).r || 0, w = (brainState() || {}).w || 0;
    if(r >= 5 || w >= 4) return CP.lateRed;
    if(r >= 3 || w >= 3) return CP.midRed;
    return CP.earlyRed;
  }
  function knowsTeammate(observer, target){
    if(observer === target) return false;
    if(isComm(observer)) return isComm(target) || isStalin(target);
    if(isStalin(observer) && game.playerCount <= 6) return isComm(target);
    return false;
  }
  function knownStalin(observer, target){
    return observer !== target && isStalin(target) && (isComm(observer) || (isStalin(observer) && game.playerCount <= 6));
  }

  // Legislative pressure: the old logic was too easy to read because a
  // Communist President wanted red almost regardless of board position.
  var oldPP = window.pickPresidentDiscardIdx;
  window.pickPresidentDiscardIdx = function(p, c, pol){
    var idx = oldPP(p, c, pol);
    if(V16.skip15pd || !isComm(p) || !pol || pol.length !== 3) return idx;
    var reds = pol.filter(function(x){ return x === 'communist'; }).length;
    var whites = 3 - reds;
    if(reds === 0) return idx;
    if(reds >= 2) return pol.indexOf('white');

    // One red + two white: passing the red is useful, but occasionally take
    // the white to establish a clean legislative record early.
    var st = brainState(), pC = pressure(), cleanPair = publicClean(p) && publicClean(c);
    var chance = pC;
    if(cleanPair && st.r <= 1 && st.w <= 1) chance -= 0.10;
    if(publicExposed(p) || publicExposed(c)) chance += 0.08;
    return Math.random() < brainClamp(chance, 0.48, 0.995) ? pol.indexOf('white') : pol.indexOf('communist');
  };

  // Communist Premier: stronger red conversion, but with enough restraint
  // to preserve plausible deniability.
  var oldCP = window.brainCommChancRedProb;
  window.brainCommChancRedProb = function(ch, p, st, params){
    var base = oldCP(ch, p, st, params);
    if(V16.skip15cc || !isComm(ch)) return base;
    var r = st.r || 0, w = st.w || 0;
    var chance = r >= 5 ? 1 : (r >= 3 || w >= 3 ? 0.88 : (r <= 1 && w <= 1 ? 0.64 : 0.80));
    if(knowsTeammate(ch, p)) chance = Math.max(chance, 0.93);
    if(publicExposed(ch) && !knowsTeammate(ch, p)) chance -= 0.08;
    if(publicExposed(p) && !knowsTeammate(ch, p)) chance += 0.05;
    if(r >= 4) chance = Math.max(chance, 0.94);
    return brainClamp(Math.max(base * 0.65, chance), 0.35, 1);
  };

  // In the Stalin Zone, known Communists stop being timid. Outside the zone,
  // they deliberately split occasionally so the bloc is not statistically loud.
  var oldVote = window.botDecideVote;
  window.botDecideVote = function(b){
    var original = oldVote(b);
    if(V16.skip15vote || !commRole(b) || !BRAIN) return original;
    var P = game.currentPresident, C = game.nominatedChancellor;
    if(b === P || b === C) return original;
    var st = brainState();
    var pMate = knowsTeammate(b, P), cMate = knowsTeammate(b, C);
    var pStalin = knownStalin(b, P), cStalin = knownStalin(b, C);

    // (v16) The old zone rule here forced ~97% YES for every Communist on every Stalin/teammate
    // ticket even when the ticket could not pass -- that WAS the visible bloc. Zone voting is now
    // decided by the table-aware logic in the v16 block at the bottom of the file.
    if(st.zone) return original;

    if(pMate || cMate){
      var partner = cMate ? C : P;
      var exposed = publicExposed(partner);
      if(exposed && Math.random() < CP.teammateDissent) return false;
      if(Math.random() < (exposed ? 0.86 : CP.teammateYes)) return true;
    }

    // Clean tickets are a valuable cover opportunity for a Communist.
    // Conversely, an obviously suspicious White ticket is worth rejecting.
    var cleanTicket = publicClean(P) && publicClean(C);
    var exposedTicket = publicExposed(P) || publicExposed(C);
    if(cleanTicket && Math.random() < CP.cleanYes) return true;
    if(exposedTicket && Math.random() < CP.exposedNo) return false;
    return original;
  };

  // Communist Secretary nominations: favor electable, clean-looking Whites
  // early, then transition toward red-capable partners as the board matures.
  var oldNom = window.pickNominationCore;
  window.pickNominationCore = function(p){
    var fallback = oldNom(p);
    if(V16.skip15nom || !isComm(p) || !BRAIN) return fallback;
    var alive = getAliveIndices(), st = brainState(), best = fallback, bestScore = -1e9;
    var late = (st.r >= 3 || st.w >= 3);
    alive.forEach(function(i){
      if(i === p || i === game.lastGovernment.chancellor) return;
      if(alive.length > 5 && i === game.lastGovernment.president) return;
      if(BOT_RULES.consistency && botPubliclyAccused(p, i)) return;
      var s = suspicion(i), clean = Math.max(0, 1 - s);
      var score = 2.0 * clean;
      if(knowsTeammate(p, i)) score += late ? 3.0 : 0.9;
      if(knownStalin(p, i)) score += (st.zone ? 7.0 : (late ? 1.8 : -0.8));
      if(game.confirmedNotStalin[i]) score -= 0.4;
      // Avoid repeatedly using the same partner: repetition creates a public tell.
      if(game.lastGovernment && game.lastGovernment.chancellor === i) score -= 5;
      score += Math.random() * 0.65;
      if(score > bestScore){ bestScore = score; best = i; }
    });
    return best;
  };

  // Special power: known Communists should use it to manufacture clean-looking
  // governments, while a Stalin player follows the normal hidden-information model.
  if(typeof window.pickSpecialTarget === 'function'){
    var oldSpecial = window.pickSpecialTarget;
    window.pickSpecialTarget = function(p){
      var old = oldSpecial(p);
      if(!isComm(p) || !BRAIN) return old;
      var alive = getAliveIndices(), best = old, score = -1e9, st = brainState();
      alive.forEach(function(i){
        if(i === p) return;
        var s = suspicion(i), u = 1.6 * (1 - s);
        if(knownStalin(p,i)) u += st.zone ? 7 : 1.2;
        else if(knowsTeammate(p,i)) u += st.zone ? 3.0 : 0.8;
        if(game.confirmedNotStalin[i]) u -= 0.3;
        u += Math.random() * 0.5;
        if(u > score){ score = u; best = i; }
      });
      return best;
    };
  }

  // Veto: Communists should not waste vetoes on ordinary early mixed hands.
  // Save it for a board-changing White enactment or a near-win red/white swing.
  var oldVeto = window.botWantsVeto;
  if(typeof oldVeto === 'function'){
    window.botWantsVeto = function(role, pol){
      if(role !== 'communist' && role !== 'stalin') return oldVeto(role, pol);
      var st = brainState(), reds = pol.filter(function(x){return x === 'communist';}).length;
      if(reds === 0) return false;
      if(st.r >= 5) return false;
      if(st.w >= 4) return true;
      // Mixed 1R/1W: usually enact red; don't veto unless the existing logic
      // strongly wants it. This keeps the action from becoming a tell.
      return oldVeto(role, pol) && (st.r >= 3 || publicExposed(game.currentPresident) || publicExposed(game.currentChancellor));
    };
  }
})();


// =====================================================================
// ============ v16: COMMUNIST BUFF -- table-aware voting, blind Stalin, softer 3-red read ============
// Whites' decision logic is untouched. What changes:
//  1. Communists read the table (votes already cast + how Whites will vote from PUBLIC info) and
//     never spend a YES on a ticket that cannot pass. They ride with the table unless pivotal.
//  2. Stalin (7+ players, blind) votes exactly like a White instead of like a fascist.
//  3. Whites weigh a "3 reds" claim / reshuffle shortfall far less (see brainPresClaimProb and
//     handleDeckReshuffle) unless the audit proves a lie and only one person fits.
// =====================================================================
var V16 = {
  on:true, zone:true, stalinWhite:true, soft3R:true,
  claim3R:0.70,      // how often Whites assume a Communist Secretary claims "3 reds" (was 0.93)
  auditOne:0.8,      // reshuffle: proven lie + exactly one claimer
  auditMany:0.2,     // reshuffle: proven lie + several claimers
  goMin:0.30,        // all-in on Stalin's ticket only if it can pass at least this often
  pivotBlockWhite:0.7,
  minimalCarry:true,
  coverPass:true,    // Communist Secretary with 2 Whites + a White/Stalin Premier: passing W+W is free, so do it often...
  coverWW:0.5        // ...and the Whites' model treats that pass as only weak evidence of innocence (same number)
};
function v16Knows(b){ return game.roles[b] === 'communist' || (game.roles[b] === 'stalin' && game.playerCount <= 6); }

// What would a White sitting in seat j do with this ticket, judged ONLY from public information?
function v16PubWhiteYes(j, P, C, st){
  if(!st.zone){
    if(j === P || j === C || st.tracker >= 2 || !baPublicEvidence(P, C)) return true;
  }
  var ov = window.brainView, saved = game.botInvestigations, fake = {}, rec = game.playerRecords[j];
  ((rec && rec.investigationsDone) || []).forEach(function(iv){ fake[iv.target] = (iv.declared === 'Communist') ? 'communist' : 'white'; });
  var inv = {}; for(var k in saved) inv[k] = saved[k]; inv[j] = fake;
  window.brainView = function(){ return ov(-1); };
  game.botInvestigations = inv;
  try { return szCoordinatedWhiteVote(j, P, C, st); }
  finally { window.brainView = ov; game.botInvestigations = saved; }
}
function v16Table(P, C, st){
  var key = [(game.voteLog || []).length, P, C, st.tracker, st.r, st.w, st.alive.length].join('|');
  if(game._v16t && game._v16t.key === key) return game._v16t;
  var py = {};
  st.alive.forEach(function(j){ if(j === P || j === C) return; py[j] = v16PubWhiteYes(j, P, C, st) ? 0.88 : 0.12; });
  game._v16t = {key:key, py:py};
  return game._v16t;
}
function v16PassFrom(ps, A){
  var dist = [1];
  ps.forEach(function(p){
    var nd = new Array(dist.length + 1); for(var z=0; z<nd.length; z++) nd[z] = 0;
    for(var y=0; y<dist.length; y++){ nd[y] += dist[y] * (1 - p); nd[y+1] += dist[y] * p; }
    dist = nd;
  });
  var need = Math.floor(A / 2) + 1, s = 0;
  for(var q=need; q<dist.length; q++) s += dist[q];
  return s;
}
// pass probability given: votes already cast (certain), Whites predicted from public info,
// other comrades per commPlan(j) ('yes' | 'table' | function)
function v16Pass(b, myVote, P, C, st, tab, commPlan, forceYes){
  var ps = [];
  st.alive.forEach(function(j){
    var p;
    if(j === b) p = myVote ? 1 : 0;
    else if(j === P || j === C) p = 1;
    else if(game.votes[j] !== undefined) p = game.votes[j] ? 1 : 0;
    else if(forceYes && forceYes.indexOf(j) >= 0) p = 1;
    else if(v16Knows(j) && j !== b) p = commPlan(j);
    else p = tab.py[j];
    ps.push(p);
  });
  return v16PassFrom(ps, st.alive.length);
}

function v16ZoneCommVote(b, P, C, st){
  var role = game.roles, tr = st.tracker, pW = role[P] === 'white', cW = role[C] === 'white';
  // ---- hard victory rules (unchanged in spirit) ----
  if(st.w === 4 && tr < 2 && pW && cW) return false;                       // never hand Whites their 5th policy
  if(st.r >= 5 && tr < 2 && (!pW || !cW) && !(hasDispute(b, P) || hasDispute(b, C))) return true;   // finish with a 6th red
  var tab = v16Table(P, C, st);

  // ---- Stalin on the ticket: a YES wins the game, but only if it can actually pass ----
  if(role[C] === 'stalin'){
    var pAll = v16Pass(b, true, P, C, st, tab, function(){ return 1; });
    if(pAll < V16.goMin) return false;                                     // futile: a doomed YES only outs the bloc
    if(!V16.minimalCarry) return true;
    // the least-suspicious comrades who have not voted yet carry it; the rest keep their cover
    var rem = st.alive.filter(function(j){ return v16Knows(j) && j !== P && j !== C && game.votes[j] === undefined; });
    rem.sort(function(x, y){ return ((baRawPubF(x) || 0) - (baRawPubF(y) || 0)) || (x - y); });
    var chosen = [], k = 0;
    for(k = 0; k <= rem.length; k++){
      chosen = rem.slice(0, k);
      if(v16Pass(b, chosen.indexOf(b) >= 0, P, C, st, tab, function(){ return 0; }, chosen) >= 0.92 * pAll) break;
    }
    k = Math.min(rem.length, k + 1);                                       // one spare yes as insurance
    return rem.slice(0, k).indexOf(b) >= 0;
  }

  // ---- any other ticket: ride with the table unless my vote decides it ----
  var plan = function(j){ return tab.py[j] === undefined ? 0.5 : tab.py[j]; };
  var pY = v16Pass(b, true, P, C, st, tab, plan), pN = v16Pass(b, false, P, C, st, tab, plan);
  var comradeOn = !pW || !cW;
  if(pY - pN < 0.12) return pY >= 0.5;                                     // not pivotal: join the likely outcome (no lone YES, no lone NO)
  if(comradeOn) return pY >= 0.5 ? true : false;                           // pivotal and it can pass: get the comrade through
  return Math.random() >= V16.pivotBlockWhite;                             // pivotal on an all-White ticket: usually block it
}

var __v16prev = window.botDecideVote;
window.botDecideVote = function(b){
  if(!BRAIN || !V16.on) return __v16prev(b);
  var P = game.currentPresident, C = game.nominatedChancellor;
  if(b === P || b === C) return __v16prev(b);
  var st = brainState(), role = game.roles[b];
  if(role === 'stalin' && game.playerCount > 6 && V16.stalinWhite){      // blind Stalin must look like a White
    if(st.zone) return szCoordinatedWhiteVote(b, P, C, st);
    __forceWhiteSeat = b;
    try { return __stealthVote(b); } finally { __forceWhiteSeat = -1; }
  }
  if(V16.zone && st.zone && v16Knows(b)) return v16ZoneCommVote(b, P, C, st);
  return __v16prev(b);
};


// ---- Communist President: in the Stalin Zone, only put Stalin forward if the table will really pass him ----
V16.nomStalinMin = 0.60;   // minimum chance (all comrades YES, Whites predicted from public info) to nominate Stalin
V16.nomGate = true;
var __v16prevNom = window.pickNomination;
window.pickNomination = function(p){
  var pick = __v16prevNom(p);
  if(!V16.on || !V16.nomGate || !BRAIN || !v16Knows(p) || game.roles[pick] !== 'stalin') return pick;
  var st = brainState();
  if(!st.zone) return pick;
  var tab = v16Table(p, pick, st);
  var odds = v16Pass(-1, true, p, pick, st, tab, function(){ return 1; });
  if(odds >= V16.nomStalinMin) return pick;
  // Futile: re-run the normal nomination with Stalin off the board (reuses every existing preference).
  var stalin = pick, oldAcc = window.botPubliclyAccused;
  window.botPubliclyAccused = function(a, i){ return i === stalin ? true : oldAcc(a, i); };
  var alt;
  try { alt = __v16prevNom(p); } finally { window.botPubliclyAccused = oldAcc; }
  return (alt === stalin || alt === undefined || alt === null) ? pick : alt;
};

// ---- Optional: Whites' vote-reading table re-fitted to the v16 Communist voting behaviour ----
// The stock VOTE_TAB was measured from the OLD Communist bots. Set V16.refit = true to give the Whites tables
// calibrated to the new behaviour (costs the Communists roughly 0-3 points at 10p; keeps Whites well-calibrated).
V16.refit = false;
var VOTE_TAB_REFIT = {"pre":{"w":[[0.988,0.736,0.409,0.753],[0.98,0.643,0.16,0.033],[0.974,0.672,0.156,0.052]],"f":[[0.861,0.399,0.535,0.77],[0.981,0.91,0.685,0.43],[0.975,0.933,0.815,0.721]]},"zone":{"w":[[0.986,0.86,0.544,0.318],[0.875,0.651,0.189,0.107],[0.868,0.514,0.086,0.023]],"f":[[0.646,0.497,0.233,0.237],[0.959,0.756,0.56,0.361],[0.706,0.599,0.497,0.572]]}};
if(V16.refit) VOTE_TAB = VOTE_TAB_REFIT;


// ---- Communist President with W+W+R and a non-Communist Premier: pass W+W (free cover; the Premier enacts a white anyway) ----
var __v16prevPD = window.pickPresidentDiscardIdx;
window.pickPresidentDiscardIdx = function(p, c, pol){
  var idx = __v16prevPD(p, c, pol);
  if(!V16.on || !V16.coverPass || !BRAIN || game.roles[p] !== 'communist' || !pol || pol.length !== 3) return idx;
  if(game.roles[c] === 'communist' || game.communistPolicies >= 5) return idx;
  var reds = pol.filter(function(x){ return x === 'communist'; }).length;
  if(reds !== 1) return idx;
  return Math.random() < V16.coverWW ? pol.indexOf('communist') : pol.indexOf('white');
};


// =====================================================================
// ============ v17: SUGGEST A PREMIER (before "Continue Revolution") + social table feel ============
// You may recommend a Premier to the NEXT Secretary. Whether they take it depends mainly on how THEY feel about you,
// a little on how the table feels about the candidate, and on whether the pick is sane. A good outcome makes you look
// more trustworthy; a refusal (or an outrageous pick) makes you look worse.
// The "table feel" blends the public read with what the bots are saying: Whites speak their honest private read,
// Communists vouch for their own side and gently smear Whites, and every voice counts in proportion to how much the
// table trusts the speaker -- so a successfully sneaky Communist moves the table far more than an exposed one.
// =====================================================================
var V17 = { on:true, wFeel:0.8, wPick:0.8, wTable:0.3, bias:0, socialShare:0.35,
            goodF:0.70, badF:1.30, outrageousRejectF:1.80, outrageousAcceptF:1.35 };

// ---------- social feel of the table ----------
function baTableWeight(k){
  var f = baRawPubF(k); if(f === null || f === undefined) f = baPrior();
  return brainClamp((1 - f) * 1.4, 0.2, 1.2);        // exposed Communists carry little weight; sneaky ones carry a lot
}
function baSocialSus(j){
  var alive = getAliveIndices(), h = game.humanPlayerIndex, prior = baPrior(), n = game.playerCount;
  var pf = baRawPubF(j); if(pf === null || pf === undefined) pf = prior;
  var num = 0, den = 0, rj = game.roles[j];
  alive.forEach(function(k){
    if(k === j || k === h) return;
    var rk = game.roles[k], w = baTableWeight(k), o;
    var honest = (rk === 'white') || (rk === 'stalin' && n > 6);
    if(honest){ o = 1 - brainView(k).F[j]; }                                   // an honest private read
    else {
      var mate = (rj !== 'white');
      if(mate) o = (pf > 0.65) ? 0.45 : 0.85;                                   // vouch for a teammate (but quietly drop one who is burned)
      else o = brainClamp(0.8 * (1 - pf) - 0.10, 0.05, 0.90);                   // lukewarm / mildly smearing a White
    }
    num += w * o; den += w;
  });
  return den > 0 ? 1 - num / den : pf;
}
function baFeelF(j){
  var pf = baRawPubF(j); if(pf === null || pf === undefined) return baPrior();
  if(!V17.on || !BRAIN) return pf;
  var sh = V17.socialShare;
  try { return brainClamp((1 - sh) * pf + sh * baSocialSus(j), 0, 1); } catch(e){ return pf; }
}

// ---------- when / for whom ----------
function baNextPresPreview(){
  var n = game.playerCount, idx;
  if(game.preSpecialPresident !== null && game.preSpecialPresident !== undefined){ idx = (game.preSpecialPresident + 1) % n; }
  else idx = (game.currentPresident + 1) % n;
  var guard = 0; while(game.players[idx].isDead && guard++ < n) idx = (idx + 1) % n;
  return idx;
}
function baSuggestKey(){ return (game.whitePolicies + game.communistPolicies) + ':' + game.currentPresident; }
function baSuggestCandidates(N){
  var alive = getAliveIndices(), out = [];
  alive.forEach(function(i){
    if(i === N) return;
    if(i === game.lastGovernment.chancellor) return;
    if(alive.length > 5 && i === game.lastGovernment.president) return;
    out.push(i);
  });
  return out;
}
function baSuggestApplicable(){
  try {
    if(SIM_MODE || !V17.on || !BRAIN || !isBotGame() || game.gameOver) return false;
    var h = game.humanPlayerIndex; if(h < 0 || !game.players[h] || game.players[h].isDead) return false;
    if(game.baSuggestKey === baSuggestKey()) return false;                       // one suggestion per government
    var enacted = window.__baEnacted, track = getCommunistTrack(game.playerCount);
    var power = (enacted === 'communist') ? track[game.communistPolicies - 1] : null;
    if(power === 'special' || power === 'win') return false;                      // next Secretary is not predictable
    var N = baNextPresPreview(); if(N === h || game.players[N].isDead) return false;
    return baSuggestCandidates(N).length > 0;
  } catch(e){ return false; }
}

// ---------- how the next Secretary rates things ----------
function baFeelToward(N){             // roughly -3 .. +3: how Secretary N feels about the human (the main driver)
  var h = game.humanPlayerIndex, prior = baPrior(), n = game.playerCount, rN = game.roles[N], rh = game.roles[h];
  var comm = (rN === 'communist') || (rN === 'stalin' && n <= 6);
  var pubF = baRawPubF(h); if(pubF === null || pubF === undefined) pubF = prior;
  var pubTrust = brainClamp((prior - pubF) * 5, -2.5, 2.5);
  var f;
  if(comm){
    // A Communist already KNOWS what you are, but a sneaky one reacts to the public read -- like a White would.
    // Only a teammate gets a warm bias on top of it.
    f = (rh !== 'white') ? 0.8 + 0.4 * pubTrust : 0.8 * pubTrust;
  } else {
    var own = baBeliefOf(N, h);                                                  // this Secretary's OWN belief about you
    f = (own === null || own === undefined) ? pubTrust : brainClamp((prior - own) * 5, -2.5, 2.5);
  }
  if(hasDispute(N, h)) f -= 2;
  return brainClamp(f, -3, 3);
}
function baCandTerm(N, j){            // how much Secretary N trusts your PICK (same -2.5..+2.5 scale as trust of you)
  var prior = baPrior(), n = game.playerCount, rN = game.roles[N], rj = game.roles[j], st = brainState();
  var pubF = baRawPubF(j); if(pubF === null || pubF === undefined) pubF = prior;
  var comm = (rN === 'communist') || (rN === 'stalin' && n <= 6), t;
  if(comm && rj !== 'white'){
    t = (pubF > 0.65) ? -0.4 : 1.2;                                              // a teammate: fine, unless already burned
    if(st.zone && rj === 'stalin'){
      try {
        var tab = v16Table(N, j, st), odds = v16Pass(-1, true, N, j, st, tab, function(){ return 1; });
        t = (odds >= V16.nomStalinMin) ? 2.0 : -2.5;                              // a doomed Stalin ticket is not a good idea
      } catch(e){}
    }
    return t;
  }
  var vw = comm ? null : brainView(N);                                             // a White (or blind Stalin) uses their own belief; a Communist reads a White like the table does
  t = brainClamp((prior - (vw ? vw.F[j] : pubF)) * 5, -2.5, 2.5);
  if(st.zone){
    var S = vw ? vw.S[j] : baRawPubS(j);
    if(S > 0.2) t -= 3 * S;
    if(game.confirmedNotStalin && game.confirmedNotStalin[j]) t += 0.4;
  }
  if(hasDispute(N, j)) t -= 2;
  return brainClamp(t, -3, 3);
}
function baIsOutrageous(N, j){        // judged on PUBLIC information, so the whole table sees it the same way
  var prior = baPrior(), st = brainState();
  if(baFeelF(j) >= prior + 0.30) return true;
  if(hasDispute(N, j)) return true;
  if(st.zone && baRawPubS(j) > 0.35 && !(game.confirmedNotStalin && game.confirmedNotStalin[j])) return true;
  return false;
}
function baSuggestEffect(factor){
  try {
    var h = game.humanPlayerIndex, Lh = new Float64Array(BRAIN.H);
    for(var q = 0; q < BRAIN.H; q++) Lh[q] = (BRAIN.hRole[q][h] !== 0) ? factor : 1;   // <1 = you look more White, >1 = more suspicious
    brainApplyVec(Lh, true);
    baUpdateVibe();
  } catch(e){}
}
function baSuggestReply(N, candName, accept, out, fT){
  var t = (game.players[N].personality && game.players[N].personality.type) || '';
  if(accept){
    if(out) return 'Fine. ' + candName + '. I hope you know what you are doing.';
    if(fT > 1.0) return candName + '? Yes — that is exactly who I was leaning towards.';
    if(t === 'Analytical') return 'The numbers do not argue against ' + candName + '. I will go with it.';
    if(t === 'Cautious') return candName + ' seems safe enough. All right.';
    return 'You make a fair point about ' + candName + '. I will take it.';
  }
  if(out) return candName + '?! After everything at this table? Are you serious?';
  if(fT < -0.8) return 'Why should I take advice from you right now?';
  if(t === 'Analytical') return 'I have my own read on ' + candName + '. I am going another way.';
  if(t === 'Outspoken') return 'No. I do not like ' + candName + '. Not happening.';
  return 'I hear you, but I am choosing someone else.';
}

// ---------- the suggestion itself ----------
function baResolveSuggestion(N, cand){
  var h = game.humanPlayerIndex, prior = baPrior();
  var fT = baFeelToward(N);                                                        // Secretary's trust of YOU          (main)
  var pT = baCandTerm(N, cand);                                                    // Secretary's trust of your PICK    (main)
  var tMe = brainClamp((prior - baFeelF(h)) * 5, -2.5, 2.5);                       // the table's trust of you          (small)
  var tPick = brainClamp((prior - baFeelF(cand)) * 5, -2.5, 2.5);                  // the table's trust of your pick    (small)
  var tT = 0.5 * (tMe + tPick);
  var out = baIsOutrageous(N, cand);
  var z = V17.wFeel * fT + V17.wPick * pT + V17.wTable * tT + V17.bias - (out ? 1.0 : 0);
  var p = brainClamp(1 / (1 + Math.exp(-z)), 0.04, 0.96);
  var accept = Math.random() < p;
  var factor = accept ? (out ? V17.outrageousAcceptF : V17.goodF) : (out ? V17.outrageousRejectF : V17.badF);
  if(accept && !out){                                                              // no farming: already-trusted players gain less
    var pfh = baRawPubF(h); if(pfh === null || pfh === undefined) pfh = prior;
    factor = 1 - (1 - V17.goodF) * brainClamp((pfh - 0.10) / 0.40, 0.25, 1);
  }
  game.baSuggestKey = baSuggestKey();
  game.baPending = accept ? {pres:N, cand:cand, round:(game.whitePolicies + game.communistPolicies)} : null;
  baSuggestEffect(factor);
  return {accept:accept, p:p, out:out, fT:fT, pT:pT, factor:factor};
}

// ---------- UI ----------
function baSuggestButtonHtml(){
  if(!baSuggestApplicable()) return '';
  var N = baNextPresPreview();
  return '<button type="button" class="btn secondary" onclick="baOpenSuggest()" style="margin-top:10px">🗳️ Suggest a Premier to Secretary ' + baEsc(baName(N)) + '</button>';
}
function baOpenSuggest(){
  try {
    if(!baSuggestApplicable()) return;
    sfx('click');
    var N = baNextPresPreview(), h = game.humanPlayerIndex;
    window.__baBack = {at:document.getElementById('at').textContent, ad:document.getElementById('ad').textContent, ac:document.getElementById('ac').innerHTML};
    document.getElementById('at').textContent = 'Suggest a Premier';
    document.getElementById('ad').textContent = 'Secretary ' + baName(N) + ' chooses next. Whom do you recommend? (Table feel shown for each.)';
    var html = '<div class="player-select-grid">';
    baSuggestCandidates(N).forEach(function(i){
      var v = baVibeInfo(baFeelF(i));
      html += '<button class="select-player-btn" onclick="baSuggestPick(' + i + ')">' + baEsc(i === h ? 'You' : baName(i)) + ' <span style="opacity:.85;font-size:.7rem">' + v.icon + ' ' + v.label + '</span></button>';
    });
    html += '</div><button type="button" class="btn secondary" onclick="baSuggestBack()" style="margin-top:12px">← Back</button>';
    document.getElementById('ac').innerHTML = html;
  } catch(e){}
}
function baSuggestBack(){
  var b = window.__baBack; if(!b) return;
  sfx('click');
  document.getElementById('at').textContent = b.at; document.getElementById('ad').textContent = b.ad; document.getElementById('ac').innerHTML = b.ac;
}
function baSuggestPick(cand){
  try {
    if(!baSuggestApplicable()) return;
    sfx('click');
    var N = baNextPresPreview(), h = game.humanPlayerIndex;
    var candName = (cand === h) ? 'me' : baName(cand);
    var r = baResolveSuggestion(N, cand);
    var reply = baSuggestReply(N, (cand === h ? 'you' : baName(cand)), r.accept, r.out, r.fT);
    logSpeech('You', 'Suggestion', 'I suggest ' + candName + ' for Premier.');
    logSpeech(baName(N), 'Secretary', reply, !r.accept && r.out);
    log('🗳️ You suggested ' + (cand === h ? 'yourself' : baName(cand)) + ' to Secretary ' + baName(N) + ': ' + (r.accept ? 'accepted.' : 'declined.'));
    var note = r.accept ? (r.out ? '🟠 They agreed, but the table did not like that pick.' : '🟢 That reflected well on you.')
                        : (r.out ? '🔴 That suggestion raised eyebrows.' : '🟠 You were turned down — the table noticed.');
    document.getElementById('at').textContent = r.accept ? 'Suggestion Accepted' : 'Suggestion Declined';
    document.getElementById('ad').textContent = 'Secretary ' + baName(N) + ' responds:';
    document.getElementById('ac').innerHTML =
      '<div class="speech-card pres"><div class="speech-name">🗳️ You suggest ' + baEsc(candName) + ' for Premier</div></div>' +
      '<div class="speech-card chanc' + (!r.accept && r.out ? ' outrage' : '') + '"><div class="speech-name">👑 ' + baEsc(baName(N)) + ' (next Secretary) replies:</div><div class="speech-text">"' + baEsc(reply) + '"</div></div>' +
      '<div style="font-size:.82rem;margin:8px 0;color:var(--td)">' + note + '</div>' +
      '<button class="btn" onclick="baSuggestContinue()" style="margin-top:10px">Continue Revolution →</button>';
  } catch(e){ try { baSuggestContinue(); } catch(e2){} }
}
function baSuggestContinue(){
  if(transitionLock) return;
  transitionLock = true; sfx('click');
  var d = window.__baDone; window.__baDone = null; if(d) d();
}
function baShowSuggestInterstitial(done){
  window.__baDone = done;
  if(!baSuggestApplicable()){ done(); return; }
  document.getElementById('at').textContent = 'Continue Revolution';
  document.getElementById('ad').textContent = 'The Secretary role passes to ' + baName(baNextPresPreview()) + '.';
  document.getElementById('ac').innerHTML = '<div style="text-align:center">' + baSuggestButtonHtml() +
    '<button class="btn" onclick="baSuggestContinue()" style="margin-top:10px">Continue Revolution →</button></div>';
}
var __v17cpd = window.conductPolicyDebrief;
window.conductPolicyDebrief = function(enacted, onDone){
  window.__baDone = onDone; window.__baEnacted = enacted;
  var h = game.humanPlayerIndex, involved = isBotGame() && (game.currentPresident === h || game.currentChancellor === h);
  var cb = onDone;
  if(involved && !SIM_MODE && V17.on && BRAIN) cb = function(){ baShowSuggestInterstitial(onDone); };   // human flows have no Continue screen of their own
  return __v17cpd(enacted, cb);
};

// ---------- the Secretary acts on an accepted suggestion ----------
var __v17prevNom = window.pickNomination;
window.pickNomination = function(p){
  var s = game.baPending;
  if(s){
    game.baPending = null;                                                       // good for one nomination only
    var alive = getAliveIndices();
    var tot = game.whitePolicies + game.communistPolicies;
    if(s.pres === p && tot >= s.round && tot <= s.round + 1 && p !== game.humanPlayerIndex && alive.indexOf(s.cand) >= 0 && s.cand !== p &&
       s.cand !== game.lastGovernment.chancellor && !(alive.length > 5 && s.cand === game.lastGovernment.president)){
      try { log('🗳️ Secretary ' + baName(p) + ' takes your suggestion.'); } catch(e){}
      return s.cand;
    }
  }
  return __v17prevNom(p);
};

// ---------- table feel shown next to each Premier candidate when YOU nominate ----------
var __v17snu = window.showNominationUI;
window.showNominationUI = function(){
  __v17snu();
  try {
    if(SIM_MODE || !BRAIN || game.mode === 'local') return;
    document.querySelectorAll('#ac .select-player-btn').forEach(function(b){
      var m = (b.getAttribute('onclick') || '').match(/nominateChancellor\((\d+)\)/); if(!m) return;
      var v = baVibeInfo(baFeelF(+m[1]));
      b.innerHTML = b.innerHTML + ' <span style="opacity:.85;font-size:.7rem">' + v.icon + ' ' + v.label + '</span>';
    });
  } catch(e){}
};

// v18: faction objectives, public-information coalition planning and narrative memory.
(function(){
  function sus(i){ var x=baRawPubF(i); return x == null || !isFinite(x) ? baPrior() : x; }
  function informed(i){return game.roles[i]==='communist' || (game.roles[i]==='stalin' && game.playerCount<=6);}
  function mate(i,j){return i===j || (informed(i) && game.roles[j]!=='white');}
  function memory(i){
    if(!game.commNarrative) game.commNarrative={};
    return game.commNarrative[i] || (game.commNarrative[i]={cover:0,reds:0,frames:0,partners:{},lastCover:-10});
  }
  function objective(i){
    var st=brainState(), weights=st.r>=5?[.25,.05,.65,.05]:st.r>=4?[.45,.10,.35,.10]:st.r>=2?[.45,.25,.15,.15]:[.30,.45,.05,.20];
    if(st.w>=4) weights=[.70,.02,.25,.03];
    return {st:st,advance:weights[0],cover:weights[1],stalin:weights[2],survival:weights[3]};
  }
  function threshold(st,i){return sus(i)>.65?.50:st.r>=5?.15:st.r>=4?.30:.40;}
  function eligible(p){var a=getAliveIndices(), g=game.lastGovernment||{};return a.filter(function(i){return i!==p && i!==g.chancellor && !(a.length>5 && i===g.president);});}
  function publicYes(j,P,C,st){return j===P||j===C ? .98 : v16Table(P,C,st).py[j];}
  function pass(P,C,st,yes,no,observed){
    return v16PassFrom(st.alive.map(function(j){
      if(observed && game.votes[j]!==undefined) return game.votes[j]?1:0;
      if(yes.indexOf(j)>=0) return 1;
      if(no.indexOf(j)>=0) return 0;
      return publicYes(j,P,C,st);
    }),st.alive.length);
  }
  function faction(p,st){return st.alive.filter(function(j){return mate(p,j) && j!==game.humanPlayerIndex;});}
  var oldVote=window.botDecideVote;
  window.botDecideVote=function(b){
    if(!BRAIN || game.roles[b]==='white') return oldVote(b);
    var P=game.currentPresident,C=game.nominatedChancellor,o=objective(b),st=o.st;
    if(!informed(b)){
      // Blind Stalin uses only his own public/private evidence; never hidden teammate roles.
      if(b===C && st.zone) return true;
      if(b===P || b===C) return oldVote(b);
      return v16PubWhiteYes(b,P,C,st);
    }
    var winning=game.roles[C]==='stalin' && st.zone;
    var favorable=winning || mate(b,P) || mate(b,C);
    var block=!favorable && (st.w>=3 || st.r>=3);
    if(!favorable && !block) return v16PubWhiteYes(b,P,C,st);
    var members=faction(b,st).filter(function(j){return game.votes[j]===undefined;});
    var allY=pass(P,C,st,members,[],true),allN=pass(P,C,st,[],members,true);
    if(favorable && allY < (winning?threshold(st,C)*.6:.22)) return v16PubWhiteYes(b,P,C,st);
    // Enumerate small faction subsets: maximize outcome, then minimize visible coordination.
    var target=favorable ? allY*.97 : (1-allN)*.97;
    var best=null,cost=Infinity,bestOutcome=-1;
    for(var mask=0;mask<(1<<members.length);mask++){
      var chosen=members.filter(function(j,k){return !!(mask&(1<<k));});
      var others=members.filter(function(j){return chosen.indexOf(j)<0;});
      // Unneeded faction members use natural public votes, rather than forced dissent.
      var probability=pass(P,C,st,favorable?chosen:[],favorable?[]:chosen,true);
      var outcome=favorable?probability:1-probability;
      var exposure=chosen.reduce(function(s,j){
        var predicted=publicYes(j,P,C,st), natural=favorable?predicted:1-predicted;
        return s+1+.8*sus(j)+.8*(1-natural);
      },0);
      if(outcome>=target && (best===null || exposure<cost)){best=chosen;cost=exposure;}
      bestOutcome=Math.max(bestOutcome,outcome);
    }
    if(best===null) return favorable;
    var chosen=best.indexOf(b)>=0;
    if(chosen) return favorable;
    if(b===P || b===C) return true;
    return v16PubWhiteYes(b,P,C,st);
  };
  var oldNom=window.pickNomination;
  window.pickNomination=function(p){
    if(!BRAIN || game.roles[p]==='white') return oldNom(p);
    // Consume the existing accepted-suggestion hook before strategically ranking alternatives.
    if(game.baPending) return oldNom(p);
    var o=objective(p),st=o.st,candidates=eligible(p),m=memory(p),best=null,score=-Infinity;
    candidates.forEach(function(c){
      var odds=pass(p,c,st,informed(p)?faction(p,st):[p],[],false);
      var trust=1-sus(c),cover=trust*(1-sus(p)),advance;
      if(informed(p)) advance=mate(p,c)?1:.48+.35*sus(c);
      else advance=1-brainView(p).F[c];
      var strike=informed(p)&&game.roles[c]==='stalin'&&st.zone;
      var utility=odds*(o.advance*advance+o.cover*cover+o.survival*trust);
      if(strike) utility=odds>=threshold(st,c)?2+odds*4:-1;
      if(game.roles[p]==='stalin') utility+=.7*odds*trust; // build credible relationships
      if(!st.zone && informed(p) && game.roles[c]==='stalin') utility-=.60*odds*trust;
      if(hasDispute(p,c)||botPubliclyAccused(p,c)) utility-=.35;
      utility-=.07*(m.partners[c]||0);
      utility+=Math.random()*.05;
      if(utility>score){score=utility;best=c;}
    });
    return best===null?oldNom(p):best;
  };
  var oldDiscard=window.pickPresidentDiscardIdx;
  window.pickPresidentDiscardIdx=function(p,c,pol){
    if(!BRAIN || game.roles[p]==='white') return oldDiscard(p,c,pol);
    var wi=pol.indexOf('white'),ri=pol.indexOf('communist'),o=objective(p),st=o.st;
    if(wi<0 || ri<0) return 0; // always a valid index for uniform hands
    var whites=pol.filter(function(x){return x==='white';}).length;
    if(game.roles[p]==='stalin' && !informed(p)){
      if(st.r>=5 || st.w>=4) return wi;
      return ri; // self-earned White credibility; no secret role knowledge
    }
    var m=memory(p),blame=sus(c)-sus(p),needsCover=m.cover<1 && st.r<3 && st.w<3;
    if(whites===1){
      var red=st.r>=4||st.w>=4?1:brainClamp(.78+.22*blame-(needsCover?.18:0),.45,.98);
      return Math.random()<red?wi:ri;
    }
    // RWW with a White Premier cannot force red: take guaranteed WW credibility.
    if(!mate(p,c) && game.roles[c]==='white') return ri;
    return Math.random()<(st.r>=4||st.w>=4?.99:needsCover?.55:.85)?wi:ri;
  };
  var oldRed=window.brainCommChancRedProb;
  window.brainCommChancRedProb=function(c,p,st,params){
    if(game.roles[c]!=='communist') return oldRed(c,p,st,params);
    if(st.r>=5 || st.w>=4) return 1;
    var m=memory(c),blame=sus(p)-sus(c);
    return brainClamp((st.r>=3?.94:st.r>=2?.85:.72)+.18*blame-(m.cover<1&&st.r<2?.14:0),.45,.995);
  };
  var oldClaim=window.brainPresClaim;
  window.brainPresClaim=function(p,c,enacted,drawn,passed){
    if(game.roles[p]!=='communist' || enacted!=='communist') return oldClaim(p,c,enacted,drawn,passed);
    var d=drawn.filter(function(x){return x==='white';}).length,a=passed.filter(function(x){return x==='white';}).length;
    var seen=(game.deckCycle&&game.deckCycle.claimedDemSeen)||0,cap=cycleWhiteCeiling();
    // 50% exploitation of the Secretary credibility asymmetry; no weakening of White inference.
    // Only frame a White or a publicly burned comrade, never a developing Stalin.
    var frame=game.roles[c]==='white' || (game.roles[c]==='communist' && sus(c)>.60);
    var plausible=seen+Math.max(1,d)<=cap;
    if(frame && plausible && sus(p)<sus(c)+.25 && Math.random()<.5){
      var cd=Math.max(1,d); memory(p).frames++;
      return {cd:cd,pf:true,pa:1,quote:brainPresQuote(cd,1,game.players[c].name)};
    }
    // Compatible forced-red cover; never invent impossible draw/pass combinations.
    return {cd:0,pf:false,pa:0,quote:brainPresQuote(0,0,game.players[c].name)};
  };
  var oldObserve=window.brainObserveGovernment;
  window.brainObserveGovernment=function(p,c,enacted,claims){
    var result=oldObserve.apply(this,arguments);
    [p,c].forEach(function(i){
      if(game.roles[i]==='white') return;
      var m=memory(i),partner=i===p?c:p;
      m.partners[partner]=(m.partners[partner]||0)+1;
      if(enacted==='white'){m.cover++;m.lastCover=(game.voteLog||[]).length;} else m.reds++;
      // Narrative calls are public commitments judged by the existing evidence engine.
      // Blind Stalin's commitments depend on his belief, never partner's true role.
      var trust=informed(i)?(mate(i,partner)&&sus(partner)<.55)||sus(partner)<.28:brainView(i).F[partner]<.35;
      if(enacted==='white' || sus(partner)>.65) recordCall(i,partner,trust,.20,'strategy');
    });
    return result;
  };
  var oldSpecial=window.pickSpecialTarget;
  window.pickSpecialTarget=function(p){
    if(!BRAIN || !informed(p)) return oldSpecial(p);
    var st=brainState(),best=p,score=-Infinity;
    st.alive.forEach(function(j){if(j===p)return;
      // Give a clean comrade the Secretary seat to nominate Stalin, not Stalin himself.
      var u=(1-sus(j))*(mate(p,j)?2:1);
      if(st.zone && game.roles[j]==='communist') u+=2;
      if(st.zone && game.roles[j]==='stalin') u-=1;
      if(u>score){score=u;best=j;}
    });return best===p?oldSpecial(p):best;
  };
})();

// Reset strategic memory and prediction caches for every new game/simulation.
(function(){var init=window.brainInit; window.brainInit=function(){game.commNarrative={};game._v16t=null;return init.apply(this,arguments);};})();

(function(){
  var veto=window.botWantsVeto;
  window.botWantsVeto=function(role,pol){
    if(role==='white') return veto(role,pol);
    // At veto unlock, a red card is a direct policy victory. All-White hands should be vetoed.
    return pol.indexOf('communist')<0;
  };
  var social=window.baSocialSus;
  window.baSocialSus=function(j){
    // Keep honest speakers' existing opinions; adapt only informed faction voices.
    var alive=getAliveIndices(),num=0,den=0,pf=baRawPubF(j);
    if(pf==null)pf=baPrior();
    alive.forEach(function(k){
      if(k===j || k===game.humanPlayerIndex)return;
      var role=game.roles[k],weight=baTableWeight(k),opinion;
      if(role==='white' || (role==='stalin' && game.playerCount>6)) opinion=1-brainView(k).F[j];
      else {
        var m=game.commNarrative&&game.commNarrative[k],partner=m&&m.partners[j]||0;
        if(game.roles[j]!=='white'){
          // Abandon burned comrades; softly support Stalin without universally vouching for the bloc.
          opinion=pf>.65?.30:game.roles[j]==='stalin'?.86:.68;
          if(partner>1)opinion-=.08;
        } else {
          // Trusted White relationships buy credibility; controversial Whites are plausible scapegoats.
          opinion=pf<.25?.88:brainClamp(.72*(1-pf)-.12,.08,.80);
          if(partner && pf<.4)opinion+=.05;
        }
      }
      num+=weight*brainClamp(opinion,0,1);den+=weight;
    });
    return den?1-num/den:social(j);
  };
})();


// v19: review unresolved card disputes from evolving public evidence, without replaying it.
function reviewOpenCardDisputes(){
  if(!BRAIN) return;
  (game.cardChecks||[]).forEach(function(rc){
    if(rc.status==='consistent' || !rc.claim) return;
    var view=brainView(-1),P=rc.P,C=rc.C;
    var st=brainState(),rs=tcReliability(P,'Secretary',st.pd[0]||.24),rp=tcReliability(C,'Premier',st.pd[0]||.24);
    // Posterior beliefs already integrate rounds, votes, investigations and deck evidence.
    // This is a display/review calculation, not another application of the same facts.
    var ws=Math.max(.002,view.F[P])*(1-rs.r+.15),wc=Math.max(.002,view.F[C])*(1-rp.r+.15);
    if(rc.status==='conflict') ws*=.30/.88; // v45: keep dossier/review weighting aligned with card-check likelihood
    rc.blameS=brainClamp(ws/(ws+wc),.05,.95);rc.blameP=1-rc.blameS;
    // Only an independently eliminated White hypothesis can settle a player's role.
    // Public certainty comes from posterior evidence, not the private hands/true roles.
    rc.resolved=view.F[P]>.9999 || view.F[C]>.9999;
    rc.reviewVersion=BRAIN.ver;
  });
}
(function(){
  ['brainObserveGovernment','brainObserveVotes','brainObserveInvestigation','brainObserveExecution','handleDeckReshuffle'].forEach(function(name){
    var old=window[name];
    window[name]=function(){var r=old.apply(this,arguments);reviewOpenCardDisputes();return r;};
  });
  var facts=window.baFacts;
  window.baFacts=function(i){
    var extra=[];
    (game.cardChecks||[]).forEach(function(rc){
      if(rc.status==='consistent'||!rc.claim||(rc.P!==i&&rc.C!==i))return;
      var share=rc.P===i?rc.blameS:rc.blameP;
      extra.push({t:rc.resolved?'bad':'warn',x:'Round '+rc.round+' card dispute: '+Math.round(share*100)+'% of provisional blame. '+
        (rc.resolved?'Strong later public evidence; review counterpart separately.':'Both players remain suspects; later facts may change this.')});
    });
    return extra.concat(facts(i)).slice(0,9);
  };
})();

window.GAME_BUILD_ID = "claims-public-only-2026-10-06-v5";


// =====================================================================
// ============ v19: execution suggestions, investigation rules, doomed-bloc fix ============
// Appended at the END of game.js so it wraps everything above.
// =====================================================================
var V19 = {
  on:true,
  // --- investigations ---
  clearedSkip:0.05,   // Whites skip "always check the next Secretary" only if public suspicion of him is already below this (set 0 = truly always)
  whiteOff:0.12,      // chance a White ignores the habit and checks someone else
  commNext:0.88,       // chance a Communist Secretary follows the White habit (may be Stalin if the habit points at him); otherwise never picks Stalin
  // --- Communist voting ---
  minPass:0.5,        // not game point: a teammate YES bloc only forms if the ticket can pass at least this often with every comrade YES
  minPassZone:0.4,    // same, in the Stalin zone but without Stalin on the ticket
  // --- suggest an execution ---
  exWFeel:0.7, exWPick:1.0, exWTable:0.3, exBias:-0.9
};

// ---------------------------------------------------------------------
// (1) INVESTIGATIONS
//   Habit: 1st check = next Secretary; later checks = the previous checker (verify their claim).
//   Whites follow it ~88% of the time (not if the target is already publicly cleared). Communists follow it 88% of the time
//   (Stalin only if the habit points at him), and otherwise never pick Stalin.
// ---------------------------------------------------------------------
// Track who has investigated, in order, so the NEXT checker can verify the previous one.
var __boi19 = window.brainObserveInvestigation;
window.brainObserveInvestigation = function(presIdx, target, declaredTeam){
  if(!game.invLog) game.invLog = [];
  game.invLog.push({by:presIdx, target:target});
  return __boi19.apply(this, arguments);
};
var __binit19 = window.brainInit;
window.brainInit = function(){ game.invLog = []; return __binit19.apply(this, arguments); };

// The "habit" target: the previous checker (verify their claim = max info); first check of the game = the next Secretary.
function v19RuleTarget(presIdx){
  var done = game.botInvestigations[presIdx] || {}, log = game.invLog || [];
  function ok(i){ return i !== presIdx && i !== undefined && i !== null && game.players[i] && !game.players[i].isDead && !done[i]; }
  for(var k = log.length - 1; k >= 0; k--) if(ok(log[k].by)) return log[k].by;
  var next = peekNextPresident();
  return ok(next) ? next : null;
}
var __bpi19 = window.brainPickInvestigation;
window.brainPickInvestigation = function(presIdx, candidates){
  if(!V19.on || !candidates || !candidates.length) return __bpi19(presIdx, candidates);
  var role = game.roles[presIdx], n = game.playerCount, rule = v19RuleTarget(presIdx);
  if(role === 'white'){
    if(rule !== null && candidates.indexOf(rule) !== -1 && Math.random() >= V19.whiteOff){            // usually follow the habit; sometimes check someone else
      var pf = null; try { pf = baRawPubF(rule); } catch(e){}
      if(!(pf !== null && pf !== undefined && pf < V19.clearedSkip)) return __bpi19(presIdx, [rule]);
    }
    var others = candidates.filter(function(t){ return t !== rule; });   // off-habit: genuinely someone else
    return __bpi19(presIdx, (rule !== null && others.length) ? others : candidates);
  }
  var cands = candidates;
  if(role === 'communist'){                                   // Stalin is never a random pick (only when the White habit points at him)
    var ns = candidates.filter(function(t){ return game.roles[t] !== 'stalin'; });
    if(ns.length) cands = ns;
  }
  var blind = (role === 'stalin' && n > 6);
  var pMimic = blind ? 0.9 : V19.commNext;
  if(rule !== null && candidates.indexOf(rule) !== -1 && Math.random() < pMimic) return __bpi19(presIdx, [rule]);
  return __bpi19(presIdx, cands);
};

// ---------------------------------------------------------------------
// (2) COMMUNIST VOTING BLOC: only when it is needed
//   Not game point (no Stalin election, not one policy from either win) and the ticket cannot pass even with
//   every comrade voting YES  ->  vote like an independent White instead of piling on.
// ---------------------------------------------------------------------
var __bdv19 = window.botDecideVote;
window.botDecideVote = function(b){
  var v = __bdv19(b);
  try {
    if(!V19.on || !BRAIN || v !== true || game.roles[b] === 'white' || !v16Knows(b)) return v;
    var P = game.currentPresident, C = game.nominatedChancellor;
    if(b === P || b === C) return v;
    var st = brainState();
    if(game.roles[C] === 'stalin' && st.zone) return v;                    // game point: Stalin election
    if(st.r >= 5 || st.w >= 4) return v;                                   // game point: one policy from a win
    var tab = v16Table(P, C, st), h = game.humanPlayerIndex;
    var ps = st.alive.map(function(j){
      if(j === P || j === C) return 1;
      if(game.votes[j] !== undefined) return game.votes[j] ? 1 : 0;       // already cast
      if(v16Knows(j) && j !== h) return 1;                                 // best case: every comrade backs it
      return tab.py[j] === undefined ? 0.5 : tab.py[j];                    // Whites as the public table would vote
    });
    var best = v16PassFrom(ps, st.alive.length);
    if(best < (st.zone ? V19.minPassZone : V19.minPass)) return v16PubWhiteYes(b, P, C, st);
  } catch(e){}
  return v;
};

// ---------------------------------------------------------------------
// (3) SUGGEST AN EXECUTION to the Secretary who holds the power (same idea as "Suggest a Premier")
//   Works best when the Secretary trusts you, the table trusts you, and your target already looks suspicious.
// ---------------------------------------------------------------------
function baExecInformed(P){ var r = game.roles[P]; return r === 'communist' || (r === 'stalin' && game.playerCount <= 6); }
function baExecCandidates(P){
  var h = game.humanPlayerIndex;
  return getAliveIndices().filter(function(i){ return i !== P && i !== h; });
}
function baExecKey(){ return game.communistPolicies + ':' + game.whitePolicies + ':' + game.currentPresident; }
function baExecApplicable(){
  try {
    if(SIM_MODE || !V19.on || !V17.on || !BRAIN || !isBotGame() || game.gameOver) return false;
    if(game.powerType !== 'execution' || game.baExecDone === baExecKey()) return false;
    var h = game.humanPlayerIndex, P = game.currentPresident;
    if(h < 0 || !game.players[h] || game.players[h].isDead || P === h || game.players[P].isDead) return false;
    return baExecCandidates(P).length > 0;
  } catch(e){ return false; }
}
function baExecWant(P, t){                  // roughly -3 .. +3: how much Secretary P wants t dead
  var prior = baPrior(), pubF = baRawPubF(t); if(pubF === null || pubF === undefined) pubF = prior;
  if(baExecInformed(P)){
    if(game.roles[t] !== 'white') return -5;                                 // never a comrade, never Stalin
    return brainClamp(0.8 + 1.4 * (1 - pubF) + (hasDispute(P, t) ? 0.8 : 0), -3, 3);   // a trusted White is the best target
  }
  var vw = brainView(P), st = brainState();
  var w = brainClamp((vw.F[t] - prior) * 5, -2.5, 2.5);
  w += (st.zone ? 4 : 1.5) * vw.S[t];                                         // Stalin risk is what really justifies a kill
  if(game.confirmedNotStalin && game.confirmedNotStalin[t]) w -= 0.4;
  if(hasDispute(P, t)) w += 0.8;
  return brainClamp(w, -3, 3);
}
function baExecOutrageous(t){               // judged on PUBLIC information: the whole table sees a clean player being killed
  var prior = baPrior(), S = baRawPubS(t);
  return baFeelF(t) < prior - 0.10 && !(S > 0.2);
}
function baExecResolve(P, t){
  var h = game.humanPlayerIndex, prior = baPrior(), informed = baExecInformed(P);
  var fT = baFeelToward(P);                                                    // Secretary's trust of YOU      (main)
  var pT = baExecWant(P, t);                                                   // Secretary wants THEM dead     (main)
  var tMe = brainClamp((prior - baFeelF(h)) * 5, -2.5, 2.5);                   // the table's trust of you      (small)
  var tPick = brainClamp((baFeelF(t) - prior) * 5, -2.5, 2.5);                 // the table also wants them gone (small)
  var out = baExecOutrageous(t);
  var z = V19.exWFeel * fT + V19.exWPick * pT + V19.exWTable * 0.5 * (tMe + tPick) + V19.exBias - ((out && !informed) ? 1.0 : 0);
  var hard = informed && game.roles[t] !== 'white';
  var p = hard ? 0 : brainClamp(1 / (1 + Math.exp(-z)), 0.03, 0.95);
  var accept = Math.random() < p;
  var factor;
  if(accept){
    if(out) factor = 1.45;                                                     // you pushed a kill on a clean player
    else { var pfh = baRawPubF(h); if(pfh === null || pfh === undefined) pfh = prior; factor = 1 - 0.2 * brainClamp((pfh - 0.10) / 0.40, 0.25, 1); }
  } else factor = out ? 1.7 : 1.15;
  game.baExecPending = accept ? {pres:P, target:t} : null;
  baSuggestEffect(factor);
  if(!accept){                                                                 // refusing to kill the obvious Stalin suspect is itself a tell
    try {
      var S = baRawPubS(t);
      if(S !== null && S !== undefined && S >= 0.3){
        var Lp = new Float64Array(BRAIN.H);
        for(var q = 0; q < BRAIN.H; q++) Lp[q] = (BRAIN.hRole[q][P] !== 0) ? 1.3 : 1;
        brainApplyVec(Lp, false); baUpdateVibe();
      }
    } catch(e){}
  }
  return {accept:accept, p:p, out:out, fT:fT, pT:pT, factor:factor};
}
function baExecReply(P, name, accept, out, fT){
  var t = (game.players[P].personality && game.players[P].personality.type) || '';
  if(accept){
    if(out) return 'Fine. ' + name + '. I hope you know what you are doing.';
    if(fT > 1.0) return 'I trust you. ' + name + ' it is.';
    if(t === 'Analytical') return 'My read on ' + name + ' agrees with yours. I will do it.';
    if(t === 'Cautious') return 'A heavy decision... but ' + name + ' is a risk I will not take. Done.';
    return 'All right. ' + name + '. I will carry it out.';
  }
  if(out) return name + '?! They have done nothing to deserve that. What are you playing at?';
  if(fT < -0.8) return 'I do not take orders from you. ' + name + ' stays.';
  if(t === 'Analytical') return 'The evidence does not point at ' + name + '. I am deciding myself.';
  if(t === 'Outspoken') return 'No. I am not killing ' + name + ' because you said so.';
  return 'I hear you, but I will make this decision myself.';
}

// ---- UI ----
function baExecShow(){
  var P = game.currentPresident;
  document.getElementById('pt').textContent = 'Executive Power';
  document.getElementById('at').textContent = 'Execution Power';
  document.getElementById('ad').textContent = 'Secretary ' + baName(P) + ' may execute a player.';
  document.getElementById('ac').innerHTML = '<div style="text-align:center">' +
    '<button type="button" class="btn secondary" onclick="baExecOpen()" style="margin-top:10px">🗡️ Suggest an execution to Secretary ' + baEsc(baName(P)) + '</button>' +
    '<button class="btn" onclick="baExecGo()" style="margin-top:10px">Let ' + baEsc(baName(P)) + ' decide →</button></div>';
}
function baExecOpen(){
  try {
    if(!baExecApplicable()) return;
    sfx('click');
    var P = game.currentPresident;
    document.getElementById('at').textContent = 'Suggest an Execution';
    document.getElementById('ad').textContent = 'Secretary ' + baName(P) + ' decides. Whom do you want executed? (Table feel shown for each.)';
    var html = '<div class="player-select-grid">';
    baExecCandidates(P).forEach(function(i){
      var v = baVibeInfo(baFeelF(i));
      html += '<button class="select-player-btn" onclick="baExecPick(' + i + ')" style="border-color:var(--r)">' + baEsc(baName(i)) + ' <span style="opacity:.85;font-size:.7rem">' + v.icon + ' ' + v.label + '</span></button>';
    });
    html += '</div><button type="button" class="btn secondary" onclick="baExecShow()" style="margin-top:12px">← Back</button>';
    document.getElementById('ac').innerHTML = html;
  } catch(e){}
}
function baExecPick(t){
  try {
    if(!baExecApplicable()) return;
    sfx('click');
    var P = game.currentPresident, name = baName(t);
    var r = baExecResolve(P, t);
    var reply = baExecReply(P, name, r.accept, r.out, r.fT);
    game.baExecDone = baExecKey();                                             // one suggestion per execution
    logSpeech('You', 'Suggestion', 'I suggest we execute ' + name + '.');
    logSpeech(baName(P), 'Secretary', reply, !r.accept && r.out);
    log('🗡️ You suggested executing ' + name + ' to Secretary ' + baName(P) + ': ' + (r.accept ? 'accepted.' : 'declined.'));
    var note = r.accept ? (r.out ? '🟠 They agreed, but the table did not like that target.' : '🟢 That reflected well on you.')
                        : (r.out ? '🔴 That suggestion raised eyebrows.' : '🟠 You were turned down — the table noticed.');
    document.getElementById('at').textContent = r.accept ? 'Suggestion Accepted' : 'Suggestion Declined';
    document.getElementById('ad').textContent = 'Secretary ' + baName(P) + ' responds:';
    document.getElementById('ac').innerHTML =
      '<div class="speech-card pres"><div class="speech-name">🗡️ You suggest executing ' + baEsc(name) + '</div></div>' +
      '<div class="speech-card chanc' + (!r.accept && r.out ? ' outrage' : '') + '"><div class="speech-name">👑 ' + baEsc(baName(P)) + ' (Secretary) replies:</div><div class="speech-text">"' + baEsc(reply) + '"</div></div>' +
      '<div style="font-size:.82rem;margin:8px 0;color:var(--td)">' + note + '</div>' +
      '<button class="btn" onclick="baExecGo()" style="margin-top:10px">Continue →</button>';
  } catch(e){ try { baExecGo(); } catch(e2){} }
}
function baExecGo(){
  var key = baExecKey();
  if(window.__baExecGoKey === key) return;                                     // double-click guard
  window.__baExecGoKey = key;
  game.baExecDone = key;
  sfx('click');
  window.__baExecSkip = true;
  window.triggerPower();
}
var __tp19 = window.triggerPower;
window.triggerPower = function(){
  if(window.__baExecSkip){ window.__baExecSkip = false; return __tp19.apply(this, arguments); }
  if(baExecApplicable()){
    transitionLock = false; game.phase = 'power'; renderGameBoard();
    baExecShow();
    return;
  }
  return __tp19.apply(this, arguments);
};

// ---- the Secretary acts on an accepted suggestion ----
var __pet19 = window.pickExecutionTarget;
window.pickExecutionTarget = function(P){
  var s = game.baExecPending;
  if(s){
    game.baExecPending = null;                                                 // good for one execution only
    if(s.pres === P && s.target !== P && game.players[s.target] && !game.players[s.target].isDead){
      try { log('🗡️ Secretary ' + baName(P) + ' takes your suggestion.'); } catch(e){}
      return s.target;
    }
  }
  return __pet19(P);
};


// =====================================================================
// v20 — stealth voting and measured White caution in the Stalin Zone
// This final override is intentionally small: it retains v19 strategy,
// investigations, persuasion, and card deduction unchanged.
// =====================================================================
var V20 = { on:true, whiteZoneCaution:0.18, whiteBulletCaution:0.23 };
var __voteBeforeV20 = window.botDecideVote;
window.botDecideVote = function(b){
  var vote = __voteBeforeV20(b);
  if(!V20.on || !BRAIN || game.gameOver) return vote;
  var P = game.currentPresident, C = game.nominatedChancellor;
  if(P === null || C === null || C === undefined || b === P || b === C) return vote;
  var st = brainState(), role = game.roles[b];

  // Communists must *not* form a conspicuous NO bloc on a publicly clean
  // government. Judge cleanliness from information visible to the table,
  // never from the nominees' secret identities.
  // A Communist who has already been publicly exposed can instead try to
  // disrupt a clean government. Four White policies is the other exception.
  if(role === 'communist' || (role === 'stalin' && game.playerCount <= 6)){
    var fp = baRawPubF(P), fc = baRawPubF(C), fb = baRawPubF(b);
    var prior = baPrior();
    var cleanLimit = Math.max(0.42, prior + 0.12);
    var cleanTicket = (fp == null || fp < cleanLimit) &&
                      (fc == null || fc < cleanLimit) &&
                      !isInAnyConflict(P) && !isInAnyConflict(C) &&
                      !game.mildSuspicionPresidents[P] && !game.mildSuspicionPresidents[C];
    var exposedSelf = (fb != null && fb >= Math.max(0.62, prior + 0.30)) ||
                      isInAnyConflict(b) || !!game.mildSuspicionPresidents[b];
    if(cleanTicket && st.w < 4 && !exposedSelf) return true;
    return vote;
  }

  // An actual White (or a blind Stalin imitating one) has a modestly lower
  // willingness to approve Zone governments: a seemingly trustworthy Premier
  // might still be Stalin, and at 4+ reds a Secretary may receive execution.
  // Keep the existing belief / trust-network decision as the starting point;
  // no secret-role knowledge enters this White decision.
  var behavesWhite = role === 'white' || (role === 'stalin' && game.playerCount > 6);
  if(behavesWhite && st.zone && vote === true){
    var caution = st.r >= 4 ? V20.whiteBulletCaution : V20.whiteZoneCaution;
    // A confirmed-safe Premier reduces Stalin risk, but not the Secretary's
    // danger; the existing model already weighs their respective records.
    if(game.confirmedNotStalin && game.confirmedNotStalin[C]) caution *= 0.55;
    // At two failed elections, a further rejection immediately risks chaos.
    if(st.tracker >= 2) caution *= 0.45;
    if(Math.random() < caution) return false;
  }
  return vote;
};

// v21: A White Secretary knows their own honest legislative testimony.
// If their Premier directly contradicted it, prioritize that proven liar
// over speculative targets when exercising an execution power.
var __executionBeforeV21 = window.pickExecutionTarget;
window.pickExecutionTarget = function(P){
  if(game.roles[P] === 'white' && game.disputes && game.players){
    var contradictions = game.disputes.filter(function(d){
      return d.p1 === P && d.p2 !== P &&
        (d.type === 'choice_denial' || d.type === 'choice_denial_rev') &&
        game.players[d.p2] && !game.players[d.p2].isDead;
    });
    if(contradictions.length){
      contradictions.sort(function(a,b){ return b.round - a.round; });
      var target = contradictions[0].p2;
      // The player is choosing based on their own firsthand knowledge,
      // not on the actual hidden role of their opponent.
      game.baExecPending = null;
      log('🎯 ' + game.players[P].name + ' targets the Premier who contradicted their firsthand policy account.');
      return target;
    }
  }
  return __executionBeforeV21(P);
};

// =====================================================================
// v22 — coherent, evidence-led voting. Replaces the v20 random veto layer.
// White behavior uses only each observer's information, never hidden roles.
// Communist cover votes follow the same public standard, with limited
// strategic exceptions near victory and when an ally's victory is possible.
// =====================================================================
V20.on = false;
var V22 = {on:true, earlySuspect:0.69, zoneSecSuspect:0.48,
  zonePremSuspect:0.47, zoneRiskThree:0.37, zoneRiskBullet:0.29};
function v22VoteLikeWhite(b, P, C, st, publicOnly){
  var view = brainView(publicOnly ? -1 : b);
  var fp = view.F[P], fc = view.F[C], cns = !!game.confirmedNotStalin[C];
  var privateChecks = publicOnly ? {} : (game.botInvestigations[b] || {});
  var hardRisk = privateChecks[P] === 'communist' || privateChecks[C] === 'communist' ||
    hasDispute(b,P) || hasDispute(b,C);
  if(!st.zone){
    if(hardRisk && st.tracker < 2) return false;
    if((fp > V22.earlySuspect || fc > V22.earlySuspect) && st.tracker < 2) return false;
    return true;
  }
  var tk = brainTicket(view,P,C,st);
  var secTrust = publicOnly ? whiteTrust(b,P,view) : szWhiteTrustNetwork(b,P);
  var premTrust = publicOnly ? whiteTrust(b,C,view) : szWhiteTrustNetwork(b,C);
  var riskThreshold = st.r >= 4 ? V22.zoneRiskBullet : V22.zoneRiskThree;
  var secretaryDanger = fp > V22.zoneSecSuspect || secTrust < -1.65;
  var premierDanger = fc > V22.zonePremSuspect || premTrust < -1.25;
  var stalRisk = cns ? 0 : tk.pS;
  var safeEnough = !hardRisk && !secretaryDanger && !premierDanger &&
    stalRisk <= riskThreshold && tk.eRed <= (st.r >= 5 ? 0.48 : 0.72);
  // Do not pass a questionable Secretary merely because the Premier is CNS.
  if(safeEnough) return true;
  // A rejected ticket advances rotation; at tracker 2 it instead topdecks.
  // Compare *expected losses* rather than penalizing a NO just for causing chaos.
  // Both probabilities use the observer's beliefs, never actual hidden roles.
  if(st.tracker >= 2){
    var chaosLoss = st.pChaosRed * st.Rc - (1-st.pChaosRed) * st.Wg;
    // A government can enact red AND hand a dangerous Secretary an execution.
    // Those consequences are not present on a chaos topdeck.
    var govLoss = tk.eRed * st.Rc - (1-tk.eRed) * st.Wg;
    if(!cns) govLoss += stalRisk * st.Kz;
    if(st.r >= 4){
      // The Secretary receives the next execution at 4/5 Communist policies.
      // Estimate its danger from the public / personal suspicion and trust,
      // with an extra penalty for a firsthand contradiction.
      var secRisk = Math.max(0,Math.min(1,fp));
      if(secTrust < -1.65) secRisk = Math.max(secRisk,0.65);
      if(privateChecks[P] === 'communist' || hasDispute(b,P)) secRisk = Math.max(secRisk,0.85);
      govLoss += secRisk * (st.r >= 5 ? 4.2 : 2.6);
    }
    if(hardRisk) govLoss += 0.9;
    // Keep a modest margin against excessive topdecking on nearly tied EVs.
    return govLoss + 0.12 < chaosLoss;
  }
  return false;
}
var __voteBeforeV22 = window.botDecideVote;
window.botDecideVote = function(b){
  if(!V22.on || !BRAIN || game.gameOver) return __voteBeforeV22(b);
  var P = game.currentPresident, C = game.nominatedChancellor;
  if(C == null || P == null) return __voteBeforeV22(b);
  var role = game.roles[b], st = brainState();
  // Candidates have their own knowledge and should ordinarily support their ticket.
  if(b === P || b === C) return __voteBeforeV22(b);
  if(role === 'white' || (role === 'stalin' && game.playerCount > 6))
    return v22VoteLikeWhite(b,P,C,st,false);
  if(role === 'communist' || role === 'stalin'){
    var publicCover = v22VoteLikeWhite(b,P,C,st,true);
    // Do not out a coordinated team by opposing normal clean governments.
    if(!st.zone && st.w < 4) return publicCover;
    var selfView = brainView(-1), prior = baPrior();
    var outed = selfView.F[b] >= Math.max(0.70,prior + 0.30) || isInAnyConflict(b);
    if(st.w >= 4 && !outed && st.tracker < 2 &&
       selfView.F[P] < 0.40 && selfView.F[C] < 0.40) return false;
    // An electable Stalin Premiership ends the game; only support when this
    // does not create a transparently futile minority bloc.
    if(st.zone && game.roles[C] === 'stalin'){
      var baseline = __voteBeforeV22(b);
      return baseline || publicCover;
    }
    if(outed && st.zone) return __voteBeforeV22(b);
    return publicCover;
  }
  return __voteBeforeV22(b);
};
// The historic likelihood table was measured on previous voting algorithms.
// Avoid claiming its obsolete YES/NO frequencies provide calibrated evidence.
// Treat voting evidence as weak until empirical tables are fitted to v22.
var __v22EvidenceVote = window.brainVoteYesProb;
window.brainVoteYesProb = function(rv,rp,rc,st,n){
  var p = __v22EvidenceVote(rv,rp,rc,st,n);
  return 0.5 + (p - 0.5) * 0.20;
};


// ==================== v24: CONSISTENT ROTATION & CHECKS ====================
// All roles follow the same public conventions. Strong immediate winning
// opportunities and nomination legality are still respected.
function v24UpcomingSecretaries(p, count){
  var result=[], i=p, n=game.playerCount;
  for(var t=0;t<n && result.length<count;t++){
    i=(i+1)%n;
    if(game.players[i] && !game.players[i].isDead && i!==p) result.push(i);
  }
  return result;
}
function v24LegalPremiers(p){
  var alive=getAliveIndices();
  var eligible=alive.filter(function(c){
    return c!==p && c!==game.lastGovernment.chancellor &&
      !(alive.length>5 && c===game.lastGovernment.president) &&
      !(BOT_RULES.consistency && botPubliclyAccused(p,c));
  });
  if(!eligible.length) eligible=alive.filter(function(c){return c!==p && c!==game.lastGovernment.chancellor && !(alive.length>5 && c===game.lastGovernment.president);});
  return eligible;
}
var __v24PriorPickNom=window.pickNomination;
window.pickNomination=function(p){
  var legal=v24LegalPremiers(p), upcoming=v24UpcomingSecretaries(p,2);
  if(!legal.length) return __v24PriorPickNom(p);
  var preferred=legal.filter(function(c){return upcoming.indexOf(c)<0;});
  // In the Stalin Zone, immediate trusted Premier or plausible Stalin election
  // is worth considering; otherwise maximize independent government tests.
  if(game.communistPolicies>=3 && BRAIN){
    var pre=__v24PriorPickNom(p);
    if(legal.indexOf(pre)>=0 && upcoming.indexOf(pre)>=0){
      if(game.roles[p]==='communist' && game.roles[pre]==='stalin') return pre;
      if(game.roles[p]==='white' && game.confirmedNotStalin[pre] && brainView(p).F[pre]<0.18) return pre;
    }
    if(preferred.indexOf(pre)>=0) return pre;
  }
  if(!preferred.length) return __v24PriorPickNom(p);
  // Temporarily make soon-to-be Secretaries ineligible to all nested
  // nomination strategies, including the accepted-suggestion hook.
  var oldAcc=window.botPubliclyAccused;
  window.botPubliclyAccused=function(a,c){
    return (a===p && upcoming.indexOf(c)>=0) || oldAcc(a,c);
  };
  var choice;
  try {choice=__v24PriorPickNom(p);} finally {window.botPubliclyAccused=oldAcc;}
  if(preferred.indexOf(choice)>=0) return choice;
  // Some older strategies don't consult botPubliclyAccused. Select the
  // strongest trusted candidate from the eligible non-upcoming set.
  if(BRAIN){
    var view=brainView(p), isF=brainIsF(p), best=preferred[0], score=-Infinity;
    preferred.forEach(function(c){
      var s=isF ? (game.communistPolicies>=3 && game.roles[c]==='stalin' ? 10 : 1.0-brainPubF(c)) :
        (1-view.F[c]+(game.confirmedNotStalin[c] ? 0.5 : 0));
      if(s>score){score=s;best=c;}
    });
    return best;
  }
  return preferred[0];
};
// Live game and simulator both use pickNomination; remove the obsolete
// duplicate live nomination algorithm.
window.botNominate=function(){
  if(game.phase!=='nomination'||game.nominatedChancellor!==null)return;
  if(isBotGame()&&game.currentPresident===game.humanPlayerIndex)return;
  var p=game.currentPresident, c=pickNomination(p);
  game.nominatedChancellor=c;
  log(game.players[p].name+' nominated '+game.players[c].name+' as Premier.');
  renderGameBoard();
  setTimeout(startVoting, BOT_DELAY);
};

function v24FeudTarget(p, candidates){
  var best=null, score=-1;
  (game.disputes||[]).forEach(function(d){
    if(d.type!=='choice_denial' && d.type!=='policy_conflict' && d.type!=='card_conflict') return;
    [d.p1,d.p2].forEach(function(c){
      if(candidates.indexOf(c)<0) return;
      var sc=(d.type==='choice_denial'?5:3)+((d.round||0)/1000);
      if(game.roles[p]==='white' && c===p) return;
      if(sc>score){score=sc;best=c;}
    });
  });
  return best;
}
var __v24PreviousInvestigation=window.brainPickInvestigation;
window.brainPickInvestigation=function(p,candidates){
  if(!candidates || !candidates.length) return __v24PreviousInvestigation(p,candidates);
  var log=game.invLog||[], target=null;
  if(log.length===0){
    var next=peekNextPresident();
    if(candidates.indexOf(next)>=0) target=next;
  }else if(log.length===1){
    // The second investigation tests the first investigator's reliability.
    var firstChecker=log[0].by;
    if(candidates.indexOf(firstChecker)>=0) target=firstChecker;
  }else{
    target=v24FeudTarget(p,candidates);
    if(target===null){
      for(var i=log.length-1;i>=0;i--){
        if(candidates.indexOf(log[i].by)>=0){target=log[i].by;break;}
      }
    }
    if(target===null){
      var next2=peekNextPresident();
      if(candidates.indexOf(next2)>=0) target=next2;
    }
  }
  if(target!==null) return __v24PreviousInvestigation(p,[target]);
  return __v24PreviousInvestigation(p,candidates);
};


// ==================== v25: RESOLVE LIVE CARD FEUDS FIRST ====================
// A concrete unresolved card contradiction is the most valuable investigation.
// Otherwise: first check the next Secretary; second check the first checker.
// The original v24 and underlying bot logic handle all remaining fallbacks.
var __v25PreviousInvestigation=window.brainPickInvestigation;
window.brainPickInvestigation=function(p,candidates){
  if(!candidates || !candidates.length) return __v25PreviousInvestigation(p,candidates);
  var conflicts=(game.disputes||[]).filter(function(d){
    return (d.type==='choice_denial' || d.type==='card_conflict' || d.type==='policy_conflict' || d.type==='impossible_claim') &&
      game.players[d.p1] && !game.players[d.p1].isDead &&
      game.players[d.p2] && !game.players[d.p2].isDead;
  });
  var best=null, bestScore=-Infinity, view=null;
  try {if(BRAIN) view=brainView(p);}catch(e){}
  conflicts.forEach(function(d){
    var sides=d.p1===d.p2?[d.p1]:[d.p1,d.p2];
    sides.forEach(function(t){
      if(candidates.indexOf(t)<0) return;
      var score=10+(d.round||0)*0.01;
      // Checking the other side of a dispute involving oneself resolves a
      // first-hand contradiction, rather than redundantly checking oneself.
      if(d.p1===p || d.p2===p) score+=7;
      if(view && Number.isFinite(view.F[t])) score+=2*(1-Math.abs(2*view.F[t]-1));
      if(score>bestScore){bestScore=score;best=t;}
    });
  });
  if(best!==null) return __v25PreviousInvestigation(p,[best]);
  return __v25PreviousInvestigation(p,candidates);
};


// ==================== v26: NO RECIPROCAL INVESTIGATION ====================
// If A investigated B, B should not spend their investigation checking A:
// it repeats a relationship with limited independent information gain.
// Applies to feud-first, checker-chain, normal rotation and bot simulation.
var __v26PreviousInvestigation = window.brainPickInvestigation;
window.brainPickInvestigation = function(p, candidates){
  if (!candidates || !candidates.length) return __v26PreviousInvestigation(p, candidates);
  var log = game.invLog || [];
  var allowed = candidates.filter(function(target){
    return !log.some(function(entry){ return entry.by === target && entry.target === p; });
  });
  // Keep the engine's existing legal-candidate fallback if every option
  // is reciprocal; otherwise enforce this consistently, even for feuds.
  return __v26PreviousInvestigation(p, allowed.length ? allowed : candidates);
};

// ==================== v27: PUBLIC CLAIM / VOTE COHERENCE ====================
// A bot that publicly clears someone must treat that claim as a strong reason
// to approve that person's government, unless the *other* nominee presents
// a concrete danger or a later public event invalidates the clearance.
// This uses the bot's own declaration, not secret team membership.
var __v27PreviousVote = window.botDecideVote;
window.botDecideVote = function(b){
  var baseline = __v27PreviousVote(b);
  if(!BRAIN || game.gameOver || !game.players[b] || game.players[b].isDead) return baseline;
  var P = game.currentPresident, C = game.nominatedChancellor;
  if(P == null || C == null || b === P || b === C) return baseline;
  var rec = game.playerRecords[b];
  if(!rec || !rec.investigationsDone) return baseline;
  var cleared = {};
  rec.investigationsDone.forEach(function(iv){
    if(iv && iv.declared === 'White') cleared[iv.target] = true;
    if(iv && iv.declared === 'Communist') cleared[iv.target] = false;
  });
  if(!cleared[P] && !cleared[C]) return baseline;
  var st = brainState(), view = brainView(b);
  // No forced YES if the *other* candidate is demonstrably dangerous.
  // A policy contradiction involving this observer is also first-hand evidence.
  if(hasDispute(b,P) || hasDispute(b,C)) return baseline;
  var other = cleared[P] ? C : P;
  var otherF = view.F[other];
  var otherExplicitlyAccused = (game.botInvestigations[b] || {})[other] === 'communist' ||
    rec.investigationsDone.some(function(iv){ return iv.target === other && iv.declared === 'Communist'; });
  if(otherExplicitlyAccused || otherF >= (st.zone ? 0.58 : 0.73)) return baseline;
  // A cleared Secretary with an unconfirmed, very risky Premier could elect
  // Stalin immediately; the public claim does not clear the whole ticket.
  if(st.zone && !cleared[C] && !game.confirmedNotStalin[C]){
    var tk = brainTicket(view,P,C,st);
    if(tk.pS >= 0.37) return baseline;
  }
  // A cleared candidate shouldn't be rejected solely due to stale general
  // suspicion or a random / overly conservative voting heuristic.
  // A Communist may still block a White match-point government strategically.
  if(game.roles[b] !== 'white' && st.w >= 4) return baseline;
  return true;
};


// ==================== v28: CREDIBILITY & DECEPTION ====================
// All credibility is computed from an observer's own belief and public history.
// Never consult hidden roles of a potential influencer.
function v28Credibility(observer, speaker){
  if(!BRAIN || observer === speaker || !game.players[speaker] || game.players[speaker].isDead) return 0;
  var v = brainView(observer), f = v.F[speaker];
  if(!Number.isFinite(f)) return 0;
  var score = Math.max(0, Math.min(1, (0.63 - f) / 0.55));
  var rec = game.playerRecords[speaker] || {};
  if((rec.disputes || []).length) score *= 0.55;
  if(game.mildSuspicionPresidents[speaker]) score *= 0.65;
  var own = (game.botInvestigations[observer] || {})[speaker];
  if(own === 'communist') return 0;
  if(own === 'white') score = Math.max(score,0.95);
  var good = game.policyHistory.filter(function(h){return h.chancellor === speaker && h.policy === 'white';}).length;
  if(good) score = Math.min(1,score + Math.min(0.14,good*0.07));
  return score;
}

// A Secretary with 2 White + 1 Communist can earn a clean policy while
// learning how a Premier uses an actual choice. Stalin especially values this.
var __v28OldPresidentDiscard = window.botPresidentDiscard;
window.botPresidentDiscard = function(){
  var p=game.currentPresident, r=game.roles[p], cards=game.drawnPolicies || [];
  var wc=cards.filter(function(x){return x==='white';}).length;
  if((r==='stalin' || r==='communist') && wc===2 && cards.length===3){
    var st=brainState(), chanc=game.currentChancellor;
    var publiclyTrusted = BRAIN ? brainPubF(p)<0.52 : true;
    var doProbe = r==='stalin' ? (st.w<4 && publiclyTrusted) :
      (st.w<4 && publiclyTrusted && Math.random()<0.62);
    if(doProbe){
      var idx=cards.indexOf('white');
      game.discardPile.push(game.drawnPolicies.splice(idx,1)[0]);
      game.passedToChancellor=game.drawnPolicies.slice();
      game._v28ChoiceProbe={p:p,c:chanc,whiteDrawn:2};
      log(game.players[p].name+' discarded a policy and passed 2 to Premier.');
      renderGameBoard();
      setTimeout(startChancellorSession,BOT_DELAY);
      return;
    }
  }
  game._v28ChoiceProbe=null;
  return __v28OldPresidentDiscard();
};

// Publicly claim only things the stated draw could plausibly have produced.
// Stalin's deliberate 2W/1C probe disguises the extra White as a Communist.
// When a Red gets through he can instead claim 3C to deny agency, but that
// may create a dispute if the Premier truthfully reports having had a choice.
var __v28OldPresClaim=window.brainPresClaim;
window.brainPresClaim=function(p,c,enacted,drawn,passed){
  var probe=game._v28ChoiceProbe;
  if(probe && probe.p===p && probe.c===c &&
     drawn.filter(function(x){return x==='white';}).length===2 &&
     passed.filter(function(x){return x==='white';}).length===1 &&
     game.roles[p]!=='white'){
    // A correct White enactment makes the Secretary appear cooperative;
    // a Red enactment allows plausible-deniability at the cost of audit risk.
    var cd=enacted==='white'?1:0;
    var pa=enacted==='white'?1:0;
    return {cd:cd,pf:pa>0,pa:pa,quote:brainPresQuote(cd,pa,game.players[c].name)};
  }
  return __v28OldPresClaim(p,c,enacted,drawn,passed);
};

// Peer influence: a trusted voter who has already voted may sway an observer.
// The observer still makes their own initial decision; contrary private
// investigation evidence, an unsafe Premier or an execution threat wins out.
var __v28OldVote=window.botDecideVote;
window.botDecideVote=function(b){
  var baseline=__v28OldVote(b);
  if(!BRAIN || game.gameOver || game.nominatedChancellor==null) return baseline;
  var P=game.currentPresident,C=game.nominatedChancellor,st=brainState();
  if(b===P || b===C) return baseline;
  var checks=game.botInvestigations[b] || {};
  if(checks[P]==='communist' || checks[C]==='communist' || hasDispute(b,P) || hasDispute(b,C)) return baseline;
  var view=brainView(b);
  // Never allow social sway to override a high-confidence Stalin/exec danger.
  if(st.zone && ((view.S[C] > 0.34 && !game.confirmedNotStalin[C]) ||
                 (st.r>=4 && view.F[P]>0.53))) return baseline;
  var agree=0, disagree=0;
  Object.keys(game.votes || {}).forEach(function(key){
    var speaker=+key;
    if(speaker===b || speaker===P || speaker===C || game.votes[key]===undefined) return;
    var cred=v28Credibility(b,speaker);
    if(cred<0.56) return;
    // Public alignment counts most when speaker has demonstrated a record.
    var weight=Math.pow((cred-0.50)/0.50,1.35);
    if(game.votes[key]===baseline) agree+=weight;
    else disagree+=weight;
  });
  if(disagree < 0.65 || disagree <= agree*1.3) return baseline;
  // Personality matters. A respected opinion can change an uncertain voter,
  // but does not create universal obedience or an obvious Communist bloc.
  var params=brainParams(b);
  var openness=0.13 + 0.18*Math.min(1,disagree/(1+agree)) +
    0.12*Math.max(0,Math.min(1,(params.bandwagon||0)));
  return Math.random() < Math.min(0.43,openness) ? !baseline : baseline;
};


// =====================================================================
// v29 — EVIDENCE-GATED STALIN ZONE + ADAPTIVE SECRETARY BLUFFS
// A lack of negative evidence is NOT positive proof of loyalty.
// Applies AFTER the v27 public-clearance and v28 social-sway overrides.
// =====================================================================
var V29 = { on:true, secretaryEvidence:2.25, premierEvidence:2.40 };

// Only public, independently corroborated events and this voter's private
// check contribute. A mere low-suspicion prior or a player's own story
// is explicitly insufficient; avoid recursive endorsement loops.
function v29PositiveEvidence(observer, target, publicOnly){
  var score=0, r=game.playerRecords[target] || {}, selfChecks=game.botInvestigations[observer] || {};
  if(!publicOnly && selfChecks[target]==='white') score+=3.5;
  if(!publicOnly && selfChecks[target]==='communist') return -100;
  var wChanc=0, wPres=0;
  (game.policyHistory || []).forEach(function(h){
    if(h.policy!=='white') return;
    if(h.chancellor===target) wChanc++;
    if(h.president===target) wPres++;
  });
  score+=Math.min(2,wChanc)*1.25+Math.min(2,wPres)*0.95;
  // A claim of a White investigation must be corroborated by the *claimant's*
  // independent record, not simply presumed true because the claimant is quiet.
  var iv=(r.investigationsReceived || []);
  var bestClaim=0;
  iv.forEach(function(x){
    if(x.declared!=='White' || !game.players[x.by] || game.players[x.by].isDead) return;
    var actualGood=(game.policyHistory || []).filter(function(h){
      return h.policy==='white' && (h.president===x.by || h.chancellor===x.by);
    }).length;
    if(actualGood>=2 && !isInAnyConflict(x.by)) bestClaim=Math.max(bestClaim,0.85);
    else if(actualGood>=1 && !isInAnyConflict(x.by)) bestClaim=Math.max(bestClaim,0.45);
  });
  score+=bestClaim;
  if(game.confirmedNotStalin[target]) score+=0.85; // safe as Premier, not proof of White
  if(isInAnyConflict(target)) score-=1.55;
  if(game.mildSuspicionPresidents[target]) score-=0.85;
  if(!publicOnly && hasDispute(observer,target)) score-=2.0;
  return score;
}

function v29PubliclyUnknown(observer,target,publicOnly,threshold){
  return v29PositiveEvidence(observer,target,publicOnly)<threshold;
}

function v29WhiteZoneDecision(observer,P,C,st,publicOnly){
  var view=brainView(publicOnly?-1:observer), chk=publicOnly?{}:(game.botInvestigations[observer]||{});
  var evP=v29PositiveEvidence(observer,P,publicOnly), evC=v29PositiveEvidence(observer,C,publicOnly);
  var cns=!!game.confirmedNotStalin[C], tk=brainTicket(view,P,C,st);
  var hardRed=chk[P]==='communist' || chk[C]==='communist' ||
    view.F[P]>=0.63 || view.F[C]>=0.63 || hasDispute(observer,P) || hasDispute(observer,C);
  var loyalP=evP>=V29.secretaryEvidence, loyalC=evC>=V29.premierEvidence;
  var riskStalin=cns?0:tk.pS;
  var executionRisk=st.r>=4 && (evP<V29.secretaryEvidence || view.F[P]>0.39);
  // Even a confirmed-not-Stalin Premier is not enough if the Secretary
  // is untested and could receive an execution power.
  var trustedTicket=loyalP && loyalC && !hardRed &&
    riskStalin<=(st.r>=4?0.16:0.22) &&
    tk.eRed<=(st.r>=5?0.42:0.69) && !executionRisk;
  if(trustedTicket) return true;
  if(st.tracker<2) return false; // rotate intentionally toward a trusted ticket
  // The THIRD rejected election triggers a topdeck. Compare the immediate
  // dangers rather than approving an unknown team out of fear of chaos.
  var chaosLoss=st.pChaosRed*st.Rc-(1-st.pChaosRed)*st.Wg;
  var govLoss=tk.eRed*st.Rc-(1-tk.eRed)*st.Wg;
  govLoss+=riskStalin*st.Kz;
  if(st.r>=4) govLoss+= (executionRisk?0.78:0.20)*(st.r>=5?4.2:2.6);
  if(hardRed) govLoss+=1.4;
  // Require a meaningful margin when making a risky, non-trusted government.
  return govLoss+0.20<chaosLoss;
}

var __v29PriorVote=window.botDecideVote;
window.botDecideVote=function(b){
  var st=brainState(), P=game.currentPresident, C=game.nominatedChancellor;
  if(!V29.on || !BRAIN || !st.zone || P==null || C==null || b===P || b===C)
    return __v29PriorVote(b);
  var role=game.roles[b];
  if(role==='white') return v29WhiteZoneDecision(b,P,C,st,false);
  if(role==='stalin' || role==='communist'){
    // Immediate Stalin election is a genuine strategic exception.
    if(role==='communist' && game.roles[C]==='stalin') return true;
    if(role==='stalin' && C===b) return true;
    // Undercover Communists can act like Whites without reading their
    // private teammate knowledge into the cover-vote calculation.
    var cover=v29WhiteZoneDecision(b,P,C,st,true);
    if(st.w>=4 && st.tracker<2 && !cover) return false;
    return cover;
  }
  return __v29PriorVote(b);
};

// A clean-looking Communist Secretary can fabricate the claim that they
// gave a Premier a White choice, even when they passed two Communists.
// This creates a REAL contradiction, not evidence of guilt for the Premier;
// v29's symmetric blame prevents Whites from treating the Secretary as
// automatically more truthful. Avoid repeating this too often or when
// deck counting makes the claim untenable.
var __v29PriorPresClaim=window.brainPresClaim;
window.brainPresClaim=function(p,c,enacted,drawn,passed){
  var previous=__v29PriorPresClaim(p,c,enacted,drawn,passed);
  if(!V29.on || game.roles[p]==='white' || enacted!=='communist' ||
     !passed || passed.some(function(x){return x==='white';})) return previous;
  var st=brainState(), speakerTrust=brainPubF(p), premierTrust=brainPubF(c);
  var claimed=(game.deckCycle && game.deckCycle.claimedDemSeen)||0;
  var ceiling=typeof cycleWhiteCeiling==='function'?cycleWhiteCeiling():6;
  var credibility=speakerTrust<0.45 && premierTrust>speakerTrust+0.06;
  var plausible=claimed+1<=ceiling;
  var alreadyBluffed=(game._v29BluffCounts && game._v29BluffCounts[p])||0;
  var chance=credibility?0.40:0.10;
  if(st.w>=4 || alreadyBluffed>=2 || !plausible) chance=0;
  if(Math.random()<chance){
    if(!game._v29BluffCounts) game._v29BluffCounts={};
    game._v29BluffCounts[p]=(game._v29BluffCounts[p]||0)+1;
    // 1 White drawn / choice passed is physically possible with 3 cards.
    return {cd:1,pf:true,pa:1,quote:brainPresQuote(1,1,game.players[c].name)};
  }
  return previous;
};

// Reset bluff bookkeeping on every new game (also reset in headless runs).
var __v29OldStartGame=window.startGame;
window.startGame=function(){ game._v29BluffCounts={}; return __v29OldStartGame.apply(this,arguments); };


// =====================================================================
// v30: evidence-based bloc inference, asymmetric choice dispute, and
// next-three-Secretary comparison for Stalin Zone voting.
// No hidden role data is used by White voters.
// =====================================================================
var V30={on:true};

// Evidence from repeated out-of-step votes and endorsements of the same
// nominees. A single minority YES or one nomination is NOT sufficient.
function v30BlocEvidence(observer){
  var n=game.playerCount, votes=game.voteLog||[], counts=Array(n).fill(0), links=Array.from({length:n},function(){return Array(n).fill(0);});
  var recent=votes.filter(function(e){return e.zone;}).slice(-12);
  recent.forEach(function(e){
    var yes=Object.keys(e.votes||{}).map(Number).filter(function(i){return e.votes[i] && game.players[i] && !game.players[i].isDead;});
    var no=Object.keys(e.votes||{}).map(Number).filter(function(i){return !e.votes[i] && game.players[i] && !game.players[i].isDead;});
    var minority=(yes.length<no.length?yes:(no.length<yes.length?no:[]));
    if(minority.length<2 || minority.length>Math.max(3,Math.floor(n/2))) return;
    // Only count suspicious minority support of governments with questionable
    // nominees; a NO minority on an obviously unsafe ticket is not a bloc.
    if(minority===no) return;
    var publicF=brainView(-1).F;
    var questionable=(publicF[e.pres]||0)>0.32 || (publicF[e.chanc]||0)>0.32 ||
      v29PositiveEvidence(-1,e.pres,true)<1.4 || v29PositiveEvidence(-1,e.chanc,true)<1.4;
    if(!questionable) return;
    minority.forEach(function(i){counts[i]+=1;});
    for(var a=0;a<minority.length;a++) for(var b=a+1;b<minority.length;b++){
      links[minority[a]][minority[b]]++; links[minority[b]][minority[a]]++;
    }
    // The ticket is circumstantial evidence only after repeated supporting votes.
    for(var x=0;x<minority.length;x++){
      [e.pres,e.chanc].forEach(function(t){if(t!==minority[x]) links[minority[x]][t]+=0.40;});
    }
  });
  // Repeated nominations of a small set of Premier candidates contribute
  // evidence, but make no claim about the private identities involved.
  var nomineeCounts={};
  recent.forEach(function(e){ nomineeCounts[e.chanc]=(nomineeCounts[e.chanc]||0)+1; });
  recent.forEach(function(e){
    if(nomineeCounts[e.chanc]>=3 && e.pres!==e.chanc){
      links[e.pres][e.chanc]+=0.65; links[e.chanc][e.pres]+=0.65;
      counts[e.chanc]+=0.22;
    }
  });
  var conf=Array(n).fill(0), groups=[];
  for(var i=0;i<n;i++){
    if(i===observer || !game.players[i] || game.players[i].isDead) continue;
    var partners=0;
    for(var j=0;j<n;j++) if(j!==i && links[i][j]>=2) partners++;
    if(counts[i]>=2 && partners>=1){
      conf[i]=Math.min(1,0.20*(counts[i]-1)+0.14*partners);
      groups.push(i);
    }
  }
  // Confidence is bounded; outsiders receive a SMALL relative benefit,
  // never automatic White status, especially when the evidence is weak.
  return {conf:conf,members:groups};
}

function v30Evidence(observer,target,bloc,publicOnly){
  var base=v29PositiveEvidence(observer,target,publicOnly);
  var b=bloc.conf[target]||0;
  if(b>0) return base-2.0*b;
  if(bloc.members.length>=2 && bloc.members.length<=Math.ceil(game.playerCount/2)){
    return base+Math.min(0.50,0.12*bloc.members.length);
  }
  return base;
}

function v30Upcoming(from,howMany){
  var result=[], n=game.playerCount, idx=from;
  for(var steps=0;steps<n*2 && result.length<howMany;steps++){
    idx=(idx+1)%n;
    if(game.players[idx] && !game.players[idx].isDead) result.push(idx);
  }
  return result;
}

function v30SecretaryValue(observer,p,view,bloc){
  var ev=v30Evidence(observer,p,bloc,false), risk=view.F[p];
  // Trusted nominees can improve the proposal but do not guarantee the
  // Premier is safe. This is a Secretary-only forecasting score.
  return Math.max(-5,Math.min(7,ev)) - 2.2*risk - (game.mildSuspicionPresidents[p]?0.8:0);
}

var __v30PrevWhiteZoneDecision=v29WhiteZoneDecision;
v29WhiteZoneDecision=function(observer,P,C,st,publicOnly){
  if(!V30.on || publicOnly) return __v30PrevWhiteZoneDecision(observer,P,C,st,publicOnly);
  var view=brainView(observer), bloc=v30BlocEvidence(observer), tk=brainTicket(view,P,C,st);
  var eP=v30Evidence(observer,P,bloc,false), eC=v30Evidence(observer,C,bloc,false);
  var hardRed=(game.botInvestigations[observer]||{})[P]==='communist' ||
    (game.botInvestigations[observer]||{})[C]==='communist' ||
    view.F[P]>=0.62 || view.F[C]>=0.62 || hasDispute(observer,P)||hasDispute(observer,C);
  var riskStalin=game.confirmedNotStalin[C]?0:tk.pS;
  var execDanger=st.r>=4 && (eP<2.25 || view.F[P]>0.39);
  var trusted=eP>=V29.secretaryEvidence && eC>=V29.premierEvidence && !hardRed &&
    riskStalin<=(st.r>=4?0.16:0.22) && tk.eRed<=(st.r>=5?0.42:0.69) && !execDanger;
  if(trusted) return true;
  // A small or uncertain voting bloc is not enough to rubber-stamp outsiders.
  // If the tracker is close to chaos, compare risks directly.
  if(st.tracker>=2){
    var chaosLoss=st.pChaosRed*st.Rc-(1-st.pChaosRed)*st.Wg;
    var govLoss=tk.eRed*st.Rc-(1-tk.eRed)*st.Wg+riskStalin*st.Kz;
    if(st.r>=4) govLoss+=(execDanger?0.78:0.20)*(st.r>=5?4.2:2.6);
    if(hardRed) govLoss+=1.4;
    return govLoss+0.20<chaosLoss;
  }
  // Compare up to three upcoming Secretaries, not only the immediate next.
  // If #2 is better than #3, it can be worth approving #2 rather than
  // endlessly holding out for a theoretical perfect team.
  var future=v30Upcoming(P,3);
  var cur=v30SecretaryValue(observer,P,view,bloc), scores=future.map(function(x){return v30SecretaryValue(observer,x,view,bloc);});
  var best=Math.max.apply(null,scores.length?scores:[-Infinity]);
  var near=Math.max.apply(null,scores.slice(0,2).length?scores.slice(0,2):[-Infinity]);
  if(hardRed || eC<1.55 || riskStalin>0.22 || execDanger) return false;
  // Voting YES for a merely reasonable ticket requires positive evidence
  // for both players and a Secretary comparable to those upcoming.
  if(eP>=1.80 && eC>=2.0 && cur>=best-0.30 && tk.eRed<0.51) return true;
  // When the current Secretary is #2 in an earlier three-person forecast,
  // the same rule automatically compares them to #3 rather than rigidly
  // demanding the strongest possible future candidate.
  return false;
};

// =====================================================================
// v31 — ELECTABLE PREMIERS, TRUSTED TICKETS & TABLE LEADERS
// Decisions use public history and observer-specific deductions, never
// the true identity of an unknown player.
// =====================================================================
var V31={on:true};
function v31PublicTrust(t){
  var publicView=brainView(-1), ev=v29PositiveEvidence(-1,t,true);
  var credibility=1-Math.max(0,Math.min(1,publicView.F[t]||0.5));
  var bloc=v30BlocEvidence(-1);
  return ev+1.4*(credibility-0.5)-2.0*(bloc.conf[t]||0);
}
function v31Leaders(){
  if(!BRAIN) return [];
  var alive=getAliveIndices(), ranks=alive.map(function(t){return {id:t,score:v31PublicTrust(t)};});
  ranks.sort(function(a,b){return b.score-a.score;});
  // A leader must have earned independent public evidence; unknown players
  // do not become influential merely because their suspicion estimate is low.
  return ranks.filter(function(x){return v29PositiveEvidence(-1,x.id,true)>=1.65 && x.score>=1.65;}).slice(0,2);
}
function v31StrongTicket(o,P,C,st){
  var v=brainView(o), bloc=v30BlocEvidence(o), eP=v30Evidence(o,P,bloc,false),eC=v30Evidence(o,C,bloc,false);
  var tk=brainTicket(v,P,C,st), checks=game.botInvestigations[o]||{};
  if(checks[P]==='communist'||checks[C]==='communist'||hasDispute(o,P)||hasDispute(o,C)) return false;
  if(v.F[P]>=0.54||v.F[C]>=0.54) return false;
  if(st.r>=4 && (eP<2.25||v.F[P]>0.37)) return false;
  if(!game.confirmedNotStalin[C] && tk.pS>(st.r>=4?0.16:0.21)) return false;
  return eP>=V29.secretaryEvidence && eC>=V29.premierEvidence && tk.eRed<=(st.r>=5?0.42:0.68);
}

// Electability is the table's *publicly observable* confidence in a ticket.
// Prefer Premier candidates whose records can persuade voters, but still
// require the Secretary's own assessment that they are safe.
var __v31PreviousNom=window.pickNomination;
window.pickNomination=function(p){
  var baseline=__v31PreviousNom(p);
  if(!V31.on||!BRAIN||game.communistPolicies<3||game.roles[p]!=='white') return baseline;
  var legal=v24LegalPremiers(p),upcoming=v24UpcomingSecretaries(p,2), preferred=legal.filter(function(c){return upcoming.indexOf(c)<0;});
  if(preferred.length) legal=preferred;
  if(!legal.length) return baseline;
  var view=brainView(p), bloc=v30BlocEvidence(p), st=brainState(),leaders=v31Leaders();
  var best=null,bestScore=-Infinity;
  legal.forEach(function(c){
    var ev=v30Evidence(p,c,bloc,false), tk=brainTicket(view,p,c,st);
    var danger=(game.confirmedNotStalin[c]?0:tk.pS), suspicion=view.F[c];
    if((game.botInvestigations[p]||{})[c]==='communist'||hasDispute(p,c)||suspicion>=0.55) return;
    var publicEvidence=v29PositiveEvidence(-1,c,true),publicSuspicion=brainView(-1).F[c];
    var electability=publicEvidence*0.90-2.1*publicSuspicion;
    var leaderBacking=leaders.reduce(function(a,x){return a+(x.id===c?0.32:0);},0);
    var score=1.45*ev+electability+leaderBacking-5.0*danger-1.6*tk.eRed-1.4*(bloc.conf[c]||0);
    if(ev<V29.premierEvidence) score-=2.2;
    if(st.r>=4 && v30Evidence(p,p,bloc,false)<2.25) score-=1.0;
    if(score>bestScore){bestScore=score;best=c;}
  });
  // Keep lawful fallback; never nominate an untrusted person merely because
  // the other candidates are unpopular.
  return best===null?baseline:best;
};

// Truly trusted tickets should be straightforward YES votes. This comes
// before the strategic near-chaos forecast, not after its rejection branch.
var __v31PreviousZoneDecision=v29WhiteZoneDecision;
v29WhiteZoneDecision=function(o,P,C,st,publicOnly){
  if(!V31.on||publicOnly||!st.zone) return __v31PreviousZoneDecision(o,P,C,st,publicOnly);
  if(v31StrongTicket(o,P,C,st)) return true;
  return __v31PreviousZoneDecision(o,P,C,st,publicOnly);
};

// The highest one or two publicly established voices can move an *uncertain*
// vote. Never override a private Communist check, a direct contradiction,
// a high Stalin probability, or a dangerous execution Secretary.
var __v31PreviousVote=window.botDecideVote;
window.botDecideVote=function(b){
  var baseline=__v31PreviousVote(b);
  if(!V31.on||!BRAIN||game.gameOver||game.communistPolicies<3||game.nominatedChancellor==null) return baseline;
  var P=game.currentPresident,C=game.nominatedChancellor;
  if(b===P||b===C) return baseline;
  var st=brainState(),view=brainView(b),chk=game.botInvestigations[b]||{};
  if(chk[P]==='communist'||chk[C]==='communist'||hasDispute(b,P)||hasDispute(b,C)) return baseline;
  var tk=brainTicket(view,P,C,st);
  if(view.F[P]>=0.57||view.F[C]>=0.57 ||
     (!game.confirmedNotStalin[C] && tk.pS>0.23) ||
     (st.r>=4 && (view.F[P]>0.40 || v30Evidence(b,P,v30BlocEvidence(b),false)<1.8))) return baseline;
  var leaders=v31Leaders(),yesWeight=0,noWeight=0;
  leaders.forEach(function(L){
    if(L.id===b||L.id===P||L.id===C||game.votes[L.id]===undefined) return;
    var cred=v28Credibility(b,L.id);
    if(cred<0.58) return;
    var w=cred*Math.min(1.35,Math.max(0.5,L.score/3.5));
    if(game.votes[L.id]) yesWeight+=w; else noWeight+=w;
  });
  // Preserve genuinely safe approvals despite table disagreement.
  if(baseline && v31StrongTicket(b,P,C,st)) return true;
  // One respected voice matters; two agreeing voices matter more. Uncertain
  // tickets can change, but clear evidence and safety constraints cannot.
  var gap=yesWeight-noWeight;
  if(Math.abs(gap)<0.55) return baseline;
  var eP=v30Evidence(b,P,v30BlocEvidence(b),false), eC=v30Evidence(b,C,v30BlocEvidence(b),false);
  if(gap>0 && !baseline && eP>=1.45 && eC>=1.60 && tk.eRed<0.55){
    return Math.random()<Math.min(0.68,0.20+0.24*gap)?true:baseline;
  }
  if(gap<0 && baseline && !v31StrongTicket(b,P,C,st)){
    return Math.random()<Math.min(0.62,0.17+0.23*(-gap))?false:baseline;
  }
  return baseline;
};

// ==================== v32: STALIN ZONE — SAFETY AND ELECTABILITY OVER ROTATION ====================
// Rotation diversity matters before the Stalin Zone, but not once Stalin can win as Premier.
var V32 = {on:true};
var __v32PreviousNomination = window.pickNomination;
window.pickNomination = function(p){
  if(!V32.on || !BRAIN || game.communistPolicies < 3) return __v32PreviousNomination(p);
  var legal=v24LegalPremiers(p);
  if(!legal.length) return __v32PreviousNomination(p);
  var role=game.roles[p], view=brainView(p), pub=brainView(-1), st=brainState();
  var bloc=v30BlocEvidence(p), leaders=v31Leaders();
  var best=null, bestScore=-Infinity;
  legal.forEach(function(c){
    var ev=v30Evidence(p,c,bloc,false), tk=brainTicket(view,p,c,st);
    var publicEvidence=v29PositiveEvidence(-1,c,true);
    var publicRisk=pub.F[c], ownRisk=view.F[c];
    var publicAppeal=0.95*publicEvidence-2.2*publicRisk;
    var leadership=leaders.some(function(x){return x.id===c;})?0.45:0;
    var score=-Infinity;
    if(role==='white'){
      // Both perceived Stalin safety and White policy chances matter; never
      // exclude an otherwise strong Premier just because their turn is next.
      if((game.botInvestigations[p]||{})[c]==='communist' || hasDispute(p,c) || ownRisk>=0.55) return;
      var stalinRisk=game.confirmedNotStalin[c]?0:tk.pS;
      score=1.65*ev+0.80*publicAppeal+leadership-8.5*stalinRisk-2.5*tk.eRed-1.5*(bloc.conf[c]||0);
      if(ev<V29.premierEvidence) score-=3.0;
      if(stalinRisk>0.20) score-=4.0;
    }else{
      // Communist Secretaries want a government the table will actually elect,
      // creating an opportunity to enact Red policies and gain executive power.
      // A Communist who knows Stalin may attempt the instant-win nomination,
      // but only when the public case makes it plausible.
      var knowsStalin=role==='communist' || (role==='stalin' && game.playerCount<=6);
      var isStalin=game.roles[c]==='stalin';
      score=1.55*publicAppeal+1.00*ev+leadership-0.8*(bloc.conf[c]||0);
      if(hasDispute(p,c)) score-=2.8;
      if(game.botInvestigations[p] && game.botInvestigations[p][c]==='communist') score-=1.5;
      if(isStalin && knowsStalin){
        var plausible=publicEvidence>=V29.premierEvidence && publicRisk<0.35 && !hasDispute(p,c);
        score+=plausible ? 9.0 : -4.0;
      }
      // Non-Stalin nominees with good public reputations are useful even if
      // they're White: electability is essential to passing Reds or earning a shot.
      if(st.r>=4 && publicEvidence<1.1) score-=1.3;
    }
    if(score>bestScore){bestScore=score;best=c;}
  });
  return best===null ? __v32PreviousNomination(p) : best;
};


// ==================== v33: VERIFIED TRUSTED TICKETS + SELECTIVE INVESTIGATION BLUFFS ====================
// Separate positive evidence from mere lack of accusations. Never infer a secret
// role from the omniscient game.roles array when making a White voting decision.
var V33 = { on:true };
function v33SafeTrustedTicket(b,P,C,st){
  if(!BRAIN || P==null || C==null || !game.players[P] || !game.players[C]) return false;
  var v=brainView(b), bloc=v30BlocEvidence(b), priv=game.botInvestigations[b]||{};
  if(priv[P]==='communist'||priv[C]==='communist'||hasDispute(b,P)||hasDispute(b,C)) return false;
  if(isInAnyConflict(P)||isInAnyConflict(C)) return false;
  var ep=v30Evidence(b,P,bloc,false), ec=v30Evidence(b,C,bloc,false);
  var scored=getAliveIndices().map(function(i){return {id:i,score:v30Evidence(b,i,bloc,false)-1.6*(v.F[i]||0)};});
  scored.sort(function(a,z){return z.score-a.score;});
  var topTwo=scored.slice(0,2).every(function(x){return x.id===P||x.id===C;});
  // A genuinely top-ranked pair gets a lower (but still positive) evidence
  // threshold; being merely the least unknown people is not enough.
  if(topTwo){ if(ep<1.10 || ec<1.10) return false; }
  else if(ep<1.70 || ec<1.80) return false;
  if(v.F[P]>0.47 || v.F[C]>0.47) return false;
  if((bloc.conf[P]||0)>0.28 || (bloc.conf[C]||0)>0.28) return false;
  var tk=brainTicket(v,P,C,st);
  if(st.zone && !game.confirmedNotStalin[C] && tk.pS>0.20) return false;
  if(st.zone && st.r>=4 && (ep<2.05||v.F[P]>0.36)) return false;
  // Don't veto otherwise trusted people solely on the deck's ordinary Red odds.
  // At Communist match point the policy risk becomes decisive again.
  if(st.r>=5 && tk.eRed>0.55) return false;
  return true;
}
var __v33PreviousVote=window.botDecideVote;
window.botDecideVote=function(b){
  var prior=__v33PreviousVote(b);
  if(!V33.on || !BRAIN || game.gameOver || game.roles[b]!=='white') return prior;
  var P=game.currentPresident,C=game.nominatedChancellor;
  if(P==null || C==null || b===P || b===C) return prior;
  var st=brainState();
  // At four White policies, finish with a credible government at ANY stage;
  // don't reject a safe opportunity just to rotate the Secretaryship.
  if((st.zone || st.w>=4) && v33SafeTrustedTicket(b,P,C,st)) return true;
  return prior;
};

// Keep the established investigation-target preferences (feud, rotation,
// anti-reciprocity), but let Communist investigators choose their public story.
// Selective misinformation is most useful if the statement is plausible and
// the speaker has standing; automatic teammate-clearing would be predictable.
var __v33PreviousInvestigation=window.brainPickInvestigation;
window.brainPickInvestigation=function(p,candidates){
  var pick=__v33PreviousInvestigation(p,candidates);
  if(!V33.on || !pick || pick.target==null || game.roles[p]==='white') return pick;
  var t=pick.target, targetRole=game.roles[t], claimed=pick.declared;
  var v=brainView(p), publicV=brainView(-1);
  var speakerTrust=v29PositiveEvidence(-1,p,true), targetTrust=v29PositiveEvidence(-1,t,true);
  var zone=game.communistPolicies>=3;
  var knownTeammate=(game.roles[p]==='communist' && targetRole!=='white') ||
    (game.roles[p]==='stalin' && game.playerCount<=6 && targetRole==='communist');
  // For 7+ players, Stalin must not plan a false claim using secret team
  // knowledge unavailable to Stalin; use what the private investigation found.
  var targetIsComm=(targetRole!=='white'); // directly observed by this investigator
  var credibility=speakerTrust>=1.0 && (publicV.F[p]||0.5)<0.48;
  var lieChance=credibility?0.31:0.16;
  if(zone) lieChance+=0.07;
  if(targetIsComm){
    // Protect a teammate or frame an innocent check as a reassuring White clear;
    // even a non-teammate Communist may be worth protecting.
    if(knownTeammate) lieChance=Math.max(lieChance,0.55);
    // A suspicious, publicly visible clearance can backfire.
    if(targetTrust<-0.8) lieChance*=0.55;
    if(Math.random()<lieChance) claimed='White';
    else claimed='Communist';
  }else{
    // Accusing an actual White can discredit a prominent opponent, but causes
    // a public feud. High-profile lies aren't constant or cost-free.
    var usefulTarget=targetTrust>=1.0 || (publicV.F[t]||0.5)>0.37;
    var frameChance=usefulTarget ? (credibility?0.30:0.14) : 0.08;
    if(zone && usefulTarget) frameChance+=0.07;
    claimed=Math.random()<frameChance?'Communist':'White';
  }
  return {target:t,declared:claimed};
};


// ==================== v34: EXPOSED ROTATION, CONFLICT FREEZE & HUMAN PRESENCE ====================
// Optional human social starting status. This never reveals identities or changes
// the human's private information. Only affects their ability to persuade.
var V34={on:true, presence:'normie'};
function v34SetPresence(choice){
  V34.presence=choice==='boss'?'boss':'normie';
  v34RenderPresence();
  if(typeof sfx==='function') sfx('click');
}
function v34RenderPresence(){
  var a=document.getElementById('v34-normie'),b=document.getElementById('v34-boss');
  if(a){a.classList.toggle('selected',V34.presence==='normie');a.setAttribute('aria-pressed',String(V34.presence==='normie'));}
  if(b){b.classList.toggle('selected',V34.presence==='boss');b.setAttribute('aria-pressed',String(V34.presence==='boss'));}
}
function v34MountPresence(){
  if(document.getElementById('v34-presence')) return;
  var root=document.getElementById('screen-setup') || document.querySelector('.screen.active');
  if(!root) return;
  var parent=document.getElementById('role-pref-select');
  if(parent) parent=parent.parentElement;
  if(!parent || !root.contains(parent)) parent=document.getElementById('bot-settings-panel') || root;
  var group=document.createElement('div');
  group.id='v34-presence';
  group.style.cssText='margin:16px auto;padding:14px;max-width:440px;text-align:center;border:1px solid var(--border);border-radius:10px;background:var(--panel)';
  group.innerHTML='<div style="font-weight:900;letter-spacing:1px;text-transform:uppercase;margin-bottom:7px">Your Table Presence</div>'+
    '<div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap">'+
    '<button type="button" id="v34-normie" class="pill-btn selected" onclick="v34SetPresence(\'normie\')">Normie</button>'+
    '<button type="button" id="v34-boss" class="pill-btn" onclick="v34SetPresence(\'boss\')">Boss</button></div>'+
    '<div style="font-size:.74rem;color:var(--td);margin-top:8px">Normie: earn your influence. Boss: stronger speeches and table presence (full bonus as White; about 30% as Communist or Stalin). Trust and hard evidence still matter.</div>';
  parent.appendChild(group);
  v34RenderPresence();
  v34TogglePresenceVisibility();
}
function v34TogglePresenceVisibility(){
  var el=document.getElementById('v34-presence');
  if(el) el.style.display=(game.mode==='bots')?'block':'none';
}
var __v34Mode=window.selectMode;
window.selectMode=function(mode){
  var r=__v34Mode(mode);v34MountPresence();v34TogglePresenceVisibility();return r;
};
var __v34StartGame=window.startGame;
window.startGame=function(){
  // Reset after each new game setup; this is an intentional starting selection.
  return __v34StartGame();
};
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',v34MountPresence);
else v34MountPresence();

// The actual speech strength is authored in baBotDelta. Both the preview
// and the live vote receive the same scaled value; this is not cosmetic.
var __v34OldSpeechDelta=window.baBotDelta;
window.baBotDelta=function(botIdx,arg){
  var delta=__v34OldSpeechDelta(botIdx,arg);
  if(!V34.on || V34.presence!=='boss' || game.mode!=='bots' || game.humanPlayerIndex<0) return delta;
  if(!game.players[botIdx] || game.players[botIdx].isDead) return delta;
  var role=game.roles[game.humanPlayerIndex];
  var multiplier=role==='white'?1.90:1.27; // incremental Communist/ Stalin bonus ~30% of White bonus
  // Amplify persuasion, not inherited trust. A lack of evidence remains a
  // lack of evidence and private checks still veto dangerous tickets.
  var raw=Number(arg&&arg.val)||0;
  var bonus=raw*(multiplier-1)*(game.players[botIdx].personality?.persuadability||1);
  var recipientTrust=typeof v28Credibility==='function'?v28Credibility(botIdx,game.humanPlayerIndex):0.5;
  var damp=0.35+0.65*recipientTrust;
  // Do not turn weak or explicitly unsound arguments into an automatic victory.
  if(arg && arg.sound===false) damp*=0.35;
  return delta+(arg.stance==='nein'?-1:1)*Math.min(2.8,bonus*damp);
};

// Being called Communist by a credible investigator is evidence, not proof.
// Public contradiction and second checks determine how strongly bots react.
function v34KnownRed(observer,target){
  if(!BRAIN || target==null || !game.players[target]) return false;
  var own=(game.botInvestigations[observer]||{})[target];
  if(own==='communist') return true;
  var rec=game.playerRecords[target]||{};
  var claims=(rec.investigationsReceived||[]).filter(function(x){return x.declared==='Communist';});
  var cred=0;
  claims.forEach(function(x){if(x.by!==target && game.players[x.by] && !game.players[x.by].isDead && v28Credibility(observer,x.by)>=0.66) cred++;});
  var v=brainView(observer);
  return (cred>=2 && v.F[target]>=0.53) || (cred>=1 && v.F[target]>=0.78);
}
function v34PendingFeud(target){
  return (game.disputes||[]).some(function(d){
    return (d.p1===target||d.p2===target) && game.players[d.p1]&&!game.players[d.p1].isDead && game.players[d.p2]&&!game.players[d.p2].isDead;
  });
}
function v34IndependentClears(observer,target){
  var rec=game.playerRecords[target]||{};
  var witnesses={};
  (rec.investigationsReceived||[]).forEach(function(x){
    if(x.declared==='White'&& x.by!==target && game.players[x.by]&&!game.players[x.by].isDead && !hasDispute(x.by,target) && v28Credibility(observer,x.by)>=0.69) witnesses[x.by]=true;
  });
  return Object.keys(witnesses).length;
}
var __v34OldVote=window.botDecideVote;
window.botDecideVote=function(b){
  var prior=__v34OldVote(b);
  if(!V34.on || !BRAIN || game.gameOver || game.roles[b]!=='white' || game.nominatedChancellor==null) return prior;
  var P=game.currentPresident,C=game.nominatedChancellor,st=brainState();
  // An outed incoming Secretary is NOT a reason to reject a clean current
  // government just to advance rotation. Reject their own ticket instead.
  if(v34KnownRed(b,P)||v34KnownRed(b,C)) return false;
  if(!st.zone && st.w<4) return prior;
  // Freeze credible active contradictions until evidence resolves them.
  // Two independent checks can rehabilitate someone, but not override the
  // observer's own direct positive Communist finding.
  var feudP=v34PendingFeud(P),feudC=v34PendingFeud(C);
  if((feudP && v34IndependentClears(b,P)<2) || (feudC && v34IndependentClears(b,C)<2)) return false;
  return prior;
};


// ==================== v35: SOCIAL TABLE & FORENSIC AFTER-ACTION REPORT ====================
// Public comments are not secret evidence. Influence is observer-specific;
// genuine private investigations and direct firsthand contradictions prevail.
var V35={on:true, roundDiscussions:{}, voteEvents:[], claimEvents:[], invEvents:[], executions:[], opinions:{}, lastDiscussionKey:'', discussionLimit:2};
function v35Reset(){
  V35.roundDiscussions={}; V35.voteEvents=[]; V35.claimEvents=[];
  V35.invEvents=[]; V35.executions=[]; V35.opinions={}; V35.lastDiscussionKey='';
}
var __v35Start=window.startGame;
window.startGame=function(){v35Reset();return __v35Start.apply(this,arguments);};
var __v35Batch=window.runBatchSimulation;
if(typeof __v35Batch==='function')window.runBatchSimulation=function(){
  var old=V35;var save=JSON.stringify(V35);
  try{return __v35Batch.apply(this,arguments);}finally{
    var previous=JSON.parse(save);Object.keys(previous).forEach(function(k){V35[k]=previous[k];});
  }
};
var __v35SimSetup=window.simSetup;
if(typeof __v35SimSetup==='function') window.simSetup=function(){v35Reset();return __v35SimSetup.apply(this,arguments);};
function v35Round(){return (game.whitePolicies||0)+(game.communistPolicies||0)+1;}
function v35Name(i){return game.players[i]?game.players[i].name:'Player '+i;}
function v35Esc(t){return String(t==null?'':t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function v35PublicCred(target){
  if(typeof v31Leaders==='function'){
    var leaders=v31Leaders(), x=leaders.find(function(q){return q.id===target;});
    if(x) return x.score;
  }
  if(typeof v29PositiveEvidence==='function')return v29PositiveEvidence(-1,target,true);
  return 0;
}
function v35IndependentTrust(observer,target){
  if(observer===target)return 1;
  var value=typeof v28Credibility==='function'?v28Credibility(observer,target):0.5;
  if(BRAIN){var v=brainView(observer);value-=0.42*(v.F[target]||0);}
  if(hasDispute(observer,target))value-=0.45;
  var repeated=(game.playerRecords[target]||{}).publicDissent||0;
  if(repeated>=2)value-=Math.min(.18,.06*(repeated-1));
  if((game.botInvestigations[observer]||{})[target]==='communist')value=-1;
  if((game.botInvestigations[observer]||{})[target]==='white')value+=0.3;
  return Math.min(1,Math.max(-1,value));
}
function v35TrustedLeaders(observer){
  var alive=getAliveIndices().filter(function(i){return i!==observer;});
  var leaders=alive.map(function(i){return {id:i,publicScore:v35PublicCred(i),trust:v35IndependentTrust(observer,i)};});
  leaders.sort(function(a,b){return (b.publicScore+1.5*b.trust)-(a.publicScore+1.5*a.trust);});
  return leaders.filter(function(x){return x.publicScore>=0.6 && x.trust>=0.52;}).slice(0,2);
}
function v35Hinge(){
  return game.communistPolicies>=3||game.whitePolicies>=4||game.electionTracker>=2||
    v34PendingFeud(game.currentPresident)||v34PendingFeud(game.nominatedChancellor);
}
function v35Opinion(b,P,C){
  var v=brainView(b), chk=game.botInvestigations[b]||{};
  if(chk[P]==='communist'||chk[C]==='communist')return {yes:false,strength:1,reason:'I personally checked someone on this ticket and found Communist allegiance.'};
  if(hasDispute(b,P)||hasDispute(b,C))return {yes:false,strength:.95,reason:'My own direct contradiction with this ticket has not been resolved.'};
  var rp=v.F[P]||0, rc=v.F[C]||0, st=brainState(), tk=brainTicket(v,P,C,st);
  var pe=typeof v30Evidence==='function'?v30Evidence(b,P,v30BlocEvidence(b),false):0;
  var ce=typeof v30Evidence==='function'?v30Evidence(b,C,v30BlocEvidence(b),false):0;
  if(st.zone && !game.confirmedNotStalin[C] && tk.pS>.21)return {yes:false,strength:.8,reason:'The Premier has not been cleared of Stalin risk.'};
  if(st.zone && (pe<1.15||ce<1.15))return {yes:false,strength:.52,reason:'We still need affirmative evidence about both candidates.'};
  if(Math.max(rp,rc)>.55)return {yes:false,strength:.78,reason:'One member of this government is too suspicious.'};
  if((st.zone||st.w>=4)&&pe>1.5&&ce>1.5)return {yes:true,strength:.78,reason:'Both nominees have earned support through their records.'};
  if(!st.zone && rp<.44 && rc<.44)return {yes:true,strength:.48,reason:'Neither nominee has raised enough warning signs to stop progress.'};
  return {yes:false,strength:.25,reason:'I am not convinced this is our safest available ticket.'};
}
function v35Talk(kind,speaker,statement){
  if(typeof SIM_MODE!=='undefined'&&SIM_MODE)return;
  var name=v35Name(speaker);logSpeech(name,kind,statement,false);
  if(!V35.opinions[v35Round()])V35.opinions[v35Round()]=[];
  V35.opinions[v35Round()].push({speaker:speaker,kind:kind,statement:statement});
}
function v35VotingDiscussion(){
  if(!V35.on||!BRAIN||!isBotGame()||game.gameOver||!v35Hinge())return;
  if(typeof SIM_MODE!=='undefined'&&SIM_MODE)return;
  var P=game.currentPresident,C=game.nominatedChancellor;
  if(C==null)return;
  var key=v35Round()+':'+P+':'+C+':'+game.electionTracker;
  if(V35.lastDiscussionKey===key)return;
  V35.lastDiscussionKey=key;
  var alive=getAliveIndices().filter(function(i){return !game.players[i].isHuman;});
  var sorted=alive.map(function(i){return {id:i,score:v35PublicCred(i)};}).sort(function(a,b){return b.score-a.score;});
  var selected=sorted.filter(function(x){return x.score>=.65;}).slice(0,2);
  if(!selected.length && game.electionTracker===2 && sorted.length)selected=sorted.slice(0,1);
  selected.forEach(function(q){
    var op=v35Opinion(q.id,P,C);
    // Communist statements may strategically favor the team, but remain plausible.
    if(game.roles[q.id]==='communist' && game.communistPolicies>=3 &&
       game.roles[C]==='stalin' && op.strength<.95)op={yes:true,strength:.7,reason:'I think this ticket deserves a chance; delaying could be worse.'};
    var line=(op.yes?'I support':'I oppose')+' '+v35Name(P)+' and '+v35Name(C)+'. '+op.reason;
    v35Talk('Table discussion',q.id,line);
    V35.roundDiscussions[key]=V35.roundDiscussions[key]||[];
    V35.roundDiscussions[key].push({id:q.id,yes:op.yes,strength:op.strength,reason:op.reason});
  });
  var ac=document.getElementById('ac');
  if(ac && selected.length){
    var panel=document.createElement('div');panel.className='v35-discussion';
    panel.style.cssText='padding:11px;margin:8px 0;border:1px solid var(--border);border-radius:10px;background:var(--panel);font-size:.83rem;text-align:left';
    panel.innerHTML='<b style="color:var(--g)">🗣️ Table discussion</b>'+ V35.roundDiscussions[key].map(function(x){return '<div style="margin-top:6px"><strong>'+v35Esc(v35Name(x.id))+':</strong> '+(x.yes?'Support':'Oppose')+' — '+v35Esc(x.reason)+'</div>';}).join('');
    ac.prepend(panel);
  }
}
var __v35StartVoting=window.startVoting;
window.startVoting=function(){var r=__v35StartVoting.apply(this,arguments);v35VotingDiscussion();return r;};
// Observer-specific social networks: trusted speakers influence uncertain votes;
// never override a private positive Communist identification or direct feud.
var __v35PriorVote=window.botDecideVote;
window.botDecideVote=function(b){
  var baseline=__v35PriorVote(b);
  if(!V35.on||!BRAIN||game.gameOver||!isBotGame())return baseline;
  var P=game.currentPresident,C=game.nominatedChancellor;
  if(P==null||C==null||b===P||b===C)return baseline;
  if((game.botInvestigations[b]||{})[P]==='communist'||(game.botInvestigations[b]||{})[C]==='communist'||hasDispute(b,P)||hasDispute(b,C))return baseline;
  var key=v35Round()+':'+P+':'+C+':'+game.electionTracker,discussion=V35.roundDiscussions[key]||[];
  if(!discussion.length)return baseline;
  var view=brainView(b),tk=brainTicket(view,P,C,brainState());
  if(game.communistPolicies>=3 && (!game.confirmedNotStalin[C]&&tk.pS>.2))return baseline;
  if(view.F[P]>.53||view.F[C]>.53)return baseline;
  if(typeof v33SafeTrustedTicket==='function' && v33SafeTrustedTicket(b,P,C,brainState()))return true;
  var influence=0;
  var chosen=v35TrustedLeaders(b);
  discussion.forEach(function(d){
    var leader=chosen.find(function(x){return x.id===d.id;});
    if(!leader||d.id===b)return;
    influence+=(d.yes?1:-1)*d.strength*Math.max(0,leader.trust)*Math.min(1.2,Math.max(.2,leader.publicScore/3));
  });
  // Only modest shifts; independent judgment dominates. A true-red team may
  // exploit these same public networks as anyone else, with no role leaks.
  if(influence>.85&&!baseline && (view.F[P]+view.F[C]<.65))return Math.random()<Math.min(.4,.12+.19*influence);
  if(influence<-.85&&baseline)return !(Math.random()<Math.min(.38,.1-.19*influence));
  return baseline;
};
// Public accountability: repeated *unexplained* dissent carries a reputation
// cost. Do not treat dissent alone as proof of an evil role.
var __v35ResolveVote=window.resolveVote;
window.resolveVote=function(){
  var P=game.currentPresident,C=game.nominatedChancellor,rd=v35Round();
  var snapshot=getAliveIndices().map(function(i){return {id:i,yes:!!game.votes[i]};});
  var yes=snapshot.filter(function(x){return x.yes;}).length,passed=yes>snapshot.length/2;
  V35.voteEvents.push({round:rd,pres:P,chanc:C,votes:snapshot,passed:passed,zone:game.communistPolicies>=3});
  if(V35.on && BRAIN && game.communistPolicies>=3 && !(typeof SIM_MODE!=='undefined'&&SIM_MODE)){
    var isStrong=typeof v33SafeTrustedTicket==='function'&&getAliveIndices().some(function(i){return game.roles[i]==='white'&&v33SafeTrustedTicket(i,P,C,brainState());});
    if(isStrong){
      snapshot.filter(function(x){return !x.yes && x.id!==P&&x.id!==C;}).slice(0,2).forEach(function(x){
        var rec=game.playerRecords[x.id];
        if(rec){rec.publicDissent=(rec.publicDissent||0)+1;}
        // Criticism after votes is visible, but without knowing the voter's
        // private check there is no guaranteed guilt deduction.
        v35Talk('Accountability',P,'Why did '+v35Name(x.id)+' reject a ticket with substantial support? We need a reason.');
      });
    }
  }
  return __v35ResolveVote.apply(this,arguments);
};
// Capture exactly what was publicly reported and the real cards involved.
// The real cards are revealed ONLY in the postgame report.
var __v35Gov=window.brainObserveGovernment;
window.brainObserveGovernment=function(P,C,enacted,claims){
  if(claims && game.drawnPoliciesOriginal && game.passedToChancellor){
    var draw=game.drawnPoliciesOriginal.slice(),passed=game.passedToChancellor.slice();
    V35.claimEvents.push({round:v35Round()-1,pres:P,chanc:C,enacted:enacted,
      actualDrawWhite:draw.filter(function(x){return x==='white';}).length,
      actualPassWhite:passed.filter(function(x){return x==='white';}).length,
      presClaimWhite:claims.cd,presClaimPassWhite:claims.pa,
      premierClaimNoChoice:!!claims.t2,actualPremierNoChoice:passed.every(function(x){return x==='communist';})});
  }
  return __v35Gov.apply(this,arguments);
};
var __v35Inv=window.brainObserveInvestigation;
window.brainObserveInvestigation=function(P,target,declared){
  V35.invEvents.push({round:v35Round(),pres:P,target:target,declared:declared,
    actual:game.roles[target]==='white'?'White':'Communist'});
  return __v35Inv.apply(this,arguments);
};
function v35ExecutionTalk(P){
  if(!V35.on||!BRAIN||!isBotGame()||(typeof SIM_MODE!=='undefined'&&SIM_MODE))return;
  var others=getAliveIndices().filter(function(i){return i!==P && !game.players[i].isHuman;});
  var leaders=others.map(function(i){return {id:i,s:v35PublicCred(i)};}).sort(function(a,b){return b.s-a.s;}).slice(0,2);
  leaders.forEach(function(L){
    var view=brainView(L.id),target=null,best=-1;
    getAliveIndices().forEach(function(j){
      if(j===P||j===L.id)return;
      var risk=(view.F[j]||0)+(hasDispute(L.id,j)?.25:0);
      if(risk>best){best=risk;target=j;}
    });
    if(target==null)return;
    v35Talk('Execution debate',L.id,'My strongest evidence points toward '+v35Name(target)+'. We should scrutinize their claims before firing.');
  });
}
var __v35BotExec=window.botExecute;
window.botExecute=function(){
  var P=game.currentPresident;v35ExecutionTalk(P);
  var priorAlive=getAliveIndices();var r=__v35BotExec.apply(this,arguments);
  priorAlive.forEach(function(i){if(game.players[i]&&game.players[i].isDead&&V35.executions.every(function(e){return e.target!==i;}))V35.executions.push({round:v35Round(),pres:P,target:i,role:game.roles[i]});});
  return r;
};
var __v35ExecutePlayer=window.executePlayer;
window.executePlayer=function(idx){
  V35.executions.push({round:v35Round(),pres:game.currentPresident,target:idx,role:game.roles[idx]});
  return __v35ExecutePlayer.apply(this,arguments);
};
var __v35ShowExec=window.showExecutionUI;
window.showExecutionUI=function(){var r=__v35ShowExec.apply(this,arguments);v35ExecutionTalk(game.currentPresident);return r;};
function v35PostgameHTML(){
  var output='<section id="v35-report" style="max-width:950px;margin:16px auto;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--panel);text-align:left">';
  output+='<h3 style="margin:0 0 10px;color:var(--g)">🕵️ Full Postgame Investigation</h3>';
  output+='<p style="font-size:.79rem;color:var(--td)">Private truth is shown here only after the game. Incorrect claims are confirmed lies; unusual votes alone are not proof of guilt.</p>';
  var identity=game.players.map(function(p,i){return v35Esc(p.name)+' — '+v35Esc(game.roles[i]);});
  output+='<details open><summary><strong>All identities</strong></summary><p>'+identity.join(' · ')+'</p></details>';
  var lies=[];
  V35.claimEvents.forEach(function(c){
    var name=v35Name(c.pres), chanc=v35Name(c.chanc),rs=[];
    if(c.presClaimWhite!==c.actualDrawWhite)rs.push('claimed '+c.presClaimWhite+' White drawn, actually '+c.actualDrawWhite);
    if(c.presClaimPassWhite!==c.actualPassWhite)rs.push('claimed '+c.presClaimPassWhite+' White passed, actually '+c.actualPassWhite);
    if(rs.length)lies.push('Round '+c.round+': '+name+' (Secretary) — '+rs.join('; ')+'. Premier: '+chanc+'.');
    if(c.premierClaimNoChoice!==c.actualPremierNoChoice){
      // t2=false is not a full detailed card claim, but it does deny being
      // forced to enact Red in this implementation.
      lies.push('Round '+c.round+': '+chanc+' (Premier) — reported '+(c.premierClaimNoChoice?'no White choice':'a White option')+', actual pass contained '+c.actualPassWhite+' White.');
    }
  });
  V35.invEvents.forEach(function(e){if(e.declared!==e.actual)lies.push('Round '+e.round+': '+v35Name(e.pres)+' falsely investigated '+v35Name(e.target)+' as '+e.declared+' (actually '+e.actual+').');});
  output+='<details open><summary><strong>Verified false statements ('+lies.length+')</strong></summary>'+(lies.length?'<ol>'+lies.map(function(t){return '<li style="margin:6px 0">'+v35Esc(t)+'</li>';}).join('')+'</ol>':'<p>No verified false policy or investigation statements were recorded.</p>')+'</details>';
  output+='<details><summary><strong>Government & vote history ('+V35.voteEvents.length+')</strong></summary>';
  output+='<div style="max-height:260px;overflow:auto;font-size:.8rem">'+V35.voteEvents.map(function(x){return '<p>Round '+x.round+': '+v35Esc(v35Name(x.pres))+' / '+v35Esc(v35Name(x.chanc))+' — '+(x.passed?'elected':'rejected')+'; YES: '+v35Esc(x.votes.filter(function(v){return v.yes;}).map(function(v){return v35Name(v.id);}).join(', '))+'</p>';}).join('')+'</div></details>';
  output+='<details><summary><strong>Executions ('+V35.executions.length+')</strong></summary>'+(V35.executions.length?'<ol>'+V35.executions.map(function(x){return '<li>Round '+x.round+': '+v35Esc(v35Name(x.pres))+' shot '+v35Esc(v35Name(x.target))+' ('+v35Esc(x.role)+')</li>';}).join('')+'</ol>':'<p>No executions.</p>')+'</details>';
  output+='<details><summary><strong>Discussion & accountability ('+Object.keys(V35.opinions).length+' rounds)</strong></summary><div style="max-height:280px;overflow:auto">';
  Object.keys(V35.opinions).forEach(function(round){V35.opinions[round].forEach(function(o){output+='<p style="font-size:.8rem">Round '+round+' — '+v35Esc(v35Name(o.speaker))+' ('+v35Esc(o.kind)+'): '+v35Esc(o.statement)+'</p>';});});
  output+='</div></details></section>';
  return output;
}
function v35DisplayReport(){
  if(typeof SIM_MODE!=='undefined'&&SIM_MODE)return;
  var old=document.getElementById('v35-report');if(old)old.remove();
  var root=document.getElementById('victory-box')||document.getElementById('ac');
  if(root)root.insertAdjacentHTML('afterend',v35PostgameHTML());
}
var __v35End=window.endGame;
window.endGame=function(w,r){var out=__v35End.apply(this,arguments);if(game.gameOver)v35DisplayReport();return out;};


// ==================== v36: COMMITTED SPEECH + LEAST-BAD COORDINATION ====================
// Public election statements must match the speaker's eventual ballot.
// Pre-committed speakers may persuade other voters, not themselves.
var V36={on:true,key:'',committed:{},speakers:[],fallbackVotes:0};
function v36Key(){return v35Round()+':'+game.currentPresident+':'+game.nominatedChancellor+':'+game.electionTracker;}
function v36Reset(){V36.key='';V36.committed={};V36.speakers=[];V36.fallbackVotes=0;}
var __v36StartGame=window.startGame;
window.startGame=function(){v36Reset();return __v36StartGame.apply(this,arguments);};
var __v36SimSetup=window.simSetup;
if(typeof __v36SimSetup==='function')window.simSetup=function(){v36Reset();return __v36SimSetup.apply(this,arguments);};

// When the entire table lacks a meaningful trust anchor, repeated unanimous NO
// votes cannot create information. Compare the CURRENT candidates with the
// immediate rotation using ONLY the observer's evidence, never true roles.
function v36WhiteLastResort(b,prior){
  if(!V36.on||!BRAIN||game.roles[b]!=='white'||game.communistPolicies<3||
      game.currentPresident==null||game.nominatedChancellor==null||
      b===game.currentPresident||b===game.nominatedChancellor)return prior;
  var P=game.currentPresident,C=game.nominatedChancellor,st=brainState();
  var view=brainView(b),checks=game.botInvestigations[b]||{},bloc=v30BlocEvidence(b);
  if(checks[P]==='communist'||checks[C]==='communist'||hasDispute(b,P)||hasDispute(b,C)||
     isInAnyConflict(P)||isInAnyConflict(C)||view.F[P]>=.60||view.F[C]>=.60)return prior;
  if(typeof v33SafeTrustedTicket==='function'&&v33SafeTrustedTicket(b,P,C,st))return true;
  var alive=getAliveIndices(),ranks=alive.map(function(i){
    return {id:i,score:v30Evidence(b,i,bloc,false)-2.2*(view.F[i]||0)-(isInAnyConflict(i)?1.0:0)};
  }).sort(function(a,z){return z.score-a.score;});
  var maxEvidence=Math.max.apply(null,alive.map(function(i){return v30Evidence(b,i,bloc,false);}));
  // Trigger ONLY when no one has earned real credibility. Not a backdoor to
  // rubber-stamp unknown tickets when a proven safe alternative exists.
  if(maxEvidence>=1.55)return prior;
  var upcoming=[P].concat(v30Upcoming(P,3));
  var future=upcoming.map(function(i){return ranks.find(function(x){return x.id===i;});});
  var pScore=future[0]?future[0].score:-9;
  var better=future.slice(1).filter(function(x){return x&&x.score>pScore+0.45;});
  var cRank=ranks.findIndex(function(x){return x.id===C;});
  var tk=brainTicket(view,P,C,st);
  // Keep hard risk bounds: an unknown Premier is not automatically safe.
  var stalinLimit=st.tracker>=2?.31:.22;
  if(!game.confirmedNotStalin[C]&&tk.pS>stalinLimit)return prior;
  if(st.r>=4&&view.F[P]>.40)return prior;
  if(st.r>=5&&tk.eRed>.60)return prior;
  if(better.length||cRank>Math.max(2,Math.floor((alive.length-1)/3)))return prior;
  // Once chaos approaches, back the least-bad reachable team. On the first
  // election, still prefer gathering information if NO is relatively safe.
  if(st.tracker>=1)return true;
  return prior;
}
// Adapt the ordinary white vote before discussions are assembled.
var __v36PriorVote=window.botDecideVote;
function v36UncommittedVote(b){return v36WhiteLastResort(b,__v36PriorVote(b));}
window.botDecideVote=function(b){
  if(V36.on&&V36.key===v36Key()&&Object.prototype.hasOwnProperty.call(V36.committed,b))return V36.committed[b];
  return v36UncommittedVote(b);
};

// Original v35 created speculative comments (and sometimes a special Communist
// endorsement) independent of the speaker's real vote. Replace that logic with
// a committed ballot followed by a faithful statement. The EXISTING v35
// social-network influence is still applied to listeners' votes below.
v35VotingDiscussion=function(){
  if(!V35.on||!BRAIN||!isBotGame()||game.gameOver||!v35Hinge()||
     (typeof SIM_MODE!=='undefined'&&SIM_MODE))return;
  var P=game.currentPresident,C=game.nominatedChancellor;
  if(C==null)return;
  var key=v36Key();if(V35.lastDiscussionKey===key)return;
  V35.lastDiscussionKey=key;
  var eligible=getAliveIndices().filter(function(i){return !game.players[i].isHuman;});
  var rated=eligible.map(function(i){return {id:i,score:v35PublicCred(i)};}).sort(function(a,z){return z.score-a.score;});
  var chosen=rated.filter(function(x){return x.score>=.65;}).slice(0,2);
  if(!chosen.length&&game.electionTracker===2&&rated.length)chosen=rated.slice(0,1);
  V36.key=key;V36.committed={};V36.speakers=chosen.map(function(x){return x.id;});
  V35.roundDiscussions[key]=[];
  chosen.forEach(function(x){
    var vote=!!v36UncommittedVote(x.id);
    V36.committed[x.id]=vote;
    var op=v35Opinion(x.id,P,C), reason;
    if(op.yes===vote)reason=op.reason;
    else if(vote)reason='On balance I believe this is our best available path forward.';
    else reason='I cannot justify supporting this ticket on the evidence I have.';
    var phrase=(vote?'I support':'I oppose')+' '+v35Name(P)+' and '+v35Name(C)+'. '+reason;
    V35.roundDiscussions[key].push({id:x.id,yes:vote,strength:op.yes===vote?op.strength:.48,reason:reason});
    v35Talk('Table discussion',x.id,phrase);
  });
  // A listener's vote is evaluated once, AFTER the speakers have declared,
  // and then committed. Nobody can later change their vote because of vote
  // order or roll a new random decision while speaking.
  eligible.forEach(function(i){
    if(!Object.prototype.hasOwnProperty.call(V36.committed,i)){
      V36.committed[i]=!!v36UncommittedVote(i);
    }
  });
  var ac=document.getElementById('ac');
  if(ac&&chosen.length){
    var old=ac.querySelector('.v35-discussion');if(old)old.remove();
    var panel=document.createElement('div');panel.className='v35-discussion';
    panel.style.cssText='padding:11px;margin:8px 0;border:1px solid var(--border);border-radius:10px;background:var(--panel);font-size:.83rem;text-align:left';
    panel.innerHTML='<b style="color:var(--g)">🗣️ Table discussion</b>'+V35.roundDiscussions[key].map(function(x){return '<div style="margin-top:6px"><strong>'+v35Esc(v35Name(x.id))+':</strong> '+(x.yes?'Support':'Oppose')+' — '+v35Esc(x.reason)+'</div>';}).join('');
    ac.prepend(panel);
  }
};
// The pre-v35 vote wrapper uses dynamic global references to current discussions,
// so the above precomputation maintains the real influence on followers.
var __v36ResolveVote=window.resolveVote;
window.resolveVote=function(){var result=__v36ResolveVote.apply(this,arguments);v36Reset();return result;};

// ==================== v37: EVIDENCE-RELATIVE STALIN ZONE VOTING ====================
// The v36 fallback could disable itself when ONE person anywhere had evidence,
// and it did nothing on tracker 0. A lack of positive information must not
// create an automatic NO on every viable ticket. Compute the best AVAILABLE
// option from each White observer's beliefs instead of requiring arbitrary
// absolute trust cutoffs.
var V37={on:true};
function v37Clamp(x,lo,hi){return Math.max(lo,Math.min(hi,x));}
function v37Score(observer,target,view,bloc){
  var ev=v30Evidence(observer,target,bloc,false);
  var f=Number.isFinite(view.F[target])?view.F[target]:0.50;
  var value=0.65*v37Clamp(ev,-3,4)-2.35*f;
  if(isInAnyConflict(target))value-=1.05;
  if(game.mildSuspicionPresidents[target])value-=0.45;
  if((bloc.conf[target]||0)>0.2)value-=1.1*bloc.conf[target];
  return value;
}
function v37ZoneWhiteVote(b,prior){
  if(!V37.on||!BRAIN||game.roles[b]!=='white'||game.communistPolicies<3||game.gameOver)return prior;
  var P=game.currentPresident,C=game.nominatedChancellor;
  if(P==null||C==null||b===P||b===C)return prior;
  var st=brainState(),view=brainView(b),checks=game.botInvestigations[b]||{},bloc=v30BlocEvidence(b);
  // Certain first-hand evidence always wins over a relative preference.
  if(checks[P]==='communist'||checks[C]==='communist'||
     (typeof v34KnownRed==='function'&&(v34KnownRed(b,P)||v34KnownRed(b,C)))||
     hasDispute(b,P)||hasDispute(b,C))return false;
  if(typeof v33SafeTrustedTicket==='function'&&v33SafeTrustedTicket(b,P,C,st))return true;
  var tk=brainTicket(view,P,C,st),alive=getAliveIndices();
  var ps=v37Score(b,P,view,bloc),cs=v37Score(b,C,view,bloc);
  var upcoming=[P].concat(v30Upcoming(P,3));
  var nextScores=upcoming.map(function(i){return v37Score(b,i,view,bloc);});
  // Prefer the current Secretary if comparable to the NEXT available one;
  // never wait indefinitely for a hypothetical perfect leader.
  var bestFuture=Math.max.apply(null,nextScores.slice(1));
  var presGap=ps-bestFuture;
  var eligible=alive.filter(function(i){return i!==P&&!game.players[i].isDead;});
  var peers=eligible.map(function(i){return v37Score(b,i,view,bloc);}).sort(function(a,z){return z-a;});
  var top=peers.length?peers[0]:cs;
  var premierGap=cs-top;
  var hasEvidence=alive.some(function(i){return v29PositiveEvidence(b,i,false)>=1.6;});
  // A known unsafe ticket is not rescued by the simple fact that everybody is unknown.
  if(view.F[P]>=0.76||view.F[C]>=0.76)return false;
  if(!game.confirmedNotStalin[C]&&tk.pS>=0.45)return false;
  if(st.r>=4&&view.F[P]>=0.64)return false;
  // With a credible option at the table, reserve more weight for it, while
  // still accepting that voters must eventually take a reasonable chance.
  var uncertainty=hasEvidence?0:1;
  var chance=0.31 + 0.15*uncertainty + 0.12*st.tracker;
  chance+=0.15*v37Clamp(presGap,-1,1);
  chance+=0.19*v37Clamp(premierGap,-1.4,0);
  chance-=0.20*v37Clamp((tk.pS||0)-0.17,0,0.7)/0.7;
  if(st.r>=4)chance-=0.14*v37Clamp(view.F[P]-0.32,0,0.4)/0.4;
  if(st.r>=5)chance-=0.25*v37Clamp((tk.eRed||0)-0.38,0,0.5)/0.5;
  if(isInAnyConflict(P)||isInAnyConflict(C))chance-=0.12;
  // At tracker 2 compare the actual expected danger of blind topdecking.
  if(st.tracker>=2){
    var chaos=st.pChaosRed*st.Rc-(1-st.pChaosRed)*st.Wg;
    var govt=tk.eRed*st.Rc-(1-tk.eRed)*st.Wg+(game.confirmedNotStalin[C]?0:tk.pS*st.Kz);
    if(st.r>=4)govt+=v37Clamp(view.F[P],0,1)*(st.r>=5?2.1:1.2);
    chance+=(govt<chaos?0.19:-0.19);
  }
  // Never form a universal bloc from a strict binary "trusted" threshold.
  // Every White judges their own weak evidence and has a moderate willingness
  // to approve the best plausible government even on the FIRST ballot.
  return Math.random()<v37Clamp(chance,0.10,0.86);
}
// v36's committed-speaker mechanism looks up v36WhiteLastResort dynamically,
// so this changes both spoken positions and the eventual ballots together.
var __v37EarlierFallback=v36WhiteLastResort;
v36WhiteLastResort=function(b,prior){
  if(!V37.on||!BRAIN||game.roles[b]!=='white'||game.communistPolicies<3)return __v37EarlierFallback(b,prior);
  return v37ZoneWhiteVote(b,prior);
};


// ==================== v38: CONSISTENT PREMIER SUGGESTION FLOW ====================
// The previous suggestion opportunity was attached only to policy debriefs and
// could vanish after reshuffles, disputes, special powers, vetoes and chaos.
// Instead, present it immediately BEFORE the next bot Secretary nominates.
// The visible sequence is: Continue Revolution -> Suggest / Skip -> Election.
var V38_FLOW = { pending:false, opening:false, used:false, originalStart:null };
// Disable the obsolete debrief suggestion button. Every debrief now has only
// its own Continue Revolution action; the next government handles suggestions.
window.baSuggestButtonHtml = function(){ return ''; };
// Bypass v17's extra, inconsistent suggestion interstitial while retaining
// the original policy dialogue and all the policy / dispute observations.
if(typeof __v17cpd === 'function') window.conductPolicyDebrief = __v17cpd;
// Keep older suggestion weighting and the nomination-acceptance hook, but
// adapt eligibility to the actual incoming Secretary (never guess rotation).
window.baSuggestApplicable = function(){
  if(typeof SIM_MODE !== 'undefined' && SIM_MODE) return false;
  if(!V17.on || !BRAIN || !isBotGame() || game.mode === 'watch' || game.gameOver) return false;
  var h=game.humanPlayerIndex, n=game.currentPresident;
  return h >= 0 && !!game.players[h] && !game.players[h].isDead &&
    n !== h && !!game.players[n] && !game.players[n].isDead &&
    baSuggestCandidates(n).length > 0;
};
function v38ResumeNomination(){
  if(!V38_FLOW.pending) return;
  V38_FLOW.pending=false;
  V38_FLOW.used=true;
  V38_FLOW.originalStart();
}
function v38PickPremier(idx){
  if(!V38_FLOW.pending || V38_FLOW.used || !baSuggestApplicable()) return;
  var n=game.currentPresident;
  if(baSuggestCandidates(n).indexOf(idx)<0) return;
  var outcome=baResolveSuggestion(n, idx);
  var cn=baName(idx), response=baSuggestReply(n,cn,outcome.accept,outcome.out,outcome.fT);
  logSpeech('You','Suggestion','I suggest '+cn+' for Premier.');
  logSpeech(baName(n),'Secretary',response,!outcome.accept && outcome.out);
  log('🗳️ You recommended '+cn+' to '+baName(n)+': '+(outcome.accept?'accepted':'declined'));
  document.getElementById('at').textContent=outcome.accept?'Suggestion Accepted':'Suggestion Declined';
  document.getElementById('ad').textContent=baName(n)+' responds:';
  document.getElementById('ac').innerHTML=
    '<div class="speech-card pres"><div class="speech-name">🗳️ You suggest '+baEsc(cn)+' for Premier</div></div>'+
    '<div class="speech-card chanc"><div class="speech-name">👑 '+baEsc(baName(n))+'</div><div class="speech-text">"'+baEsc(response)+'"</div></div>'+
    '<button class="btn" onclick="v38ResumeNomination()" style="margin-top:12px">Proceed to Election →</button>';
  V38_FLOW.used=true;
  // The accepted suggestion is consumed by the existing pickNomination hook.
  // v38ResumeNomination must still run when a suggestion was already made.
}
function v38ShowCandidates(){
  if(!V38_FLOW.pending || V38_FLOW.used) return;
  var n=game.currentPresident;
  document.getElementById('at').textContent='Suggest a Premier';
  document.getElementById('ad').textContent='Recommend a candidate to Secretary '+baName(n)+'. Their decision depends on trust and their own judgment.';
  var html='<div class="player-select-grid">';
  baSuggestCandidates(n).forEach(function(i){
    var vibe=baVibeInfo(baFeelF(i));
    html+='<button class="select-player-btn" onclick="v38PickPremier('+i+')">'+baEsc(i===game.humanPlayerIndex?'You':baName(i))+
      ' <span style="opacity:.85;font-size:.7rem">'+vibe.icon+' '+vibe.label+'</span></button>';
  });
  html+='</div><button class="btn secondary" onclick="v38ShowChoice()" style="margin-top:12px">← Back</button>';
  document.getElementById('ac').innerHTML=html;
}
function v38ShowChoice(){
  if(!V38_FLOW.pending || V38_FLOW.used) return;
  var n=game.currentPresident;
  document.getElementById('pt').textContent='Nomination';
  document.getElementById('at').textContent='Suggest a Premier?';
  document.getElementById('ad').textContent=baName(n)+' is about to nominate a Premier. Would you like to make a recommendation first?';
  document.getElementById('ac').innerHTML=
    '<div class="speech-card pres" style="text-align:center"><div class="speech-name">👑 Next Secretary: '+baEsc(baName(n))+'</div></div>'+
    '<div style="display:flex;justify-content:center;align-items:stretch;flex-wrap:wrap;gap:12px;margin:16px auto 0;width:100%;max-width:500px;box-sizing:border-box">'+
    '<button type="button" class="btn secondary" onclick="v38ShowCandidates()" style="flex:1 1 190px;min-width:0;width:auto;height:54px;min-height:54px;margin:0;padding:10px 12px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;text-align:center">Suggest a Premier</button>'+
    '<button type="button" class="btn" onclick="v38ResumeNomination()" style="flex:1 1 190px;min-width:0;width:auto;height:54px;min-height:54px;margin:0;padding:10px 12px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;text-align:center">No Suggestion</button></div>';
}
V38_FLOW.originalStart = window.startRound;
window.startRound = function(){
  // Simulations, non-bot play, first turn, dead human, and a human Secretary
  // must proceed exactly as in v37, without a needless suggestion gate.
  if((typeof SIM_MODE !== 'undefined' && SIM_MODE) || game.gameOver ||
     !isBotGame() || game.mode==='watch' ||
     !(game.voteHistory && game.voteHistory.length) || !baSuggestApplicable()){
    return V38_FLOW.originalStart.apply(this,arguments);
  }
  if(V38_FLOW.pending) return; // prevent multiple screens from overlapping
  V38_FLOW.pending=true; V38_FLOW.used=false;
  transitionLock=false;
  v38ShowChoice();
};
// No nested Continue buttons: the old v17 optional interstitial should never
// replace the single debrief Continue -> next government flow.
window.baShowSuggestInterstitial = function(done){ if(done) done(); };



// ==================== v39: CONSISTENT ROUND, EXECUTION, ZONE VOTING ====================
var SS39={on:true,execStep:'',execKey:'',execOutcome:null};
function ss39BotMode(){return typeof SIM_MODE!=='undefined'&&!SIM_MODE&&isBotGame()&&game.mode==='bots';}
function ss39PowerKey(){return [game.currentPresident,game.communistPolicies,game.whitePolicies,game.policyHistory.length].join(':');}
// Explicitly gate every subsequent bot Secretary nomination after a completed
// election, even after a failed ballot, chaos or a special power.
var ss39EarlierStart=window.startRound;
window.startRound=function(){
  SS39.execStep='';SS39.execOutcome=null;
  return ss39EarlierStart.apply(this,arguments);
};
// One button first; only THEN does the player decide whether to recommend a victim.
// The bot's actual choice and the death reveal happen on subsequent screens.
var ss39EarlierPower=window.triggerPower;
window.triggerPower=function(){
  if(!SS39.on||game.powerType!=='execution'||!ss39BotMode()||game.gameOver){
    return ss39EarlierPower.apply(this,arguments);
  }
  var key=ss39PowerKey();
  if(SS39.execKey!==key){SS39.execKey=key;SS39.execStep='';SS39.execOutcome=null;}
  if(!SS39.execStep){
    SS39.execStep='witness';
    transitionLock=false;game.phase='power';renderGameBoard();
    document.getElementById('pt').textContent='Executive Power';
    document.getElementById('at').textContent='Execution Ordered';
    document.getElementById('ad').textContent=game.players[game.currentPresident].name+' holds the execution power.';
    document.getElementById('ac').innerHTML='<button class="btn" onclick="ss39WitnessExecution()">Witness Execution →</button>';
    return;
  }
  if(SS39.execStep==='witness')return;
  // The old v19 suggestion code calls triggerPower again on acceptance/skip.
  if(SS39.execStep==='suggest')SS39.execStep='execute';
  if(SS39.execStep==='execute'){
    // Skip the original v19 suggestion interstitial, which is already shown.
    window.__baExecSkip=true;
    return ss39EarlierPower.apply(this,arguments);
  }
};
function ss39WitnessExecution(){
  if(SS39.execStep!=='witness')return;
  SS39.execStep='suggest';
  if(baExecApplicable()){
    document.getElementById('pt').textContent='Execution';
    document.getElementById('at').textContent='Suggest a Victim?';
    document.getElementById('ad').textContent='You may recommend a target, or let the Secretary decide.';
    document.getElementById('ac').innerHTML='<button class="btn" onclick="baExecOpen()">🗡️ Suggest a Victim</button>'+ 
      '<button class="btn secondary" style="margin-top:10px" onclick="ss39SkipVictim()">Skip Suggestion →</button>';
  }else{
    SS39.execStep='execute';
    ss39EarlierPower();
  }
}
function ss39SkipVictim(){
  if(SS39.execStep!=='suggest')return;
  game.baExecDone=baExecKey();
  SS39.execStep='execute';
  window.__baExecSkip=true;
  ss39EarlierPower();
}
function ss39ExecutionResult(idx){
  var isStalin=game.roles[idx]==='stalin',nm=game.players[idx].name;
  SS39.execOutcome={target:idx,isStalin:isStalin};
  document.getElementById('pt').textContent='Execution Result';
  document.getElementById('at').textContent='💀 '+nm+' Was Executed';
  document.getElementById('ad').textContent=isStalin?'Stalin has been eliminated.':'The executed player was NOT Stalin.';
  document.getElementById('ac').innerHTML='<div class="dispute-box"><div class="dispute-title">'+
    (isStalin?'STALIN EXECUTED':'NOT STALIN')+'</div><div class="dispute-desc">'+
    (isStalin?'The Whites win.':'The revolution continues.')+'</div></div>'+ 
    '<button class="btn" onclick="ss39AfterExecution()">Continue Revolution →</button>';
  renderGameBoard();
}
function ss39AfterExecution(){
  if(!SS39.execOutcome)return;
  var outcome=SS39.execOutcome;SS39.execOutcome=null;
  if(outcome.isStalin){endGame('white','Stalin was executed! Whites restore freedom!');return;}
  game.powerType=null;game.currentPresident=nextPresident();startRound();
}
// Replace only bot-mode execution resolution. Preserve accepted victim suggestions,
// log events and brain observations; defer advancing until the result is shown.
var ss39OldBotExecute=window.botExecute;
window.botExecute=function(){
  if(!SS39.on||!ss39BotMode()||SS39.execStep!=='execute')return ss39OldBotExecute.apply(this,arguments);
  var P=game.currentPresident,target=pickExecutionTarget(P);
  if(target==null||!game.players[target]||game.players[target].isDead)return ss39OldBotExecute.apply(this,arguments);
  if(typeof v35ExecutionTalk==='function')v35ExecutionTalk(P);
  game.players[target].isDead=true;
  log('💀 '+game.players[P].name+' executed '+game.players[target].name+'!');
  brainObserveExecution(target);
  if(typeof V35!=='undefined')V35.executions.push({round:v35Round(),pres:P,target:target,role:game.roles[target]});
  SS39.execStep='result';ss39ExecutionResult(target);
};
var ss39OldHumanExecute=window.executePlayer;
window.executePlayer=function(idx){
  if(!SS39.on||!ss39BotMode()||SS39.execStep!=='execute')return ss39OldHumanExecute.apply(this,arguments);
  if(idx===game.currentPresident||!game.players[idx]||game.players[idx].isDead)return;
  sfx('communist');game.players[idx].isDead=true;
  log('💀 '+game.players[game.currentPresident].name+' executed '+game.players[idx].name+'!');
  brainObserveExecution(idx);
  if(typeof V35!=='undefined')V35.executions.push({round:v35Round(),pres:game.currentPresident,target:idx,role:game.roles[idx]});
  SS39.execStep='result';ss39ExecutionResult(idx);
};

// Expected-value voting, rather than nine independent reflexive NO ballots.
// Grounding: each observer's own beliefs, observable rotation, and public deck
// claims. Never read secret identities of other candidates.
var SS39Vote={on:true};
function ss39ZoneVote(b,prior){
  if(!SS39Vote.on||!BRAIN||game.gameOver||game.roles[b]!=='white'||game.communistPolicies<3)return prior;
  var P=game.currentPresident,C=game.nominatedChancellor;
  if(P==null||C==null||b===P||b===C)return prior;
  var st=brainState(),v=brainView(b),privateInfo=game.botInvestigations[b]||{},bloc=v30BlocEvidence(b);
  if(privateInfo[P]==='communist'||privateInfo[C]==='communist'||
    (typeof v34KnownRed==='function'&&(v34KnownRed(b,P)||v34KnownRed(b,C)))||
    hasDispute(b,P)||hasDispute(b,C))return false;
  if(v33SafeTrustedTicket(b,P,C,st))return true;
  var tk=brainTicket(v,P,C,st);
  // Truly high Stalin odds or reliable evidence of a dangerous Secretary
  // cannot be overridden by generic gridlock fear.
  if(!game.confirmedNotStalin[C]&&tk.pS>=.44)return false;
  if(v.F[P]>=.84||v.F[C]>=.84)return false;
  var pScore=v37Score(b,P,v,bloc),cScore=v37Score(b,C,v,bloc);
  var next=v30Upcoming(P,3).map(function(i){return v37Score(b,i,v,bloc);});
  var bestFuture=next.length?Math.max.apply(null,next):pScore;
  var others=getAliveIndices().filter(function(i){return i!==P;}).map(function(i){return v37Score(b,i,v,bloc);}).sort(function(a,z){return z-a;});
  var bestPremier=others.length?others[0]:cScore;
  // This captures the value of the best achievable future rather than a
  // hypothetical guaranteed White government several elections ahead.
  var gapP=Math.max(-2,Math.min(2,pScore-bestFuture));
  var gapC=Math.max(-2,Math.min(0,cScore-bestPremier));
  var riskGov=tk.eRed*st.Rc-(1-tk.eRed)*st.Wg;
  if(!game.confirmedNotStalin[C])riskGov+=tk.pS*st.Kz;
  if(st.r>=4)riskGov+=(v.F[P]||0)*(st.r>=5?2.4:1.35);
  // At tracker 2, rejecting means an immediate random policy. At tracker 0/1
  // the cost is discounted but the next two rotations can also be dangerous.
  var chaos=st.pChaosRed*st.Rc-(1-st.pChaosRed)*st.Wg;
  var difference=chaos-riskGov;
  var chance=.61+.11*st.tracker+.065*gapP+.09*gapC;
  chance+=Math.max(-.22,Math.min(.22,difference*.085))*(st.tracker===2?1.5:0.65);
  if(isInAnyConflict(P)||isInAnyConflict(C))chance-=.12;
  if(v.F[P]>.57||v.F[C]>.57)chance-=.16;
  if(!game.confirmedNotStalin[C]&&tk.pS>.28)chance-=.20;
  // Strong reason to avoid gambling on a forced Communist policy at match point.
  if(st.r>=5 && tk.eRed>.65)chance-=.14;
  // When everyone is unknown, coordinate on the least bad available candidates;
  // voters retain independent beliefs but don't all assume abstention is safe.
  chance=Math.max(.06,Math.min(.95,chance));
  return Math.random()<chance;
}
// All discussion speakers and actual ballots use this same final vote rule.
v36WhiteLastResort=function(b,prior){
  if(!SS39Vote.on)return __v37EarlierFallback(b,prior);
  return ss39ZoneVote(b,prior);
};
// Drop staleness when starting a game (watch/sim retained unchanged).
var ss39EarlierNewGame=window.startGame;
window.startGame=function(){SS39.execStep='';SS39.execKey='';SS39.execOutcome=null;return ss39EarlierNewGame.apply(this,arguments);};

// ==================== v40: INDEPENDENT WHITE PREMIER NOMINATIONS ====================
// Only a White bot's own evidence is used. True roles are never consulted to
// evaluate candidates. Moderately different preferences avoid lockstep picks.
var SS40={on:true, recent:[], personal:{}};
var ss40OldPickNomination=window.pickNomination;
function ss40CandidateScore(p,c,view,st,bloc){
  var tk=brainTicket(view,p,c,st);
  var positive=v30Evidence(p,c,bloc,false);
  var published=v29PositiveEvidence(-1,c,true);
  var suspected=view.F[c], stalinChance=game.confirmedNotStalin[c]?0:view.S[c];
  var accusation=(game.botInvestigations[p]||{})[c];
  if(accusation==='communist'||hasDispute(p,c)||suspected>=0.65) return -Infinity;
  var score=1.35*positive+0.35*published-3.1*suspected-6.5*stalinChance-1.55*tk.eRed;
  if(game.confirmedNotStalin[c])score+=1.35;
  if(suspected>=0.48)score-=2.5;
  if(stalinChance>=0.30)score-=2.1;
  score-=1.0*(bloc.conf[c]||0);
  return score;
}
window.pickNomination=function(p){
  var fallback=ss40OldPickNomination(p);
  if(!SS40.on||!BRAIN||game.communistPolicies<3||game.roles[p]!=='white')return fallback;
  var legal=v24LegalPremiers(p);
  if(!legal.length)return fallback;
  var view=brainView(p),st=brainState(),bloc=v30BlocEvidence(p);
  var scores=legal.map(function(c){return {id:c,score:ss40CandidateScore(p,c,view,st,bloc)};})
    .filter(function(x){return Number.isFinite(x.score);});
  if(!scores.length)return fallback;
  scores.sort(function(a,b){return b.score-a.score;});
  // Clear leaders should still be chosen. Variation is for close/unknown cases.
  var margin=scores.length>1?scores[0].score-scores[1].score:Infinity;
  if(margin>3.5)return scores[0].id;
  var pool=scores.filter(function(x){return x.score>=scores[0].score-2.0;}).slice(0,4);
  if(pool.length===1)return pool[0].id;
  if(!SS40.personal[p])SS40.personal[p]={};
  var weights=[],total=0;
  pool.forEach(function(x){
    // Different bots may like different plausible nominees, even with
    // similarly calibrated evidence. Stable per-bot preferences persist.
    if(SS40.personal[p][x.id]===undefined)SS40.personal[p][x.id]=Math.random()*0.9-0.45;
    var repeated=SS40.recent.slice(-4).filter(function(y){return y===x.id;}).length;
    var weight=Math.exp(Math.max(-8,(x.score-scores[0].score+SS40.personal[p][x.id]-0.60*repeated)/0.85));
    weights.push(weight);total+=weight;
  });
  var roll=Math.random()*total;
  for(var i=0;i<pool.length;i++){
    roll-=weights[i];
    if(roll<=0)return pool[i].id;
  }
  return pool[pool.length-1].id;
};
// Observe choices in both live and simulated nominations, without recording
// hidden roles or leaking them through shared nomination preferences.
var ss40PriorBotNominate=window.botNominate;
window.botNominate=function(){
  var before=game.nominatedChancellor;
  var result=ss40PriorBotNominate.apply(this,arguments);
  if(game.communistPolicies>=3 && game.nominatedChancellor!=null && game.nominatedChancellor!==before){
    SS40.recent.push(game.nominatedChancellor);
    if(SS40.recent.length>8)SS40.recent.shift();
  }
  return result;
};
var ss40PriorStartGame=window.startGame;
window.startGame=function(){SS40.recent=[];SS40.personal={};return ss40PriorStartGame.apply(this,arguments);};


// ==================== v41: reliable nominations, speaking voice, table presence ====================
var SS41 = {on:true, showing:false};

// The earlier v38 wrapper checked whether a completed vote already existed,
// and an interrupted gate could leave pending=true across a phase change.
// Intercept at the outermost startRound entry instead, immediately before the
// nomination engine acts. Never gate simulations, watch games or human turns.
var ss41OldStartRound = window.startRound;
window.startRound = function(){
  if(!SS41.on || (typeof SIM_MODE!=='undefined' && SIM_MODE) ||
      game.gameOver || game.mode!=='bots' || !isBotGame() ||
      game.currentPresident===game.humanPlayerIndex ||
      game.humanPlayerIndex<0 || !game.players[game.humanPlayerIndex] ||
      game.players[game.humanPlayerIndex].isDead ||
      !game.players[game.currentPresident] || game.players[game.currentPresident].isDead ||
      !baSuggestCandidates(game.currentPresident).length){
    V38_FLOW.pending=false; SS41.showing=false;
    return ss41OldStartRound.apply(this,arguments);
  }
  // Display once per actual nomination, not once per policy count. This also
  // covers failed elections, which do not change the policy totals.
  if(SS41.showing) return;
  SS41.showing=true;
  V38_FLOW.pending=true; V38_FLOW.used=false;
  V38_FLOW.originalStart=function(){
    SS41.showing=false;
    // Skip the broken v38 gate; call the round engine from before v38.
    return ss41OldStartRound.apply(null,arguments);
  };
  transitionLock=false;
  game.phase='suggest_premier';
  try { v38ShowChoice(); }
  catch(e){ SS41.showing=false; V38_FLOW.pending=false; return ss41OldStartRound.apply(this,arguments); }
};
// The old v38 wrapper is still inside the call chain. Bypass its gating exactly
// when the player has just finished our suggestion screen.
var ss41BaseRound=V38_FLOW.originalStart;
// ss41OldStartRound -> ss39 wrapper -> v38 wrapper. Mark the just completed
// choice so the nested v38 wrapper proceeds without reopening it.
var ss41Resume=window.v38ResumeNomination;
window.v38ResumeNomination=function(){
  if(!V38_FLOW.pending)return;
  V38_FLOW.pending=false;V38_FLOW.used=true;
  SS41.showing=false;
  // old wrapper can see a pending=false and show again; bypass by forcing its
  // documented originalStart path, which already has the earlier round logic.
  return ss41BaseRound();
};
// Make sure direct click handlers resolve to the revised function.

// Speech options should never attack the speaker's own candidacy. Wording is
// first person when the speaker is on a YES ticket.
var ss41PriorArguments=window.baArguments;
window.baArguments=function(A){
  var args=ss41PriorArguments(A), h=game.humanPlayerIndex;
  if(h<0)return args;
  var selfOnTicket=(A.P===h||A.C===h);
  args=args.filter(function(a){
    if(!selfOnTicket || a.stance!=='nein')return true;
    // Opposing your own government can be rational when the OTHER officeholder
    // is dangerous. Suppress only statements blaming the human's own conduct.
    var body=String(a.text||'');
    var ownRole=A.P===h?'Secretary':'Premier';
    var ownLabel=ownRole+' You';
    if(body.indexOf(ownLabel)>=0) return false;
    if(/\b(?:You|me|I)\b.{0,85}\b(?:lied|lying|suspicious|compromised|infiltrat|cannot be trusted|under suspicion|Communist agent)\b/i.test(body))return false;
    if(/\b(?:do not trust|can't trust|cannot trust|suspect|distrust)\b.{0,35}\b(?:me|myself|You)\b/i.test(body))return false;
    // These arguments target the other candidate, chaos risk, or rotation.
    return true;
  });
  args.forEach(function(a){
    if(typeof a.text!=='string')return;
    if(a.stance==='ja' && A.P===h && /Secretary You|Secretary me|You are the Secretary/.test(a.text))
      a.text='I am the Secretary, and I believe this government deserves a YES vote. Judge me by the result.';
    else if(a.stance==='ja' && A.C===h && /Premier You|Premier me|You are the Premier/.test(a.text))
      a.text='I am the proposed Premier. Give me the opportunity to deliver a White policy, and hold me accountable.';
    // In other sentences, player-name tokens must refer to the speaker as me/I.
    a.text=a.text.replace(/\bSecretary You\b/g,'me as Secretary')
      .replace(/\bPremier You\b/g,'me as Premier')
      .replace(/\bYou was\b/g,'I was').replace(/\bYou were\b/g,'I was')
      .replace(/\bYou have\b/g,'I have').replace(/\bYou voted\b/g,'I voted')
      .replace(/\bYou enacted\b/g,'I enacted')
      .replace(/\bYou claimed\b/g,'I claimed')
      .replace(/\bYou passed\b/g,'I passed')
      .replace(/\bYou\b/g,'me');
  });
  if(A.C===h && A.P!==h && BRAIN){
    var ownRead=brainView(h), p=A.P;
    var ownSeen=(game.humanInvestigations||{})[p];
    var distrust=ownSeen==='communist'||ownRead.F[p]>=0.44||hasDispute(h,p);
    if(distrust){
      args.push({id:'ss46_refuse_unsafe_secretary',stance:'nein',priority:93,strength:'Strong',
        val:1.8,sound:true,basis:'Secretary risk',
        text:'I am willing to serve as Premier, but I do not trust this Secretary to handle the cards or an execution power. Vote NO to protect the table.'});
    }
  }
  // A rational vote-NO case: a credibly safer Secretary is soon in rotation.
  if((!selfOnTicket || A.C===h) && BRAIN && game.currentPresident!=null && typeof v30Upcoming==='function'){
    var upcoming=v30Upcoming(game.currentPresident,3);
    var view=brainView(h),bloc=typeof v30BlocEvidence==='function'?v30BlocEvidence(h):null;
    var score=function(i){
      if(!game.players[i]||game.players[i].isDead)return -Infinity;
      if((game.humanInvestigations||{})[i]==='communist')return -Infinity;
      if(typeof v37Score==='function'&&bloc)return v37Score(h,i,view,bloc);
      return -(view.F[i]||0);
    };
    var current=score(game.currentPresident);
    var candidates=upcoming.filter(function(i){return i!==h && i!==game.currentPresident && score(i)>current+0.85;})
       .sort(function(a,b){return score(b)-score(a);});
    if(candidates.length){
      var best=candidates[0];
      // Based on the human's own evidence, not secret identities.
      args.push({id:'ss41_better_secretary',stance:'nein',priority:83,strength:'Solid',
        val:1.4,sound:true,basis:'Upcoming rotation',
        text:'I have more reason to trust '+baName(best)+' than the current Secretary. '+
          'They will take the Secretary chair soon. We should reject this ticket and give them a chance to form a safer government.'});
    }
  }
  return args;
};

// Keep standard persuasion exactly as it was; Boss is a deliberate, capped
// optional advantage, not a secret-team knowledge bonus.
var ss41OldMount=window.v34MountPresence;
window.v34MountPresence=function(){
  var r=ss41OldMount.apply(this,arguments);
  var normal=document.getElementById('v34-normie');
  if(normal)normal.textContent='Standard';
  var group=document.getElementById('v34-presence');
  if(group){
    var desc=group.querySelector('div:last-child');
    if(desc)desc.textContent='Standard (default): a fair table where you have to work to gain trust and influence, and your arguments gain traction through previous play and evidence. Boss: your speeches have noticeably greater sway from the start, and people trust you more. However Boss cannot erase firm evidence, investigations, or contention.';
  }
  return r;
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){window.v34MountPresence();});
else window.v34MountPresence();
// No change to Standard mode math; modestly cap Boss extras to avoid
// overwriting a bot's genuinely contradictory first-hand evidence.


// ==================== v42: SAFE SECRETARY HANDOFF & BOSS REPUTATION ====================
// v41 assigned V38_FLOW.originalStart to a wrapper that calls the v38 layer.
// If that layer is entered again (notably when the human becomes Secretary),
// it can call itself. Always restore the original, pre-v38 startRound entry.
var SS42={on:true,baseRound:ss41BaseRound};
function ss42RestoreRound(){
  V38_FLOW.originalStart=SS42.baseRound;
}
var ss42PriorStart=window.startRound;
window.startRound=function(){
  ss42RestoreRound();
  // Only enter the suggestion interstitial when the new Secretary is a bot.
  // Human Secretary goes directly to the original nomination UI.
  if(game.mode==='bots' && game.currentPresident===game.humanPlayerIndex &&
     !(typeof SIM_MODE!=='undefined' && SIM_MODE)){
    SS41.showing=false;
    V38_FLOW.pending=false;V38_FLOW.used=false;
    return SS42.baseRound.apply(this,arguments);
  }
  return ss42PriorStart.apply(this,arguments);
};
// Resume must call the core round handler, never a wrapper whose saved
// continuation can point back to the same suggestion prompt.
window.v38ResumeNomination=function(){
  if(!V38_FLOW.pending)return;
  V38_FLOW.pending=false;V38_FLOW.used=true;
  SS41.showing=false;
  ss42RestoreRound();
  return SS42.baseRound();
};

// Boss is intentionally an advantage, not perfect information. The reputation
// floor is observer-relative and fades once the observer estimates >55% chance
// of the human belonging to the hostile team. Explicit firsthand Communist
// investigations, serious disputes and other evidence still take precedence.
var ss42PreviousCredibility=window.v28Credibility;
window.v28Credibility=function(observer,speaker){
  var base=ss42PreviousCredibility(observer,speaker);
  if(!V34.on||V34.presence!=='boss'||game.mode!=='bots'||
     speaker!==game.humanPlayerIndex||observer<0||observer===speaker||
     !BRAIN||!game.players[speaker]||game.players[speaker].isDead)return base;
  if((game.botInvestigations[observer]||{})[speaker]==='communist')return base;
  var view=brainView(observer),sus=Number(view.F[speaker]);
  if(!Number.isFinite(sus))return base;
  // Significant Boss presence remains at 40% suspicion; begins dropping
  // markedly beyond 55% and vanishes as the evidence approaches certainty.
  var persistence=sus<=0.55?1:Math.max(0,(0.85-sus)/0.30);
  var role=game.roles[speaker];
  var bonus=(role==='white'?0.25:0.125)*persistence;
  if(hasDispute(observer,speaker))bonus*=0.35;
  if((game.mildSuspicionPresidents[speaker]||0)>0)bonus*=0.60;
  return Math.max(0,Math.min(1,base+bonus));
};
// v34's prior speech scaling remains 1.90x for White and changes from
// 1.27x to 1.45x for Communist/Stalin: 50% of the extra White multiplier.
var ss42PreviousSpeech=window.baBotDelta;
window.baBotDelta=function(botIdx,arg){
  var value=ss42PreviousSpeech(botIdx,arg);
  if(!V34.on||V34.presence!=='boss'||game.mode!=='bots'||
     game.humanPlayerIndex<0||game.roles[game.humanPlayerIndex]==='white'||
     !game.players[botIdx]||game.players[botIdx].isDead)return value;
  var raw=Number(arg&&arg.val)||0;
  var trust=v28Credibility(botIdx,game.humanPlayerIndex);
  var damp=(0.35+0.65*trust)*(arg&&arg.sound===false?0.35:1);
  // Incremental 0.18 restores the desired 0.45 total over baseline.
  var extra=Math.min(1.0,raw*0.18*(game.players[botIdx].personality?.persuadability||1)*damp);
  return value+(arg&&arg.stance==='nein'?-1:1)*extra;
};
// Refresh the setting's description on the actual start screen.
var ss42PriorMount=window.v34MountPresence;
window.v34MountPresence=function(){
  var result=ss42PriorMount.apply(this,arguments);
  var group=document.getElementById('v34-presence');
  if(group){
    var desc=group.querySelector('div:last-child');
    if(desc)desc.textContent='Standard (default): a fair table where you have to work to gain trust and influence, and your arguments gain traction through previous play and evidence. Boss: your speeches have noticeably greater sway from the start, and people trust you more. However Boss cannot erase firm evidence, investigations, or contention.';
  }
  return result;
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){window.v34MountPresence();});
else window.v34MountPresence();


// ==================== v43: CONSENSUAL VETO EVIDENCE + FREE MARK SLOTS ====================
// Veto is strong PUBLIC cooperation evidence, but is not a mathematical role
// reveal: a Communist may veto tactically. Never access the true role here.
var SS43={vetoPartners:{}, vetoEvents:[]};
function ss43VetoEvidence(i){
  if(i==null || !game.players[i] || game.players[i].isDead)return 0;
  return SS43.vetoPartners[i]||0;
}
var ss43VetoOriginal=window.resolveVeto;
window.resolveVeto=function(consent){
  var valid=(consent===true && game.phase==='veto');
  var p=game.currentPresident,c=game.currentChancellor;
  var r=ss43VetoOriginal.apply(this,arguments);
  if(valid){
    SS43.vetoPartners[p]=(SS43.vetoPartners[p]||0)+1;
    SS43.vetoPartners[c]=(SS43.vetoPartners[c]||0)+1;
    SS43.vetoEvents.push({pres:p,chanc:c,round:game.whitePolicies+game.communistPolicies});
    log('🤝 Public evidence: '+game.players[p].name+' and '+game.players[c].name+' jointly agreed to veto. Strong cooperation signal (not absolute role proof).');
    if(typeof BRAIN!=='undefined' && BRAIN){BRAIN.ver++;BRAIN.cache={};}
    renderGameBoard();
  }
  return r;
};
// Each White trusts veto partners more in subsequent votes. Preserve private
// Communist findings and serious disputes as overrides, and avoid treating a
// veto as mechanically proving Stalin cannot be present.
var ss43PreviousVote=window.botDecideVote;
window.botDecideVote=function(b){
  var prior=ss43PreviousVote.apply(this,arguments);
  if(!BRAIN || game.gameOver || game.roles[b]!=='white' || game.communistPolicies<3)return prior;
  var p=game.currentPresident,c=game.nominatedChancellor;
  if(p==null||c==null || !game.players[p]||!game.players[c])return prior;
  var a=ss43VetoEvidence(p),d=ss43VetoEvidence(c);
  if(!a&&!d)return prior;
  var checks=game.botInvestigations[b]||{};
  if(checks[p]==='communist'||checks[c]==='communist'||hasDispute(b,p)||hasDispute(b,c))return prior;
  var v=brainView(b);
  if(v.F[p]>=.84||v.F[c]>=.84||(!game.confirmedNotStalin[c]&&v.S[c]>=.44))return prior;
  // Both jointly vetoed: favor an actual election very strongly, including
  // on first tracker attempt. If only one cooperated, give a meaningful lift,
  // but don't rubber-stamp an entirely unknown/dangerous partner.
  if(a&&d)return Math.random()<.95;
  if(a && v.F[c]<.44 && (game.confirmedNotStalin[c]||v.S[c]<.18))return Math.random()<.82;
  if(d && v.F[p]<.44 && (game.confirmedNotStalin[c]||v.S[c]<.18))return Math.random()<.82;
  return prior;
};
var ss43PreviousNominate=window.pickNomination;
window.pickNomination=function(p){
  var prior=ss43PreviousNominate.apply(this,arguments);
  if(!BRAIN||game.communistPolicies<3||game.roles[p]!=='white')return prior;
  var candidates=v24LegalPremiers(p).filter(function(c){return ss43VetoEvidence(c)>0;});
  if(!candidates.length)return prior;
  var v=brainView(p),checks=game.botInvestigations[p]||{};
  candidates=candidates.filter(function(c){return checks[c]!=='communist'&&!hasDispute(p,c)&&v.F[c]<.65&&v.S[c]<.30;});
  if(!candidates.length)return prior;
  candidates.sort(function(a,b){return (v.F[a]+2*v.S[a]-.14*ss43VetoEvidence(a))-(v.F[b]+2*v.S[b]-.14*ss43VetoEvidence(b));});
  var best=candidates[0];
  if(prior==null)return best;
  var currentRisk=v.F[prior]+2*v.S[prior],bestRisk=v.F[best]+2*v.S[best];
  // Improve preference but retain variety when an alternative is clearly safer.
  return bestRisk <= currentRisk+.08 ? best : prior;
};
// Remove dead players' manual trust/suspect marks before the board rerenders.
// The UI counts and allows immediate reuse of the slots after an execution.
function ss43CleanupDeadMarks(){
  ['userTrusted','userSuspects'].forEach(function(k){
    if(!Array.isArray(game[k]))return;
    game[k]=game[k].filter(function(i){return game.players[i]&&!game.players[i].isDead;});
  });
}
var ss43PreviousRender=window.renderPlayers;
window.renderPlayers=function(){ss43CleanupDeadMarks();return ss43PreviousRender.apply(this,arguments);};
var ss43PreviousStart=window.startGame;
window.startGame=function(){SS43.vetoPartners={};SS43.vetoEvents=[];return ss43PreviousStart.apply(this,arguments);};
// Keep both mark counters accurate if the player's action is attempted on a corpse.
var ss43OldTrust=window.toggleTrust,ss43OldSus=window.toggleSuspect;
window.toggleTrust=function(i){ss43CleanupDeadMarks();if(!game.players[i]||game.players[i].isDead)return;return ss43OldTrust.apply(this,arguments);};
window.toggleSuspect=function(i){ss43CleanupDeadMarks();if(!game.players[i]||game.players[i].isDead)return;return ss43OldSus.apply(this,arguments);};


// ==================== v44: CARD-COUNTED VETO CLEARANCES ====================
// Under the game-specific strategic assumption that Communist/Stalin
// Secretaries ALWAYS pass an immediately winning Communist card to a
// Communist Premier, a *mutually agreed* veto at 5 Communist policies
// requires a Secretary to have drawn three Whites if either participant
// is Communist. There are only six Whites in the total policy supply.
// If fewer than 3 un-enacted Whites remain, that Communist scenario is
// impossible. Use PUBLIC enacted counts only, not the secret draw pile.
var SS44={clear:{}, evidence:{}};
function ss44VetoLevel(i){
  if(i==null||!game.players[i]||game.players[i].isDead)return 0;
  return SS44.clear[i]?1:(SS44.evidence[i]?0.9:0);
}
function ss44RecordMutualVeto(p,c,whites,reds){
  // These special conclusions are only applicable at Communist match point.
  if(reds!==5||p==null||c==null)return;
  var whitesAvailable=6-whites;
  var certain=whitesAvailable<3;
  [p,c].forEach(function(i){
    if(certain){SS44.clear[i]=true;delete SS44.evidence[i];}
    else if(!SS44.clear[i])SS44.evidence[i]=true;
  });
  var names=game.players[p].name+' and '+game.players[c].name;
  if(certain){
    // This is an inference from PUBLIC rules and optimal enemy play,
    // not a peek at game.roles or deck composition.
    if(BRAIN){
      brainEliminate(function(r){return r[p]!==0||r[c]!==0;});
      BRAIN.cache={};
    }
    log('✅ '+names+' are publicly CONFIRMED LIBERAL by mutual veto and policy counting ('+
        whites+' Liberal policies enacted, fewer than 3 Liberal cards available).');
  } else {
    if(BRAIN){
      // A deliberately strong (not absolute) likelihood update; do not
      // convert a public claim into knowledge of a true hidden role.
      var L=new Float64Array(BRAIN.H);
      for(var h=0;h<BRAIN.H;h++){
        var r=BRAIN.hRole[h];
        L[h]=(r[p]===0?1:0.06)*(r[c]===0?1:0.06);
      }
      brainApplyVec(L,false);
      BRAIN.cache={};
    }
    log('🤝 '+names+' receive ~90% Liberal confidence each after mutual veto at five Communist policies.');
  }
  renderGameBoard();
}
var ss44OriginalResolveVeto=window.resolveVeto;
window.resolveVeto=function(consent){
  var eligible=consent===true&&game.phase==='veto';
  var p=game.currentPresident,c=game.currentChancellor,
      whites=game.whitePolicies,reds=game.communistPolicies;
  var result=ss44OriginalResolveVeto.apply(this,arguments);
  if(eligible)ss44RecordMutualVeto(p,c,whites,reds);
  return result;
};
// The additional event is not carried over to a newly started game.
var ss44OriginalStartGame=window.startGame;
window.startGame=function(){SS44.clear={};SS44.evidence={};return ss44OriginalStartGame.apply(this,arguments);};

// Downstream strategy uses the public certainty consistently. An agreed
// veto pair should no longer be discounted just because a previous heuristic
// saw an ordinary Communist policy, or demanded a strict trust cutoff.
var ss44PreviousTrust=window.whiteTrust;
window.whiteTrust=function(b,i,pub){
  var level=ss44VetoLevel(i);
  if(level===1)return 100;
  var base=ss44PreviousTrust.apply(this,arguments);
  return level===0.9?Math.max(base,6.5):base;
};
var ss44PreviousVote=window.botDecideVote;
window.botDecideVote=function(b){
  var prior=ss44PreviousVote.apply(this,arguments);
  if(!BRAIN||game.roles[b]!=='white'||game.gameOver||game.communistPolicies<3)return prior;
  var p=game.currentPresident,c=game.nominatedChancellor;
  if(p==null||c==null)return prior;
  var cp=ss44VetoLevel(p),cc=ss44VetoLevel(c);
  if(cp===1&&cc===1)return true;  // Two legally eligible confirmed Liberal candidates.
  if(cp===1||cc===1){
    var other=cp===1?c:p, v=brainView(b),checks=game.botInvestigations[b]||{};
    if(checks[other]!=='communist'&&v.F[other]<.42&&
       (game.confirmedNotStalin[c]||v.S[c]<.22))return Math.random()<.95;
  }
  if(cp>=.9&&cc>=.9){
    var v=brainView(b);
    if(v.F[p]<.35&&v.F[c]<.35&&(game.confirmedNotStalin[c]||v.S[c]<.22))return Math.random()<.94;
  }
  return prior;
};
var ss44PreviousNominate=window.pickNomination;
window.pickNomination=function(p){
  var prior=ss44PreviousNominate.apply(this,arguments);
  if(!BRAIN||game.roles[p]!=='white'||game.communistPolicies<3)return prior;
  var legal=v24LegalPremiers(p);
  var confirmed=legal.filter(function(i){return ss44VetoLevel(i)===1;});
  if(confirmed.length)return confirmed[0];
  var evidence=legal.filter(function(i){return ss44VetoLevel(i)>=.9;});
  if(evidence.length){
    var v=brainView(p);
    evidence.sort(function(a,b){return (v.F[a]+v.S[a])-(v.F[b]+v.S[b]);});
    if(prior==null||v.F[prior]+v.S[prior]>v.F[evidence[0]]+v.S[evidence[0]]+.10)return evidence[0];
  }
  return prior;
};


// ==================== v46: BOSS IS A 25% STARTING SUSPICION PRIOR ====================
// Remove both historical Boss-only layers entirely. Every downstream system
// uses the SAME ordinary trust/deduction mechanisms as Standard mode.
window.baBotDelta=__v34OldSpeechDelta;
window.v28Credibility=ss42PreviousCredibility;

// Adjust EACH independent bot's initial possible-role hypotheses. This is an
// odds-prior change (not a permanent 25% suspicion floor) and has no true-role
// lookups. Public beliefs receive the same prior for social reasoning.
var ss46BeforeBrainInit=window.brainInit;
window.brainInit=function(){
  var result=ss46BeforeBrainInit.apply(this,arguments);
  if(!BRAIN||!V34.on||V34.presence!=='boss'||game.mode!=='bots')return result;
  var human=game.humanPlayerIndex, B=BRAIN;
  if(human<0||!game.players[human])return result;
  function setPrior(w){
    var bad=0, good=0;
    for(var k=0;k<B.H;k++){
      if(B.hRole[k][human]!==0)bad+=w[k]; else good+=w[k];
    }
    // Respect certainty from independent role knowledge (including teammates).
    if(bad<1e-9||good<1e-9)return;
    var factor=(0.25/0.75)/(bad/good);
    var total=0;
    for(var t=0;t<B.H;t++){
      if(B.hRole[t][human]!==0)w[t]*=factor;
      total+=w[t];
    }
    if(total>0)for(var q=0;q<B.H;q++)w[q]/=total;
  }
  setPrior(B.pub);
  for(var seat in B.bot)setPrior(B.bot[seat]);
  B.ver++;B.cache={};
  return result;
};
var ss46PriorPresenceMount=window.v34MountPresence;
window.v34MountPresence=function(){
  var out=ss46PriorPresenceMount.apply(this,arguments);
  var panel=document.getElementById('v34-presence');
  if(panel){
    var desc=panel.querySelector('div:last-child');
    if(desc)desc.textContent='Standard (default): a fair table where you have to work to gain trust and influence, and your arguments gain traction through previous play and evidence. Boss: your speeches have noticeably greater sway from the start, and people trust you more. However Boss cannot erase firm evidence, investigations, or contention.';
  }
  return out;
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){window.v34MountPresence();});
else window.v34MountPresence();


// ==================== v47: ACTION-CONSISTENT DIALOGUE & LEADER PANEL ====================
// The final nomination / execution selector MUST honor an accepted suggestion.
// Earlier strategic wrappers used to override it after the Secretary promised yes.
var SS47={on:true};
var ss47FullVoteEngine=window.botDecideVote;
// Consult the latest voting logic (including veto inference) before committing.
function ss47PreCommitVote(i){return ss47FullVoteEngine(i);}
var ss47UnderlyingNomination=window.pickNomination;
window.pickNomination=function(p){
  var s=game.baPending;
  if(s && s.pres===p){
    game.baPending=null; // consume exactly once, even if no longer legal
    var legal=(typeof v24LegalPremiers==='function')?v24LegalPremiers(p):baSuggestCandidates(p);
    if(legal.indexOf(s.cand)>=0){
      log('🗳️ Secretary '+baName(p)+' follows through on the accepted Premier suggestion.');
      return s.cand;
    }
    log('⚠️ Accepted Premier suggestion became ineligible before nomination; Secretary must pick another candidate.');
  }
  return ss47UnderlyingNomination.apply(this,arguments);
};
var ss47UnderlyingExec=window.pickExecutionTarget;
window.pickExecutionTarget=function(p){
  var s=game.baExecPending;
  if(s && s.pres===p){
    game.baExecPending=null;
    if(s.target!==p && game.players[s.target] && !game.players[s.target].isDead){
      log('🗡️ Secretary '+baName(p)+' follows through on the accepted execution suggestion.');
      return s.target;
    }
    log('⚠️ Accepted execution suggestion is no longer legal; Secretary picks another target.');
  }
  return ss47UnderlyingExec.apply(this,arguments);
};
// Avoid a Secretary promising a suggestion that cannot actually be executed.
var ss47ResolveNomSuggestion=window.baResolveSuggestion;
window.baResolveSuggestion=function(p,c){
  var result=ss47ResolveNomSuggestion.apply(this,arguments);
  if(result.accept && ((typeof v24LegalPremiers==='function' ? v24LegalPremiers(p) : baSuggestCandidates(p)).indexOf(c)<0)){
    result.accept=false;game.baPending=null;
  }
  return result;
};
var ss47ResolveExecSuggestion=window.baExecResolve;
window.baExecResolve=function(p,t){
  var result=ss47ResolveExecSuggestion.apply(this,arguments);
  if(result.accept && (t===p || !game.players[t] || game.players[t].isDead)){
    result.accept=false;game.baExecPending=null;
  }
  return result;
};
// A reaction to rhetoric is not a ballot. Avoid claiming to vote one way
// until the individual bot has actually cast or committed their decision.
window.baReaction=function(bot,impact,arg,trust){
  var t=bot && bot.personality && bot.personality.type || '';
  if(impact>0){
    var positives={Analytical:'That is evidence worth considering.',Cautious:'I will factor that risk into my decision.',Outspoken:'That is a point the table should examine.',Loyalist:'Your reasoning deserves attention.',Diplomat:'That helps clarify the choice.',Chaotic:'Interesting argument.',Subtle:'I will weigh that carefully.',Shrewd:'That changes the calculation somewhat.',Pragmatist:'That is a relevant consideration.',Dominant:'The table should take that into account.'};
    return positives[t]||'That is a fair consideration.';
  }
  var negatives={Analytical:'I disagree with that interpretation of the evidence.',Cautious:'I am not convinced by that argument.',Outspoken:'That claim needs evidence.',Loyalist:'I would need more proof.',Diplomat:'I see the concern, but I disagree.',Chaotic:'I am not sold.',Subtle:'That feels incomplete.',Shrewd:'Your conclusion does not follow from the facts.',Pragmatist:'The argument is weaker than you suggest.',Dominant:'I will make my own assessment.'};
  return negatives[t]||'I am not persuaded by that point.';
};
// Keep the final votes bound to these declarations, even through late-strategy wrappers.
window.botDecideVote=function(i){
  if(V36.on && V36.key===v36Key() && Object.prototype.hasOwnProperty.call(V36.committed,i))return V36.committed[i];
  return ss47FullVoteEngine.apply(this,arguments);
};
// The most influential living BOT voices speak on close/hinge elections.
// A reputation estimate is only a PUBLIC impression, not a true role reveal.
// Their announced stance is computed from the SAME committed ballot used later.
v35VotingDiscussion=function(){
  if(!V35.on||!BRAIN||!isBotGame()||game.gameOver||!v35Hinge()||
     (typeof SIM_MODE!=='undefined'&&SIM_MODE))return;
  var P=game.currentPresident,C=game.nominatedChancellor;
  if(C==null)return;
  var key=v36Key();if(V35.lastDiscussionKey===key)return;
  V35.lastDiscussionKey=key;
  var eligible=getAliveIndices().filter(function(i){return !game.players[i].isHuman;});
  if(!eligible.length)return;
  var centrality=function(i){
    var total=0,n=0;
    eligible.forEach(function(j){
      if(j===i)return;
      try {total+=Math.max(-1,Math.min(1,v35IndependentTrust(j,i)));n++;}catch(e){}
    });
    return n?total/n:0;
  };
  var ranked=eligible.map(function(i){
    var pub=v35PublicCred(i),network=centrality(i),rec=game.playerRecords[i]||{};
    var history=(rec.governments||[]).length;
    return {id:i,pub:pub,network:network,impact:pub+1.15*network+Math.min(.45,history*.07)};
  }).sort(function(a,b){return b.impact-a.impact;});
  var chosen=ranked.slice(0,Math.min(3,ranked.length));
  V36.key=key;V36.committed={};V36.speakers=chosen.map(function(x){return x.id;});
  V35.roundDiscussions[key]=[];
  chosen.forEach(function(x){
    var vote=(x.id===game.currentPresident)?true:!!ss47PreCommitVote(x.id);
    V36.committed[x.id]=vote;
    var opinion=v35Opinion(x.id,P,C);
    // The original canned reason can contradict the actual choice. Never do that.
    var reason=opinion.yes===vote?opinion.reason:
      (vote?'On balance this ticket is worth the risk compared with our alternatives.':
            'Given my assessment of both candidates and the alternatives, I cannot support it.');
    var reputation=x.pub>=1.3?'widely trusted':x.pub>=.5?'fairly trusted':x.pub>=-.25?'mixed':x.pub>=-.9?'distrusted':'strongly distrusted';
    var strength=opinion.yes===vote?opinion.strength:.45;
    var item={id:x.id,yes:vote,strength:strength,reason:reason,reputation:reputation,publicScore:x.pub,influence:x.impact};
    V35.roundDiscussions[key].push(item);
    v35Talk('Table discussion',x.id,(vote?'I support ':'I oppose ')+v35Name(P)+' and '+v35Name(C)+'. '+reason);
  });
  eligible.forEach(function(i){
    if(!Object.prototype.hasOwnProperty.call(V36.committed,i))V36.committed[i]=(i===game.currentPresident)?true:!!ss47PreCommitVote(i);
  });
  var ac=document.getElementById('ac');
  if(ac){
    var old=ac.querySelector('.v35-discussion');if(old)old.remove();
    var panel=document.createElement('div');panel.className='v35-discussion';
    panel.style.cssText='padding:11px;margin:8px 0;border:1px solid var(--border);border-radius:10px;background:var(--panel);font-size:.83rem;text-align:left';
    panel.innerHTML='<b style="color:var(--g)">🗣️ Table discussion — leading voices</b>'+
      '<div style="color:var(--td);font-size:.74rem;margin-top:4px">Most influential available bot voices. Trust labels are public estimates, not secret identities. Their stated positions match their ballots.</div>'+
      V35.roundDiscussions[key].map(function(x){
        return '<div style="margin-top:9px"><strong>'+v35Esc(v35Name(x.id))+'</strong> <span style="font-weight:700;color:'+((x.publicScore>=.5)?'#58c991':(x.publicScore>=-.25)?'#e7bd68':'#e87979')+'">('+v35Esc(x.reputation)+')</span> — <b>'+
          (x.yes?'YES':'NO')+'</b><div style="margin-top:2px">'+v35Esc(x.reason)+'</div></div>';
      }).join('');
    ac.prepend(panel);
  }
};


// ===== v49: CONTEXTUAL COALITION DETECTION AND ENDGAME VOTE DISCIPLINE =====
// Input is PUBLIC votes/nominations and each observer's own subjective beliefs.
// Do NOT read true roles to determine who belongs to an alleged voting bloc.
function ss49Bloc(observer){
  var n=game.playerCount, alive=getAliveIndices();
  var history=(game.voteLog||[]).filter(function(e){return e.zone && e.votes;}).slice(-12);
  var edge=Array.from({length:n},function(){return Array(n).fill(0);});
  var conf=Array(n).fill(0), membership=[];
  // Require not merely agreement, but agreement ACROSS DIFFERENT governments,
  // including both joint YES and joint NO (the missed v48 pattern).
  for(var a=0;a<alive.length;a++) for(var b=a+1;b<alive.length;b++){
    var i=alive[a],j=alive[b],sameYes=0,sameNo=0,contrary=0;
    history.forEach(function(e){
      if(e.pres===i||e.chanc===i||e.pres===j||e.chanc===j)return;
      if(!Object.prototype.hasOwnProperty.call(e.votes,i)||!Object.prototype.hasOwnProperty.call(e.votes,j))return;
      if(e.votes[i]===e.votes[j]){ if(e.votes[i])sameYes++;else sameNo++; }
      else contrary++;
    });
    var evidence=sameYes+sameNo;
    if(evidence>=3 && sameYes>=1 && sameNo>=1 && evidence>=contrary*2+2){
      edge[i][j]=edge[j][i]=Math.min(1,(evidence-2)*.22+(sameYes>=2&&sameNo>=2?.15:0));
    }
  }
  // Candidate groups: repeated cross-government agreement among at least 3
  // players, not merely a common vote on one popular ticket.
  var groups=[];
  alive.forEach(function(i){
    var g=alive.filter(function(j){return j===i||edge[i][j]>=.22;});
    if(g.length<3||g.length>Math.ceil(alive.length/2))return;
    var linked=0;
    for(var a=0;a<g.length;a++)for(var b=a+1;b<g.length;b++)if(edge[g[a]][g[b]]>=.22)linked++;
    if(linked < g.length-1)return;
    if(!groups.some(function(x){return x.join(',')===g.join(',');}))groups.push(g);
  });
  if(!groups.length)return {conf:conf,members:[],strength:0};
  // A bloc is suspicious if it champions weak/questioned nominees and rejects
  // viable outsiders. This is relative, public evidence; don't assume the
  // coalition is evil just because its votes coincide.
  var best=null,bestStrength=0;
  groups.forEach(function(g){
    var supports=0,blocks=0,informative=0;
    history.forEach(function(e){
      var eligible=g.filter(function(i){return i!==e.pres&&i!==e.chanc&&Object.prototype.hasOwnProperty.call(e.votes,i);});
      if(eligible.length<2)return;
      var yes=eligible.filter(function(i){return e.votes[i];}).length;
      var no=eligible.length-yes;
      if(Math.max(yes,no)/eligible.length<.75)return;
      var allied=g.indexOf(e.pres)>=0||g.indexOf(e.chanc)>=0;
      if(allied && yes>no)supports++;
      if(!allied && no>yes)blocks++;
      if(allied!== (yes>no))informative++;
    });
    if(supports<1||blocks<1)return;
    var strength=Math.min(.9,.30+.12*Math.min(supports,3)+.12*Math.min(blocks,3)+.04*Math.min(informative,3));
    if(strength>bestStrength){bestStrength=strength;best=g;}
  });
  if(best){best.forEach(function(i){conf[i]=bestStrength;});return {conf:conf,members:best,strength:bestStrength};}
  return {conf:conf,members:[],strength:0};
}
// Adopt improved detection wherever earlier vote/nominations consider a bloc.
var ss49OldBloc=v30BlocEvidence;
v30BlocEvidence=function(observer){
  var baseline=ss49OldBloc(observer), improved=ss49Bloc(observer);
  if(improved.members.length>=3 && improved.strength>=.5)return improved;
  return baseline;
};

// In match-point endgames, waiting for an alleged better Secretary is bad when
// the NEXT rotation belongs to an evidence-backed suspicious coalition. A
// viable outside ticket should receive support even with imperfect trust.
var ss49EarlierZoneVote=ss39ZoneVote;
ss39ZoneVote=function(b,prior){
  if(!BRAIN||game.gameOver||game.roles[b]!=='white'||game.communistPolicies<3)return ss49EarlierZoneVote(b,prior);
  var P=game.currentPresident,C=game.nominatedChancellor;
  if(P==null||C==null||b===P||b===C)return ss49EarlierZoneVote(b,prior);
  var bloc=ss49Bloc(b), v=brainView(b), privateInfo=game.botInvestigations[b]||{};
  var next=v30Upcoming(P,2), st=brainState();
  if(game.whitePolicies>=4 && game.communistPolicies>=4 && bloc.members.length>=3 && bloc.strength>=.5 &&
      bloc.members.indexOf(P)<0 && bloc.members.indexOf(C)<0 &&
      next.length===2 && next.every(function(i){return bloc.members.indexOf(i)>=0;}) &&
      privateInfo[P]!=='communist' && privateInfo[C]!=='communist' &&
      !(typeof v34KnownRed==='function'&&(v34KnownRed(b,P)||v34KnownRed(b,C))) &&
      !hasDispute(b,P) && !hasDispute(b,C) &&
      v.F[P]<.68 && v.F[C]<.68 &&
      (game.confirmedNotStalin[C] || brainTicket(v,P,C,st).pS<.32)){
    return true;
  }
  return ss49EarlierZoneVote(b,prior);
};


// ================= v50: CONSISTENT SPECIAL ELECTIONS AND GOVERNMENT VOTES =================
// Applies after all earlier strategy layers, including v47/v49 wrappers.
var SS50={on:true, approvedNominations:{}};

// In a special election, a rational Secretary avoids empowering the Premier
// with whom they are in an unresolved direct policy-card contradiction.
// Do not use hidden roles for White decisions; assess from the acting bot's view.
var ss50PreviousSpecial=window.pickSpecialTarget;
window.pickSpecialTarget=function(p){
  var possible=getAliveIndices().filter(function(i){return i!==p;});
  if(!possible.length)return ss50PreviousSpecial.apply(this,arguments);
  var original=ss50PreviousSpecial.apply(this,arguments);
  if(game.roles[p]!=='white')return original; // leave Communist deception as strategy
  var conflicts=game.disputes||[];
  var personallyContradicted=function(i){
    return conflicts.some(function(d){
      return ((d.p1===p&&d.p2===i)||(d.p2===p&&d.p1===i)) &&
        (d.type==='choice_denial'||d.type==='policy'||d.type==='card_dispute'||
         /choice|cards|polic/i.test(String(d.reason||'')));
    });
  };
  // More generally avoid anyone in an active personal feud, not just card fights.
  var safe=possible.filter(function(i){return !hasDispute(p,i);});
  if(!safe.length)return original; // never deadlock if everyone is contested
  if(safe.indexOf(original)>=0)return original;
  var view=brainView(p),best=safe[0],top=-Infinity;
  safe.forEach(function(i){
    var score=-(Number(view.F[i])||0)*3 - (Number(view.S[i])||0)*2;
    if(game.confirmedNotStalin&&game.confirmedNotStalin[i])score+=.45;
    if(game.botInvestigations[p]&&game.botInvestigations[p][i]==='white')score+=1;
    if(game.botInvestigations[p]&&game.botInvestigations[p][i]==='communist')score-=5;
    if(personallyContradicted(i))score-=9;
    score+=Math.random()*.16;
    if(score>top){top=score;best=i;}
  });
  return best;
};

// The Secretary's nomination is a real decision, not a proposal they can then
// arbitrarily vote against. The bot votes YES on its chosen eligible Premier.
// This also covers suggestions that the Secretary explicitly accepted.
var ss50PreviousNomination=window.pickNomination;
window.pickNomination=function(p){
  var c=ss50PreviousNomination.apply(this,arguments);
  if(c!==undefined&&c!==null){
    SS50.approvedNominations[p+':'+c]={p:p,c:c};
  }
  return c;
};
var ss50PreviousVote=window.botDecideVote;
window.botDecideVote=function(i){
  if(i===game.currentPresident && i!==game.humanPlayerIndex &&
     game.nominatedChancellor!==null && game.nominatedChancellor!==undefined &&
     !game.players[i].isDead){
    return true;
  }
  return ss50PreviousVote.apply(this,arguments);
};


// ===== v51: INDEPENDENT STALIN-ZONE VOTE ACCOUNTABILITY =====
// Detect *patterns* of supporting an apparent in-group while blocking outsiders.
// No hidden roles are consulted. A lone NO or a majority disagreement is not proof.
function ss51VotingPattern(observer){
  var n=game.playerCount, history=(game.voteLog||[]).filter(function(e){return e.zone;}).slice(-14);
  var out=Array(n).fill(0), pair=typeof ss49Bloc==='function'?ss49Bloc(observer):{members:[],strength:0};
  if(history.length<3) return {suspicion:out,bloc:pair};
  var members=pair.members||[];
  if(members.length<3 || pair.strength<.5) return {suspicion:out,bloc:pair};
  members.forEach(function(i){
    if(!game.players[i]||game.players[i].isDead) return;
    var favored=0,blocked=0;
    history.forEach(function(e){
      if(e.pres===i||e.chanc===i || !Object.prototype.hasOwnProperty.call(e.votes,i))return;
      var inside=members.indexOf(e.pres)>=0||members.indexOf(e.chanc)>=0;
      if(inside && e.votes[i]===true)favored++;
      if(!inside && e.votes[i]===false)blocked++;
    });
    if(favored>=1&&blocked>=1){
      out[i]=Math.min(1.65,(Math.min(favored,3)+Math.min(blocked,3)-1)*.23 + pair.strength*.48);
    }
  });
  return {suspicion:out,bloc:pair};
}

// The *same observer's* deductions guide nominations and voting. Outsiders
// get only a SMALL relative benefit; nobody becomes "confirmed White" by exclusion.
var ss51EarlierEvidence=v30Evidence;
v30Evidence=function(observer,target,bloc,publicOnly){
  var base=ss51EarlierEvidence.apply(this,arguments);
  if(game.communistPolicies<3||!BRAIN||observer<0||publicOnly)return base;
  var pattern=ss51VotingPattern(observer), delta=pattern.suspicion[target]||0;
  if(delta>0)return base-delta;
  if(pattern.bloc.members.length>=3 && pattern.bloc.strength>=.5 &&
     pattern.bloc.members.indexOf(target)<0 && !isInAnyConflict(target)){
    return base+Math.min(.45,pattern.bloc.strength*.4);
  }
  return base;
};

// At late match point, don't reject a viable outsider only to hand two
// consecutive secretaryships to a well-supported suspicious coalition.
// Respect the voter's own private red checks and a substantial Stalin risk.
var ss51EarlierZoneVote=ss39ZoneVote;
ss39ZoneVote=function(b,prior){
  var previous=ss51EarlierZoneVote(b,prior);
  if(!BRAIN||game.gameOver||game.roles[b]!=='white'||game.communistPolicies<3)return previous;
  var P=game.currentPresident,C=game.nominatedChancellor;
  if(P==null||C==null||b===P||b===C)return previous;
  var pattern=ss51VotingPattern(b),bloc=pattern.bloc, next=v30Upcoming(P,2);
  if(bloc.members.length<3||bloc.strength<.5 ||
     bloc.members.indexOf(P)>=0||bloc.members.indexOf(C)>=0 ||
     next.length!==2||!next.every(function(i){return bloc.members.indexOf(i)>=0;})) return previous;
  var checks=game.botInvestigations[b]||{},v=brainView(b),ticket=brainTicket(v,P,C,brainState());
  if(checks[P]==='communist'||checks[C]==='communist'||hasDispute(b,P)||hasDispute(b,C)||
     (typeof v34KnownRed==='function'&&(v34KnownRed(b,P)||v34KnownRed(b,C)))||
     v.F[P]>.68||v.F[C]>.68||(!game.confirmedNotStalin[C]&&ticket.pS>.32))return previous;
  if(game.whitePolicies>=4 && game.communistPolicies>=4) return true;
  if(game.electionTracker>=1 && game.communistPolicies>=4 && Math.random()<.78)return true;
  return previous;
};


// ===== v52: TEMPORARY MUTUAL EXCLUSION FOR UNRESOLVED CARD FEUDS =====
// Both sides of a contradictory policy-card report are *provisionally* risky
// to outsider Liberals. This is a nomination preference, NOT an assertion
// that either identity is known and NOT a requirement to vote NO into chaos.
var SS52={enabled:true};
function ss52CardFeud(d){
  return !!d && d.p1!==d.p2 &&
    (d.type==='choice_denial'||d.type==='card_dispute'||d.type==='policy'||
      /contradiction.*(choice|card|polic)/i.test(String(d.reason||'')));
}
function ss52ActivePairs(){
  return (game.disputes||[]).filter(function(d){
    return ss52CardFeud(d) && game.players[d.p1] && game.players[d.p2] &&
      !game.players[d.p1].isDead && !game.players[d.p2].isDead;
  });
}
function ss52FeudRisk(observer,target){
  var feuds=ss52ActivePairs().filter(function(d){return d.p1===target||d.p2===target;});
  if(!feuds.length)return 0;
  var view=brainView(observer),risk=0;
  feuds.forEach(function(d){
    var other=d.p1===target?d.p2:d.p1;
    // Directly contradicted participants know what they saw; outsiders do not.
    if(observer===other) {risk=Math.max(risk,8);return;}
    if(observer===target)return;
    var own=(game.botInvestigations[observer]||{})[target];
    var their=(game.botInvestigations[observer]||{})[other];
    // Credible independent evidence can clear one side of the dispute.
    if(own==='white' && their!=='white') {risk=Math.max(risk,.35);return;}
    // Two genuinely independent public clearances may rehabilitate someone;
    // reuse the existing no-hidden-role public proof helper when available.
    if(typeof v34DoubleCleared==='function' && v34DoubleCleared(observer,target)){
      risk=Math.max(risk,.35);return;
    }
    if(own==='communist') {risk=Math.max(risk,9);return;}
    // Secretary gets modest benefit of the doubt, but both remain contested.
    risk=Math.max(risk,target===d.p1?1.7:2.3);
  });
  return risk;
}
var ss52PriorNomination=window.pickNomination;
window.pickNomination=function(p){
  var accepted=game.baPending && game.baPending.pres===p ? game.baPending.cand : null;
  var original=ss52PriorNomination.apply(this,arguments);
  if(!SS52.enabled || !BRAIN || game.roles[p]!=='white' || !ss52ActivePairs().length)return original;
  // Never silently override an explicitly accepted suggestion.
  if(accepted!==null && original===accepted)return original;
  var legal=v24LegalPremiers(p);
  if(legal.indexOf(original)<0)return original;
  var alternatives=legal.filter(function(c){return ss52FeudRisk(p,c)<1;});
  if(!alternatives.length || ss52FeudRisk(p,original)<1)return original;
  var view=brainView(p),st=brainState(),bloc=v30BlocEvidence(p);
  function score(c){
    var check=(game.botInvestigations[p]||{})[c];
    if(check==='communist' || view.F[c]>.72 || view.S[c]>.46)return -100;
    var value=-(view.F[c]||0)*4-(view.S[c]||0)*6;
    if(game.confirmedNotStalin[c])value+=1.2;
    if(check==='white')value+=1.0;
    if(typeof v30Evidence==='function') value+=Math.max(-2,Math.min(2,v30Evidence(p,c,bloc,false)))*.35;
    // Preference for uncontested candidates without forcing an unknown or
    // clearly worse option; score variation prevents deterministic clones.
    value-=Math.min(4,ss52FeudRisk(p,c));
    return value+Math.random()*.15;
  }
  var oldScore=score(original);
  var ordered=alternatives.map(function(c){return {c:c,score:score(c)};})
    .sort(function(a,b){return b.score-a.score;});
  if(ordered[0].score< -20 || ordered[0].score < oldScore-.35)return original;
  return ordered[0].c;
};
// Voting: an unresolved outsider feud counts against a ticket when safer
// alternatives are available. It must NOT create an unconditional veto or
// repeated NO->chaos loops. The existing v51 risk / chaos calculation remains
// authoritative; this only breaks a weak-YES tie for a clearly safer next seat.
var ss52PriorVote=window.botDecideVote;
window.botDecideVote=function(b){
  var prior=ss52PriorVote.apply(this,arguments);
  if(!SS52.enabled||!BRAIN||game.roles[b]!=='white'||game.gameOver||
     game.communistPolicies<3 || game.electionTracker>=2 ||
     b===game.currentPresident || !prior || !ss52ActivePairs().length)return prior;
  var P=game.currentPresident,C=game.nominatedChancellor;
  if(P==null||C==null)return prior;
  var currentRisk=Math.max(ss52FeudRisk(b,P),ss52FeudRisk(b,C));
  if(currentRisk<1.5)return prior;
  var next=v30Upcoming(P,2), view=brainView(b);
  // Only oppose a disputed ticket when a materially safer nearby Secretary
  // is visible. Otherwise keep the original vote to avoid blind topdecks.
  var safer=next.some(function(i){
    return ss52FeudRisk(b,i)<1 && view.F[i]<.40 && view.S[i]<.23 &&
      (game.botInvestigations[b]||{})[i]!=='communist';
  });
  if(!safer)return prior;
  // Avoid voting down a ticket involving a verified safe Premier at White
  // match point; the existing policy/chaos logic is more important.
  if(game.whitePolicies>=4 && game.confirmedNotStalin[C] && view.F[C]<.2)return prior;
  return false;
};

// ===== Multiplayer alignment: globally unique investigations =====
// A loyalty-check target cannot be investigated twice in a match, regardless
// of who performed the first investigation or whether they publicly lied.
function ssUniqueInvestigated(target){
  if((game.invLog||[]).some(function(e){return e.target===target;}))return true;
  if((game.playerRecords[target]||{}).investigationsReceived?.length)return true;
  if(game.humanInvestigations&&Object.prototype.hasOwnProperty.call(game.humanInvestigations,target))return true;
  return Object.keys(game.botInvestigations||{}).some(function(i){
    return Object.prototype.hasOwnProperty.call(game.botInvestigations[i]||{},target);
  });
}
function ssUniqueCandidates(p,withPremierExclusion){
  return getAliveIndices().filter(function(i){
    return i!==p && (!withPremierExclusion||i!==game.currentChancellor) && !ssUniqueInvestigated(i);
  });
}
var ssUniqueOldPick=window.brainPickInvestigation;
window.brainPickInvestigation=function(p,candidates){
  var allowed=(candidates||[]).filter(function(i){return !ssUniqueInvestigated(i);});
  if(!allowed.length)return null;
  return ssUniqueOldPick.call(this,p,allowed);
};
var ssUniqueOldBotInvestigate=window.botInvestigate;
window.botInvestigate=function(){
  var p=game.currentPresident;
  if(!ssUniqueCandidates(p,false).length){
    log('Every eligible comrade has already been investigated. The power is skipped.');
    game.currentPresident=nextPresident();startRound();return;
  }
  return ssUniqueOldBotInvestigate.apply(this,arguments);
};
var ssUniqueOldShowInvestigate=window.showInvestigateUI;
window.showInvestigateUI=function(){
  ssUniqueOldShowInvestigate.apply(this,arguments);
  var candidates=ssUniqueCandidates(game.currentPresident,false);
  var holder=document.getElementById('ac');
  if(!holder)return;
  if(!candidates.length){
    holder.innerHTML='<p class="action-desc">All eligible comrades were already checked.</p><button class="btn" onclick="finishPower(this)">Continue →</button>';
    return;
  }
  holder.innerHTML='<div class="player-select-grid">'+candidates.map(function(i){
    return '<button class="select-player-btn" onclick="investigatePlayer('+i+')">'+game.players[i].name+'</button>';
  }).join('')+'</div>';
};
var ssUniqueOldInvestigatePlayer=window.investigatePlayer;
window.investigatePlayer=function(i){
  if(ssUniqueInvestigated(i)||i===game.currentPresident||!game.players[i]||game.players[i].isDead){
    window.showInvestigateUI();return;
  }
  return ssUniqueOldInvestigatePlayer.apply(this,arguments);
};
var ssUniqueOldSimInvestigate=window.simInvestigate;
window.simInvestigate=function(P){
  if(!ssUniqueCandidates(P,false).length)return;
  return ssUniqueOldSimInvestigate.apply(this,arguments);
};
