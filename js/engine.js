/*
 * NSC & Load Change Report - the reading, checking and summing engine.
 * A faithful port of the desktop app (nsc_report_app.py, version 1.1).
 * Works in the browser (window.NSCEngine) and in Node (module.exports) for testing.
 * Reading needs SheetJS (XLSX); the Excel report needs ExcelJS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NSCEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var APP_VERSION = '2.0';
  var WEB_APP_URL = 'https://script.google.com/macros/s/' +
    'AKfycbzWRJdQUoFvGdqfZMu8UDlTxw1CvulfxVYNXSJGUEjb9ufIpwUeFrOtXMSkJjZTPg2Xiw/exec';
  var DISCOMS = ['NBPDCL', 'SBPDCL'];
  var DISCOM_AREA = { NBPDCL: 'North', SBPDCL: 'South' };
  var REPORTS = ['NSC <19 kW', 'NSC 19-59 kW', 'Load Change'];
  var MIN_SHARE_OF_MEDIAN = 0.25;

  var NSC_KEYS = ['Sl.No.', 'Discom', 'Circle', 'Division', 'SubDivision', 'Section'];
  var NSC_NUMS = ['Registered', 'Cancelled', 'Completed Within 15 Days', 'Completed Beyond 15 Days',
    'Pending For Document Verification', 'On-Hold Document Verification',
    'Pending For Site Inspection', 'On-Hold Site Inspection',
    'Pending For Infra Installation', 'Pending At AMISP'];
  var LC_KEYS = ['Sl.No.', 'Discom', 'Circle', 'Division', 'Connection Type'];
  var LC_NUMS = ['Total Registered', 'Registration Payment', 'Site Inspection', 'WO For Meter Installation',
    'Meter Installation', 'Meter Change Not Required', 'On Hold', 'Cancelled', 'Service Released'];
  var LC_AGENCY_TOTAL = 'Meter Installation Agency Total';

  var NSC_STAGES = [['Document verification', 10], ['On hold at document verification', 11], ['Site inspection', 12],
    ['On hold at site inspection', 13], ['Infra installation', 14], ['At AMISP', 15]];
  var LC_STAGES = [['Registration payment', 6], ['Site inspection', 7], ['Work order for meter', 8],
    ['Meter installation', 9], ['Meter change not required', 10], ['On hold', 11]];

  var ALIASES = {
    slno: 'Sl.No.', sno: 'Sl.No.', srno: 'Sl.No.',
    subdivision: 'SubDivision',
    totalregistered: 'Total Registered', totalregistration: 'Total Registered',
    siteinspectio: 'Site Inspection', siteinspection: 'Site Inspection',
    workorderformeterinstallation: 'WO For Meter Installation',
    canceled: 'Cancelled', released: 'Service Released',
    onholddocumentverification: 'On-Hold Document Verification',
    onholdsiteinspection: 'On-Hold Site Inspection',
    meterinstallationagencytotal: LC_AGENCY_TOTAL
  };

  function ReportError(message, extra) {
    this.name = 'ReportError'; this.message = message; this.stack = (new Error(message)).stack;
    if (extra) for (var k in extra) this[k] = extra[k];
  }
  ReportError.prototype = Object.create(Error.prototype);
  ReportError.prototype.constructor = ReportError;
  function fail(msg, extra) { throw new ReportError(msg, extra); }

  // ---------------------------------------------------------------- text helpers
  function norm(v) { return String(v === null || v === undefined ? '' : v).toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function clean(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') v = v ? 'True' : 'False';
    if (v instanceof Date) v = isNaN(v) ? '' : v.toISOString().replace('T', ' ').slice(0, 19);
    return String(v).replace(/\s+/g, ' ').trim();
  }
  function fmtIn(n) {
    var s = String(Math.round(n)), sign = '';
    if (s.charAt(0) === '-') { sign = '-'; s = s.slice(1); }
    if (s.length <= 3) return sign + s;
    var head = s.slice(0, -3), tail = s.slice(-3), parts = [];
    while (head.length > 2) { parts.unshift(head.slice(-2)); head = head.slice(0, -2); }
    if (head) parts.unshift(head);
    return sign + parts.join(',') + ',' + tail;
  }
  function ratio(a, b) { return b ? a / b : null; }
  function pyRound(x) {                       // Python's round(): halves go to the even number
    var f = Math.floor(x), d = x - f;
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
  }
  function cmp(a, b) {                        // compares like Python tuples / strings
    if (Array.isArray(a)) {
      for (var i = 0; i < Math.min(a.length, b.length); i++) { var c = cmp(a[i], b[i]); if (c) return c; }
      return a.length - b.length;
    }
    return a < b ? -1 : a > b ? 1 : 0;
  }

  // ---------------------------------------------------------------- difflib (SequenceMatcher.ratio, get_close_matches)
  function matchingBlocksCount(a, b) {
    var b2j = {};
    for (var j = 0; j < b.length; j++) (b2j[b[j]] = b2j[b[j]] || []).push(j);
    // autojunk only applies to strings of 200 or more; headings are short
    function longest(alo, ahi, blo, bhi) {
      var besti = alo, bestj = blo, bestsize = 0, j2len = {};
      for (var i = alo; i < ahi; i++) {
        var newj2len = {}, idx = b2j[a[i]] || [];
        for (var k = 0; k < idx.length; k++) {
          var jj = idx[k];
          if (jj < blo) continue;
          if (jj >= bhi) break;
          var size = (j2len[jj - 1] || 0) + 1;
          newj2len[jj] = size;
          if (size > bestsize) { besti = i - size + 1; bestj = jj - size + 1; bestsize = size; }
        }
        j2len = newj2len;
      }
      return [besti, bestj, bestsize];
    }
    var queue = [[0, a.length, 0, b.length]], total = 0;
    while (queue.length) {
      var q = queue.pop(), m = longest(q[0], q[1], q[2], q[3]);
      if (m[2]) {
        total += m[2];
        if (q[0] < m[0] && q[2] < m[1]) queue.push([q[0], m[0], q[2], m[1]]);
        if (m[0] + m[2] < q[1] && m[1] + m[2] < q[3]) queue.push([m[0] + m[2], q[1], m[1] + m[2], q[3]]);
      }
    }
    return total;
  }
  function seqRatio(a, b) {
    var t = a.length + b.length;
    return t ? 2.0 * matchingBlocksCount(a, b) / t : 1.0;
  }
  function closeMatches(word, possibilities, n, cutoff) {
    var res = [];
    possibilities.forEach(function (x) { var r = seqRatio(x, word); if (r >= cutoff) res.push([r, x]); });
    res.sort(function (p, q) { return p[0] !== q[0] ? q[0] - p[0] : (p[1] < q[1] ? 1 : p[1] > q[1] ? -1 : 0); });
    return res.slice(0, n).map(function (p) { return p[1]; });
  }

  // ---------------------------------------------------------------- headings
  var KNOWN = NSC_KEYS.concat(NSC_NUMS, LC_KEYS, LC_NUMS);
  var KNOWN_KEYS = KNOWN.map(norm);
  function canonical(heading) {
    var key = norm(heading);
    if (Object.prototype.hasOwnProperty.call(ALIASES, key)) return ALIASES[key];
    for (var i = 0; i < KNOWN.length; i++) if (KNOWN_KEYS[i] === key) return KNOWN[i];
    var close = closeMatches(key, KNOWN_KEYS, 2, 0.9);
    if (close.length === 1 || (close.length === 2 && seqRatio(close[0], key) > seqRatio(close[1], key)))
      return KNOWN[KNOWN_KEYS.indexOf(close[0])];
    return clean(heading);
  }
  function isMeterInstall(heading) {
    var key = norm(heading);
    if (key.slice(0, 2).indexOf('wo') >= 0 || key.indexOf('workorder') >= 0 || key.indexOf('order') >= 0) return false;
    return key.indexOf('meterinstal') >= 0 || key.indexOf('meterinstl') >= 0 || canonical(heading) === 'Meter Installation';
  }

  // Match the filled cells of a row to the headings, in order, by nearest column.
  function align(cellsAt, headsAt) {
    var n = cellsAt.length, m = headsAt.length, INF = Infinity;
    if (n > m) return null;
    function solve(preferLate) {
      var cost = [], take = [], i, j;
      for (i = 0; i <= n; i++) { cost.push(new Array(m + 1).fill(INF)); take.push(new Array(m + 1).fill(false)); }
      for (j = 0; j <= m; j++) cost[0][j] = 0;
      for (i = 1; i <= n; i++) {
        for (j = i; j <= m; j++) {
          var skip = cost[i][j - 1], use = cost[i - 1][j - 1] + Math.abs(cellsAt[i - 1] - headsAt[j - 1]);
          if (use < skip || (use === skip && preferLate)) { cost[i][j] = use; take[i][j] = true; }
          else cost[i][j] = skip;
        }
      }
      var out = new Array(m).fill(null); i = n; j = m;
      while (i > 0) { if (take[i][j]) { out[j - 1] = i - 1; i--; } j--; }
      return [out, cost[n][m]];
    }
    var a = solve(false), b = solve(true);
    if (JSON.stringify(a[0]) !== JSON.stringify(b[0]) || a[1] === INF) return null;
    for (var j = 0; j < m; j++) {
      var k = a[0][j];
      if (k !== null && Math.abs(cellsAt[k] - headsAt[j]) > 3) return null;
    }
    return a[0];
  }

  // ---------------------------------------------------------------- reading files
  function filled(row) {
    var out = [];
    for (var at = 0; at < row.length; at++) { var t = clean(row[at]); if (t) out.push([at, t]); }
    return out;
  }
  function isHeadingRow(cells) {
    var names = cells.map(function (c) { return norm(c[1]); });
    return names.indexOf('circle') >= 0 && names.indexOf('division') >= 0 &&
      names.some(function (n) { return n.indexOf('registered') >= 0; });
  }

  // Sheet -> list of rows, every row starting at column A, whatever size the file claims to be.
  function sheetRows(XLSX, ws) {
    var maxR = -1, maxC = -1;
    Object.keys(ws).forEach(function (k) {
      if (k.charAt(0) === '!') return;
      var a = XLSX.utils.decode_cell(k);
      if (a.r > maxR) maxR = a.r;
      if (a.c > maxC) maxC = a.c;
    });
    var rows = [];
    for (var r = 0; r <= maxR; r++) {
      var row = new Array(maxC + 1).fill(null);
      for (var c = 0; c <= maxC; c++) {
        var cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
        if (cell && cell.v !== undefined && cell.v !== null) row[c] = cell.v;
      }
      while (row.length && (row[row.length - 1] === null || row[row.length - 1] === '')) row.pop();
      rows.push(row);
    }
    return rows;
  }

  function readGrid(XLSX, name, data) {
    var ext = (name.match(/\.[^.]+$/) || [''])[0].toLowerCase(), rows = [];
    if (ext === '.xlsx' || ext === '.xlsm') {
      var book;
      try { book = XLSX.read(data, { type: 'array', cellDates: false, cellNF: false, cellText: false }); }
      catch (e) { fail('This is not a readable Excel file.'); }
      var best = [];
      for (var i = 0; i < book.SheetNames.length; i++) {
        var rs = sheetRows(XLSX, book.Sheets[book.SheetNames[i]]);
        if (rs.slice(0, 60).some(function (r) { return isHeadingRow(filled(r)); })) { best = rs; break; }
        if (rs.length > best.length) best = rs;
      }
      rows = best;
    } else if (ext === '.csv' || ext === '.txt') {
      var text = decodeText(data);
      rows = parseDelimited(text);
    } else if (ext === '.xls') {
      fail('Old .xls files are not supported. Open it in Excel and save it as .xlsx, then choose it again.');
    } else {
      fail('Only .xlsx and .csv files can be read.');
    }
    return rows.map(filled);
  }

  function decodeText(data) {
    var bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    try {
      var t = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return t.charAt(0) === '﻿' ? t.slice(1) : t;
    } catch (e) {
      try { return new TextDecoder('windows-1252').decode(bytes); }
      catch (e2) { return new TextDecoder('latin1').decode(bytes); }
    }
  }

  function parseDelimited(text) {
    var sample = text.slice(0, 4000), best = ',', bestScore = -1;
    [',', ';', '\t', '|'].forEach(function (d) {
      var lines = sample.split(/\r?\n/).filter(Boolean).slice(0, 30);
      var counts = lines.map(function (l) { return l.split(d).length - 1; });
      var score = counts.reduce(function (s, c) { return s + c; }, 0);
      if (score > bestScore) { bestScore = score; best = d; }
    });
    var rows = [], row = [], field = '', q = false, i = 0;
    for (; i < text.length; i++) {
      var ch = text.charAt(i);
      if (q) {
        if (ch === '"') { if (text.charAt(i + 1) === '"') { field += '"'; i++; } else q = false; }
        else field += ch;
      } else if (ch === '"') q = true;
      else if (ch === best) { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text.charAt(i + 1) === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function toCount(text, where, notes) {
    var t = text.replace(/,/g, '').trim();
    if (['null', 'none', 'nil', '-', 'na', 'n/a'].indexOf(t.toLowerCase()) >= 0) {
      notes.push(where + " was written as '" + text + "' in the file and is taken as 0.");
      return 0;
    }
    var number = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t) ? Number(t) : NaN;
    if (isNaN(number)) fail(where + " should be a number but is '" + text + "'.");
    if (number < 0 || number !== Math.trunc(number)) fail(where + " should be a whole number, zero or more, but is '" + text + "'.");
    return number;
  }

  // ---------------------------------------------------------------- one report
  function Report(name) {
    this.name = name; this.discom = ''; this.report = ''; this.kind = '';
    this.header = []; this.rows = []; this.agencies = [];
    this.periodFrom = ''; this.periodTo = ''; this.generatedOn = '';
    this.sourceTotal = null; this.notes = []; this.checks = [];
  }
  Report.prototype.nKeys = function () { return this.kind === 'nsc' ? NSC_KEYS.length : LC_KEYS.length; };
  Report.prototype.sums = function () {
    var out = [], self = this;
    for (var i = this.nKeys(); i < this.header.length; i++)
      out.push(self.rows.reduce(function (s, r) { return s + r[i]; }, 0));
    return out;
  };
  Report.prototype.registered = function () {
    var k = this.nKeys();
    return this.rows.reduce(function (s, r) { return s + r[k]; }, 0);
  };
  Report.prototype.tabName = function () { return (DISCOM_AREA[this.discom] || this.discom) + ' - ' + this.report; };

  // opts.map: {standard heading: index in the file's heading list} chosen by hand; opts.kind: 'nsc' or 'lc'
  function parseReport(XLSX, name, data, opts) {
    opts = opts || {};
    var rep = new Report(name);
    var grid = readGrid(XLSX, name, data);
    var headAt = -1;
    for (var g = 0; g < grid.length; g++) if (isHeadingRow(grid[g])) { headAt = g; break; }
    if (headAt < 0) fail('No table was found. The file needs the headings Circle, Division and Registered.');

    // ---- the lines above the table
    var topTexts = [];
    grid.slice(0, headAt).forEach(function (cells) {
      var texts = cells.map(function (c) { return c[1]; });
      texts.forEach(function (t, i) { topTexts.push(t); if (norm(t) === 'discom' && i + 1 < texts.length) rep.discom = texts[i + 1].toUpperCase(); });
    });
    var topText = topTexts.join(' | ');
    var m = /Period\s+(\d{1,2}-[A-Za-z]{3}-\d{4})\s+to\s+(\d{1,2}-[A-Za-z]{3}-\d{4})/i.exec(topText);
    if (m) { rep.periodFrom = m[1]; rep.periodTo = m[2]; }

    // ---- headings
    var headCells = grid[headAt];
    var names = headCells.map(function (c) { return canonical(c[1]); });
    var positions = headCells.map(function (c) { return c[0]; });
    var i, k, manual = opts.map || {};
    function applyManual() {
      Object.keys(manual).forEach(function (std) {
        var at = manual[std];
        if (typeof at !== 'number' || at < 0 || at >= names.length) return;
        names.forEach(function (n, j) { if (n === std && j !== at) names[j] = '(not used) ' + headCells[j][1]; });
        names[at] = std;
      });
    }
    // what the file offers, for matching headings by hand: each heading with a value from the first row
    var sampleRow = null;
    for (var si = headAt + 1; si < grid.length && si < headAt + 40; si++) {
      if (grid[si].length && /^\d+$/.test(grid[si][0][1]) && !isHeadingRow(grid[si])) { sampleRow = grid[si]; break; }
    }
    function offered() {
      var match = null;
      if (sampleRow) match = sampleRow.length === headCells.length ? sampleRow.map(function (c, x) { return x; })
        : align(sampleRow.map(function (c) { return c[0]; }), headCells.map(function (c) { return c[0]; }));
      return headCells.map(function (c, x) {
        var v = match && match[x] !== null && match[x] !== undefined ? sampleRow[match[x]][1] : '';
        return { index: x, text: c[1], sample: v };
      });
    }
    applyManual();
    if (names.indexOf('Service Released') >= 0 && names.indexOf('Connection Type') >= 0) {
      var rel = names.indexOf('Service Released'), stage = [];
      for (i = 0; i < rel; i++) if (isMeterInstall(headCells[i][1]) && names[i] !== 'WO For Meter Installation') stage.push(i);
      if (stage.length > 1)
        fail('More than one heading before Service Released reads like Meter Installation (' +
          stage.map(function (s) { return headCells[s][1]; }).join(', ') + ').');
      if (stage.length) names[stage[0]] = 'Meter Installation';
      for (i = rel + 1; i < names.length; i++) if (names[i] === 'Meter Installation') names[i] = LC_AGENCY_TOTAL;
      if (rel + 1 < names.length) {
        var first = norm(headCells[rel + 1][1]);
        if (isMeterInstall(headCells[rel + 1][1]) || first.indexOf('agency') >= 0 || first.indexOf('total') >= 0)
          names[rel + 1] = LC_AGENCY_TOTAL;
      }
      if (names.filter(function (n) { return n === LC_AGENCY_TOTAL; }).length > 1)
        fail('The agency-wise part of the table has more than one total heading.');
      for (i = rel + 1; i < names.length; i++) {
        k = norm(names[i]);
        if (names[i] !== LC_AGENCY_TOTAL && ['total', 'meter', 'agency', 'pending'].some(function (w) { return k.indexOf(w) >= 0; }))
          fail("'" + headCells[i][1] + "' stands among the agency names but does not look like an agency. " +
            'The table layout has changed; it is not read so that no figure lands under the wrong heading.');
      }
    }

    applyManual();
    var keys, nums;
    if (opts.kind === 'nsc') { rep.kind = 'nsc'; keys = NSC_KEYS; nums = NSC_NUMS; }
    else if (opts.kind === 'lc') { rep.kind = 'lc'; keys = LC_KEYS; nums = LC_NUMS; }
    else if (names.indexOf('Completed Within 15 Days') >= 0) { rep.kind = 'nsc'; keys = NSC_KEYS; nums = NSC_NUMS; }
    else if (names.indexOf('Service Released') >= 0 && names.indexOf('Connection Type') >= 0) { rep.kind = 'lc'; keys = LC_KEYS; nums = LC_NUMS; }
    else fail('This is neither an NSC pending report nor a Load Change report (headings not recognised).',
      { canMatch: true, kind: null, found: offered(), needs: { nsc: NSC_KEYS.concat(NSC_NUMS), lc: LC_KEYS.concat(LC_NUMS) } });
    var missing = keys.concat(nums).filter(function (n) { return names.indexOf(n) < 0; });
    if (missing.length)
      fail('These headings are missing: ' + missing.join(', ') + '.\nHeadings found in the file: ' +
        headCells.map(function (c) { return c[1]; }).join(', ') + '.',
        { canMatch: true, kind: rep.kind, missing: missing, found: offered(), needs: { nsc: NSC_KEYS.concat(NSC_NUMS), lc: LC_KEYS.concat(LC_NUMS) } });
    if (Object.keys(manual).length)
      rep.notes.push('Headings matched by hand: ' + Object.keys(manual).map(function (std) {
        return std + ' = "' + (headCells[manual[std]] ? headCells[manual[std]][1] : '?') + '"';
      }).join('; ') + '.');

    var hasAgencyTotal = false;
    if (rep.kind === 'lc') {
      var extra = names.slice(names.indexOf('Service Released') + 1);
      rep.agencies = (extra.length && extra[0] === LC_AGENCY_TOTAL) ? extra.slice(1) : extra.slice();
      rep.agencies = rep.agencies.map(function (a) { return ['adhani', 'adani'].indexOf(norm(a)) >= 0 ? 'Adani' : a; });
      if (new Set(rep.agencies).size !== rep.agencies.length) fail('An agency heading appears twice.');
      rep.header = keys.concat(nums, [LC_AGENCY_TOTAL], rep.agencies);
      hasAgencyTotal = extra.length > 0 && extra[0] === LC_AGENCY_TOTAL;
    } else {
      rep.header = keys.concat(nums);
    }

    var target = {}, used = {};
    names.forEach(function (n, idx) {
      var fixed = ['adhani', 'adani'].indexOf(norm(n)) >= 0 ? 'Adani' : n;
      if (rep.header.indexOf(fixed) >= 0 && !used[fixed]) { target[idx] = fixed; used[fixed] = true; }
    });
    var order = {};
    rep.header.forEach(function (n, idx) { order[n] = idx; });
    var nKeys = keys.length;

    // ---- which report
    var title = norm(topText) + ' ' + norm(rep.name);
    if (rep.kind === 'lc') rep.report = 'Load Change';
    else if (title.indexOf('greaterthan19') >= 0 || title.indexOf('1959') >= 0 || title.indexOf('19to59') >= 0) rep.report = 'NSC 19-59 kW';
    else if (title.indexOf('lessthan19') >= 0 || title.indexOf('below19') >= 0) rep.report = 'NSC <19 kW';
    else fail('This is an NSC report, but its title does not say whether it is below 19 kW or 19 to 59 kW.');

    // ---- rows
    var ignored = [], serials = [];
    for (var li = headAt + 1; li < grid.length; li++) {
      var cells = grid[li], lineNo = li + 1;
      if (!cells.length) continue;
      var firstText = cells[0][1];
      var joined = cells.map(function (c) { return c[1]; }).join(' ');
      if (isHeadingRow(cells)) continue;
      if (/generated\s+on/i.test(joined)) {
        var gm = /Generated\s+On\s*:?\s*(.+?)(?:\s+Report\s+Generated\s+By.*)?$/i.exec(joined);
        if (gm) rep.generatedOn = gm[1].replace(/\s*Page\s+\d+.*$/, '').trim();
        continue;
      }
      if (/^(grand\s*)?total/i.test(firstText)) {
        var numbers = cells.slice(1).map(function (c) { return c[1]; });
        if (numbers.length === names.length - nKeys) {
          rep.sourceTotal = {};
          names.slice(nKeys).forEach(function (n, idx) { rep.sourceTotal[n] = numbers[idx]; });
        }
        continue;
      }
      if (!/^\d+$/.test(firstText)) {
        if (/^page\s+\d+/i.test(firstText)) continue;
        ignored.push('line ' + lineNo + ': ' + joined.slice(0, 60));
        continue;
      }
      var values;
      if (cells.length === names.length) values = cells.map(function (c) { return c[1]; });
      else {
        var match = align(cells.map(function (c) { return c[0]; }), positions);
        if (match === null)
          fail('Line ' + lineNo + ' has ' + cells.length + ' values but the table has ' + names.length +
            ' headings, and they cannot be matched safely. The file may be damaged; download it again.');
        values = match.map(function (x) { return x === null ? '' : cells[x][1]; });
      }
      var row = new Array(rep.header.length).fill(null);
      values.forEach(function (text, vi) {
        var hn = target[vi];
        if (hn === undefined) return;
        var at = order[hn], where = 'Line ' + lineNo + ', ' + hn;
        if (at === 0) {
          if (!/^\d+$/.test(text)) fail(where + " should be a number but is '" + text + "'.");
          row[at] = parseInt(text, 10);
        } else if (at < nKeys) {
          if (!text) fail(where + ' is empty.');
          row[at] = at === 1 ? text.toUpperCase() : text;
        } else row[at] = text ? toCount(text, where, rep.notes) : 0;
      });
      if (rep.kind === 'lc' && !hasAgencyTotal)
        row[order[LC_AGENCY_TOTAL]] = rep.agencies.reduce(function (s, a) { return s + (row[order[a]] || 0); }, 0);
      var gaps = rep.header.filter(function (h, hi) { return row[hi] === null; });
      if (gaps.length) fail('Line ' + lineNo + ' has no value under: ' + gaps.join(', ') + '.');
      rep.rows.push(row);
      serials.push(row[0]);
    }

    // ---- checks that stop a bad file
    if (!rep.rows.length) fail('The table has no rows.');
    var found = Array.from(new Set(rep.rows.map(function (r) { return r[1]; }))).sort();
    if (found.length > 1) fail('The file holds more than one DISCOM (' + found.join(', ') + '). Use one file per DISCOM.');
    if (DISCOMS.indexOf(found[0]) < 0) fail("The DISCOM in the file is '" + found[0] + "'. Only " + DISCOMS.join(' and ') + ' are accepted.');
    if (rep.discom && rep.discom !== 'ALL' && rep.discom !== found[0]) fail('The file says it is for ' + rep.discom + ' but its rows are of ' + found[0] + '.');
    rep.discom = found[0];
    for (i = 0; i < serials.length; i++) {
      if (serials[i] !== i + 1) fail('Rows are missing or repeated near serial number ' + (i + 1) + '. Download the report again.');
    }

    var sumList = rep.sums(), sums = {};
    rep.header.slice(nKeys).forEach(function (n, idx) { sums[n] = sumList[idx]; });
    if (rep.sourceTotal) {
      rep.header.slice(nKeys).forEach(function (hn) {
        var srcName = null;
        for (var j = 0; j < names.length; j++) {
          if (canonical(names[j]) === hn || (hn === 'Adani' && ['adhani', 'adani'].indexOf(norm(names[j])) >= 0)) { srcName = names[j]; break; }
        }
        if (hn === LC_AGENCY_TOTAL) srcName = LC_AGENCY_TOTAL;
        if (srcName === null || !Object.prototype.hasOwnProperty.call(rep.sourceTotal, srcName)) return;
        var text = rep.sourceTotal[srcName];
        var t = text.replace(/,/g, '').trim(), theirs = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t) ? Math.trunc(Number(t)) : null;
        var ok = theirs === sums[hn];
        rep.checks.push([hn, sums[hn], text, ok ? 'Matches' : "Differs: the file's own total line is not reliable for this heading; the rows are used"]);
        if (!ok && hn !== 'Completed Within 15 Days')
          fail(hn + ' adds up to ' + fmtIn(sums[hn]) + " in the rows but the file's Grand Total line says " + text +
            '. The file looks incomplete; download it again.');
        if (!ok) rep.notes.push('Completed Within 15 Days: the rows add up to ' + fmtIn(sums[hn]) +
          "; the file's own Grand Total line shows " + text + '. The rows are used.');
      });
    }
    if (rep.kind === 'lc') {
      var gap = sums[LC_AGENCY_TOTAL] - rep.agencies.reduce(function (s, a) { return s + sums[a]; }, 0);
      if (gap) rep.notes.push('Meter installation: ' + fmtIn(gap) + ' cases are in the agency total but not under any named agency.');
    }
    var seen = new Set(), repeats = 0;
    rep.rows.forEach(function (r) {
      var key = JSON.stringify(r.slice(2, nKeys).map(function (v) { return String(v).toUpperCase(); }));
      if (seen.has(key)) repeats++;
      seen.add(key);
    });
    if (repeats) rep.notes.push(repeats + ' ' + (rep.kind === 'nsc' ? 'sections' : 'lines') +
      ' appear more than once in the file; their figures are added together in the summaries.');
    if (ignored.length) rep.notes.push(ignored.length + ' line(s) outside the table were skipped (' + ignored.slice(0, 2).join('; ') + ').');
    return rep;
  }

  function checkSet(reports) {
    var problems = [], notes = [], seen = {};
    reports.forEach(function (rep) {
      var key = rep.discom + '|' + rep.report;
      if (seen[key]) problems.push('Two files are for ' + rep.discom + ' ' + rep.report + ' (' + seen[key] + ' and ' + rep.name + '). Keep only one.');
      seen[key] = rep.name;
    });
    DISCOMS.forEach(function (d) {
      var ends = Array.from(new Set(reports.filter(function (r) { return r.discom === d && r.periodTo; }).map(function (r) { return r.periodTo; }))).sort();
      if (ends.length > 1) notes.push(d + ' files end on different dates (' + ends.join(', ') + ').');
      var miss = REPORTS.filter(function (n) { return !seen[d + '|' + n]; });
      if (miss.length && miss.length < REPORTS.length) notes.push(d + ': no file chosen for ' + miss.join(', ') + '.');
    });
    return { problems: problems, notes: notes };
  }

  // ---------------------------------------------------------------- figures
  function tally(kind, rows) {
    function s(i) { return rows.reduce(function (a, r) { return a + r[i]; }, 0); }
    var t = { lines: rows.length };
    function stages(list) { return list.map(function (p) { return [p[0], s(p[1])]; }); }
    if (kind === 'nsc') {
      t.reg = s(6); t.canc = s(7); t.in15 = s(8); t.out15 = s(9);
      t.done = t.in15 + t.out15;
      t.stages = stages(NSC_STAGES);
      t.pend = t.stages.reduce(function (a, p) { return a + p[1]; }, 0);
      t.other = Math.max(0, t.reg - t.canc - t.done - t.pend);
      t.pOn = ratio(t.in15, t.done);
    } else {
      t.reg = s(5); t.canc = s(12); t.done = s(13);
      t.in15 = t.out15 = null;
      t.stages = stages(LC_STAGES);
      t.pend = Math.max(0, t.reg - t.done - t.canc);
      t.other = 0;
      t.pOn = null;
    }
    t.pDone = ratio(t.done, t.reg); t.pPend = ratio(t.pend, t.reg); t.pCanc = ratio(t.canc, t.reg);
    t.topStage = ['', 0];
    if (t.stages.length) { t.topStage = t.stages[0]; t.stages.forEach(function (p) { if (p[1] > t.topStage[1]) t.topStage = p; }); }
    return t;
  }
  function group(rows, keyCols) {
    var out = new Map();
    rows.forEach(function (r) {
      var key = keyCols.map(function (i) { return String(r[i]).toUpperCase(); }), k = JSON.stringify(key);
      if (!out.has(k)) out.set(k, { key: key, rows: [] });
      out.get(k).rows.push(r);
    });
    return Array.from(out.values());
  }
  function sumCol(rs, i) { return rs.reduce(function (a, r) { return a + r[i]; }, 0); }
  function range(a, b) { var o = []; for (var i = a; i < b; i++) o.push(i); return o; }
  function nn(v) { return v === null ? -1 : v; }

  // Every sheet of the Excel report: {name, colour, head, rows, pct:Set}
  function buildTables(reports) {
    var tables = [];
    reports = reports.slice().sort(function (a, b) {
      return cmp([REPORTS.indexOf(a.report), DISCOMS.indexOf(a.discom)], [REPORTS.indexOf(b.report), DISCOMS.indexOf(b.discom)]);
    });
    var byReport = {};
    REPORTS.forEach(function (n) { byReport[n] = reports.filter(function (r) { return r.report === n; }); });
    function allRows(reps) { return [].concat.apply([], reps.map(function (x) { return x.rows; })); }

    // Summary
    var head = ['DISCOM', 'Report', 'Detail Rows', 'Registered', 'Cancelled', 'Completed / Released',
      'Completed Within 15 Days', 'Completed Beyond 15 Days', 'Pending', 'Stage Not Reported',
      'Completed %', 'Within 15 Days % of Completed', 'Pending %', 'Cancelled %',
      'Major Pendency Stage', 'Major Pendency Cases', 'Period From', 'Period To', 'Source Generated On'];
    var rows = [];
    REPORTS.forEach(function (name) {
      var g = byReport[name], list = g.concat(g.length > 1 ? [null] : []);
      list.forEach(function (rep) {
        var src = rep ? [rep] : g, t = tally(src[0].kind, allRows(src));
        rows.push([rep ? rep.discom : 'Bihar', name, t.lines, t.reg, t.canc, t.done, t.in15, t.out15,
          t.pend, t.other, t.pDone, t.pOn, t.pPend, t.pCanc, t.topStage[0], t.topStage[1],
          rep ? rep.periodFrom : '', rep ? rep.periodTo : '', rep ? rep.generatedOn : '']);
      });
    });
    tables.push({ name: 'Summary', colour: '4B47D6', head: head, rows: rows, pct: new Set([10, 11, 12, 13]) });

    // NSC by circle, division, sub-division
    [['NSC <19 kW', 3], ['NSC 19-59 kW', 2]].forEach(function (spec) {
      var name = spec[0], depth = spec[1], reps = byReport[name];
      if (!reps.length) return;
      var all = allRows(reps);
      ['Circle', 'Division', 'Sub-division'].slice(0, depth).forEach(function (label, level) {
        var keys = [1, 2, 3, 4].slice(0, level + 2);
        var h = ['DISCOM', 'Circle', 'Division', 'SubDivision'].slice(0, level + 2).concat(['Sections'], NSC_NUMS,
          ['Completed', 'Pending Total', 'Stage Not Reported', 'Completed %', 'Within 15 Days % of Completed',
            'Pending %', 'Cancelled %', 'Rank by Completed %']);
        var body = group(all, keys).map(function (gp) {
          var t = tally('nsc', gp.rows);
          return gp.key.concat([t.lines], range(6, 16).map(function (i) { return sumCol(gp.rows, i); }),
            [t.done, t.pend, t.other, t.pDone, t.pOn, t.pPend, t.pCanc]);
        });
        var pc = keys.length + 1 + 10 + 3;
        body.sort(function (a, b) { return cmp([-nn(a[pc]), -a[keys.length + 1]], [-nn(b[pc]), -b[keys.length + 1]]); });
        body.forEach(function (r, i) { r.push(i + 1); });
        tables.push({ name: name + ' - ' + label, colour: name.indexOf('<19') >= 0 ? '12A06C' : '0A7C9C', head: h, rows: body,
          pct: new Set([pc, pc + 1, pc + 2, pc + 3]) });
      });
    });

    // Load Change by circle, division, request type
    var lcReps = byReport['Load Change'];
    if (lcReps.length) {
      var lcAll = allRows(lcReps);
      [['Circle', [1, 2]], ['Division', [1, 2, 3]], ['Request Type', [1, 4]]].forEach(function (spec) {
        var label = spec[0], keys = spec[1];
        var h = keys.map(function (k) { return { 1: 'DISCOM', 2: 'Circle', 3: 'Division', 4: 'Connection Type' }[k]; })
          .concat(LC_NUMS, ['Pending', 'Released %', 'Pending %', 'Cancelled %']);
        if (label !== 'Request Type') h = h.concat(['Load Addition Registered', 'Load Addition Released %', 'Load Reduction Registered',
          'Load Reduction Released %', 'Rank by Released %']);
        var body = group(lcAll, keys).map(function (gp) {
          var t = tally('lc', gp.rows);
          var line = gp.key.concat(range(5, 14).map(function (i) { return sumCol(gp.rows, i); }), [t.pend, t.pDone, t.pPend, t.pCanc]);
          if (label !== 'Request Type') {
            var add = tally('lc', gp.rows.filter(function (r) { return r[4].indexOf('ADDITION') >= 0; }));
            var red = tally('lc', gp.rows.filter(function (r) { return r[4].indexOf('REDUCTION') >= 0; }));
            line = line.concat([add.reg, add.pDone, red.reg, red.pDone]);
          }
          return line;
        });
        var pc = keys.length + 9 + 1, pcts = new Set([pc, pc + 1, pc + 2]);
        if (label !== 'Request Type') {
          body.sort(function (a, b) { return cmp([-nn(a[pc]), -a[keys.length]], [-nn(b[pc]), -b[keys.length]]); });
          body.forEach(function (r, i) { r.push(i + 1); });
          pcts.add(pc + 4); pcts.add(pc + 6);
        }
        tables.push({ name: 'Load Change - ' + label, colour: 'C9470F', head: h, rows: body, pct: pcts });
      });
    }

    // Pending stages
    rows = [];
    REPORTS.forEach(function (name) {
      byReport[name].forEach(function (rep) {
        var t = tally(rep.kind, rep.rows), total = t.stages.reduce(function (a, p) { return a + p[1]; }, 0);
        t.stages.forEach(function (p) { rows.push([name, rep.discom, p[0], p[1], ratio(p[1], total)]); });
      });
    });
    tables.push({ name: 'Pending Stages', colour: '6250D6', head: ['Report', 'DISCOM', 'Stage', 'Pending Cases', 'Share of Pending %'], rows: rows, pct: new Set([4]) });

    // Meter agencies
    rows = [];
    lcReps.forEach(function (rep) {
      var at = {}; rep.header.forEach(function (n, i) { at[n] = i; });
      var total = sumCol(rep.rows, at[LC_AGENCY_TOTAL]), named = 0;
      rep.agencies.forEach(function (a) { var v = sumCol(rep.rows, at[a]); named += v; rows.push([rep.discom, a, v, ratio(v, total)]); });
      if (total - named) rows.push([rep.discom, 'Agency not given in source', total - named, ratio(total - named, total)]);
    });
    if (rows.length) tables.push({ name: 'Meter Agency', colour: 'B8327A', head: ['DISCOM', 'Agency', 'Cases', 'Share %'], rows: rows, pct: new Set([3]) });

    // Best and weakest divisions
    rows = [];
    REPORTS.forEach(function (name) {
      var reps = byReport[name];
      if (!reps.length) return;
      var units = group(allRows(reps), [1, 2, 3]).map(function (gp) { return [gp.key, tally(reps[0].kind, gp.rows)]; });
      var sizes = units.map(function (u) { return u[1].reg; }).sort(function (a, b) { return a - b; });
      var floor = sizes.length ? Math.max(1, pyRound(sizes[Math.floor(sizes.length / 2)] * MIN_SHARE_OF_MEDIAN)) : 1;
      var fair = units.filter(function (u) { return u[1].reg >= floor && u[1].pDone !== null; })
        .sort(function (a, b) { return cmp([-a[1].pDone, -a[1].reg, a[0]], [-b[1].pDone, -b[1].reg, b[0]]); });
      var n = Math.min(10, Math.floor((fair.length + 1) / 2));
      [['Best ' + n, fair.slice(0, n)], ['Weakest ' + n, n ? fair.slice(-n).reverse() : []]].forEach(function (pair) {
        pair[1].forEach(function (u, i) {
          var t = u[1];
          rows.push([name, pair[0], i + 1].concat(u[0], [t.reg, t.done, t.pDone, t.pend, t.pPend, t.pCanc]));
        });
      });
    });
    tables.push({ name: 'Best-Weakest Divisions', colour: '0F8F5C', head: ['Report', 'List', 'Rank', 'DISCOM', 'Circle', 'Division', 'Registered',
      'Completed / Released', 'Completed %', 'Pending', 'Pending %', 'Cancelled %'], rows: rows, pct: new Set([8, 10, 11]) });

    // Checks
    rows = [];
    reports.forEach(function (rep) {
      rows.push([rep.name, rep.discom, rep.report, 'Rows read', rep.rows.length, '', 'Serial numbers 1 to ' + rep.rows.length + ', none missing']);
      rep.checks.forEach(function (c) { rows.push([rep.name, rep.discom, rep.report, c[0], c[1], c[2], c[3]]); });
      var t = tally(rep.kind, rep.rows);
      if (rep.kind === 'nsc') rows.push([rep.name, rep.discom, rep.report, 'Registered not shown under any status', t.other, '',
        (100 * (ratio(t.other, t.reg) || 0)).toFixed(1) + '% of registered']);
      rep.notes.forEach(function (note) { rows.push([rep.name, rep.discom, rep.report, 'Note', '', '', note]); });
    });
    tables.push({ name: 'Checks', colour: '8B93A7', head: ['File', 'DISCOM', 'Report', 'Check', 'Rows Add Up To', "File's Grand Total Line", 'Result'], rows: rows, pct: new Set() });

    // Detail tables
    reports.forEach(function (rep) {
      tables.push({ name: rep.tabName(), colour: rep.discom === 'NBPDCL' ? '2A78D6' : 'EB6834', head: rep.header,
        rows: rep.rows.map(function (r) { return r.slice(); }), pct: new Set() });
    });
    return tables;
  }

  // ---------------------------------------------------------------- Excel report (ExcelJS)
  var COUNT_FMT = '[>=10000000]##\\,##\\,##\\,##0;[>=100000]##\\,##\\,##0;##,##0';
  var PCT_FMT = '0.0%';
  var NO_FMT = ['Sl.No.', 'Rank', 'Rank by Completed %', 'Rank by Released %'];

  function makeWorkbook(ExcelJS, reports) {
    var book = new ExcelJS.Workbook();
    book.creator = 'NSC & Load Change Report';
    buildTables(reports).forEach(function (tb) {
      var name = tb.name.replace(/[\[\]:*?\/\\]/g, '-').slice(0, 31);
      var sheet = book.addWorksheet(name, {
        properties: { tabColor: { argb: 'FF' + tb.colour } },
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
      });
      sheet.addRow(tb.head);
      tb.rows.forEach(function (r) { sheet.addRow(r.map(function (v) { return v === null ? null : v; })); });
      var headRow = sheet.getRow(1);
      headRow.height = 32;
      tb.head.forEach(function (h, ci) {
        var cell = headRow.getCell(ci + 1);
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + tb.colour } };
        cell.alignment = { wrapText: true, vertical: 'middle' };
        var longest = String(h).length * 0.62;
        tb.rows.slice(0, 400).forEach(function (r) {
          var v = r[ci], len = (typeof v === 'number' && Number.isInteger(v)) ? fmtIn(v).length + 1 : String(v === null || v === undefined ? '' : v).length;
          if (len > longest) longest = len;
        });
        var w = Math.max(9, Math.min(46, longest + 2));
        sheet.getColumn(ci + 1).width = w === 9 ? 9.01 : w;     // the library leaves out a width of exactly 9
        var isPct = tb.pct.has(ci);
        for (var ri = 0; ri < tb.rows.length; ri++) {
          var v = tb.rows[ri][ci];
          if (isPct) sheet.getRow(ri + 2).getCell(ci + 1).numFmt = PCT_FMT;
          else if (typeof v === 'number' && Number.isInteger(v) && NO_FMT.indexOf(h) < 0) sheet.getRow(ri + 2).getCell(ci + 1).numFmt = COUNT_FMT;
        }
      });
      if (tb.rows.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: tb.rows.length + 1, column: tb.head.length } };
    });
    return book;
  }

  // ---------------------------------------------------------------- dashboard update
  function makePayload(discom, reps, password, mode) {
    return {
      app: 'nsc-report', version: APP_VERSION, mode: mode, password: password, discom: discom,
      reports: reps.map(function (r) {
        return { report: r.report, kind: r.kind, header: r.header, rows: r.rows,
          totals: { rows: r.rows.length, sums: r.sums() },
          periodFrom: r.periodFrom, periodTo: r.periodTo, generatedOn: r.generatedOn };
      })
    };
  }

  // For the new-tab route: the same figures as a form the web app reads (the password is added on the form, not here)
  function browserBatch(reports) {
    var batch = DISCOMS.map(function (d) {
      var reps = reports.filter(function (r) { return r.discom === d; });
      if (!reps.length) return null;
      var one = makePayload(d, reps, null, 'write');
      delete one.password;
      return one;
    }).filter(Boolean);
    return JSON.stringify({ app: 'nsc-report', version: APP_VERSION, via: 'browser', batch: batch });
  }

  function UploadError(code, message) { this.name = 'UploadError'; this.code = code; this.message = message; }
  UploadError.prototype = Object.create(Error.prototype);
  UploadError.prototype.constructor = UploadError;

  function post(fetchFn, url, payload) {
    // text/plain keeps this a "simple" request, so the browser sends it straight to the web app
    return fetchFn(url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload) })
      .catch(function () {
        throw new UploadError('NET', 'The dashboard could not be reached. Check the internet connection and try again.');
      })
      .then(function (resp) {
        if (!resp.ok) throw new UploadError('NET', 'The dashboard refused the request (error ' + resp.status + '). Check the web app link and its sharing setting.');
        return resp.text();
      })
      .then(function (text) {
        var answer;
        try { answer = JSON.parse(text); }
        catch (e) {
          throw new UploadError('NET', "The web app answered with a web page instead of a result. In its deployment, set 'Execute as: Me' and 'Who has access: Anyone', and check the link ends with /exec.");
        }
        if (!answer || typeof answer !== 'object' || !('ok' in answer)) throw new UploadError('NET', 'The web app gave an answer this page does not understand.');
        return answer;
      });
  }

  // Check every DISCOM first, then write. Nothing is written unless every check passes.
  function upload(reports, password, opts) {
    opts = opts || {};
    var url = opts.url || WEB_APP_URL, say = opts.say || function () {}, fetchFn = opts.fetch || fetch;
    var sets = DISCOMS.map(function (d) { return [d, reports.filter(function (r) { return r.discom === d; })]; })
      .filter(function (s) { return s[1].length; });
    var steps = [];
    ['check', 'write'].forEach(function (mode) { sets.forEach(function (s, si) { steps.push([mode, s, si]); }); });
    return steps.reduce(function (p, step) {
      return p.then(function () {
        var mode = step[0], discom = step[1][0], reps = step[1][1];
        say(mode === 'check' ? 'Checking ' + discom + ' with the dashboard' : 'Updating ' + discom + ' on the dashboard');
        return post(fetchFn, url, makePayload(discom, reps, password, mode)).then(function (answer) {
          if (!answer.ok) {
            var text = answer.message || 'The update was not accepted.';
            var probs = answer.problems || [];
            if (probs.length) text += '\n  - ' + probs.slice(0, 8).map(String).join('\n  - ');
            if (mode === 'write' && step[2] > 0) text += '\n' + sets[0][0] + ' was already updated; ' + discom + ' was left as it was.';
            throw new UploadError(answer.code || 'ERROR', text);
          }
          if (mode === 'write') (answer.written || []).forEach(function (it) { say('  ' + it.tab + ': ' + fmtIn(it.rows || 0) + ' rows'); });
        });
      });
    }, Promise.resolve()).then(function () { return sets.map(function (s) { return s[0]; }); });
  }

  return {
    APP_VERSION: APP_VERSION, WEB_APP_URL: WEB_APP_URL, DISCOMS: DISCOMS, REPORTS: REPORTS,
    LC_AGENCY_TOTAL: LC_AGENCY_TOTAL, ReportError: ReportError, UploadError: UploadError,
    norm: norm, canonical: canonical, seqRatio: seqRatio, closeMatches: closeMatches, align: align, fmtIn: fmtIn,
    parseReport: parseReport, checkSet: checkSet, tally: tally, buildTables: buildTables,
    makeWorkbook: makeWorkbook, makePayload: makePayload, browserBatch: browserBatch, upload: upload
  };
});
