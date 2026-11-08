/* ORVEX — إصلاح واجهة المحل (يُحمَّل بعد server.js وقبل بقية الإضافات المتأخرة).
   1) تنظيف صفوف البيانات المسحوبة من السحابة في الذاكرة فقط (صفوف null، حقول ناقصة/بنوع خاطئ) كي لا ينهار العرض.
      لا يُرسَل شيء إلى Supabase: نحدّث مرجع `last` كي لا تُعدّ الصفوف «معدّلة».
   2) render آمن: أي خطأ يظهر على الشاشة مع رسالة واضحة بدل شاشة بيضاء.
   3) CSS: منع اتساع الصفحة أفقياً على الهاتف (كان يزيح الواجهة خارج الشاشة). */
(function(){
  var st=document.createElement('style');
  st.textContent=
   'html,body{max-width:100%;overflow-x:hidden}'+
   '.odash-home .od-home-main,.odash .od-main{min-width:0;max-width:100%;width:100%;box-sizing:border-box;justify-self:stretch}'+
   '.od-home-tiles,.od-home-summary{max-width:100%}'+
   '@media(max-width:520px){.od-home-tiles{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important}.od-home-tile{min-height:140px!important;padding:14px 8px!important}.od-home-tile b{font-size:16px!important}.od-home-summary{grid-template-columns:minmax(0,1fr)!important}.od-welcome,.ox-bar,.od-low{max-width:100%;box-sizing:border-box;flex-wrap:wrap}}';
  document.head.appendChild(st);

  var S=function(v,d){return typeof v==='string'?v:(v==null?d:String(v))};
  var N=function(v){var n=parseFloat(v);return isFinite(n)?n:0};
  var D=function(v){
    if(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}/.test(v))return v.slice(0,10);
    var t=typeof v==='number'?v:Date.parse(v);
    if(isFinite(t)){try{return ymd(new Date(t))}catch(e){}}
    return '';
  };
  function fixRow(k,r){
    var changed=false;
    function set(key,value){if(r[key]!==value){r[key]=value;changed=true}}
    if(k==='products'){set('name',S(r.name,''));set('stock',N(r.stock));set('min',N(r.min));set('price',N(r.price));set('cost',N(r.cost))}
    else if(k==='customers'||k==='suppliers'){set('name',S(r.name,''));set('balance',N(r.balance))}
    else if(k==='sales'){
      set('date',D(r.date||r.createdAt||r.ts));set('no',S(r.no,''));set('total',N(r.total));
      set('net',r.net==null?N(r.total):N(r.net));set('paid',N(r.paid));set('cost',N(r.cost));
      if(!Array.isArray(r.items))set('items',[]);
    }
    else if(k==='returns'){set('date',D(r.date));set('net',N(r.net));set('cost',N(r.cost))}
    else if(k==='expenses'||k==='payments'){set('date',D(r.date));set('amount',N(r.amount))}
    return changed;
  }
  window.orvexSanitizeDb=function(){
    if(typeof db==='undefined'||!db)return;
    var keys=(typeof COLL!=='undefined'?COLL:['products','customers','sales']);
    keys.forEach(function(k){
      if(!Array.isArray(db[k])){db[k]=[];return}
      if(db[k].some(function(r){return !r||typeof r!=='object'}))db[k]=db[k].filter(function(r){return r&&typeof r==='object'});
      db[k].forEach(function(r){
        if(fixRow(k,r)&&r.id&&typeof last!=='undefined'&&last&&last[k])last[k][r.id]=JSON.stringify(r);
      });
    });
    if(!db.settings||typeof db.settings!=='object')db.settings=normalize(fresh()).settings;
    db.settings.name=S(db.settings.name,'');
    if(!db.features||typeof db.features!=='object')db.features={};
    if(!Array.isArray(db.users))db.users=[];
  };

  var _r=render;
  render=function(){
    try{window.orvexSanitizeDb()}catch(e){window.__orvexShowErr&&window.__orvexShowErr('sanitize',e)}
    try{return _r.apply(this,arguments)}
    catch(e){
      console.error('[ORVEX render]',e);
      window.__orvexShowErr&&window.__orvexShowErr('render',e);
      var m=document.getElementById('main');
      if(m&&!m.innerHTML.trim())m.innerHTML='<div style="padding:24px;direction:rtl;font-family:sans-serif"><h3>تعذّر عرض الشاشة</h3><p>'+String(e&&e.message||e).replace(/[<>&]/g,'')+'</p><button class="btn" onclick="location.reload()">إعادة تحميل</button></div>';
    }
  };
})();
