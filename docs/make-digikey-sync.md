# עדכון מ-Digi-Key ל-Airtable ב-Make

תרחיש Make שמושך מ-Digi-Key את קטלוג הפריטים ומעדכן את ה-base
**"מלאי ולוגיסטיקה – Digi-Key"** (`appHZ3j17mjTXiMP6`).

## מה נבנה בפועל: ריצה חד-פעמית

התוכנית החינמית של Make (1,000 קרדיטים בחודש) לא מספיקה להרצה לילית, ולכן התרחיש רץ פעם אחת ידנית (**Run once**), בלי תזמון.

- **קובץ התרחיש:** [tools/make/digikey-to-airtable.blueprint.json](../tools/make/digikey-to-airtable.blueprint.json). מייבאים אותו ב-Make דרך ⋮ ← Import blueprint.
- **יצירה מחדש:** `node tools/make/build-blueprint.js`. הסקריפט מכיל צילום של מזהי הרשומות הקיימים ב-Airtable (פריטים וספקים). אם הרשומות משתנות לפני ההרצה, מעדכנים אותו ומריצים שוב.
- **חיבור Airtable:** חיבור "Airtable Token or Key" ב-Make (מספר 13251249). הטוקן מוזן ב-Make בלבד.
- **פרטי Digi-Key:** `dkClientId` ו-`dkClientSecret` מוזנים ידנית במודול 1 אחרי הייבוא. הם לא בקוד ולא בקובץ.
- **מגבלה:** חיבור OAuth 2.0 של Make לא תומך ב-client credentials, ולכן הטוקן של Digi-Key מתבקש במודול HTTP נפרד (מודול 2).

הסעיפים למטה מתארים את התכנון המקורי להרצה לילית. הלוגיקה זהה.

## מה מתעדכן ומה לא

| טבלה | מה קורה |
|---|---|
| `items` | upsert לפי `sku`: `name`, `category`, `supplierId`, `unitCost`, `status`=`זמין`. מק״ט שלא חזר מ-Digi-Key מסומן `status`=`לא זמין`, ולא נמחק. |
| `suppliers` | upsert לפי `id` (`MFR-<יצרן>`): `name`, `plannedLeadDays` (זמן האספקה של היצרן). |
| `meta` | בסוף כל הרצה: `loadStatus`, `loadError`, `lastAttempt`, וב-הצלחה גם `lastUpdated`. |
| `stock`, `movements`, `purchaseOrders`, `warehouses` | **לא נוגעים.** הנתונים בהן מומצאים. |

`lastUpdated` זז רק בהרצה מוצלחת, כי הדאשבורד מציג אותו בתור "עדכון אחרון" של הנתונים.
`lastAttempt` נכתב בכל הרצה, גם בכישלון.

### הכנות שכבר בוצעו ב-Airtable
- נוסף שדה `status` (בחירה יחידה: `זמין` / `לא זמין`) לטבלת `items`. ריק = זמין.
- נוספו לטבלת `meta` השורות:

| key | record ID |
|---|---|
| `lastUpdated` | `rec8hUTK0LNJdTcNV` |
| `loadStatus` | `recR3bSK4YzYAhDoC` |
| `loadError` | `recNxn6uHmIcwx5z7` |
| `lastAttempt` | `reci3muHrMjEe70aB` |

> אחרי שהתרחיש פעיל **אין להריץ יותר `tools/seed-airtable.js --digikey`** על ה-base הזה: הסקריפט מוחק את כל הטבלאות וטוען מחדש.

## כלל "הכול או כלום"

כל הקריאות ל-Digi-Key נאספות **לפני** שכותבים משהו ל-Airtable. אם בקשת טוקן או אחת מ-8 החיפושים נכשלת,
או שחזרו פחות מ-8 פריטים תקינים, לא נכתב אף פריט. נכתב רק `loadStatus=failed` עם הסיבה, והדאשבורד מציג
חלון קופץ ומשאיר מאחוריו את הנתונים התקינים האחרונים.

הסיכון היחיד שנשאר: כישלון של Airtable באמצע הכתיבה (למשל אחרי 10 מתוך 24 פריטים). גם אז נכתב
`loadStatus=failed` עם הסיבה "עדכון חלקי", וכל רשומה שנכתבה היא נתון אמיתי ושלם.

## פרטי גישה (מזינים רק ב-Make)

