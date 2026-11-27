import {ensureDiagnostics,diagnosticIssues} from './diagnostics-model.js';
export const types={single:'Одна правильна',multi:'Кілька правильних',match:'Відповідність',sequence:'Послідовність',groups:'Категорії'};
const uid=()=>crypto.randomUUID();
export const blank=()=>({id:uid(),text:'',format:'text',image:''});
export function normalizeTest(input){
 const t=structuredClone(input);t.questions??=[];t.sections??=[];
 for(const q of t.questions){q.options??=[];q.groups??=[];
  if(['match','groups'].includes(q.type)&&!q.groupItems){
   const map=new Map();q.groupItems=q.groups.map(text=>{const g={...blank(),text};map.set(text,g.id);return g});
   q.groups=q.groupItems.map(g=>g.id);q.correct=Object.fromEntries(Object.entries(q.correct||{}).map(([k,v])=>[k,v===''?'':map.get(v)||v]));
  }
  if(q.type==='match')q.matchMode??='lines';
 }
 ensureDiagnostics(t);return t;
}
export function createQuestion(type,section){
 const options=Array.from({length:type==='groups'?3:4},blank),groupItems=['match','groups'].includes(type)?Array.from({length:type==='groups'?3:4},(_,i)=>({...blank(),text:type==='groups'?`Категорія ${i+1}`:''})):[];
 return {id:uid(),type,section,text:'',format:'text',image:'',points:1,seconds:type==='single'?30:45,options,groups:groupItems.map(g=>g.id),groupItems,matchMode:'lines',correct:type==='single'?'':['multi','sequence'].includes(type)?(type==='multi'?[]:options.map(o=>o.id)):Object.fromEntries(options.map((o,i)=>[o.id,groupItems[i].id])),explanation:'',skill:''};
}
export function duplicateQuestion(q){const copy=structuredClone(q),ids=new Map();copy.id=uid();copy.options.forEach(o=>{const old=o.id;o.id=uid();ids.set(old,o.id)});copy.correct=typeof q.correct==='string'?(ids.get(q.correct)||q.correct):Array.isArray(q.correct)?q.correct.map(id=>ids.get(id)):Object.fromEntries(Object.entries(q.correct).map(([id,v])=>[ids.get(id),v]));return copy;}
export const groupItem=(q,id)=>q.groupItems?.find(g=>g.id===id)||{id,text:id,format:'text',image:''};
export function testIssues(t){
 const errors=[];const add=(q,field,message)=>errors.push({questionId:q?.id||null,section:q?.section||null,field,message});
 if(!String(t.title||'').trim())add(null,'title','Укажіть назву тесту.');
 if(!String(t.subject||'').trim())add(null,'subject','Оберіть предмет.');
 if(!Number.isInteger(+t.grade)||+t.grade<1||+t.grade>12)add(null,'grade','Клас має бути від 1 до 12.');
 if(t.grades!=null&&(!Array.isArray(t.grades)||!t.grades.length||t.grades.some(g=>!Number.isInteger(g)||g<1||g>12)))add(null,'grade','Оберіть принаймні одну паралель (1–12).');
 const sections=t.sections||[],questions=t.questions||[];
 if(!sections.length||sections.length>30)add(null,'sections','Потрібно від 1 до 30 розділів.');
 if(!questions.length||questions.length>200)add(null,'questions','Потрібно від 1 до 200 запитань.');
 const qids=new Set();
 const media=(q,o,field,max)=>{if(!String(o.text||'').trim()&&!o.image)add(q,field,'Додайте текст або зображення.');if(String(o.text||'').length>max)add(q,field,`Максимум ${max} символів.`);if(o.image){try{if(new URL(o.image).protocol!=='https:')throw Error()}catch{add(q,field.replace(/text$/,'image'),'Посилання на зображення має починатися з https://.')}}};
 for(const q of questions){
  if(!q.id||qids.has(q.id))add(q,'text','Ідентифікатор запитання має бути унікальним.');qids.add(q.id);
  if(!types[q.type])add(q,'type','Оберіть тип запитання.');
  if(!sections.some(s=>s.id===q.section))add(q,'section','Оберіть розділ.');
  media(q,q,'text',12000);if(String(q.explanation||'').length>6000)add(q,'explanation','Пояснення: максимум 6000 символів.');
  if(!Number.isInteger(+q.points)||+q.points<1||+q.points>100)add(q,'points','Вартість: ціле число від 1 до 100.');
  if(!Number.isInteger(+q.seconds)||+q.seconds<5||+q.seconds>600||+q.seconds%5)add(q,'seconds','Час: 5–600 секунд із кроком 5.');
  const os=q.options||[],keys=os.map(o=>o.id);
  if(os.length<(q.type==='single'?3:2)||os.length>20)add(q,'options',q.type==='single'?'Потрібно від 3 до 20 варіантів.':'Потрібно від 2 до 20 елементів.');
  if(new Set(keys).size!==keys.length||keys.some(x=>!x))add(q,'options','Елементи мають мати різні ідентифікатори.');
  os.forEach(o=>media(q,o,`option.${o.id}.text`,6000));
  const c=q.correct;
  if(q.type==='single'&&!keys.includes(c))add(q,'correct','Позначте одну правильну відповідь.');
  if(['multi','sequence'].includes(q.type)&&(!Array.isArray(c)||new Set(c).size!==c.length||c.some(id=>!keys.includes(id))||c.length<(q.type==='multi'?2:keys.length)))add(q,'correct',q.type==='multi'?'Позначте щонайменше дві правильні відповіді.':'Упорядкуйте всі кроки.');
  if(['match','groups'].includes(q.type)){
   const gs=q.groups||[];if(gs.length<2||gs.length>20||new Set(gs).size!==gs.length)add(q,'groups','Потрібно від 2 до 20 різних правих частин / категорій.');
   const seen=new Set();for(const id of gs){const g=groupItem(q,id);if(q.groupItems&&!q.groupItems.some(g=>g.id===id))add(q,'groups','Втрачено опис категорії / правої частини.');media(q,g,`group.${id}.text`,6000);const signature=String(g.text||'').trim()+'|'+(g.image||'');if(seen.has(signature))add(q,`group.${id}.text`,'Назви / праві частини не повинні повторюватися.');seen.add(signature);}
   for(const o of os)if(!c||typeof c[o.id]!=='string'||(!gs.includes(c[o.id])&&!(q.type==='groups'&&c[o.id]==='')))add(q,`option.${o.id}.text`,'Елемент не прив’язаний до правильної пари або категорії.');
   if(q.type==='match'&&(gs.length!==os.length||new Set(Object.values(c||{})).size!==os.length))add(q,'groups','Кожна права частина має утворювати рівно одну пару.');
   if(q.type==='groups'&&!Object.values(c||{}).some(v=>gs.includes(v)))add(q,'groups','Додайте хоча б один елемент до категорії.');
  }
 }
 const sids=new Set();for(const s of sections){if(!s.id||sids.has(s.id)||!s.name?.trim())add(null,'sections','Заповніть назви та унікальні ідентифікатори розділів.');sids.add(s.id);const qs=questions.filter(q=>q.section===s.id),take=Number(s.take)||qs.length;let msg=!qs.length?'Розділ порожній.':take>qs.length?'Замало запитань для вибірки.':s.uniqueTypes&&take>new Set(qs.map(q=>q.type)).size?'Замало різних типів для вибірки.':'';if(msg)errors.push({questionId:qs[0]?.id||null,section:s.id,field:'sections',message:`${s.name}: ${msg}`});}
 return [...errors,...diagnosticIssues(t)];
}

export function prepareDraft(input){
 if(!input||!Array.isArray(input.sections)||input.sections.length>30||!Array.isArray(input.questions)||input.questions.length>200||JSON.stringify(input).length>2000000)throw Error('Некоректна або завелика чернетка.');
 if(input.sections.some(s=>!s||typeof s.id!=='string'||typeof s.name!=='string')||input.questions.some(q=>!q||!types[q.type]||typeof q.id!=='string'||typeof q.text!=='string'||!Array.isArray(q.options)||q.options.length>20||q.options.some(o=>!o||typeof o.id!=='string'||typeof o.text!=='string')||(q.groups&&!Array.isArray(q.groups))||(q.groupItems&&(!Array.isArray(q.groupItems)||q.groupItems.some(g=>!g||typeof g.id!=='string'||typeof g.text!=='string')))))throw Error('Неправильна структура запитань у чернетці.');
 const t=normalizeTest(input);t.title=String(t.title||'');t.subject=String(t.subject||'');t.topic=String(t.topic||'');t.isDraft=true;return t;
}
