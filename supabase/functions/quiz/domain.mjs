export const TYPES = {single:'Одна правильна',multi:'Кілька правильних',match:'Відповідність',sequence:'Послідовність',groups:'Категорії'};
export const uid = () => crypto.randomUUID();
export const text = (x,n=3000) => String(x??'').trim().slice(0,n);
export function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
export function imageUrl(value){const s=text(value,1500);if(!s)return '';let u;try{u=new URL(s)}catch{fail('Перевірте посилання на зображення.')}if(u.protocol!=='https:')fail('Зображення має використовувати HTTPS.');if(u.hostname==='drive.google.com'){const id=u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1]||u.searchParams.get('id');if(id&&/^[\w-]+$/.test(id))return `https://drive.google.com/thumbnail?id=${id}&sz=w1200`;}return u.href;}
export function contentText(value,max=12000){const s=String(value??'').replace(/\r\n?/g,'\n');if(s.length>max)fail(`Текст завеликий: максимум ${max} символів.`);return s;}
const bool=v=>v===true;
export function validateTest(input){
 const t=structuredClone(input||{});t.id=typeof t.id==='string'?t.id:uid();t.title=text(t.title,160);t.subject=text(t.subject,100);t.topic=text(t.topic,160);t.grade=Number(t.grade);if(!t.title||!t.subject||!Number.isInteger(t.grade)||t.grade<1||t.grade>12)fail('Укажіть назву, предмет і клас (1–12).');
 t.timer=bool(t.timer);t.feedback=bool(t.feedback);t.shuffleQuestions=bool(t.shuffleQuestions);t.shuffleAnswers=bool(t.shuffleAnswers);t.scale=t.scale==='level'?'level':'points';
 if(!Array.isArray(t.sections)||!t.sections.length||t.sections.length>30)fail('Додайте від 1 до 30 розділів.');
 const ids=new Set();t.sections=t.sections.map(s=>{if(!s.id||ids.has(s.id))fail('Розділи мають мати різні ідентифікатори.');ids.add(s.id);return {id:text(s.id,100),name:text(s.name,180)||'Розділ',advice:text(s.advice,1000),take:Math.max(0,Math.floor(Number(s.take)||0)),uniqueTypes:bool(s.uniqueTypes)};});
 if(!Array.isArray(t.questions)||!t.questions.length||t.questions.length>200)fail('Додайте від 1 до 200 запитань.');const qids=new Set();
 t.questions=t.questions.map(q=>{
  if(!TYPES[q.type]||!ids.has(q.section)||!q.id||qids.has(q.id))fail('Перевірте тип, розділ та ідентифікатор запитання.');qids.add(q.id);
  const seconds=Number(q.seconds??(q.type==='single'?30:45)),points=Number(q.points??1);if(!Number.isInteger(seconds)||seconds<5||seconds>600||seconds%5)fail('Таймер: від 5 до 600 секунд, крок 5.');if(!Number.isInteger(points)||points<1||points>100)fail('Бали за запитання: ціле число від 1 до 100.');
  const opts=Array.isArray(q.options)?q.options.map(o=>({id:text(o.id,100),text:contentText(o.text,6000),format:o.format==='code'?'code':'text',image:imageUrl(o.image)})):[];
  if(opts.length<(q.type==='single'?3:2)||opts.length>20||new Set(opts.map(o=>o.id)).size!==opts.length||opts.some(o=>!o.id||(!o.text.trim()&&!o.image)))fail('Заповніть варіанти: для одиночного вибору — від 3, для інших типів — від 2.');
  const keys=opts.map(o=>o.id),groups=Array.isArray(q.groups)?q.groups.map(g=>text(g,200)):[];let correct=q.correct;
  if(q.type==='single'&&!keys.includes(correct))fail('Позначте одну правильну відповідь.');
  if(['multi','sequence'].includes(q.type)&&(!Array.isArray(correct)||!correct.length||new Set(correct).size!==correct.length||correct.some(c=>!keys.includes(c))))fail('Позначте правильні відповіді.');
  if(q.type==='multi'&&correct.length<2)fail('Для множинного вибору позначте щонайменше дві правильні відповіді.');
  if(q.type==='sequence'&&correct.length!==keys.length)fail('Упорядкуйте всі кроки алгоритму.');
  if(['match','groups'].includes(q.type)){
   if(groups.length<2||groups.length>20||groups.some(g=>!g)||new Set(groups).size!==groups.length||!correct||Array.isArray(correct)||typeof correct!=='object')fail('Заповніть неповторні групи / пари.');
   const c={};for(const k of keys){if(typeof correct[k]!=='string'||(!groups.includes(correct[k])&&!(q.type==='groups'&&correct[k]==='')))fail('Укажіть правильну групу для кожного елемента.');c[k]=correct[k];}correct=c;
   if(q.type==='match'&&(groups.length!==keys.length||new Set(Object.values(correct)).size!==keys.length))fail('У відповідності кожна права частина використовується один раз.');
   if(q.type==='groups'&&Object.values(correct).every(v=>v===''))fail('Розмістіть хоча б один елемент у категорії.');
  }
  const prompt=contentText(q.text);if(!prompt.trim())fail('Запишіть текст кожного запитання.');
  return {id:text(q.id,100),type:q.type,section:q.section,text:prompt,format:q.format==='code'?'code':'text',image:imageUrl(q.image),options:opts,groups,correct,seconds,points,explanation:contentText(q.explanation,6000)};
 });
 for(const s of t.sections){const qs=t.questions.filter(q=>q.section===s.id);if(!qs.length)fail(`Розділ «${s.name}» порожній.`);if(s.take>qs.length)fail(`У розділі «${s.name}» замало запитань.`);if(s.uniqueTypes&&(s.take||qs.length)>new Set(qs.map(q=>q.type)).size)fail(`У розділі «${s.name}» недостатньо різних типів.`);}
 return {id:t.id,title:t.title,subject:t.subject,topic:t.topic,grade:t.grade,timer:t.timer,feedback:t.feedback,shuffleQuestions:t.shuffleQuestions,shuffleAnswers:t.shuffleAnswers,scale:t.scale,sections:t.sections,questions:t.questions};
}
export function shuffle(xs){const out=[...xs];for(let i=out.length-1;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[out[i],out[j]]=[out[j],out[i]];}return out;}
export function variant(t){let qs=[];for(const s of t.sections){const pool=shuffle(t.questions.filter(q=>q.section===s.id)),seen=new Set();const usable=s.uniqueTypes?pool.filter(q=>{if(seen.has(q.type))return false;seen.add(q.type);return true}):pool;const chosen=usable.slice(0,s.take||usable.length);if(!t.shuffleQuestions)chosen.sort((a,b)=>t.questions.indexOf(a)-t.questions.indexOf(b));qs.push(...chosen);}if(t.shuffleQuestions)qs=shuffle(qs);return qs.map(q=>({...structuredClone(q),options:(t.shuffleAnswers||q.type==='sequence')?shuffle(q.options):q.options,groups:t.shuffleAnswers?shuffle(q.groups):q.groups}));}
export function publicQuestion(q){const {correct,explanation,...safe}=q;return safe;}
export function scoreQuestion(q,a){let fraction=0;
 if(q.type==='single')fraction=a===q.correct?1:0;
 if(q.type==='multi')fraction=Array.isArray(a)&&new Set(a).size===a.length&&a.length===q.correct.length&&q.correct.every(id=>a.includes(id))?1:0;
 if(q.type==='sequence')fraction=Array.isArray(a)&&a.length===q.correct.length&&a.every((id,i)=>id===q.correct[i])?1:0;
 if(['match','groups'].includes(q.type)&&a&&typeof a==='object'&&!Array.isArray(a))fraction=q.options.filter(o=>a[o.id]===q.correct[o.id]).length/q.options.length;
 return Math.round(q.points*fraction*1e6)/1e6;
}
export function grade(score,total){if(!(total>0))return {percent:0,mark:null,level:null,levelName:'Немає оцінки'};const ratio=Math.max(0,Math.min(1,score/total));const level=ratio<=.25?'П':ratio<=.5?'С':ratio<=.75?'Д':'В';return {percent:Math.round(ratio*100),mark:Math.max(1,Math.min(12,Math.round(ratio*12))),level,levelName:{П:'Початковий',С:'Середній',Д:'Достатній',В:'Високий'}[level]};}
export function report(test,questions,answers){const score=answers.reduce((s,a)=>s+a.points,0),total=questions.reduce((s,q)=>s+q.points,0);const sections=test.sections.map(s=>{const qs=questions.filter(q=>q.section===s.id),aa=answers.filter(a=>qs.some(q=>q.id===a.id));const total=qs.reduce((n,q)=>n+q.points,0),score=aa.reduce((n,a)=>n+a.points,0);return {...s,score,total,count:qs.length,answered:aa.length,...grade(score,total)}}).filter(s=>s.count);
 const ordered=[...sections].sort((a,b)=>(b.score/b.total)-(a.score/a.total));const best=ordered[0],weak=[...ordered].reverse().filter(s=>s.score/s.total<.8).slice(0,2);
 return {score,total,...grade(score,total),sections,feedback:{praise:score>0?`У вас є вдалі відповіді! Найвищий результат у розділі «${best.name}» — ${best.percent}%. Це основа для наступного кроку.`:'Дякуємо за виконану роботу. Тепер зрозуміло, з чого почати повторення. Один тест не визначає ваших здібностей.',focus:weak.map(s=>({name:s.name,advice:s.advice||`Повторіть основні поняття розділу «${s.name}», розберіть один приклад і виконайте два подібні завдання.`})),support:weak.length?'Оберіть один пункт для повторення. Коротка практика й пояснення своїми словами допоможуть зміцнити навичку. Ви можете рухатися у власному темпі!':'Спробуйте застосувати знання в новій практичній ситуації або створити власне завдання для однокласників.',note:sections.some(s=>s.count<3)?'У деяких розділах менше трьох запитань: результат є орієнтиром, а не вичерпною оцінкою навички.':''}};
}
export function clock(session,now=Date.now()){return (session.status==='paused'?session.paused_at:now)-session.paused_ms;}
export function equal(a,b){a=String(a);b=String(b);let n=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)n|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return n===0;}

