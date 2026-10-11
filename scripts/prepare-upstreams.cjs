// Restore pinned upstream sources and apply Micky's recorded Windows/local changes.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function git(args,cwd=root,required=true){const p=spawnSync('git',args,{cwd,encoding:'utf8',windowsHide:true});if(required&&p.status!==0)throw Error(p.stderr||p.stdout||'Git failed');return p;}
function inside(base,relative){const result=path.resolve(base,relative);if(!result.startsWith(path.resolve(base)+path.sep))throw Error('Invalid integration path');return result;}
git(['submodule','update','--init','--recursive']);
for(const item of JSON.parse(fs.readFileSync(path.join(root,'integrations/upstreams.json'),'utf8'))){
 const checkout=inside(root,item.name);
 if(git(['rev-parse','HEAD'],checkout).stdout.trim()!==item.commit)throw Error(item.name+' is at a different revision; inspect local changes before updating it');
 if(item.patch){const patch=inside(root,item.patch);if(git(['apply','--check',patch],checkout,false).status===0)git(['apply',patch],checkout);
  else if(git(['apply','--reverse','--check',patch],checkout,false).status!==0)throw Error(item.name+' patch conflicts with local changes');}
 if(item.overlay){const overlay=inside(root,item.overlay);
  function copy(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const source=path.join(dir,entry.name);if(entry.isDirectory())copy(source);else{const relative=path.relative(overlay,source),target=inside(checkout,relative),bytes=fs.readFileSync(source);if(fs.existsSync(target)&&!fs.readFileSync(target).equals(bytes))throw Error('Preserving changed overlay: '+item.name+'/'+relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}}}copy(overlay);}
 console.log(item.name+': pinned revision and Micky changes prepared');
}
