import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs/promises";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const origin = "https://pharmacy.test";
const source = await fs.readFile(new URL("../pwa/sw-template.js",import.meta.url),"utf8");
function harness({ version = "release-a", storage = new Map(), windows = [] } = {}) {
  const events = {}, requests = [];
  let offline = false, response = () => new Response("public asset",{headers:{"cache-control":"public, max-age=31536000","content-type":"application/javascript"}});
  let activations = 0;
  const address = value => new URL(typeof value === "string" ? value : value.url,origin).href;
  const caches = {
    async open(name) {
      if (!storage.has(name)) storage.set(name,new Map());
      const entries = storage.get(name);
      return {
        async put(key,value) { entries.set(address(key),value.clone()); },
        async match(key) { return entries.get(address(key))?.clone(); },
        async keys() { return [...entries.keys()].map(url => new Request(url)); },
        async delete(key) { return entries.delete(address(key)); },
      };
    },
    async keys() { return [...storage.keys()]; },
    async delete(name) { return storage.delete(name); },
  };
  class LocalRequest extends Request {
    constructor(input, options) { super(typeof input === "string" ? new URL(input,origin) : input,options); }
  }
  const self = {
    location: {origin},
    addEventListener(type,fn) { events[type]=fn; },
    clients:{ async matchAll(){return windows;},async claim(){} },
    async skipWaiting(){activations++;},
  };
  vm.runInNewContext(source.replace("__PWA_VERSION__",version),{
    self,caches, Request:LocalRequest,Response,Headers,URL,Date,
    async fetch(request){requests.push(request); if(offline)throw new TypeError("offline"); return response(request);},
  });
  async function dispatch(type,attributes={}) {
    const pending=[];
    let result;
    events[type]({...attributes,waitUntil(p){pending.push(p);},respondWith(p){result=p;}});
    const answer = result ? await result : undefined;
    await Promise.all(pending);
    return answer;
  }
  return {storage,requests,dispatch,get activations(){return activations;},set offline(value){offline=value;},set response(value){response=value;}};
}
const get = (path, options={}) => new Request(origin+path,options);
const navigation = path => ({url:origin+path,method:"GET",headers:new Headers(),mode:"navigate"});

