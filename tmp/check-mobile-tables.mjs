import { chromium } from './pwa-qa/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.TABLE_TEST_URL || 'http://localhost:3000';
const run=base.startsWith('https:')?'live':'local';
const login=JSON.parse(await fs.readFile('backend/instance/aiven-demo-login.json','utf8'));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
try {
  await page.goto(base+'/login');
  await page.getByLabel('Email address',{exact:true}).fill(login.email);
  await page.getByLabel('Password',{exact:true}).fill(login.password);
  await page.getByRole('button',{name:'Sign in to workspace'}).click();
  await page.waitForURL(base+'/',{timeout:60000});
  await page.goto(base+'/pos');
  await page.getByRole('button',{name:'Add Multiprex',exact:true}).waitFor({timeout:60000});
  await fs.mkdir('output/mobile-tables',{recursive:true});
  const measurements=[];
  for(const width of [320,375,390,768,1024,1440]) {
    await page.setViewportSize({width,height:1000});
    await page.waitForFunction(()=>document.querySelector('.pos-catalog-scroll')?.clientWidth>0);
    const measure=await page.evaluate(()=>{
      const region=document.querySelector('.pos-catalog-scroll');
      const bounds=region.getBoundingClientRect();
      const rows=[...region.querySelectorAll('tr[data-index]')];
      return {width:innerWidth,rootOverflow:document.documentElement.scrollWidth-innerWidth,
        catalogOverflow:region.scrollWidth-region.clientWidth,
        mode:getComputedStyle(rows[0]).display,rows:rows.length,
        allActionsWithinWidth:rows.every(row=>{const b=row.querySelector('button').getBoundingClientRect();return b.left>=bounds.left-1&&b.right<=bounds.right+1&&b.height>=44;}),
        textWraps:rows.every(row=>{const cell=row.querySelector('td');return cell.scrollWidth<=cell.clientWidth+1;})};
    });
    measurements.push(measure);
    assert(measure.catalogOverflow<=1,JSON.stringify(measure));
    assert(measure.rootOverflow<=1,JSON.stringify(measure));
    assert(measure.allActionsWithinWidth&&measure.textWraps,JSON.stringify(measure));
    assert.equal(measure.rows,8);
    if([375,768,1440].includes(width))await page.screenshot({path:`output/mobile-tables/${run}-pos-${width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:375,height:900});
  await page.getByRole('button',{name:'Add Multiprex',exact:true}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('.pos-cart-item')].some(row=>row.textContent.includes('Multiprex')));
  // A disposable browser-only response exercises virtualization; nothing is
  // added to Aiven and no checkout endpoint is called.
  await context.route('**/api/sync/offline-pack?**',async route=>{
    const response=await route.fetch({headers:{...route.request().headers(),'if-none-match':''}});
    const json=await response.json();
    const sample=json.data.medicines[0];
    json.data.medicines=Array.from({length:200},(_,index)=>({...sample,id:9000000+index,
      brand_name:`Layout test ${String(index).padStart(3,'0')}`,
      generic_name:sample.generic_name+' + Long formulation text for responsive layout',
      batches:sample.batches.map((batch,i)=>({...batch,id:10000000+index*10+i}))}));
    json.data.version+='-layout-test';
    await route.fulfill({response,status:200,json});
  });
  await page.reload();
  await page.getByText('200 results',{exact:true}).waitFor();
  const large=[];
  for(const width of [375,1440]) {
    await page.setViewportSize({width,height:1000});
    await page.evaluate(()=>{const region=document.querySelector('.pos-catalog-scroll');region.scrollTop=region.scrollHeight;});
    await page.getByRole('button',{name:'Add Layout test 199',exact:true}).waitFor();
    const result=await page.evaluate(()=>{const r=document.querySelector('.pos-catalog-scroll');return {width:innerWidth,renderedRows:r.querySelectorAll('tr[data-index]').length,overflow:r.scrollWidth-r.clientWidth};});
    assert(result.renderedRows<50&&result.overflow<=1,JSON.stringify(result));
    large.push(result);
  }
  const report={url:base,measurements,addToCartOnMobile:true,virtualizedCatalog:large,saleSubmitted:false};
  console.log(JSON.stringify(report,null,2));
  await fs.writeFile(`output/mobile-tables/${run}-checks.json`,JSON.stringify(report,null,2));
}finally{await context.close();await browser.close();}
