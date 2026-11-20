#!/usr/bin/env node
// Generates the Make blueprint for the one-time Digi-Key -> Airtable update.
//   node tools/make/build-blueprint.js   ->  tools/make/digikey-to-airtable.blueprint.json
// Import it in Make: scenario editor > ... > Import blueprint. Then fill dkClientId / dkClientSecret in module 1.
//
// Only real Digi-Key data is written: items (sku, name, category, supplierId, unitCost, status) and
// suppliers (id, name, plannedLeadDays). stock, movements, purchaseOrders and warehouses are never touched.
// Nothing is written unless every Digi-Key call succeeded and at least 8 usable parts came back.
'use strict';
const fs = require('fs');
const path = require('path');

const AIRTABLE_CONN = 13251249; // "Airtable Token or Key" connection in Make (My Team)
const BASE = 'appHZ3j17mjTXiMP6';
const T = {
  items: { id: 'tblsmKND0GhKkRims', sku: 'fld3sA5klerzfVc4r', name: 'fldkx6oVanVYV0Eal', category: 'fldPckOkcylstxnse', supplierId: 'fldO5jOeABrcZHyIi', unitCost: 'fldoc54lkWFqBnJbW', status: 'fldG35nQILH0k0G04' },
  suppliers: { id: 'tblS1CxeV6YLxu593', key: 'fldSjUsOiffy4CjTz', name: 'fld9cmjzEsEWAb5TU', lead: 'fldt6WO11hjftITjY' },
  meta: { id: 'tblGmahWYWceghxkR', value: 'fldKN6W4BlP6dUiJn' },
};
const META = { lastUpdated: 'rec8hUTK0LNJdTcNV', loadStatus: 'recR3bSK4YzYAhDoC', loadError: 'recNxn6uHmIcwx5z7', lastAttempt: 'reci3muHrMjEe70aB' };

// Snapshot of the existing records (sku/id -> Airtable record ID), taken when this file was generated.
// Used to update existing records instead of creating duplicates, and to mark items Digi-Key no longer returns.
const EXISTING_ITEMS = {
  'ATTINY10-TS8RTR-ND': 'rec02QKSFwhyNRL6H', 'ATTINY4-TSHRTR-ND': 'rec0oaj7F1yaHGB6w', '541-10.0KLTR-ND': 'rec7TjoSejtx4VS2p',
  'P0.0JTR-ND': 'recFPrB8mMsuqJ8HV', 'ATTINY10-TSHRTR-ND': 'recJnNDcMI7dnA1fl', '490-18149-2-ND': 'recLDXuem0x9ckyfe',
  '1589-1958-2-ND': 'recN6QajBj73BlwxU', '490-NCU15XH103F6SRCTR-ND': 'recPdWWevPFUpX622', '311-3.30KHRTR-ND': 'recPsaMaUdIu8MNsr',
  '2057-PH1-03-UA-ND': 'recRYpPUHQsUzgL1c', '2449-CS1213AGF260TR-ND': 'recSz5LTOtNFP7YYX', '455-1318TR-ND': 'recU66jIscmpvnVRF',
  'SZNUD3124LT1GOSTR-ND': 'recVpHSY5zKnc8tQd', '587-1231-2-ND': 'recWzZb1cGbkUMFen', '455-1130TR-ND': 'recZNRok1W0joGTvB',
  '490-14514-2-ND': 'recaASeyEHgYzQR2n', '1589-1987-2-ND': 'recgbqeOy9MD4ulJr', '2138-JB2835BWT-G-U40GA0000-N0000001TR-ND': 'recpjJGVDUuGN4juW',
  '490-6328-2-ND': 'recqxQ534moSYl0JN', '445-2550-2-ND': 'recsS0NvV5o6uPXcK', 'SZNUD3124DMT1GOSTR-ND': 'rectny9MVZK89Fegb',
  '160-LTST-C190GKTTR-ND': 'recujCt14ufw1BBlI', '1589-1988-2-ND': 'recvPsAIVGPkn5Wh6', '455-1042TR-ND': 'recwZz8AWXBwhD93Q',
};
const EXISTING_SUPPLIERS = {
  'MFR-ONSEMI': 'rec00xyMFVuZccrSL', 'MFR-MICROCHIP-TECHNOLOGY': 'rec0dy0Em4sxsSqnN', 'MFR-TAIYO-YUDEN': 'rec4IYt7PhgVrZXcz',
  'MFR-VISHAY-DALE': 'rec5xWpG6mrrntZI3', 'MFR-LITE-ON-INC': 'recIo2vGJGHMl4wMt', 'MFR-ADAM-TECH': 'recTelSp3hUwbgvG8',
  'MFR-YAGEO': 'recW3lBU7o0DVdntJ', 'MFR-CIT-RELAY-AND-SWITCH': 'recWpxBbsaA9mkATF', 'MFR-TDK': 'recZ7cpyoFLoDUH2h',
  'MFR-MONOLITHIC-POWER-SYSTEMS': 'recZUeXBl1mwbVvhj', 'MFR-CREE-LED': 'rechuZWmEyKbTk8Gi', 'MFR-JST-SALES-AMERICA-INC': 'recnadZIEKvcSCr8h',
  'MFR-PANASONIC-INDUSTRY': 'recvh31dFSowLttqY', 'MFR-MURATA-ELECTRONICS': 'recwMzZBOEGEI6Ubn',
};
// ";KEY=recXXXXXXXXXXXXXX;..." so a record ID can be found with indexOf(";" + key + "=").
const lookupText = (m) => ';' + Object.entries(m).map(([k, v]) => `${k}=${v}`).join(';') + ';';

