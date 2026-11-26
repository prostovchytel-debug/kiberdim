import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readdir,readFile,writeFile} from 'node:fs/promises';
for(const file of await readdir('src'))if(file.endsWith('.js'))execFileSync(process.execPath,['--check','src/'+file],{stdio:'inherit'});
import {rm,mkdir,cp} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});await cp('public','dist',{recursive:true});await cp('src','dist/src',{recursive:true});await mkdir('dist/vendor',{recursive:true});await cp('node_modules/xlsx/dist/xlsx.full.min.js','dist/vendor/xlsx.full.min.js');await cp('node_modules/xlsx/LICENSE','dist/vendor/LICENSE.sheetjs');console.log('Built static client in dist/');
// GitHub Pages caches assets for ten minutes. Version the whole module graph so
// an updated entry page cannot mix old and new modules after a deployment.
const files=(await readdir('src')).filter(f=>/\.(js|css)$/.test(f)).sort(),hash=createHash('sha256');
for(const file of files)hash.update(file).update(await readFile('src/'+file));
const version=hash.digest('hex').slice(0,12);
for(const file of files.filter(f=>f.endsWith('.js'))){
 const path='dist/src/'+file,source=await readFile(path,'utf8');
 await writeFile(path,source.replace(/(\bfrom\s*)(['"])(\.{1,2}\/[^'"]+\.js)\2/g,(_,prefix,quote,url)=>`${prefix}${quote}${url}?v=${version}${quote}`));
 execFileSync(process.execPath,['--check',path],{stdio:'inherit'});
}
for(const file of (await readdir('dist')).filter(f=>f.endsWith('.html'))){
 const path='dist/'+file,source=await readFile(path,'utf8');
 await writeFile(path,source.replace(/((?:src|href)=["'])(\.\/src\/[^"']+\.(?:js|css))(["'])/g,`$1$2?v=${version}$3`));
}
console.log('Asset version:',version);
