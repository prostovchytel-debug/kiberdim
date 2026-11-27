export const assignedIds=(q,key)=>Array.isArray(q[key+'s'])?[...new Set(q[key+'s'])]:(q[key]?[q[key]]:[]);
export const LEVELS=['П','С','Д','В'];
export const LEVEL_NAMES={П:'Початковий',С:'Середній',Д:'Достатній',В:'Високий'};
export const DIMENSIONS={sections:'Розділи',resultGroups:'Групи результатів',skills:'Навички'};
export function diagnosticLevel(score,total,thresholds=[25,50,75]){if(!(total>0))return null;const p=100*score/total;return LEVELS[p<=thresholds[0]?0:p<=thresholds[1]?1:p<=thresholds[2]?2:3];}
export function defaults(name,level){const n=`«${name||'Цей напрям'}»`;return ({
 П:{description:`Результати завдань за напрямом ${n} свідчать, що основи потребують повторення.`,recommendation:`Повернися до основ ${n}. Розбери один приклад з поясненням учителя, виконай два подібні завдання та поясни кожен крок.`},
 С:{description:`За напрямом ${n} вже є окремі вдалі відповіді, проте застосування знань ще потребує практики.`,recommendation:`Повтори складні моменти за напрямом ${n}. Порівняй правильний і помилковий приклади, а потім виконай два завдання самостійно.`},
 Д:{description:`Результати за напрямом ${n} показують, що з більшістю перевірених завдань ти справляєшся.`,recommendation:`Закріпи ${n} у практичному завданні. Перевір місця, де виникли труднощі, та поясни свій спосіб розв’язання.`},
 В:{description:`У перевірених завданнях за напрямом ${n} ти показуєш упевнене застосування знань.`,recommendation:`Спробуй застосувати ${n} у новій ситуації: створи власне завдання, проєкт або пояснення для однокласників.`}
 })[level]||{description:'Цей напрям не перевірено у твоєму варіанті тесту.',recommendation:''};}
