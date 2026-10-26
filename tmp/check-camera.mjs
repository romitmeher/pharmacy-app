import {chromium} from './pwa-qa/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const base=process.env.CAMERA_TEST_URL||'http://localhost:3000';
const login=JSON.parse(await fs.readFile('backend/instance/aiven-demo-login.json','utf8'));
const code=(await fs.readFile('tmp/camera-fixture-code.txt','utf8')).trim();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:[
  '--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',
  '--use-file-for-fake-video-capture='+path.resolve('tmp/camera-fixture.y4m'),
]});
const context=await browser.newContext({viewport:{width:390,height:844},permissions:['camera']});
await context.addInitScript(()=>{
  const native=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  window.testNativeCamera=native;window.testStreams=[];
  navigator.mediaDevices.getUserMedia=async(...args)=>{const s=await native(...args);window.testStreams.push(s);return s;};
});
const page=await context.newPage();
const report={base,saleSubmitted:false};
try {
  await page.goto(base+'/login');
  await page.getByLabel('Email address',{exact:true}).fill(login.email);
  await page.getByLabel('Password',{exact:true}).fill(login.password);
  await page.getByRole('button',{name:'Sign in to workspace'}).click();await page.waitForURL(base+'/');
  await page.goto(base+'/pos');await page.getByRole('button',{name:'Add Multiprex',exact:true}).waitFor();
  const barcode=page.getByRole('textbox',{name:'Barcode scanner input',exact:true});
  await page.keyboard.press('F2');await barcode.fill(code);await barcode.press('Enter');
  await page.waitForFunction(()=>document.querySelectorAll('.pos-cart-item').length===1);
  await page.getByRole('button',{name:'Remove Multiprex',exact:true}).click();
  await barcode.fill(code);await barcode.press('Tab');
  await page.waitForFunction(()=>document.querySelectorAll('.pos-cart-item').length===1);
  await page.getByRole('button',{name:'Remove Multiprex',exact:true}).click();
  report.hardwareEnterAndTab=true;
  await page.getByRole('button',{name:'Live camera',exact:true}).click();
  await page.getByRole('button',{name:'Start camera',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.pos-cart-item').length===1,{},{timeout:45000});
  assert.equal(await page.getByRole('dialog',{name:'Camera barcode scanner'}).count(),0);
  await page.waitForFunction(()=>window.testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
  assert.equal(await page.locator('.pos-quantity > span').textContent(),'1');
  report.realDecoderWithSimulatedVideo=true;report.noDuplicateFrameAdds=true;report.tracksStoppedAfterMatch=true;
  await page.getByRole('button',{name:'Remove Multiprex',exact:true}).click();
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('test denial','NotAllowedError');};});
  await page.getByRole('button',{name:'Live camera',exact:true}).click();
  await page.getByRole('button',{name:'Start camera',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Camera permission was blocked'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Start camera',exact:true}).isEnabled(),true);
  await page.getByRole('button',{name:'Close camera',exact:true}).click();report.permissionFailureIsRecoverable=true;
  // Hold a permission result until after close, then verify its late stream stops.
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async(...args)=>{
    const s=await window.testNativeCamera(...args);window.testStreams.push(s);
    await new Promise(resolve=>{window.releaseTestCamera=resolve;});return s;
  };});
  await page.getByRole('button',{name:'Live camera',exact:true}).click();await page.getByRole('button',{name:'Start camera',exact:true}).click();
  await page.waitForFunction(()=>Boolean(window.releaseTestCamera));
  await page.getByRole('button',{name:'Close camera',exact:true}).click();
  await page.evaluate(()=>window.releaseTestCamera());
  await page.waitForFunction(()=>window.testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
  report.tracksStoppedAfterLatePermission=true;
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
    const g=canvas.getContext('2d');g.fillStyle='white';g.fillRect(0,0,640,480);
    const media=canvas.captureStream(10);window.testStreams.push(media);return media;
  };});
  let captureRequest=false;
  await context.route('**/api/vision/recognize',async route=>{
    assert(route.request().postDataJSON().image_base64.length>100);captureRequest=true;
    await route.fulfill({json:{success:false,quality:{is_acceptable:false,blur_score:0,is_glare:false},match_result:{low_confidence:true,top_candidate:null,candidates:[]},human_verification_required:true,error_message:'Test photo needs manual review'}});
  });
  await page.getByRole('button',{name:'Live camera',exact:true}).click();await page.getByRole('button',{name:'Start camera',exact:true}).click();
  await page.getByRole('button',{name:'Capture packaging photo',exact:true}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('.camera-scanner-actions button:nth-child(2)').disabled);
  await page.getByRole('button',{name:'Capture packaging photo',exact:true}).click();
  await page.getByAltText('Packaging preview',{exact:true}).waitFor();
  await page.waitForFunction(()=>window.testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
  assert(captureRequest);report.captureRoutesToPackagingPreview=true;report.captureStopsCamera=true;
  await fs.mkdir('output/camera',{recursive:true});
  await fs.writeFile('output/camera/'+(base.startsWith('https:')?'live':'local')+'-checks.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}finally{await context.close();await browser.close();}
