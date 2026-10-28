import { cp, writeFile } from "node:fs/promises";
await cp("dist", "docs/qa/preview", { recursive: true });
const mock = `const event={addListener(){},removeListener(){}};
const tree=[{id:'0',title:'',children:[{id:'1',title:'Bookmarks Bar',folderType:'bookmarks-bar',parentId:'0',children:[{id:'work',title:'Studio',parentId:'1',children:[{id:'notes',title:'Project notes',url:'https://example.test/notes',parentId:'work'},{id:'research',title:'Research',parentId:'work',children:[{id:'guide',title:'Design reference',url:'https://example.test/design',parentId:'research'}]}]},{id:'reading',title:'Reading list',parentId:'1',children:[{id:'read',title:'A quieter way to browse',url:'https://example.test/reading',parentId:'reading'}]},{id:'mail',title:'Mail',url:'https://example.test/mail',parentId:'1'},{id:'calendar',title:'Calendar',url:'https://example.test/calendar',parentId:'1'},{id:'code',title:'Source code',url:'https://example.test/code',parentId:'1'},{id:'docs',title:'Documentation',url:'https://example.test/docs',parentId:'1'}]}]}];
const tabs=[{id:1,windowId:1,index:0,title:'Project notes',url:'https://example.test/notes',active:true},{id:2,windowId:1,index:1,title:'Design systems handbook',url:'https://example.test/handbook'},{id:3,windowId:1,index:2,title:'Weekend reading',url:'https://example.test/weekend'},{id:4,windowId:1,index:3,title:'Release checklist',url:'https://example.test/release'},{id:5,windowId:2,index:0,title:'Design inspiration',url:'https://example.test/inspiration'}];
const prefs={schemaVersion:1,bookmarkRootId:'1',favourites:['mail','calendar','code','docs'],icons:{mail:'M',calendar:'C',code:'⌘',docs:'D'},expanded:['work','research'],savedCollapsed:false,theme:'light'};
window.chrome={storage:{local:{get:async()=>({preferences:prefs}),set:async()=>{}},session:{get:async()=>({session:{associations:{1:{notes:1}},mru:[1,2,3,4,5],panels:{},fullscreen:{}}}),set:async()=>{}},onChanged:event},bookmarks:{getTree:async()=>tree,onCreated:event,onChanged:event,onMoved:event,onRemoved:event,onChildrenReordered:event},tabs:{query:async()=>tabs,onCreated:event,onUpdated:event,onRemoved:event,onMoved:event,onActivated:event,onAttached:event,onDetached:event,onReplaced:event},windows:{getCurrent:async()=>({id:1,type:'normal'})},commands:{getAll:async()=>[{name:'_execute_action',shortcut:'⌘⇧K'},{name:'toggle-sidebar',shortcut:'⌘⇧Y'}]},runtime:{connect:()=>({onDisconnect:event}),sendMessage:async()=>({ok:true}),openOptionsPage:async()=>{}},action:{openPopup:async()=>{}}};`;
await writeFile("docs/qa/preview/mock.js", mock);
for (const page of ["sidebar", "palette"]) {
  const { readFile } = await import("node:fs/promises");
  let html = await readFile("dist/" + page + ".html", "utf8");
  html = html
    .replace("<body", "<body")
    .replace('<div id="app">', '<div id="app">');
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
    '<aside class="preview-label">IMPLEMENTED UI PREVIEW · synthetic fixtures · not installed-extension evidence</aside><script src="preview.js"></script></body>',
  );
  await writeFile("docs/qa/preview/" + page + ".html", html);
}
await writeFile(
  "docs/qa/preview/preview.css",
  `body{padding-bottom:40px}.preview-label{position:fixed;bottom:0;left:0;right:0;background:#fff;color:#49434f;border-top:1px solid #d7d1df;padding:12px;font:10px -apple-system,sans-serif;z-index:50}body[data-page=sidebar] #app{height:calc(100vh - 40px)}.palette{width:600px}.palette .preview-label{font-size:10px}`,
);
await writeFile(
  "docs/qa/preview/preview.js",
  `if(document.querySelector('#query'))setTimeout(()=>{const q=document.querySelector('#query');q.value='design';q.dispatchEvent(new Event('input'));},200);`,
);
