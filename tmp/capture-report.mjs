import {chromium} from 'file:///C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
const dir='output/capstone-report/assets';await fs.mkdir(dir,{recursive:true});
const login=JSON.parse(await fs.readFile('backend/instance/aiven-demo-login.json','utf8'));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const ctx=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Kolkata',deviceScaleFactor:1});
const page=await ctx.newPage();const base='https://smartpharm-web-244760124290.asia-south1.run.app';
const records=[];
try {
 await page.goto(base+'/login');await page.getByRole('button',{name:'Sign in to workspace'}).waitFor();
 await page.screenshot({path:dir+'/01-login.png'});
 await page.getByLabel('Email address',{exact:true}).fill(login.email);await page.getByLabel('Password',{exact:true}).fill(login.password);
 await page.getByRole('button',{name:'Sign in to workspace'}).click();await page.waitForURL(base+'/');
 const routes=[['02-dashboard','/','.ops-insight-list li'],['03-pos','/pos',null],['04-inventory','/inventory',null],['05-medicines','/medicines',null],['06-purchases','/purchases',null],['07-prescriptions','/prescriptions',null],['08-expiry','/expiry',null]];
 for(const [name,route,selector] of routes){
  await page.goto(base+route);await page.locator('h1').first().waitFor();
  if(selector)await page.locator(selector).first().waitFor({timeout:90000});
  await page.waitForTimeout(4500);
  await page.screenshot({path:dir+'/'+name+'.png'});
  records.push({name,route,title:await page.locator('h1').first().innerText(),capturedAt:new Date().toISOString()});
  console.log(name+' captured');
 }
 await fs.writeFile(dir+'/screenshots.json',JSON.stringify(records,null,2));
} finally {await ctx.close();await browser.close();}
