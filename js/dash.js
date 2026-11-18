/* NSC & Load Change Pendency - dashboard */
(function () {
  'use strict';

  var FEED_URL = 'https://script.google.com/macros/s/' +
    'AKfycbzWRJdQUoFvGdqfZMu8UDlTxw1CvulfxVYNXSJGUEjb9ufIpwUeFrOtXMSkJjZTPg2Xiw/exec?format=json';
  var STORE = 'nscdash-feed-v1', PREFS = 'nscdash-prefs-v1';
  var REPORTS = ['NSC <19 kW', 'NSC 19-59 kW', 'Load Change'];
  var REPORT_NAME = { 'NSC <19 kW': 'NSC below 19 kW', 'NSC 19-59 kW': 'NSC 19 to 59 kW', 'Load Change': 'Load change' };
  var DISCOMS = ['NBPDCL', 'SBPDCL'];
  var AREA = { NBPDCL: 'North', SBPDCL: 'South' };

  // stages: label, where the work usually sits
  var NSC_STAGES = [
    ['pdoc', 'Document verification', 'Sub-division office'],
    ['hdoc', 'On hold at document verification', 'Applicant / sub-division'],
    ['psite', 'Site inspection', 'Section JE'],
    ['hsite', 'On hold at site inspection', 'Applicant / section'],
    ['infra', 'Infra installation', 'Division (works)'],
    ['amisp', 'At AMISP (meter fixing)', 'Smart meter agency']
  ];
  var LC_STAGES = [
    ['pay', 'Registration payment', 'Applicant'],
    ['insp', 'Site inspection', 'Section JE'],
    ['wo', 'Work order for meter', 'Sub-division office'],
    ['meter', 'Meter installation', 'Meter agency'],
    ['nochg', 'Meter change not required', 'Section (release)'],
    ['hold', 'On hold', 'Applicant / section']
  ];
  var STAGE_COLOURS = ['#1f5c99', '#7aa3cf', '#3f74b0', '#a9b8cc', '#5b6fa8', '#8a7cbf'];
  var LEVELS = { nsc: [['circle', 'Circle'], ['division', 'Division'], ['sub', 'Sub-division'], ['section', 'Section']],
    lc: [['circle', 'Circle'], ['division', 'Division']] };
  var PLURAL = { circle: 'circles', division: 'divisions', sub: 'sub-divisions', section: 'sections' };
  var SEV = [['c', 'Critical', 75], ['h', 'High', 60], ['m', 'Moderate', 40], ['l', 'Low', -1]];
  var SEV_FILL = { c: '#b42318', h: '#b54708', m: '#c9a227', l: '#2b7a4b' };

  var $ = function (id) { return document.getElementById(id); };
  var nf = new Intl.NumberFormat('en-IN');
  function n(v) { return v === null || v === undefined || isNaN(v) ? '-' : nf.format(Math.round(v)); }
  function pct(v, d) { return v === null || v === undefined || !isFinite(v) ? '-' : (v * 100).toFixed(d === undefined ? 1 : d) + '%'; }
  function ratio(a, b) { return b ? a / b : null; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function title(s) { return String(s || '').toLowerCase().replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); }); }
  function signed(v) { return v > 0 ? '+' + n(v) : v < 0 ? '−' + n(-v) : '0'; }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* the page works without it */ } }
  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  var prefs = {};
  try { prefs = JSON.parse(recall(PREFS) || '{}') || {}; } catch (e) { prefs = {}; }
  var S = {
    feed: null, model: null,
    report: REPORTS.indexOf(prefs.report) >= 0 ? prefs.report : REPORTS[0],
    discom: ['ALL', 'NBPDCL', 'SBPDCL'].indexOf(prefs.discom) >= 0 ? prefs.discom : 'ALL',
    level: prefs.level || '', sev: '', sortKey: 'score', sortDir: -1, showAll: false,
    interval: prefs.interval || 'week'
  };
  function savePrefs() { store(PREFS, JSON.stringify({ report: S.report, discom: S.discom, level: S.level, interval: S.interval })); }

  // ================================================================ data
  function buildModel(feed) {
    var repById = {};
    (feed.reports || []).forEach(function (r) { repById[r.id] = r; });
    var recs = [];
    (feed.nsc || []).forEach(function (x) {
      var rep = repById[x[0]]; if (!rep) return;
      var st = { pdoc: x[10], hdoc: x[11], psite: x[12], hsite: x[13], infra: x[14], amisp: x[15] };
      var pend = x[10] + x[11] + x[12] + x[13] + x[14] + x[15], done = x[8] + x[9];
      recs.push({ report: rep.label, kind: 'nsc', discom: x[1], circle: x[2], division: x[3], sub: x[4], section: x[5],
        reg: x[6], canc: x[7], in15: x[8], out15: x[9], done: done, pend: pend, hold: x[11] + x[13], st: st,
        gap: Math.max(0, x[6] - x[7] - done - pend), ag: null });
    });
    var agencies = feed.agencies || [];
    (feed.lc || []).forEach(function (x) {
      var rep = repById[x[0]]; if (!rep) return;
      var st = { pay: x[6], insp: x[7], wo: x[8], meter: x[9], nochg: x[10], hold: x[11] };
      var stageSum = x[6] + x[7] + x[8] + x[9] + x[10] + x[11];
      var pend = Math.max(0, x[5] - x[13] - x[12]);
      var ag = {}; agencies.forEach(function (a, i) { ag[a] = x[15 + i] || 0; });
      recs.push({ report: rep.label, kind: 'lc', discom: x[1], circle: x[2], division: x[3], sub: '', section: '', type: x[4],
        reg: x[5], canc: x[12], in15: null, out15: null, done: x[13], pend: pend, hold: x[11], st: st,
        gap: Math.max(0, pend - stageSum), ag: ag, agTotal: x[14] });
    });
    var reports = REPORTS.filter(function (r) { return recs.some(function (x) { return x.report === r; }); });
    return { recs: recs, reports: reports, agencies: agencies, history: feed.history || { totals: [], units: {}, log: [] }, meta: feed.meta || {} };
  }

  function kindOf(report) { return report === 'Load Change' ? 'lc' : 'nsc'; }
  function stagesOf(report) { return kindOf(report) === 'lc' ? LC_STAGES : NSC_STAGES; }
  function scopeRecs(report, discom) {
    return S.model.recs.filter(function (r) { return r.report === report && (discom === 'ALL' || r.discom === discom); });
  }
  function sumUp(rs) {
    var t = { reg: 0, canc: 0, done: 0, in15: 0, out15: 0, pend: 0, hold: 0, gap: 0, st: {}, ag: {}, lines: rs.length };
    rs.forEach(function (r) {
      t.reg += r.reg; t.canc += r.canc; t.done += r.done; t.pend += r.pend; t.hold += r.hold; t.gap += r.gap;
      if (r.in15 !== null) { t.in15 += r.in15; t.out15 += r.out15; }
      Object.keys(r.st).forEach(function (k) { t.st[k] = (t.st[k] || 0) + r.st[k]; });
      if (r.ag) Object.keys(r.ag).forEach(function (k) { t.ag[k] = (t.ag[k] || 0) + r.ag[k]; });
    });
    return t;
  }
  function levelKey(r, level) {
    var parts = [r.discom, r.circle];
    if (level !== 'circle') parts.push(r.division);
    if (level === 'sub' || level === 'section') parts.push(r.sub);
    if (level === 'section') parts.push(r.section);
    return parts;
  }
  function groupBy(rs, level) {
    var map = new Map();
    rs.forEach(function (r) {
      var parts = levelKey(r, level), k = parts.join('|');
      if (!map.has(k)) map.set(k, { parts: parts, rows: [] });
      map.get(k).rows.push(r);
    });
    return Array.from(map.values()).map(function (g) {
      var t = sumUp(g.rows); t.parts = g.parts; t.key = g.parts.join('|');
      t.name = title(g.parts[g.parts.length - 1]); t.discom = g.parts[0];
      t.context = g.parts.slice(1, -1).map(title).join(' / ');
      return t;
    });
  }

  // ---- report period: every application since 01-Jan-2020 ('full') or a recent window such as the last 1 year ('year')
  var MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  function dayOf(x) { var m = /^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})/.exec(String(x || '').trim()); return m && MON[m[2].toLowerCase()] !== undefined ? Date.UTC(+m[3], MON[m[2].toLowerCase()], +m[1]) : null; }
  function kindOfPeriod(from) { var d = dayOf(from); return d === null || d === Date.UTC(2020, 0, 1) ? 'full' : 'year'; }
  function periodsOf(report, discom) {
    var out = []; Object.keys(S.model.meta).forEach(function (k) {
      var p = k.split('|'); if (p[1] !== report || (discom !== 'ALL' && p[0] !== discom)) return;
      out.push(S.model.meta[k]);
    });
    return out;
  }
  function periodKind(report, discom) { return periodsOf(report, discom).some(function (m) { return kindOfPeriod(m.periodFrom) === 'year'; }) ? 'year' : 'full'; }
  function nice(x) { var d = dayOf(x); if (d === null) return x || ''; var t = new Date(d); return t.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][t.getUTCMonth()] + ' ' + t.getUTCFullYear(); }
  function periodText(report, discom) {
    var ps = periodsOf(report, discom), froms = [], tos = [];
    ps.forEach(function (m) { if (m.periodFrom && froms.indexOf(m.periodFrom) < 0) froms.push(m.periodFrom); if (m.periodTo && tos.indexOf(m.periodTo) < 0) tos.push(m.periodTo); });
    if (!froms.length) return '';
    var kind = periodKind(report, discom);
    var range = froms.length === 1 ? nice(froms[0]) : froms.map(nice).join(' / ');
    var to = tos.length === 1 ? nice(tos[0]) : tos.map(nice).join(' / ');
    return kind === 'year' ? 'Applications registered ' + range + ' to ' + to + ' (last 1 year)' : 'All applications since ' + range;
  }

  // ---- history (only updates that cover the same kind of period are compared)
  function histUnits(which, report, discom) {
    var set = S.model.history.units && S.model.history.units[which];
    if (!set) return null;
    var kind = periodKind(report, discom), out = {}, any = false;
    set.reports.forEach(function (r) {
      if (r.report !== report || (discom !== 'ALL' && r.discom !== discom) || kindOfPeriod(r.periodFrom) !== kind) return;
      any = true;
      r.units.forEach(function (u) { out[r.discom + '|' + u[0]] = { reg: u[1], canc: u[2], done: u[3], pend: u[4], late: u[5], hold: u[6] }; });
    });
    return any ? { date: set.date, units: out } : null;
  }
  // pending of a unit at a level, from a history set (null when the level is finer than what is saved)
  function histPend(h, unitKey, level, report) {
    if (!h) return null;
    var savedDepth = report === 'NSC <19 kW' ? 3 : 2;          // circle|division|sub or circle|division
    var depth = { circle: 1, division: 2, sub: 3, section: 4 }[level];
    if (depth > savedDepth) return null;
    var parts = unitKey.split('|'), want = parts.slice(0, 1 + depth).join('|'), total = 0, found = false;
    Object.keys(h.units).forEach(function (k) {
      if (k === want || k.indexOf(want + '|') === 0) { total += h.units[k].pend; found = true; }
    });
    return found ? total : null;
  }
  function intervalSet(which) { return which === 'day' ? 'day' : which === 'month' ? 'month' : 'week'; }
  function trendRows(report, discom) {
    // totals per date; for both DISCOMs together the last known figure of each is carried forward
    var kind = periodKind(report, discom);
    var rows = (S.model.history.totals || []).filter(function (t) { return t[2] === report && (discom === 'ALL' || t[1] === discom) && kindOfPeriod(t[9]) === kind; });
    var dates = Array.from(new Set(rows.map(function (t) { return t[0]; }))).sort();
    var last = {}, out = [], both = new Set(rows.map(function (t) { return t[1]; })).size;
    dates.forEach(function (d) {
      rows.filter(function (t) { return t[0] === d; }).forEach(function (t) { last[t[1]] = t; });
      var parts = Object.keys(last).map(function (k) { return last[k]; });
      if (parts.length < both) return;      // wait until each DISCOM has a figure
      var s = { date: d, reg: 0, canc: 0, done: 0, pend: 0, late: 0, hold: 0 };
      parts.forEach(function (t) { s.reg += t[3]; s.canc += t[4]; s.done += t[5]; s.pend += t[6]; s.late += t[7]; s.hold += t[8]; });
      out.push(s);
    });
    return out;
  }
  // registered per data date from the update log, for new-registration counts before the history began
  function logRegistrations(report, discom) {
    if (periodKind(report, discom) === 'year') return [];      // a moving window: older applications drop out every day
    var MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    var by = {};
    (S.model.history.log || []).forEach(function (l) {
      if (l[2] !== report || (discom !== 'ALL' && l[1] !== discom) || kindOfPeriod(l[5]) !== 'full') return;
      var m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(l[6] || '');
      if (!m || MON[m[2]] === undefined) return;
      var d = m[3] + '-' + ('0' + (MON[m[2]] + 1)).slice(-2) + '-' + ('0' + m[1]).slice(-2);
      by[d] = by[d] || {}; by[d][l[1]] = Number(String(l[4]).replace(/,/g, '')) || 0;
    });
    (S.model.history.totals || []).forEach(function (t) {
      if (t[2] !== report || (discom !== 'ALL' && t[1] !== discom) || kindOfPeriod(t[9]) !== 'full') return;
      by[t[0]] = by[t[0]] || {}; by[t[0]][t[1]] = t[3];
    });
    var dates = Object.keys(by).sort(), last = {}, out = [];
    var need = discom === 'ALL' ? DISCOMS : [discom];
    dates.forEach(function (d) {
      Object.keys(by[d]).forEach(function (k) { last[k] = by[d][k]; });
      if (need.every(function (k) { return last[k] !== undefined; })) out.push({ date: d, reg: need.reduce(function (s, k) { return s + last[k]; }, 0) });
    });
    return out;
  }

  // ---- criticality score
  function percentiles(vals) {
    var sorted = vals.filter(function (v) { return v !== null; }).slice().sort(function (a, b) { return a - b; });
    return function (v) {
      if (v === null || !sorted.length) return null;
      var lo = 0, hi = sorted.length;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (sorted[mid] < v) lo = mid + 1; else hi = mid; }
      var below = lo, eq = 0; while (below + eq < sorted.length && sorted[below + eq] === v) eq++;
      return sorted.length === 1 ? 1 : (below + eq / 2) / sorted.length;
    };
  }
  function scored(report, discom, level) {
    var units = groupBy(scopeRecs(report, discom), level);
    var week = histUnits('week', report, discom), latest = histUnits('latest', report, discom);
    var kind = kindOf(report);
    units.forEach(function (u) {
      u.pPend = ratio(u.pend, u.reg);
      u.pLate = kind === 'nsc' ? ratio(u.out15, u.done) : null;
      u.pHold = ratio(u.hold, u.pend);
      var then = histPend(week, u.key, level, report), now = histPend(latest, u.key, level, report);
      u.change = then !== null && now !== null && week && latest && week.date !== latest.date ? u.pend - then : null;
      u.growth = u.change === null ? null : then ? u.change / then : (u.change > 0 ? 1 : 0);
      var top = null; stagesOf(report).forEach(function (s) { if (!top || u.st[s[0]] > u.st[top[0]]) top = s; });
      u.topStage = top && u.st[top[0]] > 0 ? top[1] : '-';
    });
    var parts = [['pend', 0.40], ['pPend', 0.25], ['pLate', 0.15], ['pHold', 0.10], ['growth', 0.10]];
    var rank = {}; parts.forEach(function (p) { rank[p[0]] = percentiles(units.map(function (u) { return u[p[0]]; })); });
    units.forEach(function (u) {
      var w = 0, s = 0;
      parts.forEach(function (p) { var r = rank[p[0]](u[p[0]]); if (r !== null) { s += r * p[1]; w += p[1]; } });
      u.score = w ? Math.round(100 * s / w) : 0;
      if (!u.pend) u.score = 0;
      u.sev = SEV.filter(function (x) { return u.score >= x[2]; })[0][0];
    });
    units.sort(function (a, b) { return b.score - a.score || b.pend - a.pend; });
    units.forEach(function (u, i) { u.rank = i + 1; });
    return units;
  }
  function sevName(c) { return SEV.filter(function (x) { return x[0] === c; })[0][1]; }
  function sevChip(c) { return '<span class="sev ' + c + '">' + sevName(c) + '</span>'; }
  function dchip(d) { return '<span class="dchip ' + (d === 'NBPDCL' ? 'n' : 's') + '">' + (d === 'NBPDCL' ? 'N' : 'S') + '</span>'; }

  // ================================================================ review points
  function reviewPoints(discom) {
    var pts = [];
    S.model.reports.forEach(function (rep) {
      var rs = scopeRecs(rep, discom); if (!rs.length) return;
      var t = sumUp(rs), name = REPORT_NAME[rep], scopeName = discom === 'ALL' ? 'Bihar' : discom;
      var tr = trendRows(rep, discom), wk = histUnits('week', rep, discom), lt = histUnits('latest', rep, discom);
      var change = '';
      if (wk && lt && wk.date !== lt.date) {
        var then = tr.filter(function (x) { return x.date === wk.date; })[0];
        if (then) { var d = t.pend - then.pend; change = d === 0 ? ', unchanged in a week' : ', ' + (d > 0 ? 'up ' : 'down ') + n(Math.abs(d)) + ' in a week'; }
      }
      pts.push({ tone: ratio(t.pend, t.reg) > 0.3 ? 'c' : '', tag: name, text: scopeName + ': ' + n(t.pend) + ' applications pending, ' + pct(ratio(t.pend, t.reg)) + ' of registered' + change + '.' });
      var stg = stagesOf(rep).map(function (s) { return [s, t.st[s[0]] || 0]; }).sort(function (a, b) { return b[1] - a[1]; });
      if (stg.length && stg[0][1]) {
        pts.push({ tone: 'h', tag: name, text: stg[0][0][1] + ' holds ' + pct(ratio(stg[0][1], t.pend), 0) + ' of the pendency (' + n(stg[0][1]) + '). Action usually with: ' + stg[0][0][2] + '.' +
          (stg[1] && stg[1][1] ? ' Next: ' + stg[1][0][1] + ', ' + n(stg[1][1]) + '.' : '') });
      }
      var lvl = rep === 'NSC <19 kW' ? 'sub' : 'division';
      var crit = scored(rep, discom, lvl).filter(function (u) { return u.sev === 'c'; });
      if (crit.length) pts.push({ tone: 'c', tag: name, text: crit.length + ' ' + (crit.length === 1 ? (lvl === 'sub' ? 'sub-division is' : 'division is') : PLURAL[lvl] + ' are') + ' critical. Highest: ' +
        crit.slice(0, 3).map(function (u) { return u.name + ' (' + n(u.pend) + ')'; }).join(', ') + '.' });
      if (kindOf(rep) === 'nsc' && t.done) {
        var late = ratio(t.out15, t.done), divs = scored(rep, discom, 'division').filter(function (u) { return u.done >= 20; })
          .sort(function (a, b) { return (b.pLate || 0) - (a.pLate || 0); });
        pts.push({ tone: late > 0.5 ? 'c' : late > 0.3 ? 'h' : '', tag: name, text: pct(late, 0) + ' of completed connections took more than 15 days' +
          (divs[0] ? '; slowest division: ' + divs[0].name + ' (' + pct(divs[0].pLate, 0) + ' late).' : '.') });
        if (t.st.amisp) pts.push({ tone: '', tag: name, text: n(t.st.amisp) + ' applications are waiting at AMISP for meter fixing (' + pct(ratio(t.st.amisp, t.pend), 0) + ' of pending).' });
        if (t.hold) pts.push({ tone: '', tag: name, text: n(t.hold) + ' applications are on hold at document verification or site inspection. Review whether they can be closed or cancelled.' });
        if (ratio(t.gap, t.reg) > 0.02) pts.push({ tone: 'h', tag: name, text: n(t.gap) + ' registered applications (' + pct(ratio(t.gap, t.reg)) + ') do not appear under any status. Ask the portal team to account for them.' });
      }
      if (kindOf(rep) === 'lc') {
        var ags = Object.keys(t.ag).map(function (a) { return [a, t.ag[a]]; }).filter(function (a) { return a[1] > 0; }).sort(function (a, b) { return b[1] - a[1]; });
        if (ags.length) pts.push({ tone: '', tag: name, text: 'Meter installation pending by agency: ' + ags.slice(0, 4).map(function (a) { return a[0] + ' ' + n(a[1]); }).join(', ') + '.' });
      }
      if (rep === 'NSC 19-59 kW' && ratio(t.canc, t.reg) > 0.2) {
        var cd = groupBy(rs, 'division').filter(function (u) { return u.reg >= 15; }).sort(function (a, b) { return ratio(b.canc, b.reg) - ratio(a.canc, a.reg); });
        pts.push({ tone: 'h', tag: name, text: pct(ratio(t.canc, t.reg), 0) + ' of registered 19 to 59 kW applications were cancelled' + (cd[0] ? '; highest in ' + cd[0].name + ' (' + pct(ratio(cd[0].canc, cd[0].reg), 0) + ').' : '.') });
      }
      if (wk && lt && wk.date !== lt.date) {
        var units = scored(rep, discom, 'division').filter(function (u) { return u.change !== null; });
        var rising = units.filter(function (u) { return u.change > 0; }).sort(function (a, b) { return b.change - a.change; });
        if (units.length) pts.push({ tone: rising.length > units.length / 2 ? 'h' : 'l', tag: name, text: 'Pending rose in ' + rising.length + ' of ' + units.length + ' divisions in the last week' +
          (rising[0] ? '; largest rise: ' + rising[0].name + ' (+' + n(rising[0].change) + ').' : '.') });
      }
    });
    return pts;
  }

  // ================================================================ render
  function render() {
    var M = S.model;
    if (M.reports.indexOf(S.report) < 0) S.report = M.reports[0];
    if (S.discom !== 'ALL' && !M.recs.some(function (r) { return r.report === S.report && r.discom === S.discom; })) S.discom = 'ALL';
    var kind = kindOf(S.report), levels = LEVELS[kind].map(function (l) { return l[0]; });
    if (levels.indexOf(S.level) < 0) S.level = kind === 'nsc' ? 'division' : 'division';
    renderFilters();
    var html = '';
    html += secGlance() + secStages() + secCritical() + secDelay() + secAgency() + secTrend() + secReview() + secGaps() + secCancel();
    var box = $('content');
    box.innerHTML = html;
    box.hidden = false; $('state').hidden = true; $('filters').hidden = false;
    $('pdfBtn').disabled = false;
    bindContent();
    savePrefs();
  }

  function renderFilters() {
    var M = S.model;
    $('segReport').innerHTML = M.reports.map(function (r) {
      return '<button type="button" data-report="' + esc(r) + '" aria-pressed="' + (r === S.report) + '">' + esc(REPORT_NAME[r]) + '</button>';
    }).join('');
    var has = {}; M.recs.forEach(function (r) { if (r.report === S.report) has[r.discom] = true; });
    $('segDiscom').innerHTML = [['ALL', 'Bihar'], ['NBPDCL', 'NBPDCL'], ['SBPDCL', 'SBPDCL']].map(function (d) {
      var off = d[0] !== 'ALL' && !has[d[0]];
      return '<button type="button" data-discom="' + d[0] + '" aria-pressed="' + (d[0] === S.discom) + '"' + (off ? ' disabled title="No figures for ' + d[0] + ' in this report"' : '') + '>' + d[1] + '</button>';
    }).join('');
    var kind = periodKind(S.report, S.discom);
    $('periodChip').hidden = false;
    $('periodChip').textContent = kind === 'year' ? 'Last 1 year' : 'Since 1 Jan 2020';
    $('periodChip').className = 'pchip ' + kind;
    $('periodChip').title = periodText(S.report, S.discom);
    var secs = [['glance', 'At a glance'], ['stages', 'Stages'], ['critical', 'Critical units'], ['delay', 'Delay'],
      ['agency', kindOf(S.report) === 'lc' ? 'Agencies' : 'AMISP'], ['trend', 'Trend'], ['review', 'Review points'], ['gaps', 'Data gaps'], ['cancel', 'Cancellations']];
    $('jump').innerHTML = secs.map(function (s) { return '<a href="#' + s[0] + '">' + s[1] + '</a>'; }).join('');
  }

  function sinceText() {
    var from = Object.keys(S.model.meta).filter(function (k) { return k.split('|')[1] === S.report; })
      .map(function (k) { return S.model.meta[k].periodFrom; }).filter(Boolean)[0];
    return from ? 'since ' + String(from).replace(/-/g, ' ') : 'all registered';
  }
  function scopeLabel() { return S.discom === 'ALL' ? 'Bihar (NBPDCL + SBPDCL)' : S.discom; }

  // ---- 1. at a glance
  function secGlance() {
    var rs = scopeRecs(S.report, S.discom), t = sumUp(rs), kind = kindOf(S.report);
    var tr = trendRows(S.report, S.discom), wk = histUnits(intervalSet(S.interval), S.report, S.discom), lt = histUnits('latest', S.report, S.discom);
    var delta = '';
    if (wk && lt && wk.date !== lt.date) {
      var then = tr.filter(function (x) { return x.date === wk.date; })[0];
      if (then) {
        var d = t.pend - then.pend, per = { day: 'since the previous update', week: 'in a week', month: 'in a month' }[S.interval];
        delta = '<span class="delta ' + (d > 0 ? 'up' : d < 0 ? 'down' : 'flat') + '">' + (d > 0 ? '▲ ' : d < 0 ? '▼ ' : '') + signed(d) + ' ' + per + '</span>';
      }
    }
    var stages = stagesOf(S.report);
    var pipe = stages.map(function (s, i) {
      var v = t.st[s[0]] || 0; if (!v) return '';
      return '<span style="width:' + (100 * v / Math.max(1, t.pend)) + '%;background:' + STAGE_COLOURS[i] + '" data-tip="' + esc(s[1] + ': ' + n(v) + ' (' + pct(ratio(v, t.pend)) + ')') + '"></span>';
    }).join('');
    var key = stages.map(function (s, i) {
      var v = t.st[s[0]] || 0;
      return '<div class="key"><i style="background:' + STAGE_COLOURS[i] + '"></i><span>' + esc(s[1]) + '</span><span class="v">' + n(v) + '<span class="p">' + pct(ratio(v, t.pend), 0) + '</span></span></div>';
    }).join('');
    var kpis = [
      ['Registered', n(t.reg), sinceText()],
      [kind === 'nsc' ? 'Completed' : 'Service released', n(t.done), pct(ratio(t.done, t.reg)) + ' of registered'],
      kind === 'nsc' ? ['Completed within 15 days', pct(ratio(t.in15, t.done)), n(t.in15) + ' of ' + n(t.done)] : ['Waiting for meter', n((t.st.wo || 0) + (t.st.meter || 0)), 'work order + installation'],
      ['On hold', n(t.hold), pct(ratio(t.hold, t.pend)) + ' of pending'],
      ['Cancelled', n(t.canc), pct(ratio(t.canc, t.reg)) + ' of registered']
    ].map(function (k) { return '<div class="kpi"><div class="lab">' + k[0] + '</div><div class="val">' + k[1] + '</div><div class="note">' + k[2] + '</div></div>'; }).join('');

    // all reports at once
    var rows = '';
    S.model.reports.forEach(function (rep) {
      ['ALL'].concat(DISCOMS).forEach(function (d) {
        if (S.discom !== 'ALL' && d !== S.discom) return;
        var x = sumUp(scopeRecs(rep, d)); if (!x.lines) return;
        var on = rep === S.report && d === S.discom;
        rows += '<tr data-go-report="' + esc(rep) + '" data-go-discom="' + d + '" class="' + (on ? 'on' : '') + '">' +
          '<td><span class="rep">' + esc(REPORT_NAME[rep]) + '</span> <span class="muted small">' + (d === 'ALL' ? 'Bihar' : d) + '</span></td>' +
          '<td>' + n(x.reg) + '</td><td><b>' + n(x.pend) + '</b></td><td>' + pct(ratio(x.pend, x.reg)) + '</td>' +
          '<td>' + (x.in15 || x.out15 ? pct(ratio(x.out15, x.in15 + x.out15)) : '-') + '</td><td>' + n(x.hold) + '</td><td>' + pct(ratio(x.canc, x.reg)) + '</td></tr>';
      });
    });
    return '<section class="sec" id="glance" style="margin-top:4px">' +
      '<div class="panel"><div class="hero"><div class="hero-num"><div class="lab">' + esc(REPORT_NAME[S.report]) + ' pending, ' + esc(scopeLabel()) + '</div>' +
      '<div class="big">' + n(t.pend) + '</div><div class="ctx"><b>' + pct(ratio(t.pend, t.reg)) + '</b> of ' + n(t.reg) + ' registered</div>' +
      (periodText(S.report, S.discom) ? '<div class="period">' + esc(periodText(S.report, S.discom)) + '</div>' : '') + delta + '</div>' +
      '<div><div class="pipe-lab"><span>Where the pending applications are</span><span>' + n(t.pend) + ' in ' + stages.length + ' stages</span></div>' +
      '<div class="pipe">' + pipe + '</div><div class="pipe-key">' + key + '</div></div></div></div>' +
      '<div class="kpis">' + kpis + '</div>' +
      '<div class="panel" style="margin-top:16px"><h3>All reports</h3><p class="sub">Pick a line to look at that report.</p><div class="tbox" style="border:0"><table class="matrix"><thead><tr><th>Report</th><th>Registered</th><th>Pending</th><th>Pending %</th><th>Done after 15 days</th><th>On hold</th><th>Cancelled %</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
      '</section>';
  }

  // ---- 2. stages
  function secStages() {
    var stages = stagesOf(S.report);
    var per = DISCOMS.map(function (d) { return [d, sumUp(scopeRecs(S.report, d))]; }).filter(function (x) { return x[1].lines && (S.discom === 'ALL' || x[0] === S.discom); });
    var max = 0; stages.forEach(function (s) { var v = per.reduce(function (a, x) { return a + (x[1].st[s[0]] || 0); }, 0); if (v > max) max = v; });
    var bars = stages.map(function (s) {
      var tot = per.reduce(function (a, x) { return a + (x[1].st[s[0]] || 0); }, 0);
      var all = per.reduce(function (a, x) { return a + x[1].pend; }, 0);
      var seg = per.map(function (x) {
        var v = x[1].st[s[0]] || 0;
        return '<span style="width:' + (100 * v / Math.max(1, max)) + '%;background:var(--' + (x[0] === 'NBPDCL' ? 'north' : 'south') + ')" data-tip="' + esc(x[0] + ': ' + n(v)) + '"></span>';
      }).join('');
      return '<div class="hb"><div class="name"><b>' + esc(s[1]) + '</b><span>Usually with: ' + esc(s[2]) + '</span></div><div class="track">' + seg + '</div>' +
        '<div class="num">' + n(tot) + '<small>' + pct(ratio(tot, all), 0) + ' of pending</small></div></div>';
    }).join('');
    var legend = per.length > 1 ? '<div class="legend"><span><i style="background:var(--north)"></i>NBPDCL</span><span><i style="background:var(--south)"></i>SBPDCL</span></div>' : '';

    // heat map: circle x stage
    var circles = groupBy(scopeRecs(S.report, S.discom), 'circle').sort(function (a, b) { return b.pend - a.pend; });
    var cellMax = 0; circles.forEach(function (c) { stages.forEach(function (s) { cellMax = Math.max(cellMax, c.st[s[0]] || 0); }); });
    var heat = '<table class="heat"><thead><tr><th class="l">Circle</th>' + stages.map(function (s) { return '<th title="' + esc(s[1]) + '">' + esc(shortStage(s[1])) + '</th>'; }).join('') + '<th>Pending</th></tr></thead><tbody>' +
      circles.map(function (c) {
        return '<tr><td class="l">' + esc(c.name) + (S.discom === 'ALL' ? dchip(c.discom) : '') + '</td>' + stages.map(function (s) {
          var v = c.st[s[0]] || 0, a = cellMax ? Math.sqrt(v / cellMax) : 0;
          return '<td style="background:rgba(31,92,153,' + (0.06 + 0.8 * a).toFixed(3) + ');color:' + (a > 0.55 ? '#fff' : 'var(--ink)') + '" data-tip="' + esc(c.name + ', ' + s[1] + ': ' + n(v)) + '">' + n(v) + '</td>';
        }).join('') + '<td><b>' + n(c.pend) + '</b></td></tr>';
      }).join('') + '</tbody></table>';
    return '<section class="sec" id="stages"><div class="sec-head"><h2>Where cases are stuck</h2><p>Pending applications by stage, and the office that usually has to act.</p></div>' +
      '<div class="panel">' + legend + '<div class="hbars">' + bars + '</div></div>' +
      '<div class="panel" style="margin-top:16px"><h3>Circle by stage</h3><p class="sub">Darker means more pending. Circles with the most pending first.</p><div class="tbox" style="border:0">' + heat + '</div></div></section>';
  }
  function shortStage(s) {
    return ({ 'Document verification': 'Doc verif.', 'On hold at document verification': 'Hold: doc', 'Site inspection': 'Site insp.', 'On hold at site inspection': 'Hold: site',
      'Infra installation': 'Infra', 'At AMISP (meter fixing)': 'AMISP', 'Registration payment': 'Payment', 'Work order for meter': 'Work order',
      'Meter installation': 'Meter inst.', 'Meter change not required': 'No meter chg.', 'On hold': 'On hold' })[s] || s;
  }

  // ---- 3. critical units
  function secCritical() {
    var kind = kindOf(S.report);
    var units = scored(S.report, S.discom, S.level);
    var counts = { c: 0, h: 0, m: 0, l: 0 }; units.forEach(function (u) { counts[u.sev]++; });
    var list = units.filter(function (u) { return !S.sev || u.sev === S.sev; });
    var key = S.sortKey, dir = S.sortDir;
    list.sort(function (a, b) {
      var x = a[key], y = b[key];
      if (x === null || x === undefined) x = -Infinity; if (y === null || y === undefined) y = -Infinity;
      if (typeof x === 'string') return dir * x.localeCompare(y);
      return dir * (x - y) || b.pend - a.pend;
    });
    var shown = S.showAll ? list : list.slice(0, 25);
    var hasChange = units.some(function (u) { return u.change !== null; });
    var cols = [['rank', 'Rank', 'r'], ['name', LEVELS[kind].filter(function (l) { return l[0] === S.level; })[0][1], 'l'], ['sev', 'Severity', 'l'], ['score', 'Score', 'r'],
      ['pend', 'Pending', 'r'], ['pPend', 'Pending %', 'r']]
      .concat(kind === 'nsc' ? [['pLate', 'Done after 15 days', 'r']] : [])
      .concat([['hold', 'On hold', 'r'], ['topStage', 'Main stage', 'l']])
      .concat(hasChange ? [['change', 'Change in a week', 'r']] : []);
    var head = '<tr>' + cols.map(function (c) {
      var sort = c[0] === key ? (dir < 0 ? 'descending' : 'ascending') : 'none';
      return '<th class="' + (c[2] === 'l' ? 'l' : '') + '" data-sort="' + c[0] + '" aria-sort="' + sort + '">' + c[1] + '</th>';
    }).join('') + '</tr>';
    var body = shown.map(function (u) {
      var sbar = '<span class="score"><span class="sbar"><span style="width:' + u.score + '%;background:' + SEV_FILL[u.sev] + '"></span></span>' + u.score + '</span>';
      var cells = { rank: '<span class="rk">' + u.rank + '</span>', name: '<span class="unit"><b>' + esc(u.name) + '</b>' + (S.discom === 'ALL' ? dchip(u.discom) : '') + '<span>' + esc(u.context || u.discom) + '</span></span>',
        sev: sevChip(u.sev), score: sbar, pend: '<b>' + n(u.pend) + '</b>', pPend: pct(u.pPend), pLate: pct(u.pLate), hold: n(u.hold), topStage: esc(u.topStage),
        change: u.change === null ? '-' : '<span class="' + (u.change > 0 ? 'up' : u.change < 0 ? 'down' : '') + '">' + signed(u.change) + '</span>' };
      return '<tr>' + cols.map(function (c) { return '<td class="' + (c[2] === 'l' ? 'l' : '') + '">' + cells[c[0]] + '</td>'; }).join('') + '</tr>';
    }).join('');
    var levelSel = '<span class="selectwrap"><select id="levelSel" aria-label="Level">' + LEVELS[kind].map(function (l) {
      return '<option value="' + l[0] + '"' + (l[0] === S.level ? ' selected' : '') + '>By ' + l[1].toLowerCase() + '</option>'; }).join('') + '</select></span>';
    var chips = '<div class="chips">' + [['', 'All', units.length]].concat(SEV.map(function (s) { return [s[0], s[1], counts[s[0]]]; })).map(function (c) {
      return '<button type="button" class="chip" data-sev="' + c[0] + '" aria-pressed="' + (S.sev === c[0]) + '">' + c[1] + '<b>' + c[2] + '</b></button>'; }).join('') + '</div>';
    return '<section class="sec" id="critical"><div class="sec-head"><h2>Most critical units</h2>' +
      '<p>Ranked by a score out of 100: pending count 40%, pending % of registered 25%' + (kind === 'nsc' ? ', completed after 15 days 15%' : '') + ', on hold 10%' + (hasChange ? ', growth in a week 10%' : '') +
      '. Each is compared with the other ' + PLURAL[S.level] + '. Critical is 75 or more, High 60 to 74, Moderate 40 to 59.</p>' +
      '<div class="tools">' + levelSel + '</div></div>' +
      '<div class="panel">' + chips + '<div class="tbox" style="margin-top:12px"><table class="t" id="critTable"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' +
      (list.length > 25 ? '<div class="more"><button class="linkbtn" id="moreBtn" type="button">' + (S.showAll ? 'Show the first 25' : 'Show all ' + list.length) + '</button></div>' : '') +
      (!list.length ? '<p class="empty">No units in this group.</p>' : '') + '</div></section>';
  }

  // ---- 4. delay
  function secDelay() {
    var kind = kindOf(S.report);
    if (kind === 'lc') {
      var units = scored(S.report, S.discom, 'division').filter(function (u) { return u.pend > 0; });
      var hold = units.slice().sort(function (a, b) { return b.hold - a.hold; }).slice(0, 10);
      var meter = units.map(function (u) { u.waitMeter = (u.st.wo || 0) + (u.st.meter || 0); return u; }).sort(function (a, b) { return b.waitMeter - a.waitMeter; }).slice(0, 10);
      return '<section class="sec" id="delay"><div class="sec-head"><h2>Delay</h2><p>The load change report gives no completion time, so delay is shown through cases on hold and cases waiting for a meter.</p></div>' +
        '<div class="grid2"><div class="panel"><h3>Most cases on hold</h3><p class="sub">Divisions</p>' + barList(hold, 'hold', function (u) { return pct(ratio(u.hold, u.pend), 0) + ' of its pending'; }, 'var(--high)') + '</div>' +
        '<div class="panel"><h3>Most cases waiting for a meter</h3><p class="sub">Work order plus meter installation, divisions</p>' + barList(meter, 'waitMeter', function (u) { return pct(ratio(u.waitMeter, u.pend), 0) + ' of its pending'; }, 'var(--steel)') + '</div></div></section>';
    }
    var per = DISCOMS.map(function (d) { return [d, sumUp(scopeRecs(S.report, d))]; }).filter(function (x) { return x[1].lines; });
    var split = per.map(function (x) {
      var t = x[1], a = ratio(t.in15, t.done) || 0;
      return '<div class="hb"><div class="name"><b>' + x[0] + '</b><span>' + n(t.done) + ' completed</span></div><div class="track">' +
        '<span style="width:' + (a * 100) + '%;background:var(--low)" data-tip="Within 15 days: ' + n(t.in15) + '"></span><span style="width:' + ((1 - a) * 100) + '%;background:var(--crit)" data-tip="After 15 days: ' + n(t.out15) + '"></span></div>' +
        '<div class="num">' + pct(1 - a, 0) + '<small>after 15 days</small></div></div>';
    }).join('');
    var divs = scored(S.report, S.discom, 'division').filter(function (u) { return u.done >= 20; });
    var slow = divs.slice().sort(function (a, b) { return (b.pLate || 0) - (a.pLate || 0); }).slice(0, 10);
    var subs = scored(S.report, S.discom, 'sub').filter(function (u) { return u.pend > 0; }).sort(function (a, b) { return b.hold - a.hold; }).slice(0, 10);
    return '<section class="sec" id="delay"><div class="sec-head"><h2>Delay</h2><p>The time limit used here is 15 days from registration to completion. Pending applications have no dates in the source report, so their age cannot be shown; the trend below shows whether pendency is growing.</p></div>' +
      '<div class="panel"><div class="legend"><span><i style="background:var(--low)"></i>Completed within 15 days</span><span><i style="background:var(--crit)"></i>Completed after 15 days</span></div><div class="hbars">' + split + '</div></div>' +
      '<div class="grid2" style="margin-top:16px"><div class="panel"><h3>Slowest divisions</h3><p class="sub">Share of completed connections that took more than 15 days (divisions with 20 or more completed)</p>' +
      barList(slow, 'pLate', function (u) { return n(u.out15) + ' of ' + n(u.done); }, 'var(--crit)', true) + '</div>' +
      '<div class="panel"><h3>Most applications on hold</h3><p class="sub">Sub-divisions, at document verification or site inspection</p>' +
      barList(subs, 'hold', function (u) { return pct(ratio(u.hold, u.pend), 0) + ' of its pending'; }, 'var(--high)') + '</div></div></section>';
  }
  function barList(units, key, note, colour, isPct) {
    if (!units.length || !units.some(function (u) { return u[key]; })) return '<p class="empty">Nothing to show.</p>';
    var max = Math.max.apply(null, units.map(function (u) { return u[key] || 0; })) || 1;
    return '<div class="hbars">' + units.map(function (u) {
      var v = u[key] || 0;
      return '<div class="hb"><div class="name"><b>' + esc(u.name) + (S.discom === 'ALL' ? dchip(u.discom) : '') + '</b><span>' + esc(u.context || u.discom) + '</span></div>' +
        '<div class="track"><span style="width:' + (100 * v / max) + '%;background:' + colour + '"></span></div>' +
        '<div class="num">' + (isPct ? pct(v, 0) : n(v)) + '<small>' + note(u) + '</small></div></div>';
    }).join('') + '</div>';
  }

  // ---- 5. agencies / AMISP
  function secAgency() {
    if (kindOf(S.report) === 'lc') {
      var per = DISCOMS.map(function (d) { return [d, sumUp(scopeRecs(S.report, d))]; }).filter(function (x) { return x[1].lines && (S.discom === 'ALL' || x[0] === S.discom); });
      var names = S.model.agencies.filter(function (a) { return per.some(function (x) { return x[1].ag[a]; }); });
      var max = 0; names.forEach(function (a) { max = Math.max(max, per.reduce(function (s, x) { return s + (x[1].ag[a] || 0); }, 0)); });
      var total = per.reduce(function (s, x) { return s + Object.keys(x[1].ag).reduce(function (q, a) { return q + x[1].ag[a]; }, 0); }, 0);
      names.sort(function (a, b) { return per.reduce(function (s, x) { return s + (x[1].ag[b] || 0); }, 0) - per.reduce(function (s, x) { return s + (x[1].ag[a] || 0); }, 0); });
      var bars = names.map(function (a) {
        var tot = per.reduce(function (s, x) { return s + (x[1].ag[a] || 0); }, 0);
        return '<div class="hb"><div class="name"><b>' + esc(a) + '</b><span>' + per.map(function (x) { return x[0] + ' ' + n(x[1].ag[a] || 0); }).join(', ') + '</span></div><div class="track">' +
          per.map(function (x) { return '<span style="width:' + (100 * (x[1].ag[a] || 0) / Math.max(1, max)) + '%;background:var(--' + (x[0] === 'NBPDCL' ? 'north' : 'south') + ')"></span>'; }).join('') +
          '</div><div class="num">' + n(tot) + '<small>' + pct(ratio(tot, total), 0) + '</small></div></div>';
      }).join('');
      return '<section class="sec" id="agency"><div class="sec-head"><h2>Meter installation by agency</h2><p>Load change cases pending at meter installation, split by the agency named in the report.</p></div>' +
        '<div class="panel">' + (per.length > 1 ? '<div class="legend"><span><i style="background:var(--north)"></i>NBPDCL</span><span><i style="background:var(--south)"></i>SBPDCL</span></div>' : '') +
        (bars ? '<div class="hbars">' + bars + '</div>' : '<p class="empty">No agency figures in this report.</p>') + '</div></section>';
    }
    var circles = groupBy(scopeRecs(S.report, S.discom), 'circle').filter(function (c) { return c.st.amisp; }).sort(function (a, b) { return b.st.amisp - a.st.amisp; });
    circles.forEach(function (c) { c.amisp = c.st.amisp; });
    var t = sumUp(scopeRecs(S.report, S.discom));
    return '<section class="sec" id="agency"><div class="sec-head"><h2>Waiting at AMISP</h2><p>Applications that have passed the DISCOM stages and wait for the smart meter agency to fix the meter: ' + n(t.st.amisp || 0) + ', ' + pct(ratio(t.st.amisp || 0, t.pend), 0) + ' of pending.</p></div>' +
      '<div class="panel"><h3>By circle</h3><p class="sub">Most waiting first</p>' + barList(circles.slice(0, 15), 'amisp', function (c) { return pct(ratio(c.amisp, c.pend), 0) + ' of its pending'; }, 'var(--s4)') + '</div></section>';
  }

  // ---- 6. trend
  function secTrend() {
    var tr = trendRows(S.report, S.discom), regs = logRegistrations(S.report, S.discom);
    var iv = S.interval;
    var seg = '<div class="seg" role="group" aria-label="Interval">' + [['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']].map(function (x) {
      return '<button type="button" data-interval="' + x[0] + '" aria-pressed="' + (iv === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
    var series = bucket(tr, iv);
    var regSeries = bucket(regs, iv).map(function (x, i, arr) { return i ? { date: x.date, v: x.reg - arr[i - 1].reg, days: daysBetween(arr[i - 1].date, x.date) } : null; }).filter(Boolean);
    var chart = series.length >= 2 ? lineChart(series.map(function (x) { return { label: x.date, v: x.pend }; })) :
      '<div class="note-box">The pending trend starts with the first saved update' + (series.length ? ' (' + fmtDate(series[0].date) + ')' : '') + '. Each update adds one point; weekly and monthly views fill in as updates continue.</div>';
    var regChart = periodKind(S.report, S.discom) === 'year' ? '<p class="empty">Not shown for the last-1-year figures: each day the oldest applications leave the one-year window, so the change in the total is not the number of new registrations.</p>' : regSeries.length ? barChart(regSeries.map(function (x) { return { label: x.date, v: Math.max(0, x.v), tip: n(x.v) + ' new in ' + x.days + ' day' + (x.days > 1 ? 's' : '') }; })) : '<p class="empty">Shows once two updates are saved.</p>';
    // movers
    var which = intervalSet(iv), prev = histUnits(which, S.report, S.discom), now = histUnits('latest', S.report, S.discom);
    var movers = '';
    if (prev && now && prev.date !== now.date) {
      var lvl = S.report === 'NSC <19 kW' ? 'sub' : 'division';
      var units = groupBy(scopeRecs(S.report, S.discom), lvl).map(function (u) {
        var a = histPend(prev, u.key, lvl, S.report), b = histPend(now, u.key, lvl, S.report);
        u.mv = a !== null && b !== null ? b - a : null; return u;
      }).filter(function (u) { return u.mv !== null; });
      var up = units.filter(function (u) { return u.mv > 0; }).sort(function (a, b) { return b.mv - a.mv; }).slice(0, 8);
      var down = units.filter(function (u) { return u.mv < 0; }).sort(function (a, b) { return a.mv - b.mv; }).slice(0, 8);
      var added = units.reduce(function (s, u) { return s + Math.max(0, u.mv); }, 0), cleared = units.reduce(function (s, u) { return s + Math.max(0, -u.mv); }, 0);
      up.forEach(function (u) { u.mvAbs = u.mv; }); down.forEach(function (u) { u.mvAbs = -u.mv; });
      movers = '<div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="kpi"><div class="lab">Compared with</div><div class="val" style="font-size:18px">' + fmtDate(prev.date) + '</div><div class="note">latest ' + fmtDate(now.date) + '</div></div>' +
        '<div class="kpi"><div class="lab">Pending rose in ' + PLURAL[lvl] + '</div><div class="val up">+' + n(added) + '</div><div class="note">' + units.filter(function (u) { return u.mv > 0; }).length + ' of ' + units.length + ' ' + PLURAL[lvl] + '</div></div>' +
        '<div class="kpi"><div class="lab">Pending fell in ' + PLURAL[lvl] + '</div><div class="val down">−' + n(cleared) + '</div><div class="note">' + units.filter(function (u) { return u.mv < 0; }).length + ' of ' + units.length + ' ' + PLURAL[lvl] + '</div></div></div>' +
        '<div class="grid2" style="margin-top:16px"><div class="panel"><h3>Pendency growing fastest</h3><p class="sub">' + title(PLURAL[lvl]) + ', change in pending</p>' + barList(up, 'mvAbs', function (u) { return 'now ' + n(u.pend); }, 'var(--crit)') + '</div>' +
        '<div class="panel"><h3>Most improved</h3><p class="sub">' + title(PLURAL[lvl]) + ', fall in pending</p>' + barList(down, 'mvAbs', function (u) { return 'now ' + n(u.pend); }, 'var(--low)') + '</div></div>';
    }
    return '<section class="sec" id="trend"><div class="sec-head"><h2>Pendency over time</h2><p>From the figures saved at each update.</p><div class="tools">' + seg + '</div></div>' +
      '<div class="grid2"><div class="panel"><h3>Pending applications</h3><p class="sub">' + esc(REPORT_NAME[S.report]) + ', ' + esc(scopeLabel()) + '</p>' + chart + '</div>' +
      '<div class="panel"><h3>New registrations</h3><p class="sub">Registered since the previous point</p>' + regChart + '</div></div>' + movers + '</section>';
  }
  function daysBetween(a, b) { return Math.max(1, Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5)); }
  function bucket(rows, iv) {
    if (iv === 'day') return rows;
    var by = {};
    rows.forEach(function (r) {
      var d = new Date(r.date + 'T00:00:00'), k;
      if (iv === 'week') { var m = new Date(d.getTime() - ((d.getDay() + 6) % 7) * 864e5); k = iso(m); }
      else k = r.date.slice(0, 7);
      by[k] = r;                       // the last point in each week or month
    });
    return Object.keys(by).sort().map(function (k) { return by[k]; });
  }
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(s) { var p = String(s).split('-'); return p.length === 3 ? Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1] + ' ' + p[0] : s; }
  function shortDate(s) { var p = String(s).split('-'); return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1]; }
  function niceMax(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))); var m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
  function lineChart(pts) {
    var W = 560, H = 220, L = 58, R = 12, T = 12, B = 28;
    var vals = pts.map(function (p) { return p.v; }), lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var pad = (hi - lo) * 0.15 || hi * 0.05 || 1; lo = Math.max(0, lo - pad); hi = hi + pad;
    var x = function (i) { return L + (pts.length === 1 ? 0 : i * (W - L - R) / (pts.length - 1)); };
    var y = function (v) { return T + (H - T - B) * (1 - (v - lo) / (hi - lo)); };
    var g = '';
    for (var k = 0; k <= 4; k++) { var v = lo + (hi - lo) * k / 4; g += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + compact(v) + '</text>'; }
    var step = Math.ceil(pts.length / 6);
    pts.forEach(function (p, i) { if (i % step === 0 || i === pts.length - 1) g += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + shortDate(p.label) + '</text>'; });
    var path = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.v).toFixed(1); }).join('');
    var area = path + 'L' + x(pts.length - 1) + ',' + (H - B) + 'L' + x(0) + ',' + (H - B) + 'Z';
    var dots = pts.map(function (p, i) { return '<circle class="pt" cx="' + x(i) + '" cy="' + y(p.v) + '" r="' + (pts.length > 40 ? 2.5 : 4) + '" fill="var(--steel)" data-tip="' + esc(fmtDate(p.label) + ': ' + n(p.v) + ' pending') + '"/>'; }).join('');
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Pending over time">' + g +
      '<path d="' + area + '" fill="rgba(31,92,153,.08)"/><path class="ln" d="' + path + '" stroke="var(--steel)"/>' + dots + '</svg>';
  }
  function barChart(pts) {
    var W = 560, H = 220, L = 52, R = 8, T = 12, B = 28;
    var max = niceMax(Math.max.apply(null, pts.map(function (p) { return p.v; })));
    var bw = (W - L - R) / pts.length, g = '';
    for (var k = 0; k <= 4; k++) { var v = max * k / 4, yy = T + (H - T - B) * (1 - k / 4); g += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '"/><text x="' + (L - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + compact(v) + '</text>'; }
    var step = Math.ceil(pts.length / 6);
    pts.forEach(function (p, i) {
      var h = (H - T - B) * p.v / max, xx = L + i * bw + bw * 0.18;
      g += '<rect class="bar" x="' + xx.toFixed(1) + '" y="' + (H - B - h).toFixed(1) + '" width="' + Math.max(2, bw * 0.64).toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) + '" fill="#7aa3cf" data-tip="' + esc(fmtDate(p.label) + ': ' + p.tip) + '"/>';
      if (i % step === 0 || i === pts.length - 1) g += '<text x="' + (L + i * bw + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + shortDate(p.label) + '</text>';
    });
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="New registrations">' + g + '</svg>';
  }
  function compact(v) {
    if (v >= 1e7) return (v / 1e7).toFixed(v >= 1e8 ? 0 : 1) + ' Cr';
    if (v >= 1e5) return (v / 1e5).toFixed(v >= 1e6 ? 0 : 1) + ' L';
    if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'k';
    return String(Math.round(v));
  }

  // ---- 7. review points
  function secReview() {
    var pts = reviewPoints(S.discom);
    return '<section class="sec" id="review"><div class="sec-head"><h2>Review points</h2><p>Written from the figures for ' + esc(scopeLabel()) + ', across all reports. The same points open the PDF report.</p></div>' +
      '<div class="panel"><ul class="points">' + pts.map(function (p) { return '<li class="' + p.tone + '"><div><span class="tag">' + esc(p.tag) + '</span>' + esc(p.text) + '</div></li>'; }).join('') + '</ul></div></section>';
  }

  // ---- 8. data gaps
  function secGaps() {
    var rows = '';
    S.model.reports.forEach(function (rep) {
      DISCOMS.forEach(function (d) {
        if (S.discom !== 'ALL' && d !== S.discom) return;
        var t = sumUp(scopeRecs(rep, d)); if (!t.lines) return;
        rows += '<tr><td class="l">' + esc(REPORT_NAME[rep]) + '</td><td class="l">' + d + '</td><td>' + n(t.reg) + '</td><td>' + n(t.canc + t.done) + '</td><td>' + n(t.pend) + '</td><td><b>' + n(t.gap) + '</b></td><td>' + pct(ratio(t.gap, t.reg)) + '</td></tr>';
      });
    });
    var worst = kindOf(S.report) === 'nsc' ? groupBy(scopeRecs(S.report, S.discom), 'division').filter(function (u) { return u.gap; }).sort(function (a, b) { return b.gap - a.gap; }).slice(0, 8) : [];
    worst.forEach(function (u) { u.gapShare = ratio(u.gap, u.reg); });
    return '<section class="sec" id="gaps"><div class="sec-head"><h2>Data gaps</h2><p>Registered applications that appear neither as cancelled, completed nor under any pending stage. A large gap means the report is missing a status; raise it with the portal team.</p></div>' +
      '<div class="grid2"><div class="panel"><div class="tbox" style="border:0"><table class="t"><thead><tr><th class="l">Report</th><th class="l">DISCOM</th><th>Registered</th><th>Closed</th><th>Pending</th><th>Under no status</th><th>Share</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
      '<div class="panel"><h3>Largest gaps</h3><p class="sub">Divisions, ' + esc(REPORT_NAME[S.report]) + '</p>' + (worst.length ? barList(worst, 'gap', function (u) { return pct(u.gapShare) + ' of registered'; }, 'var(--faint)') : '<p class="empty">No gap in this report.</p>') + '</div></div></section>';
  }

  // ---- 9. cancellations
  function secCancel() {
    var rows = S.model.reports.map(function (rep) {
      var per = DISCOMS.map(function (d) { return [d, sumUp(scopeRecs(rep, d))]; }).filter(function (x) { return x[1].lines && (S.discom === 'ALL' || x[0] === S.discom); });
      return '<div class="hb"><div class="name"><b>' + esc(REPORT_NAME[rep]) + '</b><span>' + per.map(function (x) { return x[0] + ' ' + pct(ratio(x[1].canc, x[1].reg), 0); }).join(', ') + '</span></div>' +
        '<div class="track">' + per.map(function (x) { return '<span style="width:' + (100 * (ratio(x[1].canc, x[1].reg) || 0) / per.length) + '%;background:var(--' + (x[0] === 'NBPDCL' ? 'north' : 'south') + ')"></span>'; }).join('') + '</div>' +
        '<div class="num">' + pct(ratio(per.reduce(function (s, x) { return s + x[1].canc; }, 0), per.reduce(function (s, x) { return s + x[1].reg; }, 0)), 0) + '<small>cancelled</small></div></div>';
    }).join('');
    var rep = S.model.reports.indexOf('NSC 19-59 kW') >= 0 ? 'NSC 19-59 kW' : S.report;
    var divs = groupBy(scopeRecs(rep, S.discom), 'division').filter(function (u) { return u.reg >= 15; });
    divs.forEach(function (u) { u.pCanc = ratio(u.canc, u.reg); });
    divs.sort(function (a, b) { return b.pCanc - a.pCanc; });
    return '<section class="sec" id="cancel"><div class="sec-head"><h2>Cancellations</h2><p>Share of registered applications that were cancelled. A high share can mean wrong applications, unmet conditions or applications closed to clear pendency; worth checking in review.</p></div>' +
      '<div class="grid2"><div class="panel"><h3>By report</h3><p class="sub">Bar length: share cancelled</p><div class="hbars">' + rows + '</div></div>' +
      '<div class="panel"><h3>Highest cancellation, ' + esc(REPORT_NAME[rep]) + '</h3><p class="sub">Divisions with 15 or more registered</p>' + barList(divs.slice(0, 10), 'pCanc', function (u) { return n(u.canc) + ' of ' + n(u.reg); }, 'var(--s5)', true) + '</div></div></section>';
  }

  // ================================================================ events
  function bindContent() {
    var box = $('content');
    box.querySelectorAll('[data-go-report]').forEach(function (tr) {
      tr.addEventListener('click', function () { S.report = tr.dataset.goReport; S.discom = tr.dataset.goDiscom; S.showAll = false; S.sev = ''; render(); });
    });
    var lv = $('levelSel'); if (lv) lv.addEventListener('change', function () { S.level = lv.value; S.showAll = false; keepPlace('critical', render); });
    box.querySelectorAll('[data-sev]').forEach(function (b) { b.addEventListener('click', function () { S.sev = b.dataset.sev; S.showAll = false; keepPlace('critical', render); }); });
    box.querySelectorAll('#critTable th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.dataset.sort === 'sev' ? 'score' : th.dataset.sort;
        if (S.sortKey === k) S.sortDir = -S.sortDir; else { S.sortKey = k; S.sortDir = (k === 'name' || k === 'topStage' || k === 'rank') ? 1 : -1; }
        keepPlace('critical', render);
      });
    });
    var more = $('moreBtn'); if (more) more.addEventListener('click', function () { S.showAll = !S.showAll; keepPlace('critical', render); });
    box.querySelectorAll('[data-interval]').forEach(function (b) { b.addEventListener('click', function () { S.interval = b.dataset.interval; keepPlace('trend', render); }); });
  }
  // re-draw without the page jumping
  function keepPlace(id, fn) {
    var el = $(id), before = el ? el.getBoundingClientRect().top : 0;
    fn();
    var after = $(id); if (after) window.scrollBy(0, after.getBoundingClientRect().top - before);
  }
  document.addEventListener('click', function (e) {
    var r = e.target.closest('[data-report]');
    if (r) { S.report = r.dataset.report; S.showAll = false; S.sev = ''; S.sortKey = 'score'; S.sortDir = -1; render(); return; }
    var d = e.target.closest('[data-discom]');
    if (d) { S.discom = d.dataset.discom; S.showAll = false; S.sev = ''; render(); }
  });
  // tooltips
  var tip = $('tip');
  document.addEventListener('mouseover', function (e) {
    var t = e.target.closest('[data-tip]');
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.getAttribute('data-tip'); tip.hidden = false;
  });
  window.addEventListener('scroll', function () { tip.hidden = true; }, { passive: true });
  document.addEventListener('touchstart', function () { tip.hidden = true; }, { passive: true });
  document.addEventListener('mousemove', function (e) {
    if (tip.hidden) return;
    var x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8), y = e.clientY + 16;
    if (y + tip.offsetHeight > window.innerHeight - 8) y = e.clientY - tip.offsetHeight - 10;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });

  // ================================================================ loading (shows the last figures at once, then the latest)
  var loading = false;
  function setFresh(text, busy) { var f = $('fresh'); f.hidden = !text; f.textContent = text || ''; f.classList.toggle('busy', !!busy); }
  function showState(kind) {
    var st = $('state');
    if (kind === 'error') st.innerHTML = '<h2>Could not load the figures</h2><p>Check the internet connection and try again.</p><button class="btn primary" type="button" id="retry"><span>Try again</span></button>';
    else if (kind === 'empty') st.innerHTML = '<h2>No figures yet</h2><p>Update the figures from the report page, then come back.</p><a class="btn primary" href="./"><span>Update figures</span></a>';
    st.hidden = false; $('content').hidden = true;
    var b = $('retry'); if (b) b.addEventListener('click', function () { st.innerHTML = '<div class="spinner"></div><h2>Loading the figures</h2>'; load(true); });
  }
  function apply(feed, fromStore) {
    S.feed = feed; S.model = buildModel(feed);
    if (!S.model.recs.length) { showState('empty'); return; }
    $('asOf').textContent = 'Figures as on ' + (feed.asOn || '-') + '  |  NBPDCL and SBPDCL';
    render();
    if (fromStore) setFresh('Checking for newer figures', true); else setFresh('', false);
  }
  function load(fresh) {
    if (loading) return; loading = true;
    $('refreshBtn').disabled = true;
    if (S.model) setFresh('Getting the latest figures', true);
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 60000);
    fetch(FEED_URL + (fresh ? '&fresh=1' : '') + '&t=' + Date.now(), { signal: ctrl ? ctrl.signal : undefined, redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (text) {
        var feed = JSON.parse(text);
        if (!feed || !feed.reports) throw new Error('bad data');
        var old = recall(STORE);
        store(STORE, text);
        if (!S.model || old !== text) { var y = window.scrollY; apply(feed, false); window.scrollTo(0, y); } else setFresh('', false);
        if (fresh) toast('Figures are up to date');
      })
      .catch(function () {
        if (S.model) { setFresh('Showing saved figures. Could not reach the latest.', false); }
        else showState('error');
      })
      .then(function () { clearTimeout(timer); loading = false; $('refreshBtn').disabled = false; });
  }
  function toast(text) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = text; document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }
  $('refreshBtn').addEventListener('click', function () { load(true); });

  // ================================================================ PDF (the library loads only when asked)
  function loadScript(src) {
    return new Promise(function (ok, bad) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
  }
  $('pdfBtn').addEventListener('click', function () {
    var b = $('pdfBtn'); b.disabled = true; var label = b.querySelector('span').textContent; b.querySelector('span').textContent = 'Preparing the PDF';
    var ready = window.NSCPdf ? Promise.resolve() : loadScript('js/vendor/jspdf.umd.min.js').then(function () { return loadScript('js/vendor/jspdf.plugin.autotable.min.js'); }).then(function () { return loadScript('js/dash-pdf.js'); });
    ready.then(function () { window.NSCPdf.make(api()); })
      .catch(function () { toast('The PDF could not be made. Check the connection and try again.'); })
      .then(function () { b.disabled = false; b.querySelector('span').textContent = label; });
  });
  function api() {
    return { S: S, REPORTS: S.model.reports, periodText: periodText, REPORT_NAME: REPORT_NAME, DISCOMS: DISCOMS, LEVELS: LEVELS, PLURAL: PLURAL, scored: scored, sumUp: sumUp,
      scopeRecs: scopeRecs, reviewPoints: reviewPoints, stagesOf: stagesOf, kindOf: kindOf, sevName: sevName, n: n, pct: pct, ratio: ratio, fmtDate: fmtDate,
      histUnits: histUnits, trendRows: trendRows, asOn: S.feed.asOn || '' };
  }
  window.NSCDash = { api: function () { return S.model ? api() : null; } };

  // start: saved figures first (instant), then the latest
  var saved = recall(STORE);
  if (saved) { try { apply(JSON.parse(saved), true); } catch (e) { /* load fresh */ } }
  load(false);
})();
