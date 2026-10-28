import { cp, writeFile, readFile } from "node:fs/promises";
await cp("dist", "docs/qa/preview", { recursive: true });
const mock = `const ev=()=>{const listeners=new Set();return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),emit:(...args)=>listeners.forEach(fn=>fn(...args))};};
const tree=[{id:'0',title:'',children:[{id:'1',title:'Bookmarks Bar',folderType:'bookmarks-bar',parentId:'0',children:[{id:'work',title:'Workspace',parentId:'1',children:[{id:'notes',title:'Product notes',url:'https://notion.so/example-product-notes',parentId:'work'},{id:'research',title:'Design library',parentId:'work',children:[{id:'guide',title:'Design system',url:'https://github.com/example/design-system',parentId:'research'},{id:'ideas',title:'Interface inspiration',url:'https://example.test/inspiration',parentId:'research'}]}]},{id:'reading',title:'Read later',parentId:'1',children:[{id:'read',title:'A quieter way to browse',url:'https://example.test/reading',parentId:'reading'}]},{id:'mail',title:'Gmail',url:'https://mail.google.com/',parentId:'1'},{id:'calendar',title:'Calendar',url:'https://calendar.google.com/',parentId:'1'},{id:'code',title:'GitHub',url:'https://github.com/',parentId:'1'},{id:'docs',title:'Notion',url:'https://notion.so/',parentId:'1'}]}]}];
const tabs=[{id:1,windowId:1,index:0,title:'Product notes',url:'https://notion.so/example-product-notes',active:true},{id:2,windowId:1,index:1,title:'Design system · Pull requests',url:'https://github.com/example/design-system/pulls'},{id:3,windowId:1,index:2,title:'The creative process',url:'https://example.test/creative-process'},{id:4,windowId:1,index:3,title:'Release checklist',url:'https://notion.so/example-release-checklist'},{id:5,windowId:2,index:0,title:'Design explorations',url:'https://notion.so/example-design-explorations'}];
let prefs={schemaVersion:1,bookmarkRootId:'1',favourites:['mail','calendar','code','docs'],icons:{},expanded:['work','research'],savedCollapsed:false,theme:'system'};
let session={associations:{1:{notes:1}},mru:[1,2,3,4,5],panels:{},fullscreen:{}};
const storageEvent=ev();const bookmarkEvents=Object.fromEntries(['onCreated','onChanged','onMoved','onRemoved','onChildrenReordered'].map(k=>[k,ev()]));const tabEvents=Object.fromEntries(['onCreated','onUpdated','onRemoved','onMoved','onActivated','onAttached','onDetached','onReplaced'].map(k=>[k,ev()]));const requests=[];
window.fixture={requests,setPrefs:patch=>{const oldValue=prefs;prefs={...prefs,...patch};storageEvent.emit({preferences:{oldValue,newValue:prefs}},'local');},bookmarkEvents,tabEvents,tree,tabs};
window.chrome={storage:{local:{get:async()=>({preferences:structuredClone(prefs)}),set:async v=>{if(v.preferences)window.fixture.setPrefs(v.preferences);}},session:{get:async()=>({session:structuredClone(session)}),set:async()=>{}},onChanged:storageEvent},bookmarks:{getTree:async()=>structuredClone(tree),...bookmarkEvents},tabs:{query:async()=>structuredClone(tabs),get:async id=>structuredClone(tabs.find(t=>t.id===id)),...tabEvents},windows:{getCurrent:async()=>({id:1,type:'normal'}),get:async id=>({id,type:'normal'})},commands:{getAll:async()=>[{name:'_execute_action',shortcut:'⌘⇧K'},{name:'toggle-sidebar',shortcut:'⌘⇧Y'}]},runtime:{getURL:path=>location.origin+'/'+path,connect:()=>({onDisconnect:ev()}),sendMessage:async m=>{requests.push(m);return {ok:true};},openOptionsPage:async()=>{}},action:{openPopup:async()=>{}}};`;
await writeFile("docs/qa/preview/mock.js", mock);
for (const page of ["sidebar", "palette", "options"]) {
  let html = await readFile("dist/" + page + ".html", "utf8");
  html = html.replace(
    '<script type="module"',
    '<script src="mock.js"></script><script type="module"',
  );
  html = html.replace(
    "</head>",
    '<link rel="stylesheet" href="preview.css"></head>',
  );
  html = html.replace(
    "</body>",
    '<aside class="preview-label"><span>IMPLEMENTED UI PREVIEW · synthetic fixtures</span><span>Not installed-extension evidence</span></aside></body>',
  );
  await writeFile("docs/qa/preview/" + page + ".html", html);
}
await writeFile(
  "docs/qa/preview/preview.css",
  `.preview-label{position:fixed;bottom:0;left:0;right:0;background:var(--surface);color:var(--muted);border-top:1px solid var(--line);padding:9px 12px;font:9px -apple-system,sans-serif;line-height:1.4;letter-spacing:.02em;z-index:50}body[data-page=sidebar] #app{height:calc(100vh - 44px)}body.palette{padding-bottom:54px}.preview-label span{display:block}.palette .preview-label span+span:before{content:"· "}.palette .preview-label{display:flex;gap:8px}`,
);
