import test from 'node:test';
import assert from 'node:assert/strict';
import * as X from 'xlsx';
import {validateImport} from '../supabase/functions/quiz/admin-domain.mjs';
import {sheetRows} from '../src/excel.js';
const row=(v={})=>({row:2,importKey:crypto.randomUUID(),role:'student',name:'Коваленко Софія',login:'sofia.k',className:'7-А',subjects:[],...v});
test('XLSX round-trip preserves Ukrainian text, numeric classes and optional logins',()=>{
 const book=X.utils.book_new();X.utils.book_append_sheet(book,X.utils.aoa_to_sheet([['ПІБ','Клас','Логін'],['Коваленко Софія','7-А','sofia.k'],['Бондар Артем',8,'']]));
 const parsed=X.read(X.write(book,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
 const rows=sheetRows(X,parsed.Sheets[parsed.SheetNames[0]],'student');
 assert.equal(rows[0].name,'Коваленко Софія');assert.equal(rows[1].className,'8');assert.match(rows[1].login,/^student_[a-f0-9]{16}$/);assert.equal(validateImport(rows).valid,true);
});
test('teacher template supports semicolon subject lists and no administrator imports',()=>{
 const rows=sheetRows(X,X.utils.aoa_to_sheet([['ПІБ','Предмети','Логін'],['Шевченко Олена Іванівна','Інформатика; Математика','teacher1']]),'teacher');
 const p=validateImport(rows);assert.equal(p.valid,true);assert.deepEqual(p.additions.map(x=>x.name),['Інформатика','Математика']);
 assert.equal(validateImport([row({role:'admin'})]).valid,false);
});
test('duplicate logins, deleted accounts and deleted catalog entries are blocked',()=>{
 assert.equal(validateImport([row(),row({login:' SOFIA.K '})]).valid,false);
 assert.equal(validateImport([row()],[{login:'sofia.k',deleted_at:'today'}]).valid,false);
 assert.equal(validateImport([row()],[],[{kind:'class',name:'7-А',deleted_at:'today'}]).valid,false);
 assert.equal(validateImport([row({name:'Софія'})]).valid,false);
 assert.equal(validateImport([row({role:'teacher',name:'Олена Шевченко',subjects:['Інформатика']})]).valid,false);
});
test('idempotent retry matches all account fields and rejects key reuse',()=>{
 const r=row(),existing=[{login:r.login,name:r.name,role:r.role,class_name:r.className,subjects:[],import_key:r.importKey,deleted_at:null}];
 assert.equal(validateImport([r],existing).valid,true);
 assert.equal(validateImport([{...r,name:'Інша Людина'}],existing).valid,false);
});
test('same names are warnings rather than silently deduplicated children',()=>{
 const p=validateImport([row(),row({login:'sofia.other'})]);assert.equal(p.valid,true);assert.ok(p.rows.every(x=>x.warnings.length));
});
test('Excel rejects formulas, wrong headers, empty and oversized imports',()=>{
 const s=X.utils.aoa_to_sheet([['ПІБ','Клас'],['Коваленко Софія','7-А']]);s.A2.f='CONCAT("Коваленко", " Софія")';assert.throws(()=>sheetRows(X,s,'student'),/формули/);
 assert.throws(()=>sheetRows(X,X.utils.aoa_to_sheet([['NameOnly']]),'student'),/колонки/);
 assert.throws(()=>validateImport([]),/500/);assert.throws(()=>validateImport(Array.from({length:501},()=>row())),/500/);
});
