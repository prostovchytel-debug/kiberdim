import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTest,variant,publicQuestion} from '../supabase/functions/quiz/domain.mjs';
import {richText,sectionStats,indentSelection} from '../src/test-content.js';

test('code survives validation, JSON storage, re-edit, random variant and student delivery',()=>{
 const code='\n    def hello():\n\tprint("<hello>&")\n\n    hello()\n';
 for(const type of ['single','multi','sequence','match','groups']){
  const correct=type==='single'?'a':type==='multi'?['a','b']:type==='sequence'?['a','b','c']:{a:'А',b:'Б',c:'В'};
  const raw={title:'Python',subject:'Інформатика',grade:9,sections:[{id:'s',name:'Код'}],questions:[{id:'q',section:'s',type,text:code,format:'code',options:['a','b','c'].map(id=>({id,text:code,format:'code'})),groups:['А','Б','В'],correct,seconds:30,points:2,explanation:code}]};
  const saved=JSON.parse(JSON.stringify(validateTest(raw))),edited=validateTest(saved),q=publicQuestion(variant(edited)[0]);
  assert.equal(q.text,code);assert.equal(q.format,'code');assert.ok(q.options.every(o=>o.text===code&&o.format==='code'));
  assert.equal(edited.questions[0].explanation,code);assert.equal('correct' in q,false);
  raw.questions[0].text='  if True:\r\n\tpass\r\n';assert.equal(validateTest(raw).questions[0].text,'  if True:\n\tpass\n');
  raw.questions[0].text=' \n\t ';assert.throws(()=>validateTest(raw));
 }
});
test('code rendering escapes HTML while retaining every whitespace character',()=>{
 assert.equal(richText('  <script>\n\t&\n','code'),'<span class="content-text code-text">  &lt;script&gt;\n\t&amp;\n</span>');
 assert.ok(richText('a\nb').includes('a\nb'));
});
test('section counts track empty sections, moves, deletes and selection constraints',()=>{
 const t={sections:[{id:'a',name:'A',take:0},{id:'b',name:'B',take:2}],questions:[{id:'q',section:'a',type:'single'},{id:'r',section:'a',type:'single'}]};
 assert.deepEqual(sectionStats(t).map(s=>[s.count,s.shown]),[[2,2],[0,2]]);
 assert.equal(sectionStats(t)[1].issue,'Розділ порожній');
 t.questions[0].section='b';assert.deepEqual(sectionStats(t).map(s=>s.count),[1,1]);assert.equal(sectionStats(t)[1].issue,'Бракує 1 запитань');
 t.questions[1].section='b';t.sections[1].uniqueTypes=true;assert.match(sectionStats(t)[1].issue,/різних типів/);
 t.questions[1].type='multi';assert.equal(sectionStats(t)[1].issue,'');
 t.questions.pop();assert.equal(sectionStats(t)[1].count,1);
});
test('Tab and Shift+Tab handle cursor, selections, tabs and empty lines',()=>{
 assert.deepEqual(indentSelection('x\ny',2,2),{value:'x\n    y',start:6,end:6});
 assert.deepEqual(indentSelection('x\ny\nz',0,4),{value:'    x\n    y\nz',start:4,end:12});
 assert.deepEqual(indentSelection('    x\n\ty',4,8,true),{value:'x\ny',start:0,end:3});
 assert.deepEqual(indentSelection('    x',4,4,true),{value:'x',start:0,end:0});
 assert.deepEqual(indentSelection('x',0,0,true),{value:'x',start:0,end:0});
});
