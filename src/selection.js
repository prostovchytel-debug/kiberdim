import {assignedIds} from './diagnostics-model.js';
export const dimensions={sections:'Розділи',resultGroups:'Групи результатів',skills:'Навички'};
export function entries(t,k){return k==='sections'?t.sections:t.diagnostics?.[k]||[];}
export function belongs(q,k,id){return k==='sections'?q.section===id:assignedIds(q,k==='skills'?'skillId':'resultGroupId').includes(id);}
// OR inside a dimension, AND across dimensions. No duplicated questions.
export function eligible(t,plan,except=''){return t.questions.filter(q=>Object.keys(dimensions).every(k=>k===except||!plan[k]?.length||plan[k].some(r=>belongs(q,k,r.id))));}
export function selectionCounts(t,plan,k){const pool=eligible(t,plan,k);return entries(t,k).map(e=>({...e,count:pool.filter(q=>belongs(q,k,e.id)).length}));}
export function solveSelection(t,plan,random=x=>x){
 if(!plan||typeof plan!=='object'||Array.isArray(plan))throw Error('Неправильні налаштування вибірки.');
 const rules=[];for(const k of Object.keys(dimensions)){if(plan[k]!=null&&!Array.isArray(plan[k]))throw Error('Неправильний список категорій.');const seen=new Set();for(const r of plan[k]||[]){if(!r||seen.has(r.id)||!entries(t,k).some(e=>e.id===r.id))throw Error('Невідома або повторна категорія.');seen.add(r.id);if(!Number.isInteger(r.take)||r.take<5||r.take>200)throw Error('Для діагностики оберіть від 5 запитань у кожній категорії.');rules.push({...r,kind:k});}}
 if(!rules.length)throw Error('Оберіть хоча б одну категорію або стандартний запуск.');
 const pool=eligible(t,plan);for(const r of rules){const count=pool.filter(q=>belongs(q,r.kind,r.id)).length;if(count<5||count<r.take)throw Error(`Після перетину фільтрів для «${entries(t,r.kind).find(e=>e.id===r.id).name}» доступно ${count}, потрібно ${r.take}.`);}
 // Identical membership signatures can be solved together, then sampled randomly.
 const groups=new Map();for(const q of random(pool)){const mask=rules.map((r,i)=>belongs(q,r.kind,r.id)?i:-1).filter(i=>i>=0),key=mask.join(',');if(!groups.has(key))groups.set(key,{mask,qs:[]});groups.get(key).qs.push(q);}
 const gs=[...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,g])=>g),remaining=rules.map(r=>r.take),chosen=[],dead=new Set();let steps=0;
 const suffix=Array.from({length:gs.length+1},()=>rules.map(()=>0));for(let i=gs.length-1;i>=0;i--){suffix[i]=[...suffix[i+1]];for(const j of gs[i].mask)suffix[i][j]+=gs[i].qs.length;}
 function visit(i){if(++steps>150000)throw Error('Вибірка надто складна. Зменшіть кількість одночасних квот або узгодьте їх.');if(remaining.every(n=>n===0)){chosen.length=i;return true;}if(i===gs.length||remaining.some((n,j)=>n<0||n>suffix[i][j]))return false;const key=i+':'+remaining.join(',');if(dead.has(key))return false;const g=gs[i],max=Math.min(g.qs.length,...g.mask.map(j=>remaining[j]));for(const n of Array.from({length:max+1},(_,n)=>n)){g.mask.forEach(j=>remaining[j]-=n);chosen[i]=n;if(visit(i+1))return true;g.mask.forEach(j=>remaining[j]+=n);}chosen[i]=0;dead.add(key);return false;}
 if(!visit(0))throw Error('Квоти несумісні через перетини категорій. Змініть кількість запитань або фільтри.');return gs.flatMap((g,i)=>g.qs.slice(0,chosen[i]||0));
}