- **Digi-Key Client ID ו-Client Secret**: במודול 1 (Set multiple variables). אם בתוכנית ה-Make יש
  *Custom variables* (Organization › Variables), עדיף לשמור אותם שם ולמפות משם.
- **Airtable**: חיבור (Connection) של Airtable ב-Make עם Personal Access Token שיש לו
  `data.records:read`, `data.records:write`, `schema.bases:read` על ה-base הזה בלבד.

לא מעתיקים אותם לקוד, ל-README או לצ'אט.

## בניית התרחיש

שם: `Digi-Key → Airtable (לילי)`.
מספרי המודולים למטה הם לצורך ההפניות במיפוי. ב-Make המספרים יכולים לצאת אחרת, ואז ממפים לפי השם.

### 1. Tools › Set multiple variables — הגדרות
| משתנה | ערך |
|---|---|
| `dkClientId` | *(מזינים ידנית)* |
| `dkClientSecret` | *(מזינים ידנית)* |
| `queries` | `resistor|capacitor|microcontroller|connector|temperature sensor|power supply module|relay|LED` |
| `perQuery` | `3` |

`queries` הוא אותה רשימה כמו `DK_QUERIES` ב-[tools/seed-airtable.js](../tools/seed-airtable.js). משנים בשני המקומות יחד.

### 2. HTTP › Make a request — טוקן Digi-Key
- URL: `https://api.digikey.com/v1/oauth2/token`, Method: `POST`
- Body type: `application/x-www-form-urlencoded`, שדות:
  `client_id`=`{{1.dkClientId}}`, `client_secret`=`{{1.dkClientSecret}}`, `grant_type`=`client_credentials`
- Parse response: **Yes**. Evaluate all states as errors: **Yes**.
- **Error handler** (קליק ימני › Add error handler): מודול כשל F (ראו למטה) עם הסיבה
  `טוקן Digi-Key נכשל: {{error message}}`, ואחריו **Commit**.

### 3. Flow Control › Iterator — שאילתות
Array: `{{split(1.queries; "|")}}`

### 4. HTTP › Make a request — חיפוש
- URL: `https://api.digikey.com/products/v4/search/keyword`, Method: `POST`
- Headers:
  `Authorization`=`Bearer {{2.data.access_token}}`,
  `X-DIGIKEY-Client-Id`=`{{1.dkClientId}}`,
  `X-DIGIKEY-Locale-Site`=`US`, `X-DIGIKEY-Locale-Currency`=`USD`
- Body type: Raw, Content type: JSON:
  ```json
  {"Keywords": "{{3.value}}", "Limit": 10, "Offset": 0}
  ```
- Parse response: Yes. Evaluate all states as errors: Yes.
- **Error handler**: מודול כשל F עם `חיפוש "{{3.value}}" ב-Digi-Key נכשל: {{error message}}`, ואחריו **Commit**.
  ה-Commit עוצר את כל ההרצה, כך שגם שאילתות שהצליחו לא נכתבות.

`Limit` 10 ולא 20 כמו בסקריפט, כדי לחסוך פעולות Make. בדרך כלל 3 הפריטים התקינים הראשונים זהים.

### 5. Flow Control › Iterator — מוצרים
Array: `{{4.data.Products}}`

**Filter** על החיבור 5→6, שם "פריט תקין" (כל התנאים ב-AND):
- `{{ifempty(first(map(5.ProductVariations; "DigiKeyProductNumber")); 5.DigiKeyProductNumber)}}` — *Basic: Exists*
- `{{ifempty(5.UnitPrice; first(map(first(map(5.ProductVariations; "StandardPricing")); "UnitPrice")))}}` — *Numeric: Greater than* `0`
- `{{5.QuantityAvailable}}` — *Numeric: Greater than* `0`

