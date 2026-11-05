/* ORVEX — عزل بيانات المتاجر على الجهاز (isolation.js)
   المشكلة: عند دخول مدير متجر جديد على جهاز يحمل بيانات متجر/مؤسس آخر، كان التطبيق يعرض «استعادة البيانات المحلية ورفعها»
   فتُرفع بيانات المتجر الأول (أو كتالوج المؤسس) إلى المتجر الجديد. الحل: وسم مالك البيانات المحلية (shop:<id> أو founder:<id>)
   ولا تُعرض الاستعادة إلا لنفس المالك. مالك غير معروف (أجهزة قديمة قبل هذا التحديث) = لا استعادة تلقائية؛ النسخة تبقى محفوظة.
   يُحمَّل قبل server.js. */
(function(root){
'use strict';
const K=()=>(typeof KEY!=='undefined'?KEY:'orvex')+'_owner';
const mine=sb=>sb&&sb.shop?'shop:'+sb.shop:(sb&&sb.me&&sb.me.id?'founder:'+sb.me.id:'');
function prev(){try{return localStorage.getItem(K())||''}catch(e){return''}}
function set(o){try{if(o)localStorage.setItem(K(),o)}catch(e){}}
/* هل يجوز عرض استعادة بيانات محلية داخل هذه الجلسة؟ */
const canRestore=(prevOwner,myOwner)=>!!prevOwner&&!!myOwner&&prevOwner===myOwner;
root.orvexOwner={mine,prev,set,canRestore};
})(typeof window!=='undefined'?window:globalThis);