const QUERIES = ['resistor', 'capacitor', 'microcontroller', 'connector', 'temperature sensor', 'power supply module', 'relay', 'LED'];

// ---- IML expressions (module 6 works on one Digi-Key product from iterator 5) ----
const SKU = 'ifempty(first(map(5.ProductVariations; "DigiKeyProductNumber")); 5.DigiKeyProductNumber)';
const PRICE = 'ifempty(5.UnitPrice; first(map(first(map(5.ProductVariations; "StandardPricing")); "UnitPrice")))';
// Make's IML has no regex literals, so the slug from seed-airtable.js (non [A-Z0-9] runs -> "-") is approximated
// with plain replacements. It yields the same IDs for the manufacturers already in the base (e.g. "Lite-On Inc." -> LITE-ON-INC).
const SLUG = 'substring(replace(replace(replace(replace(replace(replace(upper(trim(ifempty(5.Manufacturer.Name; "Unknown"))); space; "-"); "."; emptystring); ","; emptystring); "/"; "-"); "&"; "AND"); "--"; "-"); 0; 24)';
const LEAD_WEEKS = 'parseNumber(5.ManufacturerLeadWeeks; ".")';
// Record ID for a key in a lookup text. For a new record it must be omitted (`ignore`), not an empty string:
// Airtable rejects an empty record ID with 422.
const lookup = (text, key) =>
  `{{if(contains(${text}; ${key}); substring(${text}; indexOf(${text}; ${key}) + length(${key}); indexOf(${text}; ${key}) + length(${key}) + 17); ignore)}}`;
const NOW = '{{formatDate(now; "YYYY-MM-DDTHH:mm:ss.SSS[Z]"; "UTC")}}';

// ---- module builders ----
let x = 0;
const pos = (dx = 300, y = 0) => ({ designer: { x: (x += dx), y } });
const mod = (id, module, version, mapper, extra = {}) => ({ id, module, version, parameters: {}, mapper, metadata: pos(300, extra.y || 0), ...extra.more });

