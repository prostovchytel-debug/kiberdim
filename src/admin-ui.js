import {excel, sheetRows, writeExcel, temporaryPassword} from './excel.js';
export function adminTools({S,api,modal,button,field,h,toast,navigate,loadDashboard,render}) {
 let book=null, job=null, role='student', busy=false;
 const dialog=()=>document.querySelector('#modal');
 const note='Видалення переносить запис у «Видалені». Попередні оцінки, тести та звіти зберігаються. Запис можна відновити.';
 function showImport(){
  modal(`<div class="import-panel"><span class="eyebrow">ДОДАВАННЯ СПИСКОМ</span><h2>Імпорт користувачів з Excel</h2><p>Один рядок — один користувач. До 500 записів за раз. Логін можна залишити порожнім: він сформується автоматично.</p>
  ${job?preview():`<div class="toolbar">${button('Шаблон учнів .xlsx','templateStudents','outline')}${button('Шаблон учителів .xlsx','templateTeachers','outline')}</div>
  ${field('Кого додаємо?',`<select id="import-role"><option value="student" ${role==='student'?'selected':''}>Учнів</option><option value="teacher" ${role==='teacher'?'selected':''}>Учителів</option></select>`)}
  ${field('Файл Excel · .xlsx або .xls · до 5 МБ','<input id="import-file" type="file" accept=".xlsx,.xls">')}
  ${book?field('Аркуш таблиці',`<select id="import-sheet">${book.SheetNames.map(n=>`<option value="${h(n)}">${h(n)}</option>`).join('')}</select>`):''}
  <p class="small">Учні: ПІБ, Клас, Логін. Учителі: ПІБ, Предмети, Логін. Кілька предметів розділяйте крапкою з комою. Нові класи та предмети додадуться під час імпорту. Файл обробляється у вашому браузері.</p>
  ${button('Перевірити таблицю','previewImport','primary',book?'':'disabled')}`}</div>`);
  dialog().querySelector('.modal-close').disabled=busy;
 }
 function preview(){
  const errors=job.rows.filter(r=>r.errors.length), done=job.offset===job.rows.length;
  return `<div class="import-summary"><b>Записів: ${job.rows.length}</b><span>Помилки: ${errors.length}</span><span>Створено: ${job.offset}</span></div>
   ${job.additions.length?`<p>Нові класи / предмети: ${job.additions.map(x=>h(x.name)).join(', ')}.</p>`:''}
   ${job.error?`<p class="alert" role="alert">${h(job.error)} Уже створені акаунти збережено. Кнопка «Продовжити» безпечно повторить незавершений пакет.</p>`:''}
   <div class="table-wrap import-table"><table><thead><tr><th>Рядок</th><th>ПІБ</th><th>Логін</th><th>Клас / предмети</th><th>Перевірка</th></tr></thead><tbody>${job.rows.map((r,i)=>`<tr><td>${r.row}</td><td>${h(r.name)}</td><td>${h(r.login)}</td><td>${h(r.className||r.subjects.join('; '))}</td><td class="${r.errors.length?'danger':''}">${i<job.offset?'Створено':r.errors.length?h(r.errors.join(' ')):r.warnings.length?h(r.warnings.join(' ')):'Готово'}</td></tr>`).join('')}</tbody></table></div>
   <div class="toolbar">${busy?`<p role="status">Додаємо користувачів: ${job.offset} / ${job.rows.length}. Залиште сторінку відкритою.</p>`:!done&&!errors.length?button(job.error?'Продовжити імпорт':`Додати користувачів: ${job.rows.length}`,'commitImport'):''}
   ${job.offset?button('Завантажити логіни та паролі .xlsx','exportImport','outline'):''}
   ${errors.length?button('Завантажити помилки .xlsx','exportImportErrors','outline'):''}
   ${!busy?button(done?'Імпортувати іншу таблицю':'Обрати інший файл','resetImport','text-button'):''}</div>
   ${done?'<p class="alert">Імпорт завершено. Завантажте таблицю доступів і передайте кожному користувачу лише його дані. Тимчасові паролі потрібно змінити під час першого входу.</p>':'<p class="small">Дані з помилками не імпортуються. Виправте файл і завантажте повторно. Перевірте попередження про однакові імена.</p>'}
   ${job.offset?'<p class="small">Паролі доступні тут лише до оновлення сторінки або виходу з кабінету. У базі зберігаються тільки їхні хеші.</p>':''}`;
 }
 async function trashModal(kind,id){
  const source=kind==='user'?S.users.find(x=>x.id===id):kind==='catalog'?S.catalog.find(x=>x.id===id):S.tests.find(x=>x.id===id);
  modal(`<h2>Видалити ${h(source?.name||source?.data?.title||'запис')}?</h2><p>${note}</p>${kind==='user'?'<p>Вхід у цей акаунт буде заборонений, а відкриті сесії авторизації припиняться.</p>':''}${kind==='catalog'?'<p>Якщо запис використовується в профілях, тестах або активному сеансі, система пояснить, що потрібно змінити спочатку.</p>':''}<div class="toolbar">${button('Видалити','confirmTrash','outline danger',`data-kind="${kind}" data-id="${id}"`)}${button('Скасувати','closeModal','outline')}</div>`);
 }
 async function deletedModal(){
  const data=await api('deleted');
  const groups=[['Користувачі','user',data.users],['Класи та предмети','catalog',data.items],['Мої тести','test',data.tests]];
  modal(`<h2>Видалені записи</h2><p>${note}</p>${groups.map(([title,kind,rows])=>`<section><h3>${title}</h3>${rows.length?`<ul class="catalog-list">${rows.map(r=>`<li><span>${h(r.name||r.data.title)}${r.login?` <small>${h(r.login)}</small>`:''}</span>${button('Відновити','restoreRecord','outline',`data-kind="${kind}" data-id="${r.id}"`)}</li>`).join('')}</ul>`:'<p class="small">Немає видалених записів.</p>'}</section>`).join('')}`);
 }
 async function refresh(){await loadDashboard();if(S.view==='users')S.users=(await api('users')).users;render();}
 async function click(action,el){
  const id=el.dataset.id;
  switch(action){
   case 'openImport':showImport();break;
   case 'templateStudents':await writeExcel('kiberdim-uchni-template.xlsx',[['ПІБ','Клас','Логін'],['Коваленко Софія','7-А','']],'Учні');break;
   case 'templateTeachers':await writeExcel('kiberdim-vchyteli-template.xlsx',[['ПІБ','Предмети','Логін'],['Шевченко Олена Іванівна','Інформатика; Математика','']],'Учителі');break;
   case 'previewImport':{
    el.disabled=true;try{const X=await excel(), name=document.querySelector('#import-sheet').value;
    const rows=sheetRows(X,book.Sheets[name],role);const result=await api('importPreview',{rows});
    job={...result,offset:0,exported:0,error:'',passwords:new Map()};showImport();}finally{el.disabled=false;}break;
   }
   case 'commitImport':{
    if(busy||!job?.valid)return true;busy=true;job.error='';showImport();
    try{while(job.offset<job.rows.length){
     const batch=job.rows.slice(job.offset,job.offset+5).map(r=>{
      if(!job.passwords.has(r.importKey))job.passwords.set(r.importKey,temporaryPassword());
      return {...r,temporaryPassword:job.passwords.get(r.importKey)};
     });
     await api('importUsers',{rows:batch});job.offset+=batch.length;showImport();
    }await refresh();}catch(e){job.error=e.message;}finally{busy=false;showImport();}break;
   }
   case 'exportImport':await writeExcel('kiberdim-dostupy.xlsx',[['ПІБ','Роль','Клас / предмети','Логін','Тимчасовий пароль'],...job.rows.slice(0,job.offset).map(r=>[r.name,r.role==='student'?'Учень':'Учитель',r.className||r.subjects.join('; '),r.login,job.passwords.get(r.importKey)])]);job.exported=job.offset;break;
   case 'exportImportErrors':await writeExcel('kiberdim-pomylky.xlsx',[['Рядок','ПІБ','Логін','Помилки','Попередження'],...job.rows.map(r=>[r.row,r.name,r.login,r.errors.join(' '),r.warnings.join(' ')])]);break;
   case 'resetImport':if(busy)return true;if(job?.offset>job?.exported&&!confirm('Таблицю паролів ще не завантажено. Почати інший імпорт і прибрати ці паролі з екрана?'))return true;job=null;book=null;showImport();break;
   case 'trashUser':await trashModal('user',id);break;
   case 'trashCatalog':await trashModal('catalog',id);break;
   case 'trashTest':await trashModal('test',id);break;
   case 'confirmTrash':el.disabled=true;try{await api('trash',{kind:el.dataset.kind,id});dialog().close();await refresh();toast('Запис переміщено у «Видалені».');}finally{el.disabled=false;}break;
   case 'openDeleted':await deletedModal();break;
   case 'restoreRecord':el.disabled=true;try{await api('trash',{kind:el.dataset.kind,id,restore:true});await refresh();await deletedModal();toast('Запис відновлено.');}finally{el.disabled=false;}break;
   case 'closeModal':if(busy)return true;return false;
   case 'logout':if(busy)return true;if(job?.offset>job?.exported&&!confirm('Таблицю паролів ще не завантажено. Вийти з кабінету?'))return true;job=null;book=null;return false;
   default:return false;
  }return true;
 }
 document.addEventListener('change',async e=>{try{
  if(e.target.id==='import-role'){role=e.target.value;}
  if(e.target.id==='import-file'){
   const file=e.target.files[0];if(!file)return;
   if(file.size>5*1024*1024||!/\.(xlsx|xls)$/i.test(file.name))throw Error('Оберіть файл .xlsx або .xls розміром до 5 МБ.');
   book=null;const X=await excel();book=X.read(await file.arrayBuffer(),{type:'array',cellFormula:true,sheetRows:503});showImport();
  }
 }catch(e){book=null;showImport();toast(e.message);}});
 dialog().addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 window.addEventListener('beforeunload',e=>{if(busy||job?.offset>job?.exported){e.preventDefault();e.returnValue='';}});
 return {click};
}
