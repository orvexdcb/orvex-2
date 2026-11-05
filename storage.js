/* ORVEX Store: تخزين البيانات في IndexedDB مع بديل localStorage. يُحمَّل قبل core.js.
   - save(key,db): متزامنة وسريعة. تؤجل الكتابة قليلًا وتدمج الحفظات المتتالية.
   - كل مجموعة (مصفوفة) في db سجل مستقل + سجل meta لبقية الحقول. تُكتب المتغيّرة فقط، في معاملة واحدة ذرّية.
   - لا يُكتب شيء قبل enable() (يستدعيها initData بعد تحميل البيانات) كي لا تُستبدل البيانات الحقيقية بقاعدة فارغة.
   - الترحيل من localStorage: نسخة احتياطية في IDB ثم كتابة ثم تحقق بالقراءة العكسية ثم حذف القديم. أي فشل يُبقي القديم كما هو. */
const Store=(()=>{
  const DB='orvex_db',OS='kv',DELAY=80,LSP='orvex_kv:',KEEP_DAYS=30;
  const rk=(key,part)=>key+'#'+part,bk=n=>'bk#'+n;
  const S={kind:'none',ready:false,locked:false,onError:null};
  let be=null,timer=null,chain=Promise.resolve(),initP=null;
  const pending=new Map(),written=new Map();

  /* ---------- الواجهات الخلفية: كلها غير متزامنة وبنفس الشكل ---------- */
  function idbBackend(idb){
    let dbp=null;
    const open=()=>dbp||(dbp=new Promise((res,rej)=>{
      let r;try{r=idb.open(DB,1)}catch(e){return rej(e)}
      r.onupgradeneeded=()=>{try{r.result.createObjectStore(OS)}catch(e){}};
      r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error||new Error('idb open'));r.onblocked=()=>rej(new Error('idb blocked'));
    }).catch(e=>{dbp=null;throw e}));
    const tx=(mode,fn)=>open().then(d=>new Promise((res,rej)=>{
      let t;try{t=d.transaction(OS,mode)}catch(e){return rej(e)}
      const box={};
      t.oncomplete=()=>res(box.v);t.onerror=()=>rej(t.error||new Error('idb tx'));t.onabort=()=>rej(t.error||new Error('idb abort'));
      try{fn(t.objectStore(OS),box)}catch(e){try{t.abort()}catch(_){}rej(e)}
    }));
    return{kind:'idb',
      get:k=>tx('readonly',(s,b)=>{const r=s.get(k);r.onsuccess=()=>{b.v=r.result}}),
      getMany:ks=>tx('readonly',(s,b)=>{b.v={};ks.forEach(k=>{const r=s.get(k);r.onsuccess=()=>{b.v[k]=r.result}})}),
      batch:(puts,dels)=>tx('readwrite',s=>{puts.forEach(([k,v])=>s.put(v,k));(dels||[]).forEach(k=>s.delete(k))}),
      keys:p=>tx('readonly',(s,b)=>{const r=s.getAllKeys();r.onsuccess=()=>{b.v=(r.result||[]).filter(k=>String(k).startsWith(p))}})};
  }
  function lsBackend(){
    const g=k=>{const v=localStorage.getItem(LSP+k);return v===null?undefined:v};
    return{kind:'ls',
      get:async k=>g(k),
      getMany:async ks=>{const o={};ks.forEach(k=>{o[k]=g(k)});return o},
      batch:async(puts,dels)=>{puts.forEach(([k,v])=>localStorage.setItem(LSP+k,v));(dels||[]).forEach(k=>localStorage.removeItem(LSP+k))},
      keys:async p=>{const o=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.indexOf(LSP+p)===0)o.push(k.slice(LSP.length))}return o}};
  }
  function memBackend(){
    const m=new Map();
    return{kind:'mem',
      get:async k=>m.get(k),
      getMany:async ks=>{const o={};ks.forEach(k=>{o[k]=m.get(k)});return o},
      batch:async(puts,dels)=>{puts.forEach(([k,v])=>m.set(k,v));(dels||[]).forEach(k=>m.delete(k))},
      keys:async p=>[...m.keys()].filter(k=>k.indexOf(p)===0)};
  }

  /* ---------- التهيئة ---------- */
  S.init=()=>initP||(initP=(async()=>{
    try{if(typeof indexedDB!=='undefined'&&indexedDB){const b=idbBackend(indexedDB);await b.get('__probe');be=b}}catch(e){be=null}
    if(!be){try{localStorage.setItem(LSP+'__probe','1');localStorage.removeItem(LSP+'__probe');be=lsBackend()}catch(e){be=memBackend()}}
    S.kind=be.kind;
    try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{})}catch(e){}
    return S.kind;
  })());
  S.enable=()=>{if(!S.locked)S.ready=true};
  S.lock=()=>{S.locked=true;S.ready=false;pending.clear()};

  /* ---------- التسجيل والخطة ---------- */
  function records(key,d){
    const meta={},out=[],names=[];
    Object.keys(d).forEach(k=>{const v=d[k];if(Array.isArray(v)){names.push(k);out.push([rk(key,'c:'+k),JSON.stringify(v)])}else meta[k]=v});
    meta.__arrays=names;out.push([rk(key,'meta'),JSON.stringify(meta)]);
    return out;
  }
  const plan=(key,d)=>records(key,d).filter(([k,s])=>written.get(k)!==s);

  /* ---------- القراءة ---------- */
  /* تعيد null (لا بيانات)، أو {data,legacy?,raw?}، أو {corrupt:true,raw}. وترمي إن فشلت القراءة نفسها. */
  /* لقطة خام لكل سجلات المفتاح (JSON نصي) تُحفظ نسخةً احتياطية عند التلف، فلا تضيع الأجزاء السليمة */
  async function dumpRaw(key){
    try{const ks=await be.keys(key+'#'),got=await be.getMany(ks);return JSON.stringify(got)}catch(e){return ''}
  }
  S.loadDb=async key=>{
    await S.init();
    const bad=async extra=>Object.assign({corrupt:true,raw:await dumpRaw(key)},extra); /* تلف في سجلات IDB: النسخة = كل السجلات الموجودة */
    const metaS=await be.get(rk(key,'meta'));
    if(metaS===undefined){
      let raw=null;try{raw=localStorage.getItem(key)}catch(e){}
      if(!raw){ /* لا meta ولا قديم: إن بقيت سجلات مجموعات يتيمة فهذا فقدان لا بداية نظيفة */
        const orphan=await be.keys(key+'#c:');
        return orphan.length?bad({orphan:true}):null;
      }
      try{return{data:JSON.parse(raw),legacy:true,raw}}catch(e){return{corrupt:true,raw,legacy:true}}
    }
    let meta;try{meta=JSON.parse(metaS)}catch(e){return bad()}
    if(!meta||typeof meta!=='object')return bad();
    const names=Array.isArray(meta.__arrays)?meta.__arrays:[];delete meta.__arrays;
    const keys=names.map(n=>rk(key,'c:'+n)),recs=await be.getMany(keys);
    const data=Object.assign({},meta),w=[];
    for(let i=0;i<names.length;i++){
      const s=recs[keys[i]];
      if(typeof s!=='string')return bad({missing:names[i]});
      try{data[names[i]]=JSON.parse(s)}catch(e){return bad({broken:names[i]})}
      w.push([keys[i],s]);
    }
    w.forEach(([k,s])=>written.set(k,s));written.set(rk(key,'meta'),metaS);
    return{data};
  };

  /* ---------- الكتابة ---------- */
  async function doFlush(){
    if(!pending.size)return;
    await S.init();
    const batch=[...pending.entries()];pending.clear();
    try{
      const puts=[];batch.forEach(([key,d])=>{plan(key,d).forEach(p=>puts.push(p))});
      if(puts.length)await be.batch(puts,[]);
      puts.forEach(([k,v])=>written.set(k,v));
    }catch(e){
      batch.forEach(([key,d])=>{if(!pending.has(key))pending.set(key,d)}); /* لا نفقد التغيير: يُعاد في الحفظة التالية */
      if(S.onError)S.onError(e);
      throw e;
    }
  }
  S.save=(key,d)=>{
    if(!S.ready){if(S.locked&&S.onError)S.onError(new Error('storage locked'));return}
    pending.set(key,d);
    if(timer===null)timer=setTimeout(()=>{timer=null;S.flush().catch(()=>{})},DELAY);
  };
  S.flush=()=>{
    if(timer!==null){clearTimeout(timer);timer=null}
    const p=chain.then(doFlush);chain=p.catch(()=>{});return p;
  };
  S.pendingCount=()=>pending.size;
  S.clearDb=async key=>{
    pending.delete(key);await S.init();await chain;
    const ks=await be.keys(key+'#');if(ks.length)await be.batch([],ks);
    [...written.keys()].forEach(k=>{if(k.indexOf(key+'#')===0)written.delete(k)});
  };

  /* ---------- النسخ الاحتياطية ---------- */
  S.putBackup=async(name,obj)=>{await S.init();await be.batch([[bk(name),typeof obj==='string'?obj:JSON.stringify(obj)]],[])};
  S.getBackup=async(name,legacyLsKey)=>{
    await S.init();let s;try{s=await be.get(bk(name))}catch(e){}
    if(typeof s==='string'&&s)return s;
    if(legacyLsKey){try{return localStorage.getItem(legacyLsKey)||''}catch(e){}}
    return '';
  };
  S.hasBackup=async(name,legacyLsKey)=>!!(await S.getBackup(name,legacyLsKey));
  S.delBackup=async name=>{await S.init();await be.batch([],[bk(name)])};

  /* ---------- الترحيل من localStorage ---------- */
  S.migrateLegacy=async(key,d,raw)=>{
    await S.init();
    if(S.kind!=='idb')return false;                       /* البديل يقرأ localStorage مباشرة: لا ترحيل */
    await S.putBackup('legacy_localstorage',raw);          /* 1) نسخة خام في IDB */
    await be.batch([['mig#'+key,String(Date.now())]],[]);
    pending.set(key,d);await S.flush();                    /* 2) الكتابة */
    const all=records(key,d),got=await be.getMany(all.map(r=>r[0]));  /* 3) تحقق بالقراءة العكسية */
    for(const [k,s] of all)if(got[k]!==s)throw new Error('migration verify failed: '+k);
    try{localStorage.removeItem(key)}catch(e){}            /* 4) حذف القديم يحرر حصة localStorage */
    return true;
  };
  /* تُحذف نسخة ما قبل الترحيل بعد KEEP_DAYS يومًا */
  S.cleanup=async()=>{
    await S.init();if(S.kind!=='idb')return;
    const ks=await be.keys('mig#'),got=await be.getMany(ks);
    for(const k of ks){const t=+got[k];if(t&&Date.now()-t>KEEP_DAYS*864e5){await S.delBackup('legacy_localstorage');await be.batch([],[k])}}
  };

  /* حفظ ما في الانتظار عند إخفاء الصفحة أو إغلاقها (قد لا تكتمل المعاملة في كل المتصفحات، لذا التأخير قصير) */
  try{
    addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')S.flush().catch(()=>{})});
    addEventListener('pagehide',()=>{S.flush().catch(()=>{})});
  }catch(e){}
  return S;
})();
