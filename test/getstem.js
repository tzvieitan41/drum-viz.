const {chromium}=require('playwright'); const fs=require('fs');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage(); await p.goto('http://localhost:8766/index.html');
 await p.setInputFiles('#file','real1.wav'); await p.waitForFunction(()=>__drum.hits.length>0&&document.getElementById('overlay').hidden,{timeout:600000});
 const b64=await p.evaluate(()=>{ const s=__drum.stem; const n=s.length, m=new Float32Array(n), a=s.getChannelData(0), c=s.getChannelData(1); for(let i=0;i<n;i++) m[i]=(a[i]+c[i])/2;
   let bin=''; const u=new Uint8Array(m.buffer); for(let i=0;i<u.length;i+=32768) bin+=String.fromCharCode.apply(null,u.subarray(i,i+32768)); return btoa(bin); });
 fs.writeFileSync('real1-stem.f32',Buffer.from(b64,'base64')); console.log('stem saved'); await b.close(); })();
