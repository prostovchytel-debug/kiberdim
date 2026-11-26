import {fail} from './domain.mjs';
export const MAX_HTML_BYTES=2*1024*1024;
const clean=(v,n,label)=>{if(typeof v!=='string'||v.trim().length>n)fail(`Перевірте поле «${label}» (до ${n} символів).`);return v.trim();};
export function validateSimulator(b,catalog,hasFile=false){
 const title=clean(b.title,120,'Назва');if(!title)fail('Вкажіть назву симулятора.');
 const topic=clean(b.topic??'',120,'Тема'),description=clean(b.description??'',500,'Опис');
 const choose=(value,kind,label)=>{if(!Array.isArray(value)||!value.length||value.length>100||value.some(x=>typeof x!=='string'))fail(`Оберіть ${label}.`);const names=[...new Set(value.map(x=>x.trim()))];if(names.some(n=>!catalog.some(c=>c.kind===kind&&c.name===n&&!c.deleted_at)))fail(`Оберіть чинні ${label} з довідника.`);return names;};
 if(!Array.isArray(b.classes)||!b.classes.length||b.classes.length>12||b.classes.some(x=>typeof x!=='string'||!/^([1-9]|1[0-2])$/.test(x)))fail('Оберіть хоча б одну паралель від 1 до 12 класу.');
 const classes=[...new Set(b.classes)].sort((a,b)=>Number(a)-Number(b)),subjects=choose(b.subjects,'subject','предмети');
 if(typeof b.published!=='boolean')fail('Оберіть стан публікації.');
 const result={title,topic,description,classes,subjects,published:b.published};
 if(b.html!==undefined){if(typeof b.html!=='string'||!b.html.trim()||!/<(?:!doctype\s+html|html)[\s>]/i.test(b.html))fail('Потрібен повний HTML-документ.');if(new TextEncoder().encode(b.html).length>MAX_HTML_BYTES)fail('HTML-файл має бути не більшим за 2 МБ.');const filename=clean(b.filename??'',160,'Файл');if(!/\.html?$/i.test(filename))fail('Оберіть файл .html або .htm.');Object.assign(result,{html:b.html,filename});}
 else if(!hasFile)fail('Завантажте HTML-файл.');
 return result;
}
