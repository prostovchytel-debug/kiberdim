import test from 'node:test';import assert from 'node:assert/strict';
let handler,user=null,calls=[];const owner='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222',aid='33333333-3333-4333-8333-333333333333';
const session={id:sid,owner,title:'QA',subject:'QA',classes:['9'],status:'closed',data:{scale:'points',sections:[],questions:[]},deleted_at:null};
const attempt={id:aid,session_id:sid,user_id:owner,name:'QA Student',class_name:'9',done:true,deleted_at:null,data:{questions:[],answers:[],index:0}};
globalThis.Deno={env:{get:n=>n==='SUPABASE_URL'?'https://test.invalid':'server-only'},serve:fn=>handler=fn};
globalThis.fetch=async(url,opts={})=>{const u=new URL(url),p=u.pathname.replace('/rest/v1/',''),q=u.searchParams;calls.push({p,q,body:opts.body?JSON.parse(opts.body):null});let rows=[];
if(p==='kd_auth')rows=user?[{user_id:owner,version:0}]:[];
if(p==='kd_users')rows=q.has('role')?[]:user?[user]:[];
if(p==='kd_sessions')rows=[session];if(p==='kd_attempts')rows=[attempt];
if(q.get('deleted_at')==='is.null')rows=rows.filter(r=>!r.deleted_at);if(q.get('deleted_at')==='not.is.null')rows=rows.filter(r=>r.deleted_at);
return Response.json(rows);};
await import('../supabase/functions/quiz/index.ts');
async function call(body){const r=await handler(new Request('https://test.invalid',{method:'POST',headers:{'x-kd-token':'qa'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}
test('only teacher roles may delete/restore; actor cannot be supplied by client',async()=>{
for(const role of [null,'student']){user=role?{id:owner,role}:null;for(const action of ['resultTrash','deletedResults'])assert.equal((await call({action,kind:'result',id:aid,restore:true})).status,403);}
user={id:owner,role:'teacher'};calls=[];assert.equal((await call({action:'resultTrash',kind:'result',id:aid,restore:true,p_actor:'forged'})).status,200);assert.deepEqual(calls.find(c=>c.p==='rpc/kd_trash_result').body,{p_actor:owner,p_kind:'result',p_id:aid,p_restore:true});
});
test('deleted results disappear from reports, journal and student history; deleted sessions are inaccessible',async()=>{
user={id:owner,role:'teacher'};attempt.deleted_at='2026-11-26';assert.deepEqual((await call({action:'sessionReport',id:sid})).body.students,[]);assert.deepEqual((await call({action:'journal'})).body.rows,[]);
user={id:owner,role:'student'};assert.deepEqual((await call({action:'history'})).body.results,[]);
attempt.deleted_at=null;session.deleted_at='2026-11-26';assert.deepEqual((await call({action:'history'})).body.results,[]);assert.equal((await call({action:'state',attemptToken:'x'.repeat(64)})).status,404);
user={id:owner,role:'teacher'};assert.equal((await call({action:'sessionReport',id:sid})).status,404);assert.deepEqual((await call({action:'tests'})).body.sessions,[]);assert.deepEqual((await call({action:'journal'})).body.columns,[]);
});