test("install precaches only the offline page and branded icons without credentials",async()=>{
  const h=harness(); await h.dispatch("install");
  assert.equal(h.activations,0);
  assert.equal(h.requests.length,7);
  assert(h.requests.every(r=>r.credentials==="omit" && (r.url.endsWith("/offline.html") || r.url.includes("/icons/"))));
});
test("cold deep links and refreshes use network; offline navigation falls back without caching pages",async()=>{
  const h=harness(); await h.dispatch("install");
  h.response=()=>new Response("private invoice");
  assert.equal(await (await h.dispatch("fetch",{request:navigation("/purchases/12?secret=yes")})).text(),"private invoice");
  assert([...h.storage.values()].every(cache=>![...cache.keys()].some(key=>key.includes("purchases"))));
  h.offline=true;
  assert.equal(await (await h.dispatch("fetch",{request:navigation("/pos")})).text(),"public asset");
});
test("server failures and redirects preserve status rather than masquerading as offline data",async()=>{
  const h=harness(); await h.dispatch("install");
  h.response=()=>new Response("server unavailable",{status:503});
  assert.equal((await h.dispatch("fetch",{request:navigation("/pos")})).status,503);
  h.response=()=>new Response(null,{status:302,headers:{Location:"/login"}});
  assert.equal((await h.dispatch("fetch",{request:navigation("/pos")})).status,302);
});
test("API, auth, payment, cross-origin, RSC, ranged and unsafe requests bypass the worker",async()=>{
  const h=harness();
  for (const request of [get("/api/medicines"),get("/api"),get("/api/payments",{method:"POST"}),
    get("/login",{method:"POST"}),get("/_next/static/a.js",{headers:{Authorization:"Bearer secret"}}),
    get("/_next/static/a.js",{headers:{rsc:"1"}}),get("/_next/static/a.js",{headers:{Range:"bytes=0-1"}}),
    get("/_next/static/a.js",{cache:"no-store"}),get("/_next/static/a.js?private=1"),
    new Request("https://api.other.test/api/sales"),get("/receipts/123"),get("/uploads/patient.png")]) {
    assert.equal(await h.dispatch("fetch",{request}),undefined,request.url);
  }
  assert.equal(h.requests.length,0);
});
test("public build assets are cache-first, omit credentials and are bounded to 100 entries",async()=>{
  const h=harness();
  const asset=get("/_next/static/chunks/hash-a.js");
  await h.dispatch("fetch",{request:asset}); h.offline=true;
  assert.equal(await (await h.dispatch("fetch",{request:asset})).text(),"public asset");
  assert.equal(h.requests.length,1); assert.equal(h.requests[0].credentials,"omit");
  h.offline=false;
  for(let i=0;i<105;i++)await h.dispatch("fetch",{request:get(`/_next/static/chunks/hash-${i}.js`)});
  assert.equal(h.storage.get("smartpharm-pwa-release-a-static").size,100);
});
test("private and no-store responses are never saved; expired assets require network",async()=>{
  for(const headers of [{"cache-control":"private"},{"cache-control":"no-store"},{vary:"Cookie"},{"set-cookie":"session=secret"}]) {
    const h=harness(); h.response=()=>new Response("secret",{headers});
    await h.dispatch("fetch",{request:get("/_next/static/hash.js")});
    assert.equal(h.storage.get("smartpharm-pwa-release-a-static").size,0);
  }
  const h=harness(); const request=get("/_next/static/hash.js");
  await h.dispatch("fetch",{request});
  h.storage.get("smartpharm-pwa-release-a-static").set(request.url,new Response("old",{headers:{"x-smartpharm-cached-at":"1"}}));
  h.response=()=>new Response("fresh");
  assert.equal(await (await h.dispatch("fetch",{request})).text(),"fresh");
});
test("update cleanup affects only this app's caches and refuses activation during billing or across tabs",async()=>{
  const storage=new Map([["other-app",new Map()],["smartpharm-pwa-old-shell",new Map()]]);
  const h=harness({storage}); await h.dispatch("install"); await h.dispatch("activate");
  assert(storage.has("other-app")); assert(!storage.has("smartpharm-pwa-old-shell"));
  assert(storage.has("smartpharm-pwa-release-a-shell"));
  for (const windows of [[{id:"1",url:origin+"/pos"}],[{id:"1",url:origin+"/login"},{id:"2",url:origin+"/pos"}]]) {
    const blocked=[]; const h=harness({windows});
    await h.dispatch("message",{data:{type:"ACTIVATE_UPDATE"},source:{id:"1",postMessage:m=>blocked.push(m)}});
    assert.equal(h.activations,0); assert.equal(blocked[0].type,"UPDATE_BLOCKED");
  }
  // The document started at /purchases, then the SPA returned to sign-in.
  const single=harness({windows:[{id:"1",url:origin+"/purchases"}]});
  await single.dispatch("message",{data:{type:"ACTIVATE_UPDATE",pathname:"/login"},source:{id:"1"}});
  assert.equal(single.activations,1);
});
test("branded PNGs have the exact advertised sizes and maskable safe area",async()=>{
  for(const size of [192,512])for(const name of ["icon","maskable"]) {
    const image=sharp(fileURLToPath(new URL(`../public/icons/${name}-${size}.png`,import.meta.url)));
    const meta=await image.metadata();
    assert.equal(meta.width,size); assert.equal(meta.height,size); assert.equal(meta.format,"png");
    if(name==="maskable") {
      const {data,info}=await image.removeAlpha().raw().toBuffer({resolveWithObject:true});
      for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
        const offset=(y*size+x)*info.channels;
        if(data[offset]>170 && data[offset+1]>180) assert(Math.hypot(x-size/2,y-size/2)<size*.4);
      }
    }
  }
});
