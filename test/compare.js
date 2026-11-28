const {chromium}=require('playwright'); const fs=require('fs');
const names=['kick','snare','hhC','hhO','tomH','tomM','tomF','ride','crash','crash2'];
function evalHits(truth,hits,tol=0.03){
  const tt=[]; truth.map(h=>h.t).sort((a,b)=>a-b).forEach(t=>{ if(!tt.length||t-tt[tt.length-1]>0.012) tt.push(t); });
  const ht=[...new Set(hits.map(h=>h.t))].sort((a,b)=>a-b);
  const used=new Set(); let tp=0; const err=[];
  tt.forEach(t=>{ let bi=-1,bd=tol; ht.forEach((h,i)=>{ if(!used.has(i)&&Math.abs(h-t)<bd){bd=Math.abs(h-t);bi=i;} }); if(bi>=0){used.add(bi);tp++;err.push(Math.abs(ht[bi]-t));} });
  const cls={}; let okAll=0,totAll=0;
  for(let d=0;d<9;d++){ const T=truth.filter(h=>h.d===d||(d===8&&h.d===9)), H=hits.filter(h=>h.d===d||(d===8&&h.d===9)); const u=new Set(); let ok=0;
    T.forEach(t=>{ const i=H.findIndex((h,i)=>!u.has(i)&&Math.abs(h.t-t.t)<tol); if(i>=0){u.add(i);ok++;} }); okAll+=ok; totAll+=T.length;
    if(T.length) cls[names[d]]=Math.round(ok/T.length*100)+'%/'+(H.length?Math.round(ok/H.length*100):0)+'%'; }
  return {recall:(tp/tt.length*100).toFixed(1), precision:(tp/ht.length*100).toFixed(1), mae:(err.reduce((a,b)=>a+b,0)/err.length*1000).toFixed(1), typeRecall:(okAll/totAll*100).toFixed(1), cls};
}
(async()=>{
 const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
 for(const song of (process.argv[2]||'song112').split(',')){
  const truth=JSON.parse(fs.readFileSync(song+'.wav.json'));
  for(const sep of [false,true]){
   const ctx=await b.newContext(); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
   p.on('console',m=>{ if(m.type()==='warning'||m.type()==='error') errs.push(m.text()); });
   if(!sep) await p.addInitScript(()=>{ const W=window.Worker; window.Worker=function(u,o){ if(String(u).includes('separator')) throw new Error('disabled for test'); return new W(u,o); }; });
   await p.goto('http://localhost:8766/index.html');
   const t0=Date.now(); await p.setInputFiles('#file', song+'.wav');
   await p.waitForFunction(()=>window.__drum.hits.length>0 && document.getElementById('overlay').hidden,{timeout:600000});
   const r=await p.evaluate(()=>({hits:__drum.hits,bpm:__drum.bpm,sep:__drum.sepOk}));
   const ev=evalHits(truth,r.hits);
   console.log(song, sep?'WITH separation   ':'without separation', 'sepOk',r.sep,'| time',((Date.now()-t0)/1000).toFixed(1)+'s | bpm',r.bpm,'| found',ev.recall+'%','real',ev.precision+'%','type-correct',ev.typeRecall+'%','| timing err',ev.mae+'ms');
   console.log('   per drum (found/correct):',JSON.stringify(ev.cls), errs.length?' ERR '+errs.slice(0,3).join(' | '):'');
   await ctx.close();
  }
 }
 await b.close();
})();