const airtableUpsert = (id, table, recordId, record, y = 0) => ({
  id, module: 'airtable:upsertRecord', version: 3,
  parameters: { __IMTCONN__: AIRTABLE_CONN },
  mapper: { base: BASE, table, recordId, record, typecast: false, useColumnId: false },
  metadata: { designer: { x: (x += 300), y } },
});
const metaWrite = (id, key, value, y) => airtableUpsert(id, T.meta.id, META[key], { [T.meta.value]: value }, y);

// Error handler: write loadStatus=failed with the reason, then stop the run (Commit) so nothing else is written.
let nextHandlerId = 100;
function failRoute(reason, y = 300) {
  const saveX = x;
  const r = [
    metaWrite(nextHandlerId++, 'loadStatus', 'failed', y),
    metaWrite(nextHandlerId++, 'loadError', reason, y),
    metaWrite(nextHandlerId++, 'lastAttempt', NOW, y),
    { id: nextHandlerId++, module: 'builtin:Commit', version: 1, parameters: {}, mapper: null, metadata: { designer: { x: (x += 300), y } } },
  ];
  x = saveX;
  return r;
}
const filter = (name, conditions) => ({ name, conditions: [conditions] });

// ---- flow ----
const flow = [];

flow.push({
  id: 1, module: 'util:SetVariables', version: 1, parameters: {},
  mapper: {
    variables: [
      { name: 'dkClientId', value: '' },
      { name: 'dkClientSecret', value: '' },
      { name: 'queries', value: QUERIES.join('\n') },
      { name: 'perQuery', value: '3' },
      { name: 'existingItems', value: lookupText(EXISTING_ITEMS) },
      { name: 'existingSuppliers', value: lookupText(EXISTING_SUPPLIERS) },
    ],
  },
  metadata: { designer: { x: 0, y: 0 } },
});

flow.push({
  id: 2, module: 'http:MakeRequest', version: 4,
  parameters: { authenticationType: 'noAuth', tlsType: '' },
  mapper: {
    url: 'https://api.digikey.com/v1/oauth2/token', method: 'post',
    contentType: 'urlEncoded',
    urlEncodedBodyContent: [
      { name: 'client_id', value: '{{1.dkClientId}}' },
      { name: 'client_secret', value: '{{1.dkClientSecret}}' },
      { name: 'grant_type', value: 'client_credentials' },
    ],
    parseResponse: true, stopOnHttpError: true, timeout: '40', allowRedirects: true, shareCookies: false, requestCompressedContent: true,
  },
  metadata: pos(),
  onerror: failRoute('קבלת טוקן מ-Digi-Key נכשלה. בדקו את Client ID ו-Client Secret במודול 1. הנתונים לא עודכנו.'),
});

flow.push(mod(3, 'builtin:BasicFeeder', 1, { array: '{{split(1.queries; newline)}}' }));

flow.push({
  id: 4, module: 'http:MakeRequest', version: 4,
  parameters: { authenticationType: 'noAuth', tlsType: '' },
  mapper: {
    url: 'https://api.digikey.com/products/v4/search/keyword', method: 'post',
    headers: [
      { name: 'Authorization', value: 'Bearer {{2.data.access_token}}' },
      { name: 'X-DIGIKEY-Client-Id', value: '{{1.dkClientId}}' },
      { name: 'X-DIGIKEY-Locale-Site', value: 'US' },
      { name: 'X-DIGIKEY-Locale-Currency', value: 'USD' },
    ],
    contentType: 'json', inputMethod: 'jsonString',
    jsonStringBodyContent: '{"Keywords": "{{3.value}}", "Limit": 10, "Offset": 0}',
    parseResponse: true, stopOnHttpError: true, timeout: '40', allowRedirects: true, shareCookies: false, requestCompressedContent: true,
  },
  metadata: pos(),
  onerror: failRoute('חיפוש "{{3.value}}" ב-Digi-Key נכשל. הנתונים לא עודכנו.'),
});

