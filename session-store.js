/* ORVEX: حفظ جلسة التبويب واستعادتها (منفصل عن منطق تحديث الملفات وتسجيل الخروج).
   - يحفظ فقط اسم المستخدم + refresh token + uid داخل sessionStorage. لا كلمات مرور ولا بيانات متجر.
   - clear() يُستدعى من تسجيل الخروج وعند ثبوت بطلان الجلسة فقط؛ لا يُستدعى أثناء التحديث.
   - suspend() بعد تسجيل الخروج يمنع أي تجديد متأخر للرمز من إعادة كتابة الجلسة (فلا تُستعاد بعد الخروج).
   - beginRestore() حارس ضد حلقات إعادة المحاولة: 3 محاولات كحد أقصى كل 60 ثانية. */
(function(root){
'use strict';
var KEY='orvex_tab_session_v1',UPD='orvex_update_marker_v1',TRY='orvex_restore_try_v1',off=false;
function ss(){try{return root.sessionStorage||null}catch(e){return null}}
function get(k){var s=ss();try{return s?s.getItem(k):null}catch(e){return null}}
function set(k,v){var s=ss();try{if(!s)return false;s.setItem(k,v);return true}catch(e){return false}}
function del(k){var s=ss();try{if(s)s.removeItem(k)}catch(e){}}
function save(o){if(off||!o||!o.rt||!o.username)return false;return set(KEY,JSON.stringify({username:String(o.username),rt:String(o.rt),uid:o.uid||'',t:Date.now()}))}
function load(){try{var j=JSON.parse(get(KEY)||'null');return j&&j.rt&&j.username?j:null}catch(e){return null}}
function clear(){del(KEY);del(UPD);del(TRY)}
function suspend(){off=true}
function resume(){off=false}
function markUpdate(){set(UPD,String(Date.now()))}
function isUpdate(){var t=+get(UPD)||0;return t>0&&Date.now()-t<5*60000}
function beginRestore(){
  var now=Date.now(),t=null;try{t=JSON.parse(get(TRY)||'null')}catch(e){}
  if(!t||typeof t.at!=='number'||now-t.at>60000)t={n:0,at:now};
  t.n++;set(TRY,JSON.stringify(t));return t.n<=3}
function endRestore(){del(TRY);del(UPD)}
/* 400/401/403/422 من رمز التحديث = جلسة منتهية أو مُبطلة؛ غير ذلك (5xx، شبكة) = عطل مؤقت لا يُمسح معه الرمز */
function classify(status){return(status===400||status===401||status===403||status===422)?'expired':'transient'}
root.orvexSession={save:save,load:load,clear:clear,suspend:suspend,resume:resume,markUpdate:markUpdate,isUpdate:isUpdate,beginRestore:beginRestore,endRestore:endRestore,classify:classify,KEY:KEY};
})(typeof window!=='undefined'?window:globalThis);
