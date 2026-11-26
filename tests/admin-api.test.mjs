import test from 'node:test';
import assert from 'node:assert/strict';
let handle, user=null, writes=[];
globalThis.Deno={env:{get:n=>n==='SUPABASE_URL'?'https://test.invalid':'test-server-key'},serve:fn=>{handle=fn;}};
globalThis.fetch=async (url,options={})=>{
 const parsed=new URL(url);const p=parsed.pathname.replace('/rest/v1/','')+parsed.search;
 const data=options.body?JSON.parse(options.body):null;
 if(options.method&&options.method!=='GET')writes.push({p,data});
 let result=[];
 if(p.startsWith('kd_auth?'))result=user?[{user_id:user.id,version:0}]:[];
 else if(p.startsWith('kd_users?id='))result=user?[user]:[];
 else if(p.startsWith('kd_users?select='))result=[];
 else if(p.startsWith('rpc/kd_import_users'))result=data.p_rows.map(r=>({id:crypto.randomUUID(),login:r.login,importKey:r.importKey}));
 return Response.json(result);
};
await import('../supabase/functions/quiz/index.ts');
const call=async body=>{const r=await handle(new Request('https://test.invalid/quiz',{method:'POST',headers:{'content-type':'application/json','x-kd-token':'test'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};};
const account=role=>({id:crypto.randomUUID(),role,auth_version:0,blocked:false,must_change:false,deleted_at:null});
const row=()=>({importKey:crypto.randomUUID(),row:2,role:'student',name:'Перевірка Учня',login:'qa_student',className:'7-А',subjects:[],temporaryPassword:'test-generated-password-12345'});
test('only administrators may import or delete users/catalog; teachers may not elevate through payloads',async()=>{
 for(const role of [null,'student','teacher']){
  user=role?account(role):null;
  for(const action of ['importPreview','importUsers'])assert.equal((await call({action,rows:[row()]})).status,403);
  assert.equal((await call({action:'trash',kind:'user',id:crypto.randomUUID()})).status,403);
 }
 user=account('admin');const bad=row();bad.role='admin';assert.equal((await call({action:'importPreview',rows:[bad]})).body.valid,false);
});
test('import hashes passwords server-side and returns no plaintext or hashes',async()=>{
 user=account('admin');writes=[];
 const result=await call({action:'importUsers',rows:[row()]});assert.equal(result.status,200);
 const saved=writes.find(x=>x.p==='rpc/kd_import_users').data.p_rows[0];assert.match(saved.password_hash,/^[a-f0-9-]+:[a-f0-9]{64}$/);assert.equal(saved.temporaryPassword,undefined);
 assert.equal(JSON.stringify(result.body).includes('password'),false);
 assert.equal((await call({action:'importUsers',rows:Array.from({length:6},row)})).status,400);
});
