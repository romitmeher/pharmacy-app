import { chromium } from './pwa-qa/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const base='https://smartpharm-web-244760124290.asia-south1.run.app';
const profile=await fs.mkdtemp(path.resolve('tmp/pwa-live-chrome-'));
const context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
  const page=await context.newPage();
  await page.goto(base+'/login',{timeout:90000});
  await page.getByRole('heading',{name:'Welcome back.'}).waitFor();
  await page.evaluate(async()=>await navigator.serviceWorker.ready);
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  const cdp=await context.newCDPSession(page);
  await cdp.send('Page.enable');
  const manifestCheck=await cdp.send('Page.getAppManifest');
  const eligibility=await cdp.send('Page.getInstallabilityErrors');
  assert.deepEqual(manifestCheck.errors,[]);
  assert.deepEqual(eligibility.installabilityErrors,[]);
  const manifest=await (await page.request.get(base+'/manifest.webmanifest')).json();
  const sw=await page.request.get(base+'/sw.js');
  assert.equal(sw.status(),200);
  assert.match(sw.headers()['content-type'],/javascript/);
  assert.equal(sw.headers()['cache-control'],'no-store, max-age=0');
  assert.equal(sw.headers()['service-worker-allowed'],'/');
  assert.equal(manifest.id,'/'); assert.equal(manifest.start_url,'/login');
  for(const icon of manifest.icons) {
    const response=await page.request.get(base+icon.src);
    assert.equal(response.status(),200);
    const bytes=await response.body();
    const size=Number(icon.sizes.split('x')[0]);
    assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
  }
  await page.goto(base+'/pos');await page.waitForURL('**/login');
  await context.setOffline(true);
  await page.goto(base+'/inventory?test=pwa');
  await page.getByRole('heading',{name:'A little pause. Your work stays yours.'}).waitFor();
  const cachePaths=await page.evaluate(async()=>{
    const paths=[];
    for(const name of await caches.keys())for(const r of await (await caches.open(name)).keys())paths.push(new URL(r.url).pathname);
    return paths;
  });
  assert(cachePaths.every(p=>p==='/offline.html'||p.startsWith('/icons/')||p.startsWith('/_next/static/')||p.startsWith('/fonts/')));
  await context.setOffline(false);
  await page.getByRole('link',{name:'Try this page again'}).click();
  await page.waitForURL('**/login');
  const report={url:base,https:true,manifestErrors:manifestCheck.errors,installabilityErrors:eligibility.installabilityErrors,
    iconsValid:true,workerActivated:true,workerNoStore:true,protectedDeepLinks:true,offlineFallback:true,
    reconnect:true,noPrivateCache:true};
  await fs.writeFile('output/pwa/live-checks.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}finally{await context.close();}
