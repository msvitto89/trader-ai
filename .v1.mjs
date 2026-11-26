import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({
  args:["--no-sandbox","--disable-dev-shm-usage","--use-gl=swiftshader","--enable-unsafe-swiftshader","--disable-gpu-sandbox"],
  executablePath:"/tmp/chromium", headless:true, protocolTimeout:180000,
  env:{...process.env, LD_LIBRARY_PATH:"/tmp/al2023/lib"} });
const pg = await b.newPage();
const errs=[]; pg.on("pageerror",e=>errs.push(e.message.slice(0,160)));
pg.on("console",m=>{const t=m.text(); if(/mercury|ERROR/i.test(t)&&!/GPU stall|Driver/.test(t)) errs.push("C:"+t.slice(0,180));});
await pg.setViewport({ width:1440, height:900, deviceScaleFactor:2 });
await pg.goto("http://localhost:3000/?preview=1",{waitUntil:"domcontentloaded"});
await new Promise(r=>setTimeout(r,5000));
const box = await pg.evaluate(()=>{const r=document.querySelector("[data-fluid-target]").getBoundingClientRect();
  return {x:r.x,y:r.y,w:r.width,h:r.height,cy:Math.round(r.top+r.height/2)};});
const clip={x:box.x-80,y:box.y-64,width:box.w+160,height:box.h+132};
await pg.screenshot({path:"screenshots/z-rest.png", clip});
for(let i=0;i<30;i++){ await pg.mouse.move(box.x+box.w*(0.12+0.72*i/30), box.cy+Math.sin(i/5)*34); await new Promise(r=>setTimeout(r,60)); }
await new Promise(r=>setTimeout(r,900));
await pg.screenshot({path:"screenshots/z-flow.png", clip});
await pg.mouse.move(box.x+box.w*0.18, box.cy+50);
for(let i=0;i<12;i++){ await pg.mouse.move(box.x+box.w*0.18+i*2, box.cy+50); await new Promise(r=>setTimeout(r,70)); }
await new Promise(r=>setTimeout(r,1400));
await pg.screenshot({path:"screenshots/z-hold.png", clip});
console.log("opacity:", JSON.stringify(await pg.evaluate(()=>document.querySelector("[data-fluid-target]").style.opacity)));
console.log("errors:", errs.length?errs.join(" | "):"none");
await b.close();
