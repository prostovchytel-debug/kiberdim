export function resultTrashTools({S,api,modal,button,h,toast,loadDashboard,render}){
 const close=()=>document.querySelector('#modal').close();
 const attrs=(kind,id)=>`data-kind="${kind}" data-id="${h(id)}"`;
 const removeButton=(kind,id,label='Видалити')=>button(label,'removeResultRecord','text-button danger',attrs(kind,id));
 async function refresh(){await loadDashboard();if(S.view==='journal')S.journal=await api('journal');if(S.live){try{S.live=await api('sessionReport',{id:S.live.session.id});}catch{S.live=null;}}render();}
 async function deleted(){const d=await api('deletedResults');modal(`<h2>Видалені сеанси та результати</h2><p>Спочатку відновіть сеанс, щоб повернути його колонку й результати. Окремо видалені роботи відновлюються окремо.</p>${[['Сеанси','session',d.sessions],['Результати учнів','result',d.results]].map(([title,kind,rows])=>`<h3>${title}</h3>${rows.length?`<ul class="catalog-list">${rows.map(r=>`<li><span>${h(r.title)}${r.name?`<small> · ${h(r.name)} · ${h(r.class_name)}</small>`:`<small> · ${h(r.classes.join(', '))}</small>`}</span>${button('Відновити','restoreResultRecord','outline',attrs(kind,r.id))}</li>`).join('')}</ul>`:'<p>Немає видалених записів.</p>'}`).join('')}`);}
 async function click(action,el){if(!['removeResultRecord','confirmResultTrash','restoreResultRecord','deletedResults'].includes(action))return false;
 const {kind,id}=el.dataset;
 if(action==='deletedResults'){await deleted();return true;}
 if(action==='removeResultRecord'){modal(`<h2>${kind==='session'?'Видалити сеанс?':'Видалити результат учня?'}</h2><p>${kind==='session'?'Сеанс і його колонка з оцінками зникнуть із журналу. Результати також не відображатимуться в історії та карті досягнень учнів.':'Ця робота, оцінка та індивідуальний звіт зникнуть зі списків і статистики. Профіль учня залишиться.'}</p><p>Запис можна відновити через кнопку «Видалені сеанси та результати».</p><div class="toolbar">${button('Видалити','confirmResultTrash','outline danger',attrs(kind,id))}${button('Скасувати','closeModal','outline')}</div>`);return true;}
 el.disabled=true;try{await api('resultTrash',{kind,id,restore:action==='restoreResultRecord'});close();await refresh();if(action==='restoreResultRecord')await deleted();toast(action==='restoreResultRecord'?'Запис відновлено.':'Запис перенесено у видалені.');}finally{el.disabled=false;}return true;
 }
 return {click,removeButton};
}
