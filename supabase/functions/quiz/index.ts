import {solveSelection} from './selection.js';
import {studentReport,diagnosticIssues} from './diagnostics-model.js';
import {prepareDraft} from './editor-model.js';
import {validateSimulator,MAX_HTML_BYTES} from './simulator-domain.mjs';
import {validateImport} from './admin-domain.mjs';
import {validateTest,variant,publicQuestion,scoreQuestion,report,grade,clock,text,uid,equal,fail} from './domain.mjs';
const URL=Deno.env.get('SUPABASE_URL')!, KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers={'apikey':KEY,'Authorization':`Bearer ${KEY}`,'Content-Type':'application/json','Prefer':'return=representation'};
async function db(path:string,method='GET',body?:unknown){const r=await fetch(URL+'/rest/v1/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok){const e=await r.json().catch(()=>({}));if(r.status===409)fail('Такий запис уже існує. Перевірте логін або повторіть запуск.',409);throw new Error(e.message||'Помилка збереження. Спробуйте ще раз.');}return r.status===204?null:await r.json();}
async function allRows(path:string){const result=[];for(let offset=0;;offset+=1000){const page=await db(`${path}&offset=${offset}&limit=1000`);result.push(...page);if(page.length<1000)return result;}}
const one=async(p:string)=>(await db(p))[0]??null;
const rpc=(n:string,b:unknown)=>db('rpc/'+n,'POST',b);
const hex=(a:ArrayBuffer)=>Array.from(new Uint8Array(a)).map(n=>n.toString(16).padStart(2,'0')).join('');
const digest=async(s:string)=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
const token=()=>hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
async function password(p:string,salt:string,iterations=600000){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(p),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations,hash:'SHA-256'},k,256));}
async function verify(u:any,p:string){const [salt,hash]=(u?.password_hash||'unavailable:').split(':');return equal(await password(p,salt,u?.iterations||600000),hash)&&!!u;}
function passwordValid(p:unknown){if(typeof p!=='string'||p.length<10||p.length>128)fail('Пароль: від 10 до 128 символів.');return p;}
function safe(u:any){if(!u)return null;const {password_hash,iterations,auth_version,import_key,...v}=u;return v;}
async function limit(key:string,max:number,seconds=600){if(!await rpc('kd_limit',{p_key:await digest(key),p_max:max,p_seconds:seconds}))fail('Забагато спроб. Зачекайте кілька хвилин.',429);}
async function auth(raw:string){if(!raw)return null;const s=await one(`kd_auth?token_hash=eq.${await digest(raw)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`);if(!s)return null;return one(`kd_users?id=eq.${s.user_id}&blocked=eq.false&deleted_at=is.null&auth_version=eq.${s.version}`);}
async function issue(u:any){const t=token();await db('kd_auth','POST',{token_hash:await digest(t),user_id:u.id,version:u.auth_version,expires_at:new Date(Date.now()+7*86400000).toISOString()});return {token:t,user:safe(u)};}
function teacher(u:any){if(!u||!['admin','teacher'].includes(u.role))fail('Потрібен вхід учителя.',403);}
function admin(u:any){if(u?.role!=='admin')fail('Лише адміністратор.',403);}
const ids=(s:unknown)=>{const x=String(s||'');if(!/^[a-f0-9-]{36}$/.test(x))fail('Неправильний ідентифікатор.');return x;};
const list=(x:unknown,n=40)=>{if(!Array.isArray(x)||x.length>n||x.some(v=>typeof v!=='string'||!v.trim()||v.length>100))fail('Перевірте список.');return [...new Set(x.map(v=>v.trim()))];};
async function owned(table:string,id:unknown,u:any){const r=await one(`${table}?id=eq.${ids(id)}&owner=eq.${u.id}`);if(!r)fail('Запис не знайдено.',404);return r;}
async function attempt(raw:string){if(typeof raw!=='string'||raw.length!==64)fail('Спробу не знайдено.',404);const h=await digest(raw);const a=await one(`kd_attempts?token_hash=eq.${h}&deleted_at=is.null`);if(!a)fail('Спробу не знайдено.',404);const s=await one(`kd_sessions?id=eq.${a.session_id}&deleted_at=is.null`);if(!s)fail("Сеанс видалено.",404);return {a,s,h};}
async function state(raw:string){
 for(let retry=0;retry<3;retry++){
 const {a,s,h}=await attempt(raw);const d=a.data;
 if(!a.done&&s.status==='active'&&d.started===null){d.started=clock(s);const ok=await rpc('kd_commit_attempt',{p_id:a.id,p_token:h,p_revision:a.revision,p_session_revision:s.revision,p_data:d,p_done:false});if(!ok)continue;}
 const r={id:a.id,title:s.title,subject:s.subject,status:s.status,done:a.done,index:d.index,count:d.questions.length,timer:s.data.timer,feedback:s.data.feedback,scale:s.data.scale,name:a.name,className:a.class_name,serverNow:Date.now()};
 if(a.done)return {...r,result:{...studentReport(report(s.data,d.questions,d.answers)),teacherComment:a.comment_visible?a.teacher_comment||'':''}};
 if(s.status==='closed'||s.status==='cancelled')return {...r,stopped:true};
 const q=d.questions[d.index];return {...r,question:publicQuestion(q),remainingMs:s.data.timer?Math.max(0,q.seconds*1000-(clock(s)-d.started)):null};
 }fail('Стан змінився. Оновіть сторінку.',409);
}
async function handle(b:any,u:any,ip:string,rawAuth:string){
 if(!b||typeof b!=='object'||Array.isArray(b))fail('Неправильний формат запиту.');
 const action=b.action;
 if(action==='health')return {ok:true,version:'2.4.0'};
 if(action==='login'){
 const login=text(b.login,80).toLowerCase(),p=String(b.password||'');if(!p||p.length>128)fail('Перевірте пароль.');if(!/^[a-z0-9_.@-]{3,80}$/.test(login))fail('Перевірте логін.');await limit('login-ip:'+ip,200);await limit('login:'+login+':'+ip,20);const user=await one('kd_users?login=eq.'+encodeURIComponent(login));if(!await verify(user,p)||user.blocked||user.deleted_at)fail('Неправильний логін чи пароль або доступ призупинено.',401);return issue(user);
 }
 if(action==='me')return {user:safe(u)};
 if(action==='logout'){if(rawAuth)await db('kd_auth?token_hash=eq.'+await digest(rawAuth),'DELETE');return {ok:true};}
 if(action==='changePassword'){
 if(!u)fail('Увійдіть до кабінету.',401);await limit('password:'+u.id,10);const p=passwordValid(b.newPassword);if(p===b.currentPassword||!await verify(u,String(b.currentPassword||'')))fail('Перевірте поточний пароль. Новий має відрізнятися.');const salt=uid();const next=await db(`kd_users?id=eq.${u.id}&auth_version=eq.${u.auth_version}`,'PATCH',{password_hash:salt+':'+await password(p,salt),iterations:600000,must_change:false,auth_version:u.auth_version+1});if(!next.length)fail('Повторіть вхід.',409);return issue(next[0]);
 }
 if(u?.must_change)fail('Спочатку змініть тимчасовий пароль.',403);
 if(action==='lookup'){
 const pin=String(b.code||'');if(!/^\d{6}$/.test(pin))fail('Код має містити 6 цифр.');await limit('lookup:'+ip,150,300);const s=await one(`kd_sessions?code=eq.${pin}&status=in.(active,paused)&select=id,title,subject,classes,status,data`);if(!s)fail('Активний тест за цим кодом не знайдено.',404);return {title:s.title,subject:s.subject,classes:s.classes,status:s.status,timer:s.data.timer,scale:s.data.scale};
 }
 if(action==='join'){
 await limit('join:'+ip,200,600);const pin=String(b.code||'');if(!/^\d{6}$/.test(pin))fail('Перевірте код.');const s=await one(`kd_sessions?code=eq.${pin}&status=eq.active`);if(!s)fail('Тест ще не розпочато, призупинено або завершено.',404);
 const name=u?.role==='student'?u.name:text(b.name,100).replace(/\s+/g,' '),cl=u?.role==='student'?u.class_name:text(b.className,30);if(name.split(' ').length<2)fail('Введіть прізвище та ім’я.');if(!s.classes.includes(cl))fail('Цей клас не бере участі в сеансі.');
 const t=token(),qs=variant(s.data);await rpc('kd_join',{p_session:s.id,p_token:await digest(t),p_user:u?.role==='student'?u.id:null,p_name:name,p_class:cl,p_data:{questions:qs,index:0,answers:[],started:null}});return {attemptToken:t,...await state(t)};
 }
 if(action==='attemptStatus'){const {a,s}=await attempt(b.attemptToken);return {status:s.status,done:a.done};}
 if(action==='state')return state(b.attemptToken);
 if(action==='answer'){
 const {a,s,h}=await attempt(b.attemptToken),d=a.data;const idx=Number(b.index);
 if(Number.isInteger(idx)&&idx>=0&&idx<d.index){const old=d.answers[idx];return {accepted:true,done:a.done,index:d.index,feedback:s.data.feedback?old.review:null};}
 if(a.done||s.status!=='active')fail(s.status==='paused'?'Тест на паузі.':'Сеанс завершено.',409);
 if(idx!==d.index||d.started===null)fail('Оновіть поточне запитання.',409);
 const q=d.questions[idx],expired=s.data.timer&&clock(s)>d.started+q.seconds*1000+1000;
 const value=expired?null:b.value;const points=scoreQuestion(q,value);const review={points,max:q.points,correct:q.correct,explanation:q.explanation,value,expired};
 d.answers.push({id:q.id,type:q.type,section:q.section,points,max:q.points,value,expired,review});d.index++;d.started=null;
 const done=d.index===d.questions.length;const ok=await rpc('kd_commit_attempt',{p_id:a.id,p_token:h,p_revision:a.revision,p_session_revision:s.revision,p_data:d,p_done:done});if(!ok)fail('Стан змінився. Спробуйте надіслати відповідь ще раз.',409);return {accepted:true,done,index:d.index,feedback:s.data.feedback?review:null};
 }
 if(action==='history'){
 if(!u||u.role!=='student')fail('Увійдіть до учнівського профілю.',403);const aa=await db(`kd_attempts?user_id=eq.${u.id}&deleted_at=is.null&done=eq.true&order=created_at.desc&limit=200`);const result=[];for(const a of aa){const s=await one(`kd_sessions?id=eq.${a.session_id}&deleted_at=is.null`);if(!s)continue;result.push({id:a.id,name:a.name,className:a.class_name,title:s.title,subject:s.subject,date:a.finished_at,testId:s.test_id,scale:s.data.scale,...studentReport(report(s.data,a.data.questions,a.data.answers)),teacherComment:a.comment_visible?a.teacher_comment||'':''});}return {results:result};
 }
 if(action==='simulators'){
 const isAdmin=u?.role==='admin';if(b.deleted&&!isAdmin)admin(u);
 const select='id,title,classes,subjects,topic,description,filename,published,created_at,updated_at,deleted_at';
 return {simulators:await allRows(`kd_simulators?select=${select}&deleted_at=${b.deleted?'not.is.null':'is.null'}${isAdmin?'':'&published=eq.true'}&order=updated_at.desc,id`)};
 }
 if(action==='simulatorGet'){
 const s=await one(`kd_simulators?id=eq.${ids(b.id)}&deleted_at=is.null${u?.role==='admin'?'':'&published=eq.true'}`);
 if(!s)fail('Симулятор не оприлюднений або його видалено.',404);return {simulator:s};
 }
 if(action==='simulatorSave'){
 admin(u);const id=ids(b.id),old=await one(`kd_simulators?id=eq.${id}`);if(old?.deleted_at)fail('Спочатку відновіть симулятор.',409);
 const catalog=await allRows('kd_catalog?select=kind,name,deleted_at&order=id');const data=validateSimulator(b,catalog,!!old);
 const values={...data,updated_at:new Date().toISOString()};
 if(old)await db(`kd_simulators?id=eq.${id}&deleted_at=is.null`,'PATCH',values);else await db('kd_simulators','POST',{id,owner:u.id,...values});
 return {ok:true,id};
 }
 if(action==='simulatorTrash'){
 admin(u);const id=ids(b.id),old=await one(`kd_simulators?id=eq.${id}`);if(!old)fail('Симулятор не знайдено.',404);
 await db(`kd_simulators?id=eq.${id}`,'PATCH',{deleted_at:b.restore===true?null:new Date().toISOString(),updated_at:new Date().toISOString()});return {ok:true};
 }
 if(action==='trash'){
 if(b.kind==='test')teacher(u);else admin(u);
 await rpc('kd_trash',{p_actor:u.id,p_kind:b.kind,p_id:ids(b.id),p_restore:b.restore===true});return {ok:true};
 }
 if(action==='deleted'){
 teacher(u);return {users:u.role==='admin'?(await allRows('kd_users?deleted_at=not.is.null&order=deleted_at.desc,id')).map(safe):[],items:u.role==='admin'?await db('kd_catalog?deleted_at=not.is.null&order=name'):[],tests:await db(`kd_tests?owner=eq.${u.id}&deleted_at=not.is.null&order=deleted_at.desc&limit=1000`)};
 }
 if(action==='importPreview'||action==='importUsers'){
 admin(u);
 if(action==='importUsers'&&(!Array.isArray(b.rows)||b.rows.length>5))fail('Пакет має містити не більше 5 користувачів.');
 const existing=[];for(let offset=0;;offset+=1000){const page=await db(`kd_users?select=login,name,role,class_name,subjects,deleted_at,import_key&order=id&offset=${offset}&limit=1000`);existing.push(...page);if(page.length<1000)break;}
 const catalog=await db('kd_catalog?select=kind,name,deleted_at');
 const preview=validateImport(b.rows,existing,catalog);
 if(action==='importPreview')return preview;
 if(!preview.valid)fail(preview.rows.filter((r:any)=>r.errors.length).map((r:any)=>`Рядок ${r.row}: ${r.errors.join(' ')}`).join(' '));
 const rows=[];
 for(let i=0;i<preview.rows.length;i++){
  const r=preview.rows[i],old=existing.find((x:any)=>x.import_key===r.importKey);
  if(old){rows.push(r);continue;}
  const p=passwordValid(b.rows[i].temporaryPassword),salt=uid();rows.push({...r,password_hash:salt+':'+await password(p,salt)});
 }
 return {created:await rpc('kd_import_users',{p_actor:u.id,p_rows:rows})};
 }
 if(action==='catalog'){if(!u)fail('Увійдіть до кабінету.',401);return {items:await db('kd_catalog?deleted_at=is.null&order=name')};}
 if(action==='catalogAdd'){admin(u);if(!['class','subject'].includes(b.kind))fail('Перевірте тип.');const name=text(b.name,100);if(!name)fail('Введіть назву.');await db('kd_catalog','POST',{kind:b.kind,name});return {ok:true};}
 if(action==='users'){admin(u);return {users:(await allRows('kd_users?deleted_at=is.null&order=name,id')).map(safe)};}
 if(action==='userCreate'){
 admin(u);const role=b.role==='teacher'?'teacher':'student',login=text(b.login,80).toLowerCase(),name=text(b.name,100).replace(/\s+/g,' '),subjects=role==='teacher'?list(b.subjects):[],class_name=role==='student'?text(b.className,30):'';
 if(!/^[a-z0-9_.@-]{3,80}$/.test(login)||name.split(' ').length<(role==='teacher'?3:2)||role==='teacher'&&!subjects.length||role==='student'&&!class_name)fail('Перевірте логін, ПІБ, предмети та клас.');const p=token().slice(0,18)+'aB7!',salt=uid();const [user]=await db('kd_users','POST',{login,name,role,subjects,class_name,password_hash:salt+':'+await password(p,salt)});await db('kd_audit','POST',{actor:u.id,action:'create-user',target:user.id});return {user:safe(user),temporaryPassword:p};
 }
 if(action==='userReset'||action==='userBlock'||action==='userUpdate'){
 admin(u);const user=await one(`kd_users?id=eq.${ids(b.id)}`);if(!user||user.deleted_at)fail('Користувача не знайдено.',404);if(user.id===u.id&&action!=='userUpdate')fail('Свій пароль змінюйте в налаштуваннях.');
 if(action==='userReset'){const p=token().slice(0,18)+'aB7!',salt=uid();await db(`kd_users?id=eq.${user.id}`,'PATCH',{password_hash:salt+':'+await password(p,salt),iterations:600000,must_change:true,auth_version:user.auth_version+1});await db('kd_audit','POST',{actor:u.id,action:'reset-password',target:user.id});return {login:user.login,temporaryPassword:p};}
 if(action==='userBlock'){await db(`kd_users?id=eq.${user.id}`,'PATCH',{blocked:!!b.blocked,auth_version:user.auth_version+1});return {ok:true};}
 const name=text(b.name,100),subjects=user.role==='student'?[]:list(b.subjects),class_name=user.role==='student'?text(b.className,30):'';if(!name||user.role==='student'&&!class_name)fail('Заповніть ім’я та клас.');await db(`kd_users?id=eq.${user.id}`,'PATCH',{name,subjects,class_name});return {ok:true};
 }
 teacher(u);
 if(action==='diagnosticBank')return {entries:await db(`kd_diagnostic_bank?owner=eq.${u.id}&subject=eq.${encodeURIComponent(text(b.subject,100))}&order=updated_at.desc&limit=500`)};
 if(action==='diagnosticBankSave'){
 const subject=text(b.subject,100),kind=b.kind,entry=b.entry;if(!subject||!['skills','resultGroups','materials'].includes(kind)||!entry)fail('Оберіть предмет і тип запису.');
 if(u.role!=='admin'&&!u.subjects.includes(subject))fail('Оберіть свій предмет.',403);
 const data=structuredClone(entry);ids(data.id);
 const test={sections:[],questions:[],diagnostics:kind==='materials'?{skills:[{id:'material',name:'Матеріал',materials:[data]}]}:{[kind]:[data]}};
 const errors=diagnosticIssues(test);if(errors.length)fail(errors[0].message);
 const existing=await one(`kd_diagnostic_bank?id=eq.${data.id}`);if(existing&&existing.owner!==u.id)fail('Чужий запис.',403);
 if(existing)await db(`kd_diagnostic_bank?id=eq.${data.id}&owner=eq.${u.id}`,'PATCH',{subject,kind,data,updated_at:new Date().toISOString()});else await db('kd_diagnostic_bank','POST',{id:data.id,owner:u.id,subject,kind,data});return {ok:true};
 }
 if(action==='diagnosticBankDelete'){await owned('kd_diagnostic_bank',b.id,u);await db(`kd_diagnostic_bank?id=eq.${ids(b.id)}&owner=eq.${u.id}`,'DELETE');return {ok:true};}
 if(action==='reportComment'){
 const a=await one(`kd_attempts?id=eq.${ids(b.id)}&deleted_at=is.null`);if(!a||!a.done)fail('Завершений результат не знайдено.',404);
 const session=await owned('kd_sessions',a.session_id,u);if(session.deleted_at)fail('Сеанс видалено.',404);
 if(typeof b.comment!=='string'||b.comment.length>4000)fail('Коментар: максимум 4000 символів.');
 await db(`kd_attempts?id=eq.${a.id}`,'PATCH',{teacher_comment:b.comment,comment_visible:b.visible===true});return {ok:true};
 }
 if(action==='resultTrash'){await rpc('kd_trash_result',{p_actor:u.id,p_kind:b.kind,p_id:ids(b.id),p_restore:b.restore===true});return {ok:true};}
 if(action==='deletedResults'){
 const ss=await allRows(`kd_sessions?owner=eq.${u.id}&order=created_at.desc,id`),sessions=[],results=[];
 for(const s of ss){if(s.deleted_at){sessions.push({id:s.id,title:s.title,classes:s.classes,deleted_at:s.deleted_at});continue;}
 const aa=await allRows(`kd_attempts?session_id=eq.${s.id}&deleted_at=not.is.null&select=id,name,class_name,deleted_at&order=deleted_at.desc,id`);
 results.push(...aa.map((a:any)=>({...a,title:s.title,sessionId:s.id})));}return {sessions,results};
 }
 if(action==='tests')return {tests:await db(`kd_tests?owner=eq.${u.id}&deleted_at=is.null&order=updated_at.desc`),sessions:await db(`kd_sessions?owner=eq.${u.id}&deleted_at=is.null&select=id,title,subject,code,classes,status,created_at,ended_at&order=created_at.desc&limit=200`)};
 if(action==='saveTest'){
 const t=b.draft===true?prepareDraft(b.test):validateTest(b.test);t.isDraft=b.draft===true;ids(t.id);if(u.role!=='admin'&&!u.subjects.includes(t.subject))fail('Оберіть предмет зі своєї картки.',403);
 const existing=await one(`kd_tests?id=eq.${t.id}`);if(existing?.deleted_at)fail('Спочатку відновіть тест у розділі «Видалені».',409);if(existing&&existing.owner!==u.id)fail('Цей тест належить іншому вчителю.',403);
 t.author=u.name;if(existing)await db(`kd_tests?id=eq.${t.id}&owner=eq.${u.id}`,'PATCH',{data:t,updated_at:new Date().toISOString()});else await db('kd_tests','POST',{id:t.id,owner:u.id,data:t});return {test:t};
 }
 if(action==='launch'){
 const t=await owned('kd_tests',b.id,u),classes=list(b.classes);if(!classes.length)fail('Оберіть класи.');const catalog=await db('kd_catalog?kind=eq.class&deleted_at=is.null');if(classes.some(c=>!catalog.some((x:any)=>x.name===c)))fail('Додайте клас у довідник адміністратора.');
 if(t.deleted_at)fail('Тест видалено.',404);if(t.data.isDraft)fail('Спочатку збережіть готовий тест.');const data=validateTest(t.data);if(b.plan){solveSelection(data,b.plan);data.launchPlan=b.plan;}for(let i=0;i<8;i++){const code=String(100000+crypto.getRandomValues(new Uint32Array(1))[0]%900000);try{const [s]=await db('kd_sessions','POST',{owner:u.id,test_id:t.id,code,title:data.title,subject:data.subject,classes,data});return {session:{id:s.id,code:s.code,title:s.title}};}catch(e){if(e.status!==409)throw e;}}fail('Не вдалося створити код. Повторіть запуск.');
 }
 if(action==='sessionAction'){await owned('kd_sessions',b.id,u);if(!['pause','resume','close','cancel'].includes(b.command))fail('Невідома дія.');await rpc('kd_session_action',{p_id:b.id,p_owner:u.id,p_action:b.command});return {ok:true};}
 if(action==='sessionReport'){
 const s=await owned('kd_sessions',b.id,u);if(s.deleted_at)fail('Сеанс видалено.',404);const aa=await db(`kd_attempts?session_id=eq.${s.id}&deleted_at=is.null&order=created_at&limit=1000`);const students=aa.map((a:any)=>({id:a.id,userId:a.user_id,name:a.name,className:a.class_name,done:a.done,index:a.data.index,count:a.data.questions.length,created:a.created_at,result:a.done?{...report(s.data,a.data.questions,a.data.answers),teacherComment:a.teacher_comment||'',commentVisible:a.comment_visible===true}:null,answers:a.data.answers.map((v:any)=>({id:v.id,type:v.type,section:v.section,points:v.points,max:v.max,value:v.value,expired:v.expired})),questionIds:a.data.questions.map((q:any)=>q.id)}));
 const enrolled=await db(`kd_users?role=eq.student&blocked=eq.false&deleted_at=is.null&select=id,name,class_name`);const roster=enrolled.filter((a:any)=>s.classes.includes(a.class_name));return {session:{id:s.id,title:s.title,subject:s.subject,code:s.code,status:s.status,classes:s.classes,created:s.created_at,scale:s.data.scale},students,roster,sections:s.data.sections,questions:s.data.questions};
 }
 if(action==='journal'){
 const ss=await db(`kd_sessions?owner=eq.${u.id}&deleted_at=is.null&order=created_at&limit=200`),columns=[],rows=new Map();
 const roster=await db('kd_users?role=eq.student&blocked=eq.false&deleted_at=is.null&select=id,name,class_name');
 for(const s of ss){const aa=await db(`kd_attempts?session_id=eq.${s.id}&deleted_at=is.null&order=created_at&limit=1000`);if(s.status==='cancelled'&&!aa.some((a:any)=>a.done))continue;columns.push({id:s.id,title:s.title,subject:s.subject,classes:s.classes,date:s.created_at,status:s.status,scale:s.data.scale});for(const r of roster.filter((r:any)=>s.classes.includes(r.class_name)))if(!rows.has(r.id))rows.set(r.id,{id:r.id,name:r.name,className:r.class_name,verified:true,cells:{}});
 for(const a of aa){const key=a.user_id||'guest:'+a.class_name+':'+a.name;const row=rows.get(key)||{id:key,name:a.name,className:a.class_name,verified:!!a.user_id,cells:{}};const rr=a.done?report(s.data,a.data.questions,a.data.answers):null;const previous=row.cells[s.id];if(!previous||rr)row.cells[s.id]=rr?{attemptId:a.id,mark:rr.mark,level:rr.level,percent:rr.percent,status:'done'}:{attemptId:a.id,status:s.status==='cancelled'?'cancelled':s.status==='closed'?'missing':'active'};rows.set(key,row);}
 }
 for(const row of rows.values())for(const s of columns)if(s.classes.includes(row.className)&&!row.cells[s.id])row.cells[s.id]={status:s.status==='cancelled'?'cancelled':s.status==='closed'?'missing':'waiting'};
 return {columns,rows:[...rows.values()].sort((a,b)=>a.className.localeCompare(b.className,'uk')||a.name.localeCompare(b.name,'uk'))};
 }
 fail('Невідома дія.',404);
}
Deno.serve(async(req:Request)=>{
 const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type, apikey, x-kd-token, authorization','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 try{
 if(req.method!=='POST')fail('Використайте POST.',405);const rawAuth=req.headers.get('x-kd-token')||'',u=await auth(rawAuth);let raw='';const decoder=new TextDecoder();const reader=req.body?.getReader();if(reader){let bytes=0;while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>(u?.role==='admin'?MAX_HTML_BYTES*6+10000:u?.role==='teacher'?2100000:350000)){await reader.cancel();fail('Завеликий запит.',413);}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}
 let b;try{b=JSON.parse(raw)}catch{fail('Неправильний формат запиту.');}
 const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
 return Response.json(await handle(b,u,ip,rawAuth),{headers:cors});
 }catch(e){return Response.json({error:e.message||'Помилка сервера.',issues:e.issues},{status:e.status||400,headers:cors});}
});