flow.push(mod(5, 'builtin:BasicFeeder', 1, { array: '{{4.data.Products}}' }));

flow.push({
  id: 6, module: 'util:SetVariables', version: 1, parameters: {},
  filter: filter('פריט תקין', [
    { a: `{{${SKU}}}`, o: 'exist' },
    { a: `{{${PRICE}}}`, o: 'number:greater', b: '0' },
    { a: '{{5.QuantityAvailable}}', o: 'number:greater', b: '0' },
  ]),
  mapper: {
    variables: [
      { name: 'sku', value: `{{${SKU}}}` },
      { name: 'unitCost', value: `{{round(${PRICE} * 100) / 100}}` },
      { name: 'name', value: '{{substring(join(add(emptyarray; 5.ManufacturerProductNumber; ifempty(5.Description.ProductDescription; 5.Description.DetailedDescription)); " - "); 0; 90)}}' },
      { name: 'category', value: '{{ifempty(5.Category.Name; 3.value)}}' },
      { name: 'mfr', value: '{{ifempty(5.Manufacturer.Name; "Unknown")}}' },
      { name: 'supplierId', value: `MFR-{{ifempty(${SLUG}; "UNKNOWN")}}` },
      { name: 'leadDays', value: `{{if(${LEAD_WEEKS} > 0; min(${LEAD_WEEKS} * 7; 120); 14)}}` },
      { name: 'skuKey', value: `;{{${SKU}}}=` },
      { name: 'supKey', value: `;MFR-{{ifempty(${SLUG}; "UNKNOWN")}}=` },
    ],
  },
  metadata: pos(),
});

const partFields = ['sku', 'unitCost', 'name', 'category', 'mfr', 'supplierId', 'leadDays', 'skuKey', 'supKey'];
flow.push({
  id: 7, module: 'builtin:BasicAggregator', version: 1, parameters: { feeder: 5 },
  mapper: Object.fromEntries(partFields.map((f) => [f, `{{6.${f}}}`])),
  metadata: pos(),
});
flow.push({
  id: 9, module: 'builtin:BasicAggregator', version: 1, parameters: { feeder: 3 },
  mapper: { picks: '{{slice(7.array; 0; 1.perQuery)}}' },
  metadata: pos(),
});
flow.push({
  id: 10, module: 'util:SetVariables', version: 1, parameters: {},
  mapper: {
    variables: [
      { name: 'parts', value: '{{flatten(map(9.array; "picks"))}}' },
      { name: 'skus', value: '{{deduplicate(map(flatten(map(9.array; "picks")); "sku"))}}' },
      { name: 'supplierIds', value: '{{deduplicate(map(flatten(map(9.array; "picks")); "supplierId"))}}' },
      { name: 'count', value: '{{length(deduplicate(map(flatten(map(9.array; "picks")); "sku")))}}' },
    ],
  },
  metadata: pos(),
});

// ---- check + write ----
const routerX = x;
const tooFew = [
  { ...metaWrite(20, 'loadStatus', 'failed', -300), filter: filter('פחות מ-8 פריטים', [{ a: '{{10.count}}', o: 'number:less', b: '8' }]) },
  metaWrite(21, 'loadError', 'Digi-Key החזיר רק {{10.count}} פריטים תקינים (נדרשים לפחות 8). הנתונים לא עודכנו.', -300),
  metaWrite(22, 'lastAttempt', NOW, -300),
];
x = routerX;

const firstPart = (field, by, value) => `{{first(map(10.parts; "${field}"; "${by}"; ${value}))}}`;

