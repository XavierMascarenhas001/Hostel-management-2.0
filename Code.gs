/* Reservas Estoril · Google Apps Script server
   Lives in your Google account (script.google.com). It
     1. reads the Airbnb / Booking.com / site emails in this Gmail every 10 minutes (Parser.gs does the reading),
     2. keeps every booking in a Google Sheet ("Reservas Estoril · dados"),
     3. answers the web page, but only after the Manager or Cleaning password is given.
   Setup, once: run setup(), then edit and run setPasswords(), then Deploy → New deployment → Web app. See SETUP.md. */

const COLS = ['key','status','platform','code','apt','name','country','place','phone','email','people','checkin','ciTime','checkout','coTime',
  'listing','total','payout','hostFee','cleaningFee','nights','notes','locked','sources','updated'];
const NUMS = ['people','total','payout','hostFee','cleaningFee','nights'];
const EDITABLE = ['status','apt','name','country','phone','email','people','checkin','ciTime','checkout','coTime','total','payout','hostFee','cleaningFee','notes','platform','listing'];
const SEARCH = '("airbnb.com" OR "booking.com" OR "brevosend.com" OR "Reserva Site")';
const LABEL = 'Reservas lidas';
const TZ = 'Europe/Lisbon';
const SESSION_HOURS = 8;

/* ============ one-time setup ============ */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let ss;
  if (props.getProperty('SHEET_ID')) ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  else { ss = SpreadsheetApp.create('Reservas Estoril · dados'); props.setProperty('SHEET_ID', ss.getId()); }
  const res = ss.getSheetByName('Reservas') || ss.insertSheet('Reservas');
  res.getRange('A:Z').setNumberFormat('@');
  res.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold');
  res.setFrozenRows(1);
  const st = ss.getSheetByName('Estado') || ss.insertSheet('Estado');
  st.getRange('A:A').setNumberFormat('@');
  if (!st.getRange('A1').getValue()) st.getRange('A1').setValue(JSON.stringify({events: [], inv: {}, settings: {}, updatedAt: ''}));
  const log = ss.getSheetByName('Log') || ss.insertSheet('Log');
  log.getRange('A:F').setNumberFormat('@');
  if (!log.getRange('A1').getValue()) log.getRange(1, 1, 1, 6).setValues([['when','messageId','subject','type','keys','result']]).setFontWeight('bold');
  const first = ss.getSheetByName('Sheet1') || ss.getSheetByName('Folha1'); if (first && ss.getSheets().length > 1) ss.deleteSheet(first);
  if (!props.getProperty('SALT')) props.setProperty('SALT', Utilities.getUuid());
  GmailApp.getUserLabelByName(LABEL) || GmailApp.createUserLabel(LABEL);
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncGmail').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncGmail').timeBased().everyMinutes(10).create();
  Logger.log('Ready. Data sheet: ' + ss.getUrl());
  Logger.log('Next: type your two passwords in setPasswords() and run it.');
}

/* Type the two passwords between the quotes, run this function once, then delete them from here again. */
function setPasswords() {
  const MANAGER = '';
  const CLEANING = '';
  if (MANAGER.length < 8 || CLEANING.length < 8) throw new Error('Use at least 8 characters for each password.');
  if (MANAGER === CLEANING) throw new Error('The two passwords must be different.');
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SALT')) props.setProperty('SALT', Utilities.getUuid());
  props.setProperty('MANAGER_HASH', hash_(MANAGER));
  props.setProperty('CLEANING_HASH', hash_(CLEANING));
  CacheService.getScriptCache().remove('fails');
  Logger.log('Passwords saved. Now delete them from setPasswords() and save the script.');
}

/* Reads the last 400 days of booking emails. Run it once after setup; run again if it stops at the 6-minute limit. */
function importHistory() { Logger.log(JSON.stringify(syncGmail_(400, 300))); }