### 6. Tools › Set multiple variables — שדות הפריט
| משתנה | ערך |
|---|---|
| `sku` | `{{ifempty(first(map(5.ProductVariations; "DigiKeyProductNumber")); 5.DigiKeyProductNumber)}}` |
| `unitCost` | `{{round(ifempty(5.UnitPrice; first(map(first(map(5.ProductVariations; "StandardPricing")); "UnitPrice"))) * 100) / 100}}` |
| `name` | `{{substring(join(add(emptyarray; 5.ManufacturerProductNumber; ifempty(5.Description.ProductDescription; 5.Description.DetailedDescription)); " - "); 0; 90)}}` |
| `category` | `{{ifempty(5.Category.Name; 3.value)}}` |
| `mfr` | `{{ifempty(5.Manufacturer.Name; "Unknown")}}` |
| `supplierId` | `MFR-{{ifempty(substring(replace(replace(upper(ifempty(5.Manufacturer.Name; "Unknown")); /[^A-Z0-9]+/g; "-"); /^-\|-$/g; emptystring); 0; 24); "UNKNOWN")}}` |
| `leadDays` | `{{if(parseNumber(5.ManufacturerLeadWeeks) > 0; min(parseNumber(5.ManufacturerLeadWeeks) * 7; 120); 14)}}` |

(ב-`supplierId` ה-`\|` בטבלה הוא רק בגלל Markdown. ב-Make כותבים `/^-|-$/g`.)
אלה אותם כללים כמו ב-`digikeyCatalog()` בסקריפט, כך שמזהי הספקים הקיימים נשמרים.

### 7. Flow Control › Array aggregator — מוצרים לשאילתה
Source module: **5**. Aggregated fields: כל המשתנים של מודול 6.

### 8. Tools › Set variable — 3 הראשונים
`picks` = `{{slice(7.array; 0; 1.perQuery)}}`

### 9. Flow Control › Array aggregator — כל השאילתות
Source module: **3**. Aggregated field: `picks` (ממודול 8).

### 10. Tools › Set multiple variables — הקטלוג של הלילה
| משתנה | ערך |
|---|---|
| `parts` | `{{flatten(map(9.array; "picks"))}}` |
| `skus` | `{{deduplicate(map(flatten(map(9.array; "picks")); "sku"))}}` |
| `supplierIds` | `{{deduplicate(map(flatten(map(9.array; "picks")); "supplierId"))}}` |

מק״ט שחזר בשתי שאילתות נכתב פעם אחת, לפי ההופעה הראשונה (כמו בסקריפט).

### 11–14. הרשומות הקיימות ב-Airtable
- **11** Airtable › Search Records: base `appHZ3j17mjTXiMP6`, table `items`, Limit `1000`, בלי נוסחה.
- **12** Array aggregator, Source **11**: `ID`, `sku`, `status`.
- **13** Airtable › Search Records: table `suppliers`, Limit `1000`.
- **14** Array aggregator, Source **13**: `ID`, `id`.

לשני מודולי ה-Search: error handler עם מודול כשל F (`קריאת Airtable נכשלה: {{error message}}`) ו-Commit.

### 15. Router — בדיקת תקינות
- **מסלול "מעט מדי פריטים"**, filter: `{{length(10.skus)}}` *Numeric: Less than* `8`
  → מודול כשל F עם `Digi-Key החזיר רק {{length(10.skus)}} פריטים תקינים (נדרשים לפחות 8). הנתונים לא עודכנו.`
- **מסלול "כתיבה"**, filter: `{{length(10.skus)}}` *Numeric: Greater than or equal to* `8` → Router 16.

### 16. Router — כתיבה (המסלולים רצים לפי הסדר)

**מסלול 1: ספקים**
- Iterator, Array: `{{10.supplierIds}}`
- Airtable › Upsert a Record, table `suppliers`:
  - Record ID: `{{first(map(14.array; "ID"; "id"; value))}}` (ריק = יוצר רשומה חדשה)
  - `id`=`{{value}}`
  - `name`=`{{first(map(10.parts; "mfr"; "supplierId"; value))}}`
  - `plannedLeadDays`=`{{first(map(10.parts; "leadDays"; "supplierId"; value))}}`

**מסלול 2: פריטים**
- Iterator, Array: `{{10.skus}}`
- Airtable › Upsert a Record, table `items`:
  - Record ID: `{{first(map(12.array; "ID"; "sku"; value))}}`
  - `sku`=`{{value}}`
  - `name`, `category`, `supplierId`, `unitCost`: `{{first(map(10.parts; "<שם השדה>"; "sku"; value))}}`
  - `status`=`זמין`

**מסלול 3: סימון "לא זמין"**
- Iterator, Array: `{{12.array}}`
- Filter: `{{10.skus}}` *Array: Does not contain* `{{sku}}` **וגם** `{{status}}` *Text: Not equal to* `לא זמין`
- Airtable › Update a Record, table `items`, Record ID `{{ID}}`, `status`=`לא זמין`. שאר השדות ריקים, כך שהם לא משתנים.