x = routerX + 300;
const writeRoutes = [];
// 1. suppliers
x = routerX + 600;
writeRoutes.push({ flow: [
  { ...mod(31, 'builtin:BasicFeeder', 1, { array: '{{10.supplierIds}}' }), metadata: { designer: { x: (x += 300), y: 0 } } },
  { ...airtableUpsert(32, T.suppliers.id,
      lookup('1.existingSuppliers', `first(map(10.parts; "supKey"; "supplierId"; 31.value))`),
      { [T.suppliers.key]: '{{31.value}}', [T.suppliers.name]: firstPart('mfr', 'supplierId', '31.value'), [T.suppliers.lead]: firstPart('leadDays', 'supplierId', '31.value') }, 0),
    onerror: failRoute('כתיבת ספקים ל-Airtable נכשלה. ייתכן עדכון חלקי.', 150) },
] });
// 2. items (status = זמין)
x = routerX + 600;
writeRoutes.push({ flow: [
  { ...mod(33, 'builtin:BasicFeeder', 1, { array: '{{10.skus}}' }), metadata: { designer: { x: (x += 300), y: 300 } } },
  { ...airtableUpsert(34, T.items.id,
      lookup('1.existingItems', `first(map(10.parts; "skuKey"; "sku"; 33.value))`),
      {
        [T.items.sku]: '{{33.value}}',
        [T.items.name]: firstPart('name', 'sku', '33.value'),
        [T.items.category]: firstPart('category', 'sku', '33.value'),
        [T.items.supplierId]: firstPart('supplierId', 'sku', '33.value'),
        [T.items.unitCost]: firstPart('unitCost', 'sku', '33.value'),
        [T.items.status]: 'זמין',
      }, 300),
    onerror: failRoute('כתיבת פריטים ל-Airtable נכשלה. ייתכן עדכון חלקי.', 450) },
] });
// 3. existing items that Digi-Key did not return -> לא זמין (never deleted)
x = routerX + 600;
writeRoutes.push({ flow: [
  { ...mod(35, 'builtin:BasicFeeder', 1, { array: '{{split(1.existingItems; ";")}}' }), metadata: { designer: { x: (x += 300), y: 600 } } },
  { ...airtableUpsert(36, T.items.id, '{{last(split(35.value; "="))}}', { [T.items.status]: 'לא זמין' }, 600),
    filter: filter('הוסר מ-Digi-Key', [
      { a: '{{35.value}}', o: 'exist' },
      { a: '{{10.skus}}', o: 'array:notcontain', b: '{{first(split(35.value; "="))}}' },
    ]),
    onerror: failRoute('סימון פריטים "לא זמין" ב-Airtable נכשל. ייתכן עדכון חלקי.', 750) },
] });
// 4. success
x = routerX + 600;
writeRoutes.push({ flow: [
  metaWrite(37, 'lastUpdated', NOW, 900),
  metaWrite(38, 'loadStatus', 'ok', 900),
  metaWrite(39, 'loadError', '', 900),
  metaWrite(40, 'lastAttempt', NOW, 900),
] });

flow.push({
  id: 11, module: 'builtin:BasicRouter', version: 1, parameters: {}, mapper: null,
  metadata: { designer: { x: routerX + 300, y: 0 } },
  routes: [
    { flow: tooFew },
    { flow: [{
      id: 30, module: 'builtin:BasicRouter', version: 1, parameters: {}, mapper: null,
      filter: filter('לפחות 8 פריטים', [{ a: '{{10.count}}', o: 'number:greaterorequal', b: '8' }]),
      metadata: { designer: { x: routerX + 600, y: 0 } },
      routes: writeRoutes,
    }] },
  ],
});

const blueprint = {
  name: 'Digi-Key → Airtable (חד-פעמי)',
  flow,
  metadata: {
    instant: false, version: 1,
    scenario: { roundtrips: 1, maxErrors: 3, autoCommit: true, autoCommitTriggerLast: true, sequential: false, confidential: false, dataloss: false, dlq: false, freshVariables: false },
    designer: { orphans: [] },
  },
};

const out = path.join(__dirname, 'digikey-to-airtable.blueprint.json');
fs.writeFileSync(out, JSON.stringify(blueprint, null, 2) + '\n');
console.log('Wrote', out);