/* ============ Gmail → sheet ============ */
function syncGmail() { syncGmail_(3, 60); }
function syncGmail_(days, maxThreads) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return {busy: true};
  const started = Date.now(), out = {read: 0, bookings: 0, skipped: 0};
  try {
    const ss = book_(), logSh = ss.getSheetByName('Log');
    const seen = new Set(logSh.getLastRow() > 1 ? logSh.getRange(2, 2, logSh.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : []);
    const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createUserLabel(LABEL);
    const store = readAll_(), map = (readState_().settings || {}).listingMap || {};
    const logRows = [], touched = new Set();
    for (let start = 0; start < maxThreads; start += 30) {
      const threads = GmailApp.search(SEARCH + ' newer_than:' + days + 'd', start, 30);
      if (!threads.length) break;
      for (const th of threads) {
        if (Date.now() - started > 300000) break;
        let any = false;
        for (const msg of th.getMessages()) {
          const id = msg.getId(); if (seen.has(id)) continue;
          seen.add(id); out.read++;
          const meta = {from: msg.getFrom(), subject: msg.getSubject(), date: Utilities.formatDate(msg.getDate(), TZ, 'yyyy-MM-dd'), id: id};
          let recs = [];
          try { recs = ReservasParser.parse(msg.getPlainBody(), meta); } catch (e) { logRows.push([stamp_(), id, meta.subject, 'error', '', String(e)]); continue; }
          const useful = recs.filter(r => r.kind === 'booking' || r.kind === 'inquiry' || r.kind === 'payout');
          useful.forEach(r => { applyMap_(r, map); store[r.key] = ReservasParser.merge(store[r.key], r); touched.add(r.key); });
          out.bookings += useful.length; if (!useful.length) out.skipped++;
          logRows.push([stamp_(), id, meta.subject, recs.map(r => r.kind).join(',') || 'not a booking email', useful.map(r => r.key).join(' '), useful.length ? 'saved' : 'ignored']);
          any = any || useful.length > 0;
        }
        if (any) th.addLabel(label);
      }
      if (threads.length < 30) break;
    }
    if (touched.size) writeAll_(store, touched);
    if (logRows.length) logSh.getRange(logSh.getLastRow() + 1, 1, logRows.length, 6).setValues(logRows);
    PropertiesService.getScriptProperties().setProperty('LAST_SYNC', new Date().toISOString());
  } finally { lock.releaseLock(); }
  return out;
}
function applyMap_(r, map) {
  if (r.apt || !r.listing) return;
  const k = String(r.listing).toLowerCase().trim();
  if (map[k]) r.apt = String(map[k]);
}

/* ============ web API (called by the page) ============ */
function doGet() { return ContentService.createTextOutput('Reservas Estoril: this address only answers the web page.'); }

function doPost(e) {
  let req = {};
  try { req = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({error: 'Bad request'}); }
  try {
    if (req.action === 'login') return json_(login_(req.password));
    const role = req.token ? CacheService.getScriptCache().get('tok:' + req.token) : null;
    if (!role) return json_({error: 'session', message: 'Please log in again.'});
    const mgr = role === 'manager';
    switch (req.action) {
      case 'data': return json_(data_(role));
      case 'saveState': return json_({ok: true, state: saveState_(req.state, mgr)});
      case 'logout': CacheService.getScriptCache().remove('tok:' + req.token); return json_({ok: true});
    }
    if (!mgr) return json_({error: 'forbidden', message: 'Only the manager can do this.'});
    switch (req.action) {
      case 'upsert': return json_(upsert_(req.records || []));
      case 'edit': return json_(edit_(req.key, req.fields || {}));
      case 'remove': return json_(remove_(req.key));
      case 'sync': { const r = syncGmail_(3, 60); return Object.assign(data_(role), {sync: r}); }
    }
    return json_({error: 'Unknown action'});
  } catch (err) { return json_({error: 'server', message: String(err && err.message || err)}); }
}

function login_(password) {
  const cache = CacheService.getScriptCache(), props = PropertiesService.getScriptProperties();
  const fails = +(cache.get('fails') || 0);
  if (fails >= 8) return {error: 'locked', message: 'Too many wrong passwords. Try again in 15 minutes.'};
  const h = hash_(String(password || ''));
  const role = h === props.getProperty('MANAGER_HASH') ? 'manager' : h === props.getProperty('CLEANING_HASH') ? 'cleaning' : null;
  if (!role || !props.getProperty('MANAGER_HASH')) {
    cache.put('fails', String(fails + 1), 900);
    Utilities.sleep(800);
    return {error: 'password', message: 'Wrong password.'};
  }
  const token = Utilities.getUuid() + Utilities.getUuid().slice(0, 8);
  cache.put('tok:' + token, role, SESSION_HOURS * 3600);
  return {token: token, role: role};
}

