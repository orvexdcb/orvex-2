/* ORVEX — شاشة أخطاء مؤقتة (تُحمَّل أولاً). تعرض أي خطأ JavaScript على الشاشة بدل الصفحة البيضاء.
   لإزالتها لاحقاً: احذف وسم <script src="shopfix.js"> من index.html. */
(function(){
  var box=null,n=0;
  function ensure(){
    if(box&&document.body&&document.body.contains(box))return box;
    if(!document.body)return null;
    box=document.createElement('div');box.id='orvexErr';
    box.setAttribute('style','position:fixed;left:0;right:0;bottom:0;max-height:55vh;overflow:auto;z-index:2147483647;background:#7a0b0b;color:#fff;font:12px/1.5 monospace;direction:ltr;text-align:left;padding:10px 12px;white-space:pre-wrap;word-break:break-word;box-shadow:0 -4px 20px rgba(0,0,0,.4)');
    var h=document.createElement('div');h.setAttribute('style','display:flex;gap:8px;justify-content:space-between;font:bold 13px sans-serif;margin-bottom:6px');
    h.innerHTML='<span>ORVEX debug — JS error</span><span><button id="orvexErrCopy" style="padding:2px 8px">copy</button> <button id="orvexErrX" style="padding:2px 8px">×</button></span>';
    box.appendChild(h);document.body.appendChild(box);
    document.getElementById('orvexErrX').onclick=function(){box.remove();box=null};
    document.getElementById('orvexErrCopy').onclick=function(){try{navigator.clipboard.writeText(box.innerText)}catch(e){}};
    return box;
  }
  function show(kind,msg,src,line,col,stack){
    try{
      window.__orvexErrors=(window.__orvexErrors||[]).concat([{kind:kind,msg:String(msg),src:src,line:line,col:col}]);
      if(++n>8)return;
      var b=ensure();if(!b){document.addEventListener('DOMContentLoaded',function(){show(kind,msg,src,line,col,stack)});return}
      var d=document.createElement('div');d.setAttribute('style','border-top:1px solid rgba(255,255,255,.3);padding-top:6px;margin-top:6px');
      d.textContent='['+kind+'] '+msg+(src?'\n@ '+String(src).split('/').pop()+':'+(line||'?')+':'+(col||'?'):'')+(stack?'\n'+String(stack).split('\n').slice(0,6).join('\n'):'')+'\nUA: '+navigator.userAgent;
      b.appendChild(d);
    }catch(e){}
  }
  window.addEventListener('error',function(e){show('error',e.message,e.filename,e.lineno,e.colno,e.error&&e.error.stack)});
  window.addEventListener('unhandledrejection',function(e){var r=e.reason;show('promise',r&&r.message||r,'','','',r&&r.stack)});
  window.__orvexShowErr=function(tag,e){show(tag,e&&e.message||e,'','','',e&&e.stack)};
})();