**מסלול 4: סיום מוצלח**
- Airtable › Make an API Call:
  - URL: `/v0/appHZ3j17mjTXiMP6/meta`, Method: `PATCH`
  - Body:
    ```json
    {"records": [
      {"id": "rec8hUTK0LNJdTcNV", "fields": {"value": "{{formatDate(now; "YYYY-MM-DDTHH:mm:ss.SSS[Z]"; "UTC")}}"}},
      {"id": "recR3bSK4YzYAhDoC", "fields": {"value": "ok"}},
      {"id": "recNxn6uHmIcwx5z7", "fields": {"value": ""}},
      {"id": "reci3muHrMjEe70aB", "fields": {"value": "{{formatDate(now; "YYYY-MM-DDTHH:mm:ss.SSS[Z]"; "UTC")}}"}}
    ]}
    ```

לכל מודול Airtable במסלולים 1–3: error handler עם מודול כשל F
(`כתיבה ל-Airtable נכשלה, ייתכן עדכון חלקי: {{error message}}`) ו-Commit.

אם אין ב-Make מודול *Upsert a Record*: Router עם שני מסלולים. Record ID ריק → *Create a Record*, אחרת *Update a Record*.

### מודול כשל F (חוזר בכל error handler)
Airtable › Make an API Call, URL `/v0/appHZ3j17mjTXiMP6/meta`, Method `PATCH`, Body:
```json
{"records": [
  {"id": "recR3bSK4YzYAhDoC", "fields": {"value": "failed"}},
  {"id": "recNxn6uHmIcwx5z7", "fields": {"value": "{{substring(replace(<הסיבה>; /["\\\s]+/g; " "); 0; 500)}}"}},
  {"id": "reci3muHrMjEe70aB", "fields": {"value": "{{formatDate(now; "YYYY-MM-DDTHH:mm:ss.SSS[Z]"; "UTC")}}"}}
]}
```
ה-`replace` מנקה מרכאות, לוכסנים וירידות שורה מהודעת השגיאה, כדי שגוף ה-JSON יישאר תקין.
`lastUpdated` לא נכתב בכישלון.

## תזמון והגדרות התרחיש
- Schedule: **Every day**, `02:00`. אזור הזמן של Make נקבע ב-Organization/Profile; לוודא `Asia/Jerusalem`.
- Scenario settings: *Sequential processing* מופעל, *Allow storing of incomplete executions* כבוי.
- **Commit** בסוף מסלולי הכשל משאיר את ההרצה כ"הצלחה" ב-Make, כך ש-Make לא מכבה את התרחיש אחרי כמה כישלונות.
  הכישלון מתועד ב-`meta` ובדאשבורד. אם רוצים גם מייל מ-Make, מחליפים ל-**Rollback**. אחרי כמה כישלונות רצופים,
  Make עלול לכבות את התרחיש.

## עלות בפעולות Make
בערך 150 פעולות להרצה, כלומר כ-4,500 בחודש. זה מעבר לתוכנית החינמית (1,000) ומתאים לתוכנית Core.

## בדיקה
1. **Run once** ב-Make. ב-Airtable: `meta.loadStatus`=`ok`, `lastUpdated` עודכן, ול-`items` יש `status`.
2. בדיקת כישלון: לשנות זמנית את `dkClientSecret` לערך שגוי ולהריץ. צפוי `loadStatus`=`failed`,
   `loadError` עם הסיבה, `items` לא השתנו, ו-`digikey.html` מציג חלון קופץ עם הפירוט.
3. להחזיר את הסוד הנכון ולהריץ שוב. החלון הקופץ נעלם.

## מה הדאשבורד עושה עם זה
- [src/sources/airtable-source.js](../src/sources/airtable-source.js) קורא את `loadStatus`, `loadError`, `lastAttempt`,
  ומסמן פריט `לא זמין` בשם שלו: "(לא זמין ב-Digi-Key)".
- [src/app.js](../src/app.js): כש-`loadStatus`=`failed` מוצג חלון קופץ עם מועד הניסיון, הסיבה ומועד הנתונים המוצגים.
  הדאשבורד עצמו מוצג מאחוריו.
- מק״ט חדש מ-Digi-Key נכנס ל-`items`, אבל אין לו שורות ב-`stock`, ולכן הוא לא מופיע בגרפי המלאי.
