import {execFileSync} from 'node:child_process';
import {readdir} from 'node:fs/promises';
for(const file of await readdir('src'))if(file.endsWith('.js'))execFileSync(process.execPath,['--check','src/'+file],{stdio:'inherit'});
import {rm,mkdir,cp} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});await cp('public','dist',{recursive:true});await cp('src','dist/src',{recursive:true});await mkdir('dist/vendor',{recursive:true});await cp('node_modules/xlsx/dist/xlsx.full.min.js','dist/vendor/xlsx.full.min.js');await cp('node_modules/xlsx/LICENSE','dist/vendor/LICENSE.sheetjs');console.log('Built static client in dist/');
