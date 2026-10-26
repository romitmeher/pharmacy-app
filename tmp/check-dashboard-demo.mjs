import {chromium} from './pwa-qa/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.DASHBOARD_TEST_URL||'http://localhost:3000';
const login=JSON.parse(await fs.readFile('backend/instance/aiven-demo-login.json','utf8'));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Kolkata'});
const page=await context.newPage();
try{
  await page.goto(base+'/login');await page.getByLabel('Email address',{exact:true}).fill(login.email);await page.getByLabel('Password',{exact:true}).fill(login.password);
  await page.getByRole('button',{name:'Sign in to workspace'}).click();await page.waitForURL(base+'/');
  await page.waitForFunction(()=>document.querySelectorAll('.ops-stats .ui-stat-value').length===4&&[...document.querySelectorAll('.ops-stats .ui-stat-value')].every(e=>e.textContent!=='—'),{},{timeout:90000});
  await page.waitForFunction(()=>Number(document.querySelector('.ops-stats .ui-stat-value [aria-hidden="true"]')?.textContent)>=50);
  const metrics=await page.locator('.ops-stats .ui-stat-value [aria-hidden="true"]').allTextContents();
  assert(Number(metrics[0])>=50&&Number(metrics[1])>0&&Number(metrics[2])>=3&&Number(metrics[3])>=3,JSON.stringify(metrics));
  const chart=await page.locator('.ops-chart').getAttribute('aria-label');
  const insights=await page.locator('.ops-insight-list li').count();
  assert(insights>0,'Expected demo stock/reorder insight rows');
  await fs.mkdir('output/dashboard-demo',{recursive:true});
  await page.screenshot({path:`output/dashboard-demo/${base.startsWith('https:')?'live':'local'}-dashboard.png`,fullPage:true});
  await page.goto(base+'/returns');await page.getByRole('textbox',{name:'Sale ID',exact:true}).waitFor();
  const lookup=[];
  for(const width of [375,1440]){
    await page.setViewportSize({width,height:900});
    const dimensions=await page.evaluate(()=>{
      const input=document.querySelector('.returns-10'),icon=document.querySelector('.returns-9');
      const i=input.getBoundingClientRect(),s=icon.getBoundingClientRect();
      return {width:innerWidth,iconRight:s.right,textStart:i.left+parseFloat(getComputedStyle(input).paddingLeft),rootOverflow:document.documentElement.scrollWidth-innerWidth};
    });
    assert(dimensions.textStart>=dimensions.iconRight+6,JSON.stringify(dimensions));assert(dimensions.rootOverflow<=1);
    lookup.push(dimensions);
  }
  const report={url:base,metrics,insightRows:insights,chartLabel:chart,lookup,realPaymentsSent:false};
  console.log(JSON.stringify(report,null,2));
  await fs.writeFile(`output/dashboard-demo/${base.startsWith('https:')?'live':'local'}-checks.json`,JSON.stringify(report,null,2));
}finally{await context.close();await browser.close();}
