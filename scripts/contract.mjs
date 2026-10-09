import {createHash} from 'node:crypto';
import {deflateSync,crc32} from 'node:zlib';

export const repository='Vasiliy566/OpenAgents';
export const repositoryURL='https://github.com/'+repository;
export const consentVersion='openagents-2026-10-09';
export const consentText='Разрешаю опубликовать карточку, изображения, имя издателя и адрес подключения в OpenAgents и публичном GitHub. Подтверждаю права на эти материалы. После удаления из каталога ранее опубликованные версии сохранятся в истории GitHub.';
export const pluginName=id=>'appinside-'+id;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fail=message=>{throw Error(message)};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function fields(value,allowed,label){if(!object(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail('Неверная структура: '+label);}
const secrets=/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,})|\bBearer\s+[A-Za-z0-9._-]{16,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/i;
function text(value,max,label){if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f<>]/.test(value)||secrets.test(value))fail('Проверьте текст: '+label);return value;}
function publicURL(value){
 let url;try{url=new URL(value)}catch{fail('Нужна публичная HTTPS-ссылка')}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!url.hostname.includes('.')||url.hostname.includes(':')||/(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)||/^\d+\./.test(url.hostname)||[...url.searchParams.keys()].some(key=>/token|key|secret|password|auth|session/i.test(key))||secrets.test(value))fail('Ссылка содержит закрытый адрес или секрет');
 return url;
}
export function defaultIcon(color='#C2410C'){
 if(!/^#[\da-f]{6}$/i.test(color))fail('Некорректный цвет');
 const rgb=[1,3,5].map(index=>parseInt(color.slice(index,index+2),16)),rows=[];
 for(let y=0;y<64;y++){const row=Buffer.alloc(1+64*4);for(let x=0;x<64;x++){const ring=x>=18&&x<=45&&y>=18&&y<=45&&(x<=21||x>=42||y<=21||y>=42),center=x>=28&&x<=35&&y>=28&&y<=35;row.set(ring||center?[255,255,255,255]:[...rgb,255],1+x*4)}rows.push(row)}
 const chunk=(type,data)=>{const name=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([size,name,data,crc])};
 const header=Buffer.alloc(13);header.writeUInt32BE(64);header.writeUInt32BE(64,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))]);
}
function image(bytes,path){
 if(bytes.length>1_048_576)fail('Изображение больше 1 МБ');
 if(path.endsWith('.png')){
  if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))fail('Некорректный PNG');
  let offset=8,ended=false,hasData=false;
  while(offset+12<=bytes.length){const size=bytes.readUInt32BE(offset),end=offset+12+size;if(end>bytes.length)fail('Некорректный PNG');const kind=bytes.toString('ascii',offset+4,offset+8);if(crc32(bytes.subarray(offset+4,end-4))!==bytes.readUInt32BE(end-4))fail('Некорректный PNG');if(offset===8&&(kind!=='IHDR'||size!==13))fail('Некорректный PNG');if(kind==='IDAT')hasData=true;offset=end;if(kind==='IEND'){ended=size===0;break}}
  if(!ended||!hasData||offset!==bytes.length||bytes.readUInt32BE(16)<48||bytes.readUInt32BE(16)>4096||bytes.readUInt32BE(20)<48||bytes.readUInt32BE(20)>4096)fail('Некорректный PNG');
 }else if(bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)fail('Некорректный JPEG');
}
// Deliberately narrower than the general plugin specification. No skills,
// commands, local servers, hooks, uploaded source or executable assets.
export function validatePlugin(files,{id,origin}={}){
 if(!uuid.test(id||''))fail('Неверный идентификатор приложения');
 if(!object(files)||Object.keys(files).length>9)fail('Неверный состав пакета');
 let total=0;
 for(const [path,value]of Object.entries(files)){
  if(!/^(?:plugin\.json|mcp\.json|README\.md|assets\/(?:logo|icon|screenshot-[1-5])\.(?:png|jpg))$/.test(path))fail('В пакете есть исполняемый или неизвестный файл');
  const bytes=Buffer.from(value);total+=bytes.length;if(bytes.length>1_100_000||total>6_500_000)fail('Слишком большой пакет');
  if(path.startsWith('assets/'))image(bytes,path);else if(secrets.test(bytes.toString('utf8')))fail('В материалах найден возможный секрет');
 }
 let manifest,mcp;try{manifest=JSON.parse(String(files['plugin.json']));mcp=JSON.parse(String(files['mcp.json']))}catch{fail('Некорректный JSON пакета')}
 fields(manifest,['$schema','name','version','description','author','homepage','extensions'],'plugin.json');
 if(manifest.$schema!=='https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'||manifest.name!==pluginName(id)||!/^1\.0\.[1-9]\d*$/.test(manifest.version))fail('Неверная версия или имя пакета');
 text(manifest.description,4000,'описание');fields(manifest.author,['name'],'издатель');text(manifest.author.name,100,'издатель');publicURL(manifest.homepage);
 fields(manifest.extensions,['com.openai'],'extensions');fields(manifest.extensions['com.openai'],['interface'],'OpenAI');
 const ui=manifest.extensions['com.openai'].interface;
 fields(ui,['displayName','shortDescription','longDescription','developerName','category','capabilities','websiteURL','supportURL','privacyPolicyURL','termsOfServiceURL','defaultPrompt','brandColor','composerIcon','logo','screenshots'],'карточка');
 for(const [key,max]of [['displayName',30],['shortDescription',30],['longDescription',4000],['developerName',100]])text(ui[key],max,key);
 if(!['Productivity','Developer Tools'].includes(ui.category)||!/^#[\da-f]{6}$/i.test(ui.brandColor)||!Array.isArray(ui.capabilities)||!ui.capabilities.length||ui.capabilities.some(v=>!['Read','Write'].includes(v)))fail('Некорректные свойства карточки');
 for(const key of ['websiteURL','supportURL','privacyPolicyURL','termsOfServiceURL'])publicURL(ui[key]);
 if(!Array.isArray(ui.defaultPrompt)||ui.defaultPrompt.length>3)fail('Некорректные примеры запросов');ui.defaultPrompt.forEach(v=>text(v,128,'запрос'));
 if(ui.screenshots!==undefined&&(!Array.isArray(ui.screenshots)||ui.screenshots.length>5))fail('Некорректные скриншоты');
 for(const path of [ui.logo,ui.composerIcon,...(ui.screenshots||[])])if(typeof path!=='string'||!path.startsWith('./assets/')||!Object.hasOwn(files,path.slice(2)))fail('Изображение не найдено');
 fields(mcp,['$schema','mcpServers'],'mcp.json');fields(mcp.mcpServers,['appinside'],'MCP servers');fields(mcp.mcpServers.appinside,['type','url'],'MCP connection');
 const expected=publicURL(origin).origin+'/mcp/'+id+'/authorized';
 if(mcp.$schema!=='https://agent-plugins.org/schemas/1.0.0/mcp.schema.json'||mcp.mcpServers.appinside.type!=='streamable-http'||mcp.mcpServers.appinside.url!==expected)fail('Разрешено только размещённое AppInside подключение с OAuth');
 if(typeof files['README.md']!=='string'||files['README.md'].length>20000)fail('Нужна инструкция установки');
 return {manifest,ui,sha256:createHash('sha256').update(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)).map(([path,value])=>path+':'+createHash('sha256').update(value).digest('hex')).join('\n')).digest('hex')};
}
export function marketplace(entries=[]){return {name:'openagents',interface:{displayName:'OpenAgents'},plugins:entries.sort((a,b)=>a.name.localeCompare(b.name)).map(({name,category})=>({name,source:{source:'local',path:'./plugins/'+name},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'},category}))};}
export function decodeFiles(payload){return Object.fromEntries(Object.entries(payload.files).map(([path,value])=>[path,path.startsWith('assets/')?Buffer.from(value,'base64'):Buffer.from(value,'base64').toString('utf8')]));}
