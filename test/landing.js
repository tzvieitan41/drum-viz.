const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('http://localhost:8766/index.html');
await p.setInputFiles('#file','hard112.wav');await p.waitForFunction(()=>__drum.hits.length>0&&document.getElementById('overlay').hidden,{timeout:60000});
const out=await p.evaluate(async()=>{
  const res=[]; const S=__drum; const sync=S.syncMs/1000;
  for(const k of ['L','R']){ for(const h of S.hands[k].slice(5,9)){
    for(const dt of [-0.12,-0.04,0]){ S.offset=h.t+dt+sync; S.ptr={}; await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const tip=document.querySelector('#hand'+k+' .tip'); res.push(k+' d'+h.d+' dt'+dt+' tip('+(+tip.getAttribute('cx')).toFixed(0)+','+(+tip.getAttribute('cy')).toFixed(0)+') r'+(+tip.getAttribute('r')).toFixed(1)); } } }
  return res; });
console.log(out.join('\n'));await b.close();})();
