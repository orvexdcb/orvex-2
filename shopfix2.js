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
    if(k==='products'){r.name=S(r.name,'');r.stock=N(r.stock);r.min=N(r.min);r.price=N(r.price);r.cost=N(r.cost)}
    else if(k==='customers'||k==='suppliers'){r.name=S(r.name,'');r.balance=N(r.balance)}
    else if(k==='sales'){r.date=D(r.date||r.createdAt||r.ts);r.no=S(r.no,'');r.total=N(r.total);r.net=r.net==null?N(r.total):N(r.net);r.paid=N(r.paid);r.cost=N(r.cost);if(!Array.isArray(r.items))r.items=[]}
    else if(k==='returns'){r.date=D(r.date);r.net=N(r.net);r.cost=N(r.cost)}
    else if(k==='expenses'||k==='payments'){r.date=D(r.date);r.amount=N(r.amount)}
  }
  window.orvexSanitizeDb=function(){
    if(typeof db==='undefined'||!db)return;
    var keys=(typeof COLL!=='undefined'?COLL:['products','customers','sales']);
    keys.forEach(function(k){
      if(!Array.isArray(db[k])){db[k]=[];return}
      if(db[k].some(function(r){return !r||typeof r!=='object'}))db[k]=db[k].filter(function(r){return r&&typeof r==='object'});
      db[k].forEach(function(r){
        var before=JSON.stringify(r);fixRow(k,r);
        if(before!==JSON.stringify(r)&&r.id&&typeof last!=='undefined'&&last&&last[k])last[k][r.id]=JSON.stringify(r);
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
