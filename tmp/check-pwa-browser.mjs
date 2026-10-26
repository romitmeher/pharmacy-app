import { chromium } from './pwa-qa/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const base='http://127.0.0.1:3100';
const workerPath=path.resolve('frontend/public/sw.js');
const original=await fs.readFile(workerPath,'utf8');
const profile=await fs.mkdtemp(path.resolve('tmp/pwa-chrome-'));
const context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await context.newPage();
const report={};
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
try {
  await page.goto(base+'/login');
  await page.getByRole('heading',{name:'Welcome back.'}).waitFor();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  const cdp=await context.newCDPSession(page);
  await cdp.send('Page.enable');
  const manifest=await cdp.send('Page.getAppManifest');
  const eligibility=await cdp.send('Page.getInstallabilityErrors');
  report.devtoolsManifestErrors=manifest.errors;
  report.devtoolsInstallabilityErrors=eligibility.installabilityErrors;
  assert.deepEqual(manifest.errors,[]);
  assert.deepEqual(eligibility.installabilityErrors,[]);
  const m=await (await page.request.get(base+'/manifest.webmanifest')).json();
  assert.equal(m.start_url,'/login'); assert.equal(m.scope,'/'); assert.equal(m.id,'/');
  for(const icon of m.icons)assert.equal((await page.request.get(base+icon.src)).status(),200);
  assert.equal((await page.request.get(base+'/sw.js')).headers()['cache-control'],'no-store, max-age=0');
  report.manifestAndIcons=true;
  await page.evaluate(()=>{
    const e=new Event('beforeinstallprompt',{cancelable:true});
    window.pwaPromptCalls=0;
    Object.assign(e,{prompt:async()=>{window.pwaPromptCalls++;},userChoice:Promise.resolve({outcome:'dismissed'})});
    window.dispatchEvent(e);
  });
  await page.getByRole('button',{name:'Install SmartPharm',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Install SmartPharm',exact:true}).click();
  await page.getByText('Installation dismissed.',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>window.pwaPromptCalls),1);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Install SmartPharm',exact:true}).click();
  await page.getByText('Some browsers only offer a bookmark;', {exact:false}).waitFor();
  await page.keyboard.press('Escape');
  report.installDismissalAndManualGuidance=true;
  await page.evaluate(()=>{
    const e=new Event('beforeinstallprompt',{cancelable:true});
    Object.assign(e,{prompt:async()=>{},userChoice:Promise.resolve({outcome:'accepted'})});
    window.dispatchEvent(e);
  });
  await page.getByRole('button',{name:'Install SmartPharm',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Install SmartPharm',exact:true}).click();
  await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));
  await page.waitForFunction(()=>![...document.querySelectorAll('button')].some(b=>b.textContent==='Install SmartPharm'));
  assert.equal(await page.getByRole('button',{name:'Install SmartPharm',exact:true}).count(),0);
  report.installAcceptedEvent=true;
  await page.reload();
  await page.getByRole('heading',{name:'Welcome back.'}).waitFor();
  await page.goto(base+'/inventory');
  await page.waitForURL('**/login'); // Protected deep links still require authentication.
  report.onlineDeepLinkAndRefresh=true;
  await context.setOffline(true);
  await page.goto(base+'/purchases?demo=offline');
  await page.getByRole('heading',{name:'A little pause. Your work stays yours.'}).waitFor();
  assert.equal(new URL(page.url()).pathname,'/purchases');
  await page.reload();
  await page.getByRole('link',{name:'Try this page again'}).waitFor();
  report.offlineDeepLinkAndRefresh=true;
  const cacheKeys=await page.evaluate(async()=>{
    const result=[];
    for(const key of await caches.keys())for(const request of await (await caches.open(key)).keys())result.push(new URL(request.url).pathname);
    return result;
  });
  assert(cacheKeys.every(k=>k==='/offline.html'||k.startsWith('/icons/')||k.startsWith('/_next/static/')||k.startsWith('/fonts/')));
  report.noPrivatePagesOrAPIInCache=true;
  await context.setOffline(false);
  await page.getByRole('link',{name:'Try this page again'}).click();
  await page.waitForURL('**/login');
  await page.getByRole('heading',{name:'Welcome back.'}).waitFor();
  report.reconnect=true;
  const tab=await context.newPage(); await tab.goto(base+'/login');
  const before=await page.evaluate(()=>navigator.serviceWorker.controller.scriptURL);
  await fs.writeFile(workerPath,original.replace(/const VERSION = "[^"]+";/,'const VERSION = "browser-update-check";'));
  await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration(); await r.update();});
  await page.getByText('A SmartPharm update is ready.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Update now'}).click();
  await page.getByRole('complementary',{name:'App update'}).getByText('Close the other SmartPharm tabs or app windows, then try again.').waitFor();
  assert.equal(await page.evaluate(()=>navigator.serviceWorker.controller.scriptURL),before);
  report.updateBlocksOtherTabs=true;
  await tab.close();
  const activeWorker=context.serviceWorkers()[0];
  for(let i=0;i<50;i++) {
    if(await activeWorker.evaluate(async()=> (await self.clients.matchAll({type:'window',includeUncontrolled:true})).length)===1)break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  try {
    await Promise.all([page.waitForEvent('load'), page.getByRole('button',{name:'Update now'}).click()]);
  } catch(error) {
    console.log('Update diagnostics',await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return {active:r.active?.state,waiting:r.waiting?.state,text:document.querySelector('.pwa-update')?.textContent};}));
    console.log('Worker clients',await activeWorker.evaluate(async()=> (await self.clients.matchAll({type:'window',includeUncontrolled:true})).map(c=>({url:c.url,id:c.id}))));
    throw error;
  }
  await page.getByRole('heading',{name:'Welcome back.'}).waitFor();
  assert.equal(await page.evaluate(async()=>Boolean((await navigator.serviceWorker.getRegistration()).waiting)),false);
  const names=await page.evaluate(()=>caches.keys());
  assert(names.every(n=>!n.startsWith('smartpharm-pwa-')||n.includes('browser-update-check')));
  report.userApprovedUpdateAndOldCacheCleanup=true;
  report.javascriptErrors=errors;
  assert.deepEqual(errors,[]);
  await fs.mkdir('output/pwa',{recursive:true});
  await page.screenshot({path:'output/pwa/login.png',fullPage:true});
  console.log(JSON.stringify(report,null,2));
  await fs.writeFile('output/pwa/browser-checks.json',JSON.stringify(report,null,2));
} finally {
  await fs.writeFile(workerPath,original);
  await context.close();
}
