import { createServer } from "node:http";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";
import assert from "node:assert/strict";
const root=resolve(process.argv[2]);
const locales=[{"code":"en","name":"English"},{"code":"et","name":"Eesti"},{"code":"fi","name":"Suomi"},{"code":"ru","name":"???????"},{"code":"es","name":"Espa�ol"},{"code":"pt","name":"Portugu�s (Brasil)","tag":"pt-BR"},{"code":"fr","name":"Fran�ais"},{"code":"de","name":"Deutsch"},{"code":"it","name":"Italiano"},{"code":"lv","name":"Latviesu"},{"code":"hi","name":"??????"},{"code":"vi","name":"Ti?ng Vi?t"},{"code":"id","name":"Bahasa Indonesia"},{"code":"lt","name":"Lietuviu"},{"code":"tr","name":"T�rk�e"},{"code":"sv","name":"Svenska"},{"code":"hr","name":"Hrvatski"},{"code":"cs","name":"Cestina"},{"code":"da","name":"Dansk"},{"code":"nl","name":"Nederlands"},{"code":"hu","name":"Magyar"},{"code":"pl","name":"Polski"},{"code":"ro","name":"Rom�na"},{"code":"sk","name":"Slovencina"},{"code":"sl","name":"Slovenscina"}];
const guideLocales = [...locales, ...[{"code":"pt-PT","name":"Português (Portugal)"},{"code":"bg","name":"Български"},{"code":"uk","name":"Українська"},{"code":"el","name":"Ελληνικά"},{"code":"zh-Hans","name":"简体中文"},{"code":"ar","name":"العربية"},{"code":"ja","name":"日本語"},{"code":"ko","name":"한국어"}]];
const privacyLocales = guideLocales;
const guideFile = (code) => code === "en" ? "app.html" : "app-" + code.toLowerCase() + ".html";
const server=createServer(async(req,res)=>{
  try{
    const file=resolve(root, "."+new URL(req.url,"http://localhost").pathname);
    if(!file.startsWith(root+"\\")&&!file.startsWith(root+"/"))throw Error("path");
    const bytes=await readFile(file);
    res.setHeader("Content-Type",({".html":"text/html; charset=utf-8",".png":"image/png",".xml":"application/xml",".js":"text/javascript; charset=utf-8"})[extname(file)]??"text/plain; charset=utf-8");res.end(bytes);
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
  for(const l of guideLocales){
    const file=guideFile(l.code);
    await command("Emulation.setDeviceMetricsOverride",{width:375,height:812,deviceScaleFactor:1,mobile:false});
    await navigate(file);
    const info=await evaluate(`(()=>{
      const controls=[...document.querySelectorAll("button[data-site-target]")];
      const ids=[...document.querySelectorAll("[id]")].map(x=>x.id);
      return {lang:document.documentElement.lang,h1:document.querySelectorAll("h1").length,
      menu:document.querySelectorAll(".language-options button").length,current:document.querySelectorAll(".language-options button[aria-current]").length,
      alternate:[...document.querySelectorAll('link[rel="alternate"]')].map(a=>[a.hreflang, a.getAttribute("href").split("/").at(-1)]),
      languageOptions:[...document.querySelectorAll(".language-options button")].map(a=>[a.lang, a.dataset.siteTarget]),
      selected:document.querySelector(".language-options button[aria-current]")?.dataset.siteTarget,
      direction:getComputedStyle(document.documentElement).direction,
      canonical:document.querySelector('link[rel="canonical"]').href.split("/").at(-1),
      privacy:controls.filter(a=>a.dataset.siteTarget.startsWith("privacy.html")).map(a=>a.dataset.siteTarget),
      sections:controls.filter(a=>a.dataset.siteTarget.startsWith("#")).every(a=>document.getElementById(a.dataset.siteTarget.slice(1))),
      noLinks:!document.querySelector("a, area"),
      localTargets:controls.every(a=>!a.dataset.siteTarget.includes(":")&&!a.dataset.siteTarget.includes("/")),
      join:[...document.querySelectorAll("#join .plain-address")].map(a=>a.textContent.trim()),
      width:document.documentElement.scrollWidth,viewport:innerWidth,
      images:[...document.images].every(i=>i.complete&&i.naturalWidth>0),
      notice:document.querySelector("[data-language-availability]")?.textContent,
      languages:document.querySelectorAll("[data-language-availability] .languages span").length,
      credits:controls.filter(a=>a.dataset.siteTarget.startsWith("voice-credits.html")).map(a=>a.dataset.siteTarget),
      uniqueIds:ids.length===new Set(ids).size};
    })()`);
    check(info.lang===(l.tag??l.code),"language "+file);check(info.h1===1,"one heading "+file);
    const routes = guideLocales.map(locale => [locale.tag ?? locale.code, guideFile(locale.code)]);
    check(info.menu===guideLocales.length&&info.current===1&&info.selected===file,"language navigation "+file);
    check(JSON.stringify(info.languageOptions)===JSON.stringify(routes),"language menu routes "+file);
    check(JSON.stringify(info.alternate)===JSON.stringify([...routes, ["x-default", "app.html"]])&&info.canonical===file,"hreflang and canonical "+file);
    check(info.direction===(l.code==="ar"?"rtl":"ltr"),"reading direction "+file);
    check(info.privacy.length>=2&&info.privacy.every(x=>x==="privacy.html#"+l.code),"privacy chapter "+file);
    check(info.sections&&info.uniqueIds,"local section targets "+file);
    check(info.noLinks&&info.localTargets,"no clickable hyperlinks "+file);check(info.images,"images load "+file);
    check(info.join.includes("https://groups.google.com/g/my-little-voice-testers")&&info.join.includes("https://play.google.com/apps/testing/org.mylittlevoice.aac")&&info.join.includes("https://play.google.com/store/apps/details?id=org.mylittlevoice.aac"),"plain testing addresses "+file);
    check(info.notice.match(/\d+/g)?.join(",")==="33"&&info.languages===33,"availability disclosure "+file);
    check(info.credits.length===1&&info.credits[0]==="voice-credits.html#"+l.code,"voice credits control "+file);
    check(info.width<=info.viewport+1,"mobile overflow "+file+" "+JSON.stringify(info));
    if(!locales.includes(l)||["hr","cs","da","nl","hu","pl","ro","sk","sl","de"].includes(l.code)){
      for(const width of [320,768,1280]){
        await command("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:false});
        await pause(20);
        check(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),"layout "+file+" at "+width);
        await evaluate("document.querySelector('.language-menu').open=true");
        check(await evaluate("document.documentElement.scrollWidth<=innerWidth+1 && document.querySelector('.language-options').getBoundingClientRect().left>=-1 && document.querySelector('.language-options').getBoundingClientRect().right<=innerWidth+1"),"menu layout "+file+" at "+width);
        await evaluate("document.querySelector('.language-menu').open=false");
      }
    }
  }
  await command("Emulation.setDeviceMetricsOverride",{width:375,height:812,deviceScaleFactor:1,mobile:false});
  const chooseDocumentLanguage = async (code) => {
    await evaluate(`(() => {
      const picker = document.getElementById("document-language");
      picker.value = ${JSON.stringify(code)};
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
  };
  for (const page of ["privacy.html", "voice-credits.html"]) {
    await navigate(page + "#ar");
    check(await evaluate(`(() => {
      const picker = document.getElementById("document-language");
      return !picker.closest(".language-picker").hidden && picker.options.length === ${privacyLocales.length}
        && picker.value === "ar" && document.documentElement.lang === "ar"
        && document.getElementById("ar").dir === "rtl" && !document.getElementById("ar").hidden
        && document.querySelectorAll("article").length === ${privacyLocales.length}
        && document.querySelectorAll("a, area").length === 0;
    })()`), "language coverage, Arabic deep link, and no clickable links on " + page);
    for (const locale of privacyLocales) {
      await chooseDocumentLanguage(locale.code);
      const chapter = await evaluate(`(() => {
        const a = document.getElementById(${JSON.stringify(locale.code)});
        return {
          visible: !a.hidden && document.querySelectorAll("article:not([hidden])").length === 1,
          lang: a.lang,
          selected: document.documentElement.lang === a.lang && location.hash === "#" + a.id,
          headings: a.querySelectorAll("h2").length,
          ageSignals: a.querySelectorAll("[data-play-age-signals]").length,
          contact: a.querySelector("address")?.textContent,
          paragraphs: a.querySelectorAll("p").length,
          date: a.querySelector("time")?.dateTime,
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          text: a.textContent,
        };
      })()`);
      check(chapter.visible && chapter.selected && chapter.lang === (locale.tag ?? locale.code), page + "#" + locale.code);
      check(!chapter.overflow, "document layout " + page + "#" + locale.code);
      if (page === "privacy.html") {
        check(chapter.headings === 7 && chapter.paragraphs >= 14, "privacy topics " + locale.code);
        check(chapter.contact.includes("helen_penjam@yahoo.com") && chapter.contact.includes("+372 5816 6552"), "privacy contact " + locale.code);
        check(chapter.ageSignals === 1 && chapter.date === "2026-11-24", "policy disclosure and date " + locale.code);
        for (const address of ["https://policies.google.com/privacy", "https://www.aki.ee", "https://hile616-hub.github.io/my-little-voice-downloads/privacy.html"]) {
          check(chapter.text.includes(address), "plain privacy address " + locale.code + " " + address);
        }
      } else {
        check(chapter.headings >= 4 && !chapter.text.includes("github.com/"), "voice credits " + locale.code);
      }
    }
  }
  const notices = await evaluate(`[...document.querySelectorAll("details pre[data-notice]")].map(
    (notice) => [notice.dataset.notice, notice.textContent]
  )`);
  check(notices.length === 7 && new Set(notices.map(([filename]) => filename)).size === 7, "original licence notices available");
  for (const [filename, content] of notices) {
    const original = (await readFile(join(root, "notices", filename), "utf8")).replace(/\r\n/g, "\n");
    check(content === original, "verbatim original notice " + filename);
  }
  await navigate("index.html");
  check(await evaluate('!document.querySelector("a, area")'), "no hyperlinks on the home page");
  await evaluate(`document.querySelector('button[data-site-target="privacy.html"]').click()`);
  for (let i=0; i<100 && !await evaluate('location.pathname.endsWith("/privacy.html")'); i++) await pause(20);
  check(await evaluate('location.pathname.endsWith("/privacy.html")'), "home privacy control works");
  await navigate("app.html");
  await evaluate(`document.querySelector('button[data-site-target="#features"]').click()`);
  check(await evaluate('location.hash === "#features" && document.activeElement.id === "features"'), "guide section control and focus work");
  await evaluate(`document.querySelector('button[data-site-target="app-fi.html"]').click()`);
  for (let i=0; i<100 && !await evaluate('document.documentElement?.lang === "fi"'); i++) await pause(20);
  check(await evaluate('document.documentElement?.lang === "fi"'), "guide language control works");
  await navigate("app-hr.html");
  const top=await command("Page.captureScreenshot",{format:"png"});await writeFile(join(root,"review-hr-phone.png"),Buffer.from(top.data,"base64"));
  await evaluate("document.getElementById('join').scrollIntoView()");
  const joinShot=await command("Page.captureScreenshot",{format:"png"});await writeFile(join(root,"review-hr-join.png"),Buffer.from(joinShot.data,"base64"));
  console.log(JSON.stringify({passed:true,assertions,pages:guideLocales.length,privacyLanguages:privacyLocales.length,widths:[320,375,768,1280]}));
}finally{ws?.close();chrome.kill();await new Promise(r=>server.close(r));}
