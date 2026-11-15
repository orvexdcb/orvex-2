const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'shop-home.js'), 'utf8');
const window = {};
vm.runInNewContext(source, { window, console, Date, Math, Set, Map, Array, Object, String, Number, JSON });
const api = window.__orvexShopHome;

const env = {
  can: () => true, canView: () => true,
  hasQuotes: () => true, money: n => String(n), fmt: n => String(n),
  today: '2099-01-01',
  db: { sales: [], products: [] }, expiring: () => 0
};

test('all 17 main business activity codes have independent profiles', () => {
  const codes = [
    'general_trade','food_consumer','fashion','electronics','phones_telecom',
    'automotive','construction','furniture','health_pharma','restaurants',
    'perfume_beauty','jewelry_gold','stationery_books','professional_services',
    'industrial','agricultural','other'
  ];
  assert.equal(Object.keys(api.ACTIVITY_PROFILES).length, 17);
  for (const code of codes) {
    const profile = api.ACTIVITY_PROFILES[code];
    assert.ok(profile, 'missing profile: ' + code);
    const html = api.panelHtml({ layout: 'retail' }, {
      name: 'اختبار', activity: profile.title, activityCode: code, features: []
    }, env);
    assert.match(html, new RegExp('data-activity="' + code + '"'));
    assert.match(html, new RegExp('sh-profile-' + code));
    assert.ok(html.includes(profile.title));
  }
});

test('resolved sub-activity keeps the actual main activity profile code', () => {
  const r = api.resolveActivityProfile({
    main: { code: 'fashion', name_ar: 'الملابس' },
    sub: { code: 'fashion.mens', name_ar: 'ملابس رجالية' },
    spec: { code: 'fashion.mens.shoes', name_ar: 'أحذية رجالية' }
  });
  assert.equal(r.code, 'fashion');
  assert.equal(r.level, 'specialty');
  assert.equal(r.profile, api.ACTIVITY_PROFILES.fashion);
  assert.equal(r.label, 'الملابس ‹ ملابس رجالية ‹ أحذية رجالية');
});

test('unknown activity codes do not get silently mapped to another template', () => {
  const r = api.resolveActivityProfile({
    main: { code: 'custom_activity', name_ar: 'نشاط مخصص' }
  });
  assert.equal(r.code, 'custom_activity');
  assert.equal(r.profile, null);
  const html = api.panelHtml({ layout: 'services' }, {
    activity: r.label, activityCode: r.code, features: []
  }, env);
  assert.match(html, /data-activity="custom_activity"/);
  assert.match(html, /sh-profile-custom_activity/);
});

test('dashboard rendering is read-only with respect to shop and sales records', () => {
  const sales = [{ date: '2099-01-01', total: 123, id: 'sale-1' }];
  const products = [{ id: 'product-1', stock: 4, min: 2 }];
  const before = JSON.stringify({ sales, products });
  api.panelHtml({ layout: 'retail' }, {
    name: 'محل اختبار', activity: 'التجارة العامة',
    activityCode: 'general_trade', features: []
  }, { ...env, db: { sales, products } });
  assert.equal(JSON.stringify({ sales, products }), before);
});
