const fs=require('fs'),vm=require('vm'),assert=require('assert');
const s=fs.readFileSync('military.js','utf8');
function extract(name){const re=new RegExp('function '+name+'\\('),m=re.exec(s);assert(m,'missing '+name);const pos=s.indexOf('{',m.index);let level=0,inStr=null,esc=false;for(let i=pos;i<s.length;i++){const c=s[i];if(inStr){if(esc)esc=false;else if(c==='\\')esc=true;else if(c===inStr)inStr=null;continue}if(c==='"'||c==="'"||c==='`'){inStr=c;continue}if(c==='{')level++;else if(c==='}'&&!--level)return s.slice(m.index,i+1)}throw Error('bad extract')}
function run(name,ctx){vm.createContext(ctx);vm.runInContext(extract(name),ctx);return ctx[name]}
{
const c={aiChallenge:'medium'};assert.strictEqual(run('divisionRecruitPrice',c)('militia'),15);assert.strictEqual(c.divisionRecruitPrice('elite'),65);
}
{
let holdings=[[0,2],[1],[3],[4]];const territories=[{i:0,owner:0,p:1,region:0},{i:1,owner:1,p:1,region:0},{i:2,owner:0,p:1,region:0},{i:3,owner:2,p:1,region:0},{i:4,owner:3,p:1,region:0}];
const countries=[0,1,2,3].map(id=>({id,name:'N'+id,stability:50,treasury:100,power:30,surrendered:false}));
const ctx={territories,countries,countyGraph:[[1,2],[0,3],[0],[1,4],[3]],armies:[],wars:[[0,1]],pacts:[],humanId:0,gameMode:'watch',actionNotice:'',
 validCountries:()=>countries.filter(c=>!c.surrendered&&territories.some(t=>t.owner===c.id)),
 countryStats:c=>({holdings:territories.filter(t=>t.owner===c.id),power:20,pop:10}),enemies:id=>id===1?[0]:id===0?[1]:[],alliance:()=>false,atWar:(a,b)=>a!==b&&[a,b].sort().join(',')==='0,1',rand:()=>.5,
 nums:arr=>arr.reduce((a,b)=>a+b,0),log:()=>{},invalidate:()=>{},restorePeaceArmies:()=>{},retreatDisplacedArmies:()=>{},Math};
run('countyComponents',ctx);run('alignmentScore',ctx);run('fixEnclaves',ctx);run('capitulate',ctx);
assert.strictEqual(ctx.fixEnclaves(),0);assert.strictEqual(territories[2].owner,0,'wartime enclave must not move to neutral');
ctx.capitulate(countries[1]);assert.strictEqual(territories[1].owner,0,'capitulated county to actual enemy');assert.strictEqual(territories[3].owner,2,'neutral nation unchanged');assert.strictEqual(territories[4].owner,3,'other neutral unchanged');
}
{
assert(s.includes('const openQuota=Math.ceil(assaulting.length*.5)'),'AI open frontier quota');
assert(s.includes('if(assaultIndex<openQuota&&possible.some(y=>y.resistance===0)&&x.resistance>0)continue;'),'ungarrisoned selection logic');
}
console.log('PASS: v54 prices, non-belligerent ownership, open-border priority');
