import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';
const source=new URL('../src/lib/camera.ts',import.meta.url);
const loaded=new Module(source.pathname);
loaded._compile(ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,source.pathname);
const {stopCameraStream,cameraErrorMessage}=loaded.exports;
test('camera cleanup stops every track and tolerates an absent or late stream',()=>{
  let stops=0;
  stopCameraStream(null);stopCameraStream(undefined);
  stopCameraStream({getTracks:()=>[{stop(){stops++;}},{stop(){stops++;}}]});
  assert.equal(stops,2);
});
test('camera permission, missing device and busy device have actionable messages',()=>{
  for(const [name,word] of [['NotAllowedError','permission'],['NotFoundError','No camera'],['NotReadableError','busy']]){
    const error=new Error('private device details');error.name=name;
    const message=cameraErrorMessage(error);
    assert(message.includes(word));assert(!message.includes(error.message));
  }
});
