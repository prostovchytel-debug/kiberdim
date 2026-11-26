const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function richText(value,format='text'){return `<span class="content-text${format==='code'?' code-text':''}">${escape(value)}</span>`;}
export function sectionStats(test){return test.sections.map(s=>{
 const questions=test.questions.filter(q=>q.section===s.id),count=questions.length,types=new Set(questions.map(q=>q.type)).size,take=Number(s.take)||0,shown=take||count;
 const issue=!count?'Розділ порожній':shown>count?`Бракує ${shown-count} запитань`:s.uniqueTypes&&shown>types?`Потрібно ${shown} різних типів; є ${types}`:'';
 return {...s,count,types,shown,issue,questions};
});}
export function indentSelection(value,start,end,outdent=false){
 if(start===end&&!outdent){return {value:value.slice(0,start)+'    '+value.slice(end),start:start+4,end:start+4};}
 const from=value.lastIndexOf('\n',start-1)+1,to=end>start&&value[end-1]==='\n'?end-1:end;
 const lines=value.slice(from,to).split('\n');let delta=0,firstDelta=0;
 const changed=lines.map((line,i)=>{let n;if(outdent){n=-(line.match(/^(?:\t| {1,4})/)?.[0].length||0);line=line.slice(-n);}else{n=4;line='    '+line;}delta+=n;if(!i)firstDelta=n;return line;}).join('\n');
 return {value:value.slice(0,from)+changed+value.slice(to),start:Math.max(from,start+firstDelta),end:Math.max(from,end+delta)};
}
