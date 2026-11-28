import {DIMENSIONS,diagnosticLevel,LEVEL_NAMES,feedbackFor} from './diagnostics-model.js';
export function taskResults(live,student=null){
 const students=student?[student]:live.students.filter(s=>s.done);
 return live.questions.flatMap((q,i)=>{const participants=students.filter(s=>s.questionIds.includes(q.id));if(!participants.length)return [];
 const answers=participants.map(s=>s.answers.find(a=>a.id===q.id)),total=answers.reduce((n,a)=>n+(a?.max??q.points),0),score=answers.reduce((n,a)=>n+(a?.points||0),0);
 const full=answers.filter((a)=>a&&a.points>0&&a.points>=a.max).length,partial=answers.filter(a=>a&&a.points>0&&a.points<a.max).length;
 return [{q,number:i+1,participants,total,score,percent:total?100*score/total:null,full,partial,wrong:participants.length-full-partial}];
 });
}
export function groupReport(live){
 const students=live.students.filter(s=>s.done&&s.result),thresholds=students[0]?.result.diagnostics?.thresholds||[25,50,75],diagnostics={thresholds};
 for(const kind of Object.keys(DIMENSIONS)){
 const rows=new Map();for(const s of students)for(const x of s.result.diagnostics?.[kind]||[]){const r=rows.get(x.id)||{id:x.id,name:x.name,score:0,total:0,count:0,answered:0};for(const k of ['score','total','count','answered'])r[k]+=x[k]||0;rows.set(x.id,r);}
 diagnostics[kind]=[...rows.values()].map(r=>{const level=diagnosticLevel(r.score,r.total,thresholds);return {...r,level,levelName:LEVEL_NAMES[level]||'Не перевірено',percent:r.total?Math.round(100*r.score/r.total):null,preliminary:r.count>0&&r.count<3,...feedbackFor(r,level)}});
 }
 const total=students.reduce((n,s)=>n+s.result.total,0),score=students.reduce((n,s)=>n+s.result.score,0),level=diagnosticLevel(score,total,thresholds);
 return {score,total,percent:total?Math.round(100*score/total):0,mark:total?Math.max(1,Math.round(12*score/total)):null,level,diagnostics,feedback:{support:'Узагальнення за завершеними роботами. Результати залежать від завдань, які отримав кожен учень.'}};
}
