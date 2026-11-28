const {chromium}=require('playwright'); const fs=require('fs');
(async()=>{
 const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
 for (const [w,h,name] of [[375,667,'se'],[390,844,'i14']]){
  const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await p.goto('http://localhost:8765/index.html');
  await p.screenshot({path:`test/shot-empty-${name}.png`});
  const file = name==='se' ? 'test/song.mp4' : 'test/song.wav';
  await p.setInputFiles('#file', file);
  await p.waitForTimeout(400); await p.screenshot({path:`test/shot-analyzing-${name}.png`});
  await p.waitForFunction(()=>window.__drum.hits.length>0 && document.getElementById('overlay').hidden,{timeout:60000});
  const res=await p.evaluate(()=>({n:__drum.hits.length,bpm:__drum.bpm,mode:__drum.mode,hits:__drum.hits,L:__drum.hands.L.length,R:__drum.hands.R.length}));
  const truth=JSON.parse(fs.readFileSync('test/song.wav.json'));
  const tt=[];truth.forEach(x=>{if(!tt.length||x.t-tt[tt.length-1]>0.012)tt.push(x.t)});
  const ht=[...new Set(res.hits.map(x=>x.t))];
  const m=tt.filter(t=>ht.some(x=>Math.abs(x-t)<0.03)).length;
  console.log(name,file,'mode',res.mode,'hits',res.n,'bpm',res.bpm,'hands L/R',res.L,res.R,'onset recall',(m/tt.length*100).toFixed(0)+'%');
  await p.click('#playBtn'); await p.waitForTimeout(2300);
  await p.screenshot({path:`test/shot-play-${name}.png`});
  // seek to the tom fill and pause right at a hit
  await p.evaluate(()=>{ const s=__drum; s.offset=0; });
  const st=await p.evaluate(()=>({playing:__drum.playing, pos:document.getElementById('tCur').textContent, name:document.querySelector('#drumName span').textContent, ctx:__drum.ctx.state}));
  console.log(' playback state',JSON.stringify(st));
  await p.click('#playBtn'); // pause
  await p.$eval('#seek',el=>{el.value=Math.round(7.62/__drum.duration*1000);el.dispatchEvent(new Event('input'));el.dispatchEvent(new Event('change'));});
  await p.waitForTimeout(200);
  await p.screenshot({path:`test/shot-seek-${name}.png`});
  console.log(' errors:',errs.length?errs:'none');
  await p.close();
 }
 await b.close();
})();
