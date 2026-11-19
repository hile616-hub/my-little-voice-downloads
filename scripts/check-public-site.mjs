import { createServer } from "node:http";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";
import assert from "node:assert/strict";
const root=resolve(process.argv[2]);
const locales=[{"code":"en","name":"English"},{"code":"et","name":"Eesti"},{"code":"fi","name":"Suomi"},{"code":"ru","name":"???????"},{"code":"es","name":"Espa�ol"},{"code":"pt","name":"Portugu�s (Brasil)","tag":"pt-BR"},{"code":"fr","name":"Fran�ais"},{"code":"de","name":"Deutsch"},{"code":"it","name":"Italiano"},{"code":"lv","name":"Latviesu"},{"code":"hi","name":"??????"},{"code":"vi","name":"Ti?ng Vi?t"},{"code":"id","name":"Bahasa Indonesia"},{"code":"lt","name":"Lietuviu"},{"code":"tr","name":"T�rk�e"},{"code":"sv","name":"Svenska"},{"code":"hr","name":"Hrvatski"},{"code":"cs","name":"Cestina"},{"code":"da","name":"Dansk"},{"code":"nl","name":"Nederlands"},{"code":"hu","name":"Magyar"},{"code":"pl","name":"Polski"},{"code":"ro","name":"Rom�na"},{"code":"sk","name":"Slovencina"},{"code":"sl","name":"Slovenscina"}];
const privacyLocales = [...locales, ...[{"code":"pt-PT","name":"Português (Portugal)"},{"code":"bg","name":"Български"},{"code":"uk","name":"Українська"},{"code":"el","name":"Ελληνικά"},{"code":"zh-Hans","name":"简体中文"},{"code":"ar","name":"العربية"},{"code":"ja","name":"日本語"},{"code":"ko","name":"한국어"}]];
const server=createServer(async(req,res)=>{
  try{
    const file=resolve(root, "."+new URL(req.url,"http://localhost").pathname);
    if(!file.startsWith(root+"\\")&&!file.startsWith(root+"/"))throw Error("path");
    const bytes=await readFile(file);
    res.setHeader("Content-Type",({".html":"text/html; charset=utf-8",".png":"image/png",".xml":"application/xml"})[extname(file)]??"text/plain; charset=utf-8");res.end(bytes);
  }catch{res.writeHead(404);res.end("Not found");}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const port=server.address().port,base="http://127.0.0.1:"+port;
const profile=await mkdtemp(join(tmpdir(),"aac-public-site-browser-"));
const chromePath = process.env.CHROME_BIN || (process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : "google-chrome");
const chrome=spawn(chromePath,["--headless","--no-sandbox","--disable-gpu","--no-first-run","--remote-debugging-port=0","--user-data-dir="+profile],{windowsHide:true,stdio:["ignore","ignore","pipe"]});
let stderr="",ws;chrome.stderr.on("data",b=>stderr=(stderr+b).slice(-4000));
let assertions=0;const check=(condition,message)=>{assertions++;assert(condition,message);};
try{
  let debugPort;for(let i=0;i<200&&!debugPort;i++){try{debugPort=(await readFile(join(profile,"DevToolsActivePort"),"utf8")).split("\n")[0];}catch{await pause(100);}}
  check(debugPort,"Chrome starts "+stderr);
  const tab=await(await fetch("http://127.0.0.1:"+debugPort+"/json/new?about:blank",{method:"PUT"})).json();
  ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener("open",r,{once:true});ws.addEventListener("error",j,{once:true});});
  let sequence=0;const pending=new Map();ws.addEventListener("message",({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
  const command=(method,params={})=>new Promise((r,j)=>{const id=++sequence;pending.set(id,{resolve:r,reject:j});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async(expression)=>{const r=await command("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
  await command("Page.enable");await command("Runtime.enable");
  async function navigate(path){await command("Page.navigate",{url:base+"/"+path});for(let i=0;i<100;i++){if(await evaluate("document.readyState==='complete' && location.href==="+JSON.stringify(base+"/"+path)))return;await pause(50);}throw Error("load timeout "+path);}
  for(const l of locales){
    const file=l.code==="en"?"app.html":"app-"+l.code+".html";
    await command("Emulation.setDeviceMetricsOverride",{width:375,height:812,deviceScaleFactor:1,mobile:false});
    await navigate(file);
    const info=await evaluate(`(()=>{
      const links=[...document.querySelectorAll("a")];
      const ids=[...document.querySelectorAll("[id]")].map(x=>x.id);
      return {lang:document.documentElement.lang,h1:document.querySelectorAll("h1").length,
      menu:document.querySelectorAll(".language-options a").length,current:document.querySelectorAll(".language-options a[aria-current]").length,
      alternate:document.querySelectorAll('link[rel="alternate"]').length,
      privacy:links.filter(a=>a.getAttribute("href").startsWith("privacy.html")).map(a=>a.getAttribute("href")),
      anchors:links.filter(a=>a.getAttribute("href").startsWith("#")).every(a=>document.getElementById(a.hash.slice(1))),
      join:links.filter(a=>a.closest("#join")).map(a=>a.href),
      width:document.documentElement.scrollWidth,viewport:innerWidth,
      images:[...document.images].every(i=>i.complete&&i.naturalWidth>0),
      notice:document.querySelector("[data-language-availability]")?.textContent,
      uniqueIds:ids.length===new Set(ids).size};
    })()`);
    check(info.lang===(l.tag??l.code),"language "+file);check(info.h1===1,"one heading "+file);
    check(info.menu===25&&info.current===1,"language navigation "+file);check(info.alternate===26,"hreflang "+file);
    check(info.privacy.length>=2&&info.privacy.every(x=>x==="privacy.html#"+l.code),"privacy chapter "+file);
    check(info.anchors&&info.uniqueIds,"anchors "+file);check(info.images,"images load "+file);
    check(info.join.includes("https://groups.google.com/g/my-little-voice-testers")&&info.join.includes("https://play.google.com/apps/testing/org.mylittlevoice.aac")&&info.join.includes("https://play.google.com/store/apps/details?id=org.mylittlevoice.aac"),"testing links "+file);
    check(info.notice.includes("25")&&info.notice.includes("16"),"availability disclosure "+file);
    check(info.width<=info.viewport+1,"mobile overflow "+file+" "+JSON.stringify(info));
    if(["hr","cs","da","nl","hu","pl","ro","sk","sl","de"].includes(l.code)){
      for(const width of [320,768,1280]){
        await command("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:false});
        await pause(20);
        check(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),"layout "+file+" at "+width);
        await evaluate("document.querySelector('.language-menu').open=true");
        check(await evaluate("document.documentElement.scrollWidth<=innerWidth+1 && document.querySelector('.language-options').getBoundingClientRect().left>=-1"),"menu layout "+file+" at "+width);
        await evaluate("document.querySelector('.language-menu').open=false");
      }
    }
  }
  await command("Emulation.setDeviceMetricsOverride",{width:375,height:812,deviceScaleFactor:1,mobile:false});
  await navigate("privacy.html");
  check(await evaluate("document.querySelectorAll('article').length===" + privacyLocales.length + " && document.querySelectorAll('nav a').length===" + privacyLocales.length),"privacy language coverage");
  check(await evaluate("document.querySelectorAll('nav[aria-label=\"Additional policy languages\"] a').length===8"),"eight additional policy chapters are separate from the guide languages");
  for(const l of privacyLocales){
    await evaluate(`document.querySelector(${JSON.stringify('nav a[href="#'+l.code+'"]')}).click()`);await pause(20);
    const r=await evaluate(`(()=>{const a=document.getElementById(${JSON.stringify(l.code)});return {visible:getComputedStyle(a).display!=="none",lang:a.lang,headings:a.querySelectorAll("h2").length,contact:a.querySelector("address")?.textContent,paras:a.querySelectorAll("p").length,date:a.querySelector("time")?.dateTime,overflow:document.documentElement.scrollWidth>innerWidth+1,links:[...a.querySelectorAll("a")].map(link=>link.href)};})()`);
    check(r.visible&&r.lang===(l.tag??l.code),"privacy target "+l.code);check(r.headings===7,"privacy topics "+l.code);check(r.contact.includes("helen_penjam@yahoo.com")&&r.contact.includes("+372 5816 6552"),"privacy contact "+l.code);check(r.paras>=14,"policy paragraphs "+l.code);check(r.date==="2026-11-16","policy effective date "+l.code);check(!r.overflow,"privacy layout "+l.code);
    for (const url of ["https://policies.google.com/privacy","https://www.aki.ee/","https://hile616-hub.github.io/my-little-voice-downloads/privacy.html"]) check(r.links.includes(url),"privacy link "+l.code+" "+url);
  }
  await navigate("voice-credits.html");
  check(await evaluate("document.querySelectorAll('article').length === 33"), "voice credits cover all 33 policy languages");
  for (const l of privacyLocales) {
    await evaluate(`document.querySelector(${JSON.stringify('nav a[href="#'+l.code+'"]')}).click()`);
    const visible = await evaluate(`(()=>{const a=document.getElementById(${JSON.stringify(l.code)});return a && a.lang===${JSON.stringify(l.tag??l.code)} && getComputedStyle(a).display!=="none" && a.querySelectorAll("h2").length>=4 && document.documentElement.scrollWidth<=innerWidth+1;})()`);
    check(visible,"voice credits chapter "+l.code);
  }
  await navigate("app-hr.html");
  const top=await command("Page.captureScreenshot",{format:"png"});await writeFile(join(root,"review-hr-phone.png"),Buffer.from(top.data,"base64"));
  await evaluate("document.getElementById('join').scrollIntoView()");
  const joinShot=await command("Page.captureScreenshot",{format:"png"});await writeFile(join(root,"review-hr-join.png"),Buffer.from(joinShot.data,"base64"));
  console.log(JSON.stringify({passed:true,assertions,pages:25,privacyLanguages:privacyLocales.length,widths:[320,375,768,1280]}));
}finally{ws?.close();chrome.kill();await new Promise(r=>server.close(r));}


