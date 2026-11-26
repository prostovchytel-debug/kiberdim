import test from 'node:test';import assert from 'node:assert/strict';
let handler,user=null,calls=[];const id='c28395c1-7f8c-4c69-a6f1-589ae225255d';
const sim={id,title:'Гра',classes:['2'],subjects:['Інформатика'],topic:'',description:'',published:false,deleted_at:null,html:'<!doctype html><title>Гра</title>',filename:'game.html'};
globalThis.Deno={env:{get:n=>n==='SUPABASE_URL'?'https://test.invalid':'server-only'},serve:fn=>handler=fn};
globalThis.fetch=async(url,options={})=>{const u=new URL(url),p=u.pathname.replace('/rest/v1/',''),q=u.searchParams;calls.push({p,query:q.toString(),method:options.method,body:options.body&&JSON.parse(options.body)});let data=[];
 if(p==='kd_auth')data=user?[{user_id:user.id,version:0}]:[];
 if(p==='kd_users')data=user?[user]:[];
 if(p==='kd_catalog')data=[{kind:'subject',name:'Інформатика'}];
 if(p==='kd_simulators'){data=q.get('published')==='eq.true'&&!sim.published?[]:[{...sim}];if(q.has('select'))data=data.map(s=>Object.fromEntries(q.get('select').split(',').map(k=>[k,s[k]])));}
 return Response.json(data);};
await import('../supabase/functions/quiz/index.ts');
const call=async body=>{const r=await handler(new Request('https://test.invalid',{method:'POST',headers:{'content-type':'application/json','x-kd-token':'test'},body:JSON.stringify(body)}));return {status:r.status,data:await r.json()};};
test('public readers cannot see drafts or edit, publish, delete and restore',async()=>{
 for(const role of [null,'student','teacher']){user=role?{id,role}:null;assert.equal((await call({action:'simulatorGet',id})).status,404);assert.deepEqual((await call({action:'simulators'})).data.simulators,[]);
 for(const action of ['simulatorSave','simulatorTrash'])assert.equal((await call({action,id,restore:true,...sim,published:true})).status,403);
 assert.equal((await call({action:'simulators',deleted:true})).status,403);}
 sim.published=true;user=null;assert.equal((await call({action:'simulatorGet',id})).data.simulator.html,sim.html);const list=await call({action:'simulators'});assert.equal(list.data.simulators[0].html,undefined);
});
test('admin can rename without replacing HTML; publication changes are persisted',async()=>{
 user={id,role:'admin'};calls=[];const {html,filename,...metadata}=sim;const r=await call({action:'simulatorSave',...metadata,title:'Перейменовано',published:false});assert.equal(r.status,200);const write=calls.find(x=>x.p==='kd_simulators'&&x.method==='PATCH');assert.equal(write.body.title,'Перейменовано');assert.equal(write.body.html,undefined);assert.equal(write.body.published,false);
});
