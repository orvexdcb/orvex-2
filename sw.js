/* ORVEX service worker: يعمل التطبيق دون إنترنت بعد أول زيارة */
const VER='orvex-root-v52-release-center';
const CLEAN_ROOT_CACHES=VER.startsWith('orvex-root-');
const CORE=['./','index.html','shopfix.js','shopfix2.js','storage.js','core.js','home.js','pos.js','inventory.js','parties.js','purchases.js','reports.js','demo.js','users.js','closings.js','addon.js','inventory2.js','inventory3.js','ledger.js','finance2.js','loyalty2.js','quotes2.js','isolation.js','safety2.js','loyalty.js','staff2.js','hr2.js','assets3.js','mfg.js','schedrep.js','assets2.js','coupons2.js','reports2.js','session-store.js','preturns.js','server.js','mall.js','scanner.js','sync-ui.js','accounting.js','accounting-ui.js','sync-merge.js','syncq.js','tax.js','quotes.js','feedback.js','theme-toggle-dashboard.js','maps.js','designer-hub.js','update-center.js','orvex-build.js','vendor/leaflet/leaflet.js','vendor/leaflet/leaflet.css','vendor/leaflet/images/layers.png','vendor/leaflet/images/layers-2x.png','vendor/leaflet/images/marker-icon.png','vendor/leaflet/images/marker-icon-2x.png','vendor/leaflet/images/marker-shadow.png','pwa.js','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png'];
self.addEventListener('message',e=>{if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('install',e=>{e.waitUntil(caches.open(VER).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil((CLEAN_ROOT_CACHES?caches.keys().then(k=>Promise.all(k.filter(x=>x!==VER&&(x.startsWith('orvex-root-')||/^orvex-v\d/.test(x))).map(x=>caches.delete(x)))):Promise.resolve()).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET')return;
  /* لا نعترض طلبات الخادم (Supabase) أبدًا: البيانات والمصادقة دائمًا مباشرة */
  const fonts=u.hostname==='fonts.googleapis.com'||u.hostname==='fonts.gstatic.com';
  if(u.origin!==location.origin&&!fonts)return;
  if(fonts){
    e.respondWith(caches.open(VER).then(c=>c.match(r).then(h=>{
      const f=fetch(r).then(n=>{if(n&&(n.ok||n.type==='opaque'))c.put(r,n.clone());return n}).catch(()=>h);
      return h||f})));
    return;
  }
  /* ملفات التطبيق: الشبكة أولًا (لتجنب عدم تطابق index.html مع app.js) ثم النسخة المخزنة */
  const key=r.mode==='navigate'?'index.html':r;
  e.respondWith(fetch(r.mode==='navigate'?r:new Request(r,{cache:'no-cache'})).then(n=>{if(n.ok){const cp=n.clone();caches.open(VER).then(c=>c.put(key,cp))}return n})
    .catch(()=>caches.match(key).then(h=>h||caches.match('./'))));
});
