/* Reservas Estoril · email parser
   One file, used in two places — keep both copies identical:
     • next to the web page, as parser.js
     • in the Google Apps Script project, as Parser.gs
   Reads Airbnb, Booking.com and direct-site ("Reserva Site" / Brevo) emails, forwarded or not,
   in Portuguese, English or Spanish, and turns each one into a booking record. */
var ReservasParser = (function () {
  'use strict';

  /* ---------- small helpers ---------- */
  var MONTHS = {jan:1,january:1,janeiro:1,ene:1,enero:1,feb:2,february:2,fev:2,fevereiro:2,febrero:2,mar:3,march:3,marco:3,marzo:3,
    apr:4,april:4,abr:4,abril:4,may:5,mai:5,maio:5,mayo:5,jun:6,june:6,junho:6,junio:6,jul:7,july:7,julho:7,julio:7,aug:8,august:8,
    ago:8,agosto:8,sep:9,sept:9,september:9,set:9,setembro:9,septiembre:9,oct:10,october:10,out:10,outubro:10,octubre:10,
    nov:11,november:11,novembro:11,noviembre:11,dec:12,december:12,dez:12,dezembro:12,dic:12,diciembre:12};
  function strip(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function low(s) { return strip(s).toLowerCase(); }
  function clean(l) { return String(l).replace(/[\u00a0\u200b\u200c\u200d\u2007\u202f\ufeff]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function toLines(t) { return String(t || '').replace(/\r\n?/g, '\n').split('\n').map(clean); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { return (y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) ? y + '-' + pad(m) + '-' + pad(d) : ''; }
  function addDays(s, n) { var p = s.split('-'); return new Date(Date.UTC(+p[0], p[1] - 1, +p[2] + n)).toISOString().slice(0, 10); }
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /* A date with no year ("sábado, 24/10") takes the year that puts it closest after the reference date.
     after = true for check-out dates, which must come after check-in. */
  function withYear(y, m, d, ref, after) {
    if (y) return iso(y, m, d);
    ref = ref || todayISO();
    y = +ref.slice(0, 4);
    var c = iso(y, m, d);
    if (!c) return '';
    if (after ? c <= ref : c < addDays(ref, -120)) c = iso(y + 1, m, d);
    return c;
  }
  /* "31/01/2027", "24/10", "4 de novembro de 2026", "dom., 27 de dez. de 2026", "2026-04-24", "Sun, Jan 31, 2027" */
  function dateFrom(text, ref, after) {
    var s = low(text).replace(/\b\d{1,2}[:h]\d{2}\b(\s*[ap]\.?\s?m\.?)?/g, ' ');
    var m;
    if ((m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/))) return iso(+m[1], +m[2], +m[3]);
    if ((m = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
      var y = m[3] ? +m[3] : 0; if (y && y < 100) y += 2000;
      return withYear(y, +m[2], +m[1], ref, after);
    }
    var toks = s.replace(/[,.]/g, ' ').split(/\s+/), d = 0, mo = 0, yr = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (MONTHS[t]) { mo = MONTHS[t]; continue; }
      if (/^\d{4}$/.test(t)) { yr = +t; continue; }
      if (!d && /^\d{1,2}(st|nd|rd|th)?$/.test(t)) { var n = parseInt(t, 10); if (n >= 1 && n <= 31) d = n; }
    }
    return d && mo ? withYear(yr, mo, d, ref, after) : '';
  }
  function timeFrom(s) { var m = String(s || '').match(/\b(\d{1,2})[:h](\d{2})\b/); return m && +m[1] < 24 ? pad(+m[1]) + ':' + m[2] : ''; }
  /* "1.930,88 €", "€ 377,58 EUR", "-379,90 €", "€40,00", "1,234.50" */
  function money(v) {
    if (v == null || v === '') return null;
    var s = String(v).replace(/(\d)\s(?=\d{3}\b)/g, '$1');
    var m = s.match(/-?\s?\d[\d.,]*/); if (!m) return null;
    var t = m[0].replace(/\s/g, '').replace(/[.,]$/, '');
    var lc = t.lastIndexOf(','), ld = t.lastIndexOf('.');
    if (lc > -1 && ld > -1) t = lc > ld ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    else if (lc > -1) t = /,\d{1,2}$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, '');
    else if (ld > -1 && !/\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
    var n = parseFloat(t);
    return isNaN(n) ? null : Math.round(n * 100) / 100;
  }
  function hasMoney(l) { return /\d\s*(€|eur\b)|(€|eur)\s*-?\s?\d/i.test(l); }

  /* Find a label line such as "Check-in", "Check-in:" or "Check In : 2026-04-24" and return its value:
     the text after the colon, plus the next non-empty lines (up to n values), stopping at the next label. */
  function field(L, src, n, stop) {
    var re = new RegExp('^(?:' + src + ')\\s*(?::\\s*(.*))?$', 'i');
    for (var i = 0; i < L.length; i++) {
      if (!L[i] || !re.test(low(L[i]))) continue;
      var out = [], c = L[i].indexOf(':'), same = c > -1 ? L[i].slice(c + 1).trim() : '';
      if (same) out.push(same);
      for (var k = i + 1; out.length < (n || 1) && k < L.length && k < i + 14; k++) {
        if (!L[k]) continue;
        if (stop && stop.test(low(L[k]))) break;
        out.push(L[k]);
      }
      return out;
    }
    return [];
  }
  /* value on the same line only ("Coupon : " stays empty) */
  function sameLine(L, src) {
    var re = new RegExp('^(?:' + src + ')\\s*:\\s*(.*)$', 'i');
    for (var i = 0; i < L.length; i++) if (L[i] && re.test(low(L[i]))) return L[i].slice(L[i].indexOf(':') + 1).trim();
    return '';
  }
  function indexOfLine(L, re, from) { for (var i = from || 0; i < L.length; i++) if (L[i] && re.test(low(L[i]))) return i; return -1; }
  function lineAbove(L, i) { for (var k = i - 1; k >= 0 && k > i - 6; k--) if (L[k]) return L[k]; return ''; }
  function lineBelow(L, i) { for (var k = i + 1; k < L.length && k < i + 6; k++) if (L[k]) return L[k]; return ''; }
  function moneyAfter(L, src) { var v = field(L, src, 3); for (var i = 0; i < v.length; i++) if (hasMoney(v[i])) return money(v[i]); return null; }
  function countPeople(vals) {
    var s = low(vals.join(' '));
    if (/^\s*\d+\s*$/.test(s)) return +s;
    var t = 0, re = /(\d+)\s*(adult\w*|crianc\w*|child\w*|kid\w*|hosp\w*|guest\w*|pessoa\w*|viajante\w*|persons?|people|nin\w*)/g, m;
    while ((m = re.exec(s))) t += +m[1];
    return t || null;
  }
  function countryOf(place) { if (!place || /mensagem|message|airbnb desde|on airbnb since/i.test(place)) return ''; var p = place.split(','); return p.length > 1 ? p[p.length - 1].trim() : ''; }
  function between(L, startIdx, stopRe, max) {
    var out = [];
    for (var k = startIdx + 1; k < L.length && out.length < (max || 12); k++) { if (!L[k]) continue; if (stopRe.test(low(L[k]))) break; out.push(L[k]); }
    return out.join(' ').slice(0, 500);
  }
  var STOP = /^(check-?out|check-?in|viajantes|hospedes|guests|travel+ers|total de hospedes|total guests|nome da propriedade|property name|numero da reserva|booking number|codigo de confirmacao|confirmation code|tem 24 horas|you have 24 hours|mais informacoes|more info|pre-aprovar|pre-approve|ver itinerario|view itinerary)\b/;

  function base(platform, meta) {
    return {kind: 'unknown', platform: platform, code: '', status: '', name: '', place: '', country: '', phone: '', email: '',
      people: null, checkin: '', checkout: '', ciTime: '', coTime: '', listing: '', apt: '', total: null, payout: null,
      hostFee: null, cleaningFee: null, nights: null, notes: '', subject: meta.subject || '', emailDate: meta.date || '', msgId: meta.id || ''};
  }

  /* ---------- Airbnb ---------- */
  function airbnb(L, meta) {
    var r = base('Airbnb', meta), body = low(L.join('\n')), subj = low(meta.subject || '');
    var head = subj + '\n' + body.slice(0, 400);
    var ref = meta.date || todayISO();
    if (/enviamos-lhe|we sent you|we've sent|enviamos um pagamento|pagamento de|payout/.test(head) || /identificacao do pagamento|payout id|payout reference/.test(body)) return airbnbPayout(L, meta);
    if (/avaliac|coment[aá]rio|review/.test(subj) || (!subj && /deixe a sua avaliac|descubra o que .* escreveu|leave a review|wrote you a review/.test(head))) { r.kind = 'review'; return [r]; }
    if (/cancel/.test(head)) { r.kind = 'booking'; r.status = 'Cancelled'; }
    else if (/consulta|inquiry|enquiry|pre-aprova|pre-approv/.test(head)) { r.kind = 'inquiry'; r.status = 'Inquiry'; }
    else if (/pedido de reserva|reservation request|booking request|solicitacao de reserva|request to book/.test(head)) { r.kind = 'booking'; r.status = 'Waiting Confirmation'; }
    else if (/reserva confirmada|reservation confirmed|nova reserva|new booking|new reservation|lembrete de reserva|reservation reminder|chega em|arrives|alterac|alterad|changed|updated/.test(head)) { r.kind = 'booking'; r.status = 'Confirmed'; }

    var code = field(L, 'codigo de confirmacao|confirmation code|codigo da reserva', 1).join(' ').match(/\bHM[A-Z0-9]{8}\b/) || L.join(' ').match(/\bHM[A-Z0-9]{8}\b/);
    r.code = code ? code[0] : '';
    if (r.kind === 'unknown' && r.code) { r.kind = 'booking'; r.status = 'Confirmed'; }

    var iv = indexOfLine(L, /^(identidade verificada|identity verified|responsavel pela reserva|booker|reservation holder)/);
    var holder = '';
    if (iv > -1) {
      r.name = lineAbove(L, iv);
      if (/^(responsavel pela reserva|booker|reservation holder)/.test(low(L[iv]))) holder = lineBelow(L, iv); else r.place = lineBelow(L, iv);
    }
    if (!r.name) {
      var m = (meta.subject || '').match(/[-–]\s*(.+?)\s+(?:chega|arrives)\b/i) || L.join('\n').match(/(?:consulta de|inquiry from|mensagem de|message from)\s+([^\n]+)/i);
      if (m) {
        r.name = m[1].trim();
        var ni = L.indexOf(r.name, indexOfLine(L, /consulta de|inquiry from/) + 1);
        if (ni > -1) r.place = lineBelow(L, ni);
      }
    }
    if (/^(airbnb|envie|send)/i.test(r.name)) r.name = '';
    if (r.place && r.place.indexOf(',') < 0) r.place = '';
    r.country = countryOf(r.place);

    var li = indexOfLine(L, /^(casa inteira|entire home|entire place|entire rental|espaco inteiro|quarto privado|quarto em|private room|room in|apartamento - |apartment - )/);
    if (li > -1) r.listing = lineAbove(L, li);
    if (!r.listing) { var ls = (meta.subject || '').match(/(?:sobre|for)\s+(.+?)\s+(?:para|for)\s+\d/i); if (ls) r.listing = ls[1]; }

    var ci = field(L, 'check-?in', 4, STOP).join(' '), co = field(L, 'check-?out', 4, STOP).join(' ');
    r.checkin = dateFrom(ci, ref); r.ciTime = timeFrom(ci);
    r.checkout = dateFrom(co, r.checkin || ref, !!r.checkin); r.coTime = timeFrom(co);
    r.people = countPeople(field(L, 'viajantes|hospedes|guests|travel+ers|viajeros', 2, STOP));

    r.total = moneyAfter(L, 'total \\((?:eur|usd|gbp|brl|chf)\\)|total \\(eur\\)');
    r.payout = moneyAfter(L, 'voce ganha|you earn|you\'ll earn|total payout|o seu pagamento total');
    var fee = moneyAfter(L, 'taxa de servico do anfitri.*|host service fee.*');
    r.hostFee = fee == null ? null : Math.abs(fee);
    r.cleaningFee = moneyAfter(L, 'taxa de limpeza|cleaning fee');
    var nm = L.join(' ').match(/x\s*(\d+)\s*(noites?|nights?)/i);
    r.nights = nm ? +nm[1] : null;

    if (r.kind === 'inquiry' || r.kind === 'booking') {
      var mi = r.place ? L.indexOf(r.place) : iv;
      if (r.kind === 'inquiry' && mi > -1) {
        var msg = between(L, mi, /^(pre-aprovar|pre-approve|responder|reply|na airbnb desde|on airbnb since|tambem pode responder)/);
        if (/^na airbnb desde|on airbnb since/.test(low(lineBelow(L, mi)))) msg = between(L, mi + 2, /^(pre-aprovar|pre-approve|responder|reply|tambem pode responder)/);
        msg = msg.replace(/^(na airbnb desde|on airbnb since)\s*\d{4}\s*/i, '');
        if (msg && !STOP.test(low(msg))) r.notes = 'Mensagem: ' + msg;
      }
      if (holder && !/^(responder|reply)/i.test(holder)) r.notes = 'Mensagem: ' + holder;
    }
    return r.kind === 'unknown' ? [] : [r];
  }
  /* "Enviámos-lhe um pagamento": one block per paid booking — name, amount, dates, listing, code */
  function airbnbPayout(L, meta) {
    var out = [];
    for (var i = 0; i < L.length; i++) {
      var m = L[i].match(/^\bHM[A-Z0-9]{8}\b$/);
      if (!m) continue;
      var r = base('Airbnb', meta); r.kind = 'payout'; r.code = m[0];
      for (var k = i - 1; k >= 0 && k > i - 10; k--) {
        var l = L[k]; if (!l) continue;
        var dr = l.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
        if (dr && !r.checkin) { r.checkin = dateFrom(dr[1]); r.checkout = dateFrom(dr[2]); continue; }
        if (/\(\d{5,}\)\s*$/.test(l) && !r.listing) { r.listing = l.replace(/\s*\(\d{5,}\)\s*$/, ''); continue; }
        if (hasMoney(l) && r.payout == null) { r.payout = money(l); r.name = lineAbove(L, k); break; }
      }
      out.push(r);
    }
    return out;
  }

  /* ---------- Booking.com ---------- */
  function booking(L, meta) {
    var r = base('Booking', meta), body = low(L.join('\n')), subj = low(meta.subject || '');
    var head = subj + '\n' + body.slice(0, 400), ref = meta.date || todayISO();
    var code = field(L, 'numero da reserva|numero da confirmacao|booking number|reservation number|confirmation number|numero de reserva', 1).join(' ').match(/\d{8,12}/)
      || L.join(' ').match(/(?:reserva|booking|confirma\w*|reservation)\D{0,25}(\d{8,12})/i);
    r.code = code ? (code[1] || code[0]) : '';
    if (!r.code) return [];
    r.kind = 'booking';
    r.status = /cancel/.test(head) ? 'Cancelled' : /pedido de reserva|reservation request|pending/.test(head) && !/confirmad|confirmed/.test(head) ? 'Waiting Confirmation' : 'Confirmed';
    r.name = (field(L, 'nome do hospede|guest name|nome do cliente|booker name|nome do responsavel pela reserva', 1)[0] || '').trim();
    var ci = field(L, 'check-?in|chegada|arrival', 3, STOP).join(' '), co = field(L, 'check-?out|partida|departure', 3, STOP).join(' ');
    r.checkin = dateFrom(ci, ref); r.checkout = dateFrom(co, r.checkin || ref, !!r.checkin);
    r.listing = (field(L, 'nome da propriedade|property name|nome do alojamento|propriedade', 1)[0] || '').trim();
    r.people = countPeople(field(L, 'total de hospedes|total guests|numero de hospedes|number of guests|hospedes|guests|pessoas|persons', 1));
    r.total = moneyAfter(L, 'preco total|total price|valor total|total da reserva|price|preco');
    r.hostFee = moneyAfter(L, 'comissao|commission');
    var u = L.join(' ').match(/apartamento\s*(\d{2})\b/i); if (u) r.apt = u[1];
    var si = indexOfLine(L, /^.{2,80} (disse|said|escreveu|wrote|ha escrito|dijo):$/);
    if (si > -1) {
      var msg = between(L, si, /^(responder|reply|confirmado|confirmed|dados da reserva|reservation details|booking details|pode alterar)/);
      if (msg) {
        r.notes = 'Mensagem: ' + msg;
        var t = msg.match(/check-?in[^0-9]{0,25}(\d{1,2})[:h](\d{2})/i) || msg.match(/(?:chega\w*|arriv\w*|lleg\w*)[^0-9]{0,25}(\d{1,2})[:h](\d{2})/i);
        if (t && +t[1] < 24) r.ciTime = pad(+t[1]) + ':' + t[2];
      }
    }
    return [r];
  }

  /* ---------- direct site ("Reserva Site", sent through Brevo) ---------- */
  function site(L, meta) {
    var r = base('Site', meta);
    r.code = sameLine(L, 'booking code'); if (!r.code) return [];
    r.kind = 'booking'; r.status = /cancel/i.test(meta.subject || '') ? 'Cancelled' : 'Waiting Confirmation';
    r.name = [sameLine(L, 'name'), sameLine(L, 'last name')].filter(Boolean).join(' ');
    r.phone = sameLine(L, 'phone'); r.email = sameLine(L, 'email');
    var room = sameLine(L, 'room \\d+'), a = room.match(/\d{2}/); r.listing = room; r.apt = a ? a[0] : '';
    var ad = parseInt(sameLine(L, 'adults?'), 10) || 0, ch = parseInt(sameLine(L, 'children'), 10) || 0;
    r.people = ad + ch || null;
    r.checkin = dateFrom(sameLine(L, 'check in')); r.ciTime = timeFrom(sameLine(L, 'check in time'));
    r.checkout = dateFrom(sameLine(L, 'check out'));
    r.total = money(sameLine(L, 'total price'));
    var paid = money(sameLine(L, 'paid amount'));
    var ni = indexOfLine(L, /^additional note\s*:/), note = '';
    if (ni > -1) { note = L[ni].slice(L[ni].indexOf(':') + 1).trim(); var more = between(L, ni, /^coupon\s*:/, 30); note = (note + ' ' + more).trim(); }
    var si = indexOfLine(L, /^additional services$/), svc = si > -1 ? between(L, si, /^payment information/, 6) : '';
    r.notes = [note && 'Nota: ' + note, svc && 'Serviços: ' + svc, r.total != null ? 'Site: total €' + r.total + ', pago €' + (paid || 0) : ''].filter(Boolean).join(' · ');
    return [r];
  }

  /* ---------- entry points ---------- */
  function headers(L) {
    var h = {};
    for (var i = 0; i < Math.min(L.length, 14); i++) {
      var m = L[i].match(/^(de|from|date|data|subject|assunto|enviado|sent)\s*:\s*(.*)$/i);
      if (!m) continue;
      var k = low(m[1]);
      if ((k === 'de' || k === 'from') && !h.from) h.from = m[2];
      if ((k === 'date' || k === 'data' || k === 'enviado' || k === 'sent') && !h.date) h.date = m[2];
      if ((k === 'subject' || k === 'assunto') && !h.subject) h.subject = m[2];
    }
    return h;
  }
  function source(from, L) {
    var f = low(from), b = low(L.slice(0, 400).join('\n'));
    if (/brevosend|reserva site/.test(f) || /^booking code\s*:/m.test(b)) return 'site';
    if (/airbnb/.test(f) || /airbnb ireland|airbnb payments|airbnb, inc/.test(b)) return 'airbnb';
    if (/booking\.com/.test(f) || /booking\.com/.test(b)) return 'booking';
    return '';
  }
  /* text: one email, or several forwarded emails pasted together.
     meta: {from, subject, date (YYYY-MM-DD), id} from Gmail, used when the text has no forwarded header. */
  function parse(text, meta) {
    meta = meta || {};
    var parts = String(text || '').split(/-{3,}\s*(?:forwarded message|mensagem encaminhada|mensaje reenviado|message transf[eé]r[eé]|weitergeleitete nachricht)\s*-{3,}/i);
    var many = parts.length > 1, out = [];
    for (var p = 0; p < parts.length; p++) {
      var L = toLines(parts[p]); if (!L.join('')) continue;
      var h = many ? headers(L) : {};
      var m = {from: h.from || meta.from || '', subject: h.subject || meta.subject || '', id: meta.id || '',
        date: (h.date ? dateFrom(h.date) : '') || meta.date || ''};
      var s = source(m.from, L);
      var recs = s === 'airbnb' ? airbnb(L, m) : s === 'booking' ? booking(L, m) : s === 'site' ? site(L, m) : [];
      recs.forEach(function (r) { r.key = keyOf(r); out.push(r); });
    }
    return out;
  }
  function keyOf(r) {
    if (r.code) return r.platform + ':' + r.code;
    return r.platform + ':INQ:' + low(r.name).replace(/[^a-z0-9]/g, '') + ':' + r.checkin + ':' + r.checkout;
  }

  /* Merge a newly read email into the stored booking.
     Fields the manager edited by hand (listed in old.locked) are never overwritten. */
  var RANK = {'Inquiry': 0, 'Waiting Confirmation': 1, 'Not paid': 1, 'Confirmed': 2, 'Cancelled': 3};
  var FIELDS = ['platform','code','name','place','country','phone','email','people','checkin','checkout','ciTime','coTime','listing','apt','total','payout','hostFee','cleaningFee','nights','notes'];
  function merge(old, rec) {
    if (!old) { var n = {}; FIELDS.forEach(function (f) { n[f] = rec[f] == null ? '' : rec[f]; }); n.key = rec.key; n.status = rec.status || 'Confirmed'; n.locked = ''; n.sources = rec.kind; return n; }
    var locked = String(old.locked || '').split(',');
    FIELDS.forEach(function (f) {
      if (locked.indexOf(f) > -1) return;
      var v = rec[f]; if (v == null || v === '') return;
      if (f === 'notes') { if (String(old.notes || '').indexOf(v) < 0) old.notes = old.notes ? old.notes + ' · ' + v : v; return; }
      if (f === 'payout' && rec.kind === 'payout') { old.payout = v; return; }
      if (f === 'name' && old.name && String(v).length <= String(old.name).length) return;
      if (old[f] == null || old[f] === '' || f === 'checkin' || f === 'checkout' || f === 'people' || f === 'total') { if (rec.kind !== 'payout' || old[f] == null || old[f] === '') old[f] = v; }
    });
    if (rec.status && locked.indexOf('status') < 0 && (RANK[rec.status] || 0) >= (RANK[old.status] || 0)) old.status = rec.status;
    if (String(old.sources || '').split(',').indexOf(rec.kind) < 0) old.sources = old.sources ? old.sources + ',' + rec.kind : rec.kind;
    return old;
  }

  return {parse: parse, merge: merge, keyOf: keyOf, dateFrom: dateFrom, money: money, timeFrom: timeFrom, FIELDS: FIELDS};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ReservasParser;
