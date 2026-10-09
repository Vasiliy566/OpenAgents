import assert from 'node:assert/strict';
import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validatePlugin,marketplace} from './contract.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(readFileSync(resolve(root,'.agents/plugins/marketplace.json'),'utf8'));
const expected=[],names=new Set();
function readPackage(folder){
 const files={};
 function walk(path){for(const name of readdirSync(path)){const entry=resolve(path,name),stat=lstatSync(entry);assert.ok(!stat.isSymbolicLink(),'No symlinks');if(stat.isDirectory())walk(entry);else{assert.ok(stat.isFile(),'Regular files only');const file=relative(folder,entry);files[file]=file.startsWith('assets/')?readFileSync(entry):readFileSync(entry,'utf8');}}}
 walk(folder);return files;
}
for(const entry of catalog.plugins){
 const match=entry.name.match(/^appinside-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/);assert.ok(match,'Unexpected plugin name');assert.ok(!names.has(entry.name),'Duplicate plugin');names.add(entry.name);
 const files=readPackage(resolve(root,'plugins',entry.name));
 const url=JSON.parse(files['mcp.json']).mcpServers.appinside.url,origin=new URL(url).origin;
 assert.ok(['https://appinagents.ru','https://appinside.planerverse.ru'].includes(origin),'Unexpected hosted service');
 const checked=validatePlugin(files,{id:match[1],origin});expected.push({name:entry.name,category:checked.ui.category});
}
for(const name of readdirSync(resolve(root,'plugins')))assert.ok(name==='.gitkeep'||names.has(name),'Unlisted plugin folder');
assert.deepEqual(catalog,marketplace(expected));
console.log(`Validated ${expected.length} OpenAgents plugin(s).`);
