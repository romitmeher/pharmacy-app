import { chromium } from './pwa-qa/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='https://smartpharm-web-244760124290.asia-south1.run.app';
const login=JSON.parse(await fs.readFile('backend/instance/aiven-demo-login.json','utf8'));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext();
const page=await context.newPage();
try {
  await page.goto(base+'/login');
  await page.getByLabel('Email address',{exact:true}).fill(login.email);
  await page.getByLabel('Password',{exact:true}).fill(login.password);
  await page.getByRole('button',{name:'Sign in to workspace'}).click();
  await page.waitForURL(base+'/',{timeout:60000});
  await page.goto(base+'/prescriptions');
  await page.getByRole('button',{name:'Upload / Scan Rx'}).click();
  await page.getByLabel('Prescription image',{exact:true}).setInputFiles('C:/Users/user/Pictures/Screenshots/Screenshot 2026-10-25 201544.png');
  await page.getByAltText('Original prescription for comparison with the draft').waitFor();
  assert.equal(await page.getByLabel('Image recognition').inputValue(),'handwriting');
  const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/ai/prescription/scan')&&r.request().method()==='POST',{timeout:120000});
  await page.getByRole('button',{name:'Read handwriting with AI',exact:true}).click();
  const response=await responsePromise;
  assert.equal(response.status(),200);
  const result=(await response.json()).data;
  await page.getByLabel('Medicine name 1',{exact:true}).waitFor();
  const names=page.getByRole('textbox',{name:/^Medicine name \d+$/});
  assert.equal(await names.count(),result.total_detected);
  assert.equal(result.total_detected,4);
  assert.equal(result.engine,'handwriting_ai');
  assert(result.items.every(item=>item.matched_medicine_id===null));
  assert(result.items.every(item=>item.quantity_to_dispense===null));
  for(let i=1;i<=4;i++)assert.equal(await page.getByLabel(`Confirmed quantity ${i}`,{exact:true}).inputValue(),'');
  const report={deployedScanHTTP:response.status(),imagePreview:true,handwritingMode:true,rows:result.total_detected,
    warnings:result.warnings.length,editableRows:true,noAutomaticMedicineLinks:true,quantitiesBlank:true,prescriptionSaved:false};
  await fs.mkdir('output/prescription',{recursive:true});
  await fs.writeFile('output/prescription/live-checks.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}finally{await context.close();await browser.close();}
