import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateSimulator,MAX_HTML_BYTES} from '../supabase/functions/quiz/simulator-domain.mjs';
import {mountSimulator} from '../src/simulator-frame.js';
const catalog=[{kind:'subject',name:'Інформатика'},{kind:'subject',name:'Математика'},{kind:'subject',name:'Видалений',deleted_at:'2026-11-26'}];
const payload=()=>({title:'Світ об’єктів',classes:['2','3','2'],subjects:['Інформатика','Математика'],topic:'',description:'',published:false,filename:'game.html',html:'<!doctype html><title>Гра</title><script>document.body.textContent="Гра"</script>'});
test('multiple parallels and subjects are required; topic is optional; rename retains file',()=>{
 const b=payload(),r=validateSimulator(b,catalog);assert.deepEqual(r.classes,['2','3']);assert.equal(r.topic,'');assert.equal(r.subjects.length,2);
 for(const [key,value] of [['classes',[]],['subjects',[]],['classes',['2-А']],['classes',['13']],['subjects',['Видалений']],['subjects',['Чужий']]])assert.throws(()=>validateSimulator({...b,[key]:value},catalog));
 delete b.html;delete b.filename;b.title='Нова назва';assert.equal(validateSimulator(b,catalog,true).html,undefined);assert.throws(()=>validateSimulator(b,catalog,false));
});
test('HTML upload rejects non HTML and oversize UTF-8 content',()=>{
 assert.throws(()=>validateSimulator({...payload(),html:'console.log(1)'},catalog));
 assert.throws(()=>validateSimulator({...payload(),filename:'game.exe'},catalog));
 assert.throws(()=>validateSimulator({...payload(),html:'<!doctype html>'+ 'я'.repeat(MAX_HTML_BYTES/2)},catalog));
});
test('HTML stays in sandbox and cannot gain the platform origin or navigation rights',()=>{
 const attrs={};const frame={setAttribute:(k,v)=>attrs[k]=v};const html='<!doctype html><script>parent.document.body.innerHTML="attack"</script>';
 mountSimulator(frame,html,'Назва');assert.equal(attrs.sandbox,'allow-scripts allow-modals');assert.equal(frame.referrerPolicy,'no-referrer');assert.match(frame.srcdoc,/base-uri 'none'/);assert.match(frame.srcdoc,/form-action 'none'/);assert.equal(frame.title,'Назва');assert.ok(frame.srcdoc.endsWith(html));
 const viewer=readFileSync(new URL('../src/simulator-viewer.js',import.meta.url),'utf8');assert.ok(!viewer.includes('sessionStorage'));assert.ok(!viewer.includes('x-kd-token'));
});
