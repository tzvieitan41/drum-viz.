const {chromium}=require('playwright'); const fs=require('fs');
(async()=>{ const b=await chromium.launch(); const song=process.argv[2]||'hard112';
 const truth=JSON.parse(fs.readFileSync(song+'.wav.json')); const p=await b.newPage(); await p.goto('http://localhost:8766/index.html');
 await p.setInputFiles('#file',song+'.wav'); await p.waitForFunction(()=>__drum.hits.length>0&&document.getElementById('overlay').hidden,{timeout:600000});
 const hits=await p.evaluate(()=>__drum.hits); const n=['K','S','hc','ho','T1','T2','FT','R','C','C2']; const fp={};
 hits.forEach(h=>{ const ok=truth.some(t=>Math.abs(t.t-h.t)<0.03 && (t.d===h.d||(h.d>=8&&t.d>=8))); if(!ok){ const near=truth.filter(t=>Math.abs(t.t-h.t)<0.03).map(t=>n[t.d]).join('+')||'nothing'; const k=n[h.d]+' at '+near; fp[k]=(fp[k]||0)+1; } });
 console.log(song,'wrong hits (detected at → truth there):',JSON.stringify(Object.entries(fp).sort((a,b)=>b[1]-a[1])));
 await b.close(); })();