function data_(role) {
  const all = Object.values(readAll_());
  const list = role === 'manager' ? all : all
    .filter(r => r.status !== 'Inquiry' && r.status !== 'Cancelled' && r.checkin && r.checkout)
    .map(r => ({key: r.key, apt: r.apt, status: r.status, checkin: r.checkin, checkout: r.checkout, ciTime: r.ciTime, coTime: r.coTime,
      people: r.people, name: String(r.name || '').split(/\s+/)[0]}));
  const state = readState_();
  if (role !== 'manager') state.settings = {kit: (state.settings || {}).kit};
  return {role: role, reservations: list, state: state, lastSync: PropertiesService.getScriptProperties().getProperty('LAST_SYNC') || ''};
}

function upsert_(records) {
  const store = readAll_(), map = (readState_().settings || {}).listingMap || {}, touched = new Set();
  records.forEach(r => {
    if (!r || !r.key || !/^(booking|inquiry|payout|manual)$/.test(r.kind || '')) return;
    applyMap_(r, map);
    store[r.key] = ReservasParser.merge(store[r.key], r); touched.add(r.key);
  });
  writeAll_(store, touched);
  return {ok: true, saved: touched.size, reservations: Object.values(store)};
}
function edit_(key, fields) {
  const store = readAll_(); const r = store[key];
  if (!r) return {error: 'Booking not found'};
  const locked = new Set(String(r.locked || '').split(',').filter(Boolean));
  Object.keys(fields).forEach(f => { if (EDITABLE.indexOf(f) > -1) { r[f] = fields[f] == null ? '' : fields[f]; locked.add(f); } });
  r.locked = Array.from(locked).join(',');
  writeAll_(store, new Set([key]));
  return {ok: true, reservation: r};
}
function remove_(key) {
  const sh = book_().getSheetByName('Reservas'), keys = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
  for (let i = 0; i < keys.length; i++) if (keys[i][0] === key) { sh.deleteRow(i + 2); return {ok: true}; }
  return {error: 'Booking not found'};
}

/* shared calendar events, laundry and settings; the cleaning role can change events and laundry only */
function saveState_(incoming, mgr) {
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const cur = readState_(), next = Object.assign({}, cur);
    if (incoming && Array.isArray(incoming.events)) next.events = incoming.events.filter(ev => !ev.date || ev.date >= addDaysISO_(-400));
    if (incoming && incoming.inv) next.inv = incoming.inv;
    if (mgr && incoming && incoming.settings) next.settings = incoming.settings;
    next.updatedAt = new Date().toISOString();
    const txt = JSON.stringify(next);
    if (txt.length > 49000) throw new Error('Saved state is too large; delete old events.');
    book_().getSheetByName('Estado').getRange('A1').setValue(txt);
    return next;
  } finally { lock.releaseLock(); }
}

/* ============ storage helpers ============ */
function book_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Run setup() first.');
  return SpreadsheetApp.openById(id);
}
function readAll_() {
  const sh = book_().getSheetByName('Reservas'), n = sh.getLastRow() - 1, out = {};
  if (n < 1) return out;
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.getRange(2, 1, n, head.length).getValues().forEach(row => {
    const r = {}; head.forEach((h, i) => { r[h] = row[i] === null ? '' : row[i]; });
    NUMS.forEach(f => { r[f] = r[f] === '' || isNaN(+r[f]) ? '' : +r[f]; });
    ['checkin','checkout'].forEach(f => { if (r[f] instanceof Date) r[f] = Utilities.formatDate(r[f], TZ, 'yyyy-MM-dd'); });
    if (r.key) out[r.key] = r;
  });
  return out;
}
function writeAll_(store, touched) {
  const sh = book_().getSheetByName('Reservas');
  const keys = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => r[0]) : [];
  const now = stamp_(), append = [];
  touched.forEach(k => {
    const r = store[k]; if (!r) return; r.updated = now;
    const row = COLS.map(c => r[c] == null ? '' : String(r[c]));
    const i = keys.indexOf(k);
    if (i > -1) sh.getRange(i + 2, 1, 1, COLS.length).setValues([row]); else append.push(row);
  });
  if (append.length) sh.getRange(sh.getLastRow() + 1, 1, append.length, COLS.length).setNumberFormat('@').setValues(append);
}
function readState_() {
  try { return JSON.parse(book_().getSheetByName('Estado').getRange('A1').getValue() || '{}'); } catch (e) { return {events: [], inv: {}, settings: {}}; }
}
function hash_(s) {
  const salt = PropertiesService.getScriptProperties().getProperty('SALT') || '';
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + s, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function stamp_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }
function addDaysISO_(n) { return Utilities.formatDate(new Date(Date.now() + n * 86400000), TZ, 'yyyy-MM-dd'); }
