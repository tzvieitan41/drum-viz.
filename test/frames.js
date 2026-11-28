const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
await p.goto('http://localhost:8766/index.html');await p.setInputFiles('#file','hard112.wav');
await p.waitForFunction(()=>__drum.hits.length>0&&document.getElementById('overlay').hidden,{timeout:60000});
// freeze at chosen song times (paused), slightly after a hit so flashes/ripples show
const hits=await p.evaluate(()=>__drum.hits);
const pick=(d,n)=>hits.filter(h=>h.d===d)[n].t;
const times=[['crash',pick(8,1)+0.04],['tom',pick(4,1)-0.05],['openhat',pick(3,2)+0.03],['snare',pick(1,6)+0.03]];
for(const [name,t] of times){ await p.evaluate(t=>{__drum.offset=t+__drum.syncMs/1000;__drum.ptr={};},t); await p.waitForTimeout(150);
  const el=await p.$('#stage'); await el.screenshot({path:`f-${name}.png`}); }
await p.screenshot({path:'test/f-full.png'});
await b.close();})();