export function ensureDiagnostics(t){
 const legacy=!t.diagnostics;const d=t.diagnostics??={};d.version=1;d.skills??=[];d.resultGroups??=[];d.sectionSettings??={};d.mode??='combined';d.thresholds??=[25,50,75];d.studentViews??={sections:true,resultGroups:true,skills:true};d.studentRecommendations??=true;
 if(legacy)for(const s of t.sections||[])if(s.advice)d.sectionSettings[s.id]={levels:Object.fromEntries(LEVELS.map(l=>[l,{recommendation:s.advice}]))};
 // Preserve old free-text tags as real skills, without guessing educational groups.
 for(const q of t.questions||[]){if(q.skill&&!q.skillId){let s=d.skills.find(s=>s.name===q.skill);if(!s){s={id:crypto.randomUUID(),name:q.skill,description:'',levels:{},materials:[]};d.skills.push(s);}q.skillId=s.id;}q.skillId??='';q.resultGroupId??='';}
 return d;
}
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
export function diagnosticIssues(t){const d=t.diagnostics;if(!d)return [];const out=[],add=(message,q)=>out.push({questionId:q?.id||null,section:q?.section||null,field:'diagnostics',message});
 if(!object(d)){add('Перевірте структуру діагностики.');return out;}
 if(!['auto','custom','combined'].includes(d.mode??'combined'))add('Оберіть режим рекомендацій.');
 const th=d.thresholds??[25,50,75];if(!Array.isArray(th)||th.length!==3||th.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<=0||v>=100)||!(th[0]<th[1]&&th[1]<th[2]))add('Межі рівнів мають зростати й бути між 0 та 100.');
 function entry(e){if(!object(e)){add('Неправильний запис діагностики.');return;}if(e.description!=null&&(typeof e.description!=='string'||e.description.length>3000))add('Опис: максимум 3000 символів.');if(e.levels!=null&&!object(e.levels)){add('Неправильні описи рівнів.');return;}for(const l of LEVELS){const v=e.levels?.[l];if(v!=null&&(!object(v)||['description','recommendation'].some(k=>v[k]!=null&&(typeof v[k]!=='string'||v[k].length>3000))))add('Коментар рівня: максимум 3000 символів у кожному полі.');}if(e.materials!=null&&(!Array.isArray(e.materials)||e.materials.length>10)){add('Не більше 10 матеріалів на напрям.');return;}for(const m of e.materials||[]){if(!object(m)||typeof m.title!=='string'||!m.title.trim()||m.title.length>180){add('Укажіть назву навчального матеріалу (до 180 символів).');continue;}if(m.simulatorId){if(!/^[a-f0-9-]{36}$/.test(m.simulatorId))add('Оберіть симулятор зі списку.');}else{try{const u=new URL(m.url);if(u.protocol!=='https:'||u.username||u.password||m.url.length>2000)throw Error();}catch{add('Матеріал має містити безпечне посилання HTTPS або симулятор.');}}}}
 for(const kind of ['skills','resultGroups']){const xs=d[kind]??[];if(!Array.isArray(xs)||xs.length>100){add('Довідник: максимум 100 записів.');continue;}const ids=new Set();for(const e of xs){if(!object(e)||typeof e.id!=='string'||!e.id||e.id.length>100||ids.has(e.id)||typeof e.name!=='string'||!e.name.trim()||e.name.length>180){add('Заповніть назви та унікальні ідентифікатори навичок / ГР.');continue;}ids.add(e.id);entry(e);}}
 if(d.sectionSettings!=null&&!object(d.sectionSettings))add('Перевірте рекомендації розділів.');else for(const [id,e] of Object.entries(d.sectionSettings||{})){if(!(t.sections||[]).some(s=>s.id===id))add('Рекомендація належить видаленому розділу.');entry(e);}
 for(const q of t.questions||[])for(const [key,kind] of [['skillId','skills'],['resultGroupId','resultGroups']])if((q[key+'s']!=null&&(!Array.isArray(q[key+'s'])||q[key+'s'].length>100))||assignedIds(q,key).some(id=>!Array.isArray(d[kind])||!d[kind].some(e=>e.id===id)))add('Навичку або групу результатів не знайдено в довіднику.',q);
 return out;
}
export function feedbackFor(entry,level,mode='combined'){const auto=defaults(entry.name,level),custom=entry.levels?.[level]||{};if(!level)return auto;return Object.fromEntries(['description','recommendation'].map(k=>[k,mode==='auto'?auto[k]:mode==='custom'?(custom[k]?.trim()||''):(custom[k]?.trim()||auto[k])]));}
export function diagnosticReport(test,questions,answers){
 const d=test.diagnostics||{},thresholds=d.thresholds||[25,50,75],answerMap=new Map(answers.map(a=>[a.id,a]));
 const config={sections:(test.sections||[]).map(s=>({...s,...d.sectionSettings?.[s.id],name:s.name})),skills:d.skills||[],resultGroups:d.resultGroups||[]};
 const result={};for(const [kind,entries] of Object.entries(config))result[kind]=entries.map(e=>{const key={sections:'section',skills:'skillId',resultGroups:'resultGroupId'}[kind],qs=questions.filter(q=>key==='section'?q.section===e.id:assignedIds(q,key).includes(e.id)),total=qs.reduce((n,q)=>n+q.points,0),score=qs.reduce((n,q)=>n+(answerMap.get(q.id)?.points||0),0),level=diagnosticLevel(score,total,thresholds);const row={id:e.id,name:e.name,description:e.description||'',score,total,count:qs.length,answered:qs.filter(q=>answerMap.has(q.id)).length,percent:total?Math.round(100*score/total):null,level,levelName:level?LEVEL_NAMES[level]:'Не перевірено',preliminary:qs.length>0&&qs.length<3,materials:level?(e.materials||[]):[],...feedbackFor(e,level,d.mode)};if(!d.version&&e.advice&&level)row.recommendation=e.advice;return row;});
 return {...result,thresholds,studentViews:d.studentViews||{sections:true,resultGroups:true,skills:true},studentRecommendations:d.studentRecommendations!==false};
}
export function diagnosticFocus(d){const pool=d.skills?.some(x=>x.total)?d.skills:d.sections?.some(x=>x.total)?d.sections:d.resultGroups||[];return pool.filter(x=>x.total&&x.level!=='В').sort((a,b)=>a.score/a.total-b.score/b.total).slice(0,2);}
export function studentReport(r){const copy=structuredClone(r);if(!copy.diagnostics)return copy;const d=copy.diagnostics;
 for(const k of Object.keys(DIMENSIONS))if(d.studentViews[k]===false)d[k]=[];
 if(!d.studentRecommendations)for(const k of Object.keys(DIMENSIONS))d[k]=d[k].map(({description,recommendation,materials,...row})=>row);
 copy.sections=d.sections.map(s=>({...s,advice:d.studentRecommendations?s.recommendation:''}));
 // Rebuild feedback from visible dimensions, never leak hidden skill names or comments.
 const focus=d.studentRecommendations?diagnosticFocus(d):[];
 copy.feedback={praise:'Дякуємо за роботу. Результат допоможе обрати наступний крок у навчанні.',focus:focus.map(x=>({name:x.name,advice:x.recommendation})),support:'Кожна опрацьована навичка — ще один крок уперед. Один тест не визначає твоїх здібностей.',note:''};
 delete d.studentViews;delete d.studentRecommendations;return copy;
}
export function skillTrend(current,previous){if(!previous||current.subject!==previous.subject||current.testId!==previous.testId)return [];return (current.diagnostics?.skills||[]).filter(s=>s.total).flatMap(s=>{const p=previous.diagnostics?.skills?.find(p=>p.id===s.id&&p.total);return p?[{id:s.id,name:s.name,before:p.percent,after:s.percent,delta:s.percent-p.percent}]:[];});}
