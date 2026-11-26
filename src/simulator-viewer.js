import {API,PUBLIC_KEY} from './config.js';
import {mountSimulator} from './simulator-frame.js';
const frame=document.querySelector('#sim-frame'),message=document.querySelector('#sim-message'),full=document.querySelector('#sim-fullscreen');
full.onclick=async()=>{try{await document.querySelector('#sim-stage').requestFullscreen();}catch{message.hidden=false;message.textContent='Повноекранний режим недоступний у цьому браузері.';}};
(async()=>{try{
 const id=new URLSearchParams(location.search).get('id');if(!/^[a-f0-9-]{36}$/i.test(id||''))throw Error('Неправильне посилання на симулятор.');
 const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json',apikey:PUBLIC_KEY},body:JSON.stringify({action:'simulatorGet',id})});const data=await r.json();if(!r.ok)throw Error(data.error||'Не вдалося відкрити симулятор.');const s=data.simulator;
 document.title=s.title+' · КіберДім';document.querySelector('#sim-title').textContent=s.title;document.querySelector('#sim-meta').textContent=[s.classes.map(x=>x+' клас').join(', '),s.subjects.join(', '),s.topic].filter(Boolean).join(' · ');
 mountSimulator(frame,s.html,s.title);frame.hidden=false;message.hidden=true;full.hidden=!document.querySelector('#sim-stage').requestFullscreen;
}catch(e){message.textContent=e.message;document.querySelector('#sim-title').textContent='Симулятор недоступний';}})();
