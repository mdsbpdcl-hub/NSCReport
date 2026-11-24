/* NSC & Load Change Pendency - "Top 20 pendency" PDFs in the Review Report look
   (A4 portrait, Times New Roman, light blue title band with gold line, six tiles, boxed headings, gridded tables). */
(function () {
  'use strict';
  var C = {
    band: [234, 241, 251], bandLine: [143, 174, 221], gold: [201, 162, 39], small: [45, 59, 85], title: [22, 41, 77],
    headBar: [31, 78, 154], head: [220, 232, 247], grid: [95, 102, 110], outer: [51, 51, 51], ink: [29, 36, 51], grey: [102, 112, 133],
    total: [234, 241, 251], top5: [253, 231, 210], up: [184, 53, 43], down: [26, 138, 76],
    tiles: [[47, 109, 181], [192, 57, 43], [201, 162, 39], [46, 139, 87], [122, 101, 194], [15, 159, 143]]
  };
  var LEVEL_NAME = { circle: ['Circle', 'Circles'], division: ['Division', 'Divisions'], sub: ['Sub-division', 'Sub-divisions'], section: ['Section', 'Sections'] };
  var TOP = 20, FOCUS = 5, M = 36;

  function make(A, level) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), CW = W - 2 * M;
    var rep = A.S.report, repName = A.REPORT_NAME[rep], discom = A.S.discom, kind = A.kindOf(rep);
    var scopeName = discom === 'ALL' ? 'Bihar' : discom;
    var lv = LEVEL_NAME[level];
    var period = (A.periodText(rep, discom) || '').replace(/\. Bihar totals.*$/, '');
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], now = new Date();
    var made = now.getDate() + ' ' + MON[now.getMonth()] + ' ' + now.getFullYear();
    var madeAt = made + ', ' + ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    var asOn = A.asOn ? niceDate(A.asOn) : '-';

    var total = A.sumUp(A.scopeRecs(rep, discom));
    var units = A.scored(rep, discom, level).filter(function (u) { return u.pend > 0; })
      .sort(function (a, b) { return b.pend - a.pend || (b.pPend || 0) - (a.pPend || 0); });
    var top = units.slice(0, TOP), nTop = top.length, nFocus = Math.min(FOCUS, nTop);
    var sum = function (list, f) { return list.reduce(function (s, u) { return s + (f(u) || 0); }, 0); };
    var topPend = sum(top, function (u) { return u.pend; }), focusPend = sum(top.slice(0, FOCUS), function (u) { return u.pend; });
    var hasChange = top.some(function (u) { return u.change !== null; });
    var showDiscom = discom === 'ALL';
    var reportTitle = 'Top ' + nTop + ' ' + lv[1].toLowerCase() + ' by pendency';

    // ---------------- title band
    var y = M, bandH = 66;
    doc.setFillColor.apply(doc, C.band); doc.setDrawColor.apply(doc, C.bandLine); doc.setLineWidth(1.3);
    doc.rect(M, y, CW, bandH, 'FD');
    doc.setDrawColor.apply(doc, C.gold); doc.setLineWidth(2); doc.line(M, y + bandH + 2.5, M + CW, y + bandH + 2.5);
    doc.setFont('times', 'normal'); doc.setTextColor.apply(doc, C.small);
    fitText(doc, 'NSC & Load Change Pendency', M + 10, y + 13, CW / 2 - 14, 8.5, 6.5);
    fitText(doc, 'Made on ' + madeAt, M + CW - 10, y + 13, CW / 2 - 14, 8.5, 6.5, 'right');
    doc.setFont('times', 'bold'); doc.setTextColor.apply(doc, C.title);
    fitText(doc, reportTitle + ': ' + repName, M + 10, y + 36, CW - 20, 15, 10);
    doc.setFont('times', 'normal'); doc.setTextColor.apply(doc, C.small);
    fitText(doc, scopeName + ' > ' + repName + (period ? '   |   ' + period : '') + '   |   Figures as on ' + asOn, M + 10, y + 54, CW - 20, 9.5, 7);
    y += bandH + 14;

    // ---------------- six tiles
    var tiles = [
      ['Registered', A.n(total.reg)],
      ['Pending', A.n(total.pend)],
      ['Pending % of registered', A.pct(A.ratio(total.pend, total.reg))],
      ['Held by these ' + nTop, A.n(topPend) + ' (' + A.pct(A.ratio(topPend, total.pend), 0) + ')'],
      ['Held by the top ' + nFocus, A.n(focusPend) + ' (' + A.pct(A.ratio(focusPend, total.pend), 0) + ')'],
      ['On hold', A.n(total.hold)]
    ];
    var gap = 6, tw = (CW - 5 * gap) / 6, th = 40;
    tiles.forEach(function (t, i) {
      var x = M + i * (tw + gap);
      doc.setFillColor(255, 255, 255); doc.setDrawColor.apply(doc, C.grid); doc.setLineWidth(1); doc.rect(x, y, tw, th, 'FD');
      doc.setFillColor.apply(doc, C.tiles[i]); doc.rect(x, y, tw, 3.2, 'F');
      doc.setFont('times', 'normal'); doc.setTextColor.apply(doc, C.grey); fitText(doc, t[0], x + 6, y + 15, tw - 12, 7.5, 6);
      doc.setFont('times', 'bold'); doc.setTextColor.apply(doc, C.ink); fitText(doc, t[1], x + 6, y + 31, tw - 12, 11, 7.5);
    });
    y += th + 16;

    // ---------------- section 1: the top 20 in order of pending
    y = sectionHeading(doc, 'Top ' + nTop + ' ' + lv[1].toLowerCase() + ' in order of pending applications', y, 140);
    doc.setFont('times', 'normal'); doc.setTextColor.apply(doc, C.grey);
    doc.setFillColor.apply(doc, C.top5); doc.setDrawColor.apply(doc, C.grid); doc.setLineWidth(0.5); doc.rect(M, y - 7, 10, 8, 'FD');
    fitText(doc, 'The top ' + nFocus + ' by pending are shaded light orange. The total of the ' + nTop + ' comes first.', M + 15, y, CW - 15, 8.5, 7);
    y += 7;

    var head = ['No.', lv[0]].concat(level === 'circle' ? [] : ['Within']).concat(showDiscom ? ['DISCOM'] : [])
      .concat(['Registered', 'Pending', 'Pending %', 'Main stage']).concat(kind === 'nsc' ? ['After 15 days'] : [])
      .concat(['On hold']).concat(hasChange ? ['Week change'] : []);
    var nameCols = [1].concat(level === 'circle' ? [] : [2]);
    var changeCol = head.indexOf('Week change');
    var totalRow = ['', 'These ' + nTop].concat(level === 'circle' ? [] : ['']).concat(showDiscom ? [''] : [])
      .concat([A.n(sum(top, function (u) { return u.reg; })), A.n(topPend), A.pct(A.ratio(topPend, sum(top, function (u) { return u.reg; }))), ''])
      .concat(kind === 'nsc' ? [A.pct(A.ratio(sum(top, function (u) { return u.out15; }), sum(top, function (u) { return u.done; })))] : [])
      .concat([A.n(sum(top, function (u) { return u.hold; }))])
      .concat(hasChange ? [signed(A, sum(top, function (u) { return u.change; }))] : []);
    var body = [totalRow].concat(top.map(function (u, i) {
      var within = String(u.context || '').split(' / ').slice(-2).join(' / ');      // the nearest two levels are enough
      return [String(i + 1), clean(u.name)].concat(level === 'circle' ? [] : [clean(within)]).concat(showDiscom ? [u.discom] : [])
        .concat([A.n(u.reg), A.n(u.pend), A.pct(u.pPend), short(u.topStage)])
        .concat(kind === 'nsc' ? [A.pct(u.pLate)] : []).concat([A.n(u.hold)]).concat(hasChange ? [signed(A, u.change)] : []);
    }));
    var colStyles = { 0: { cellWidth: 26 } };
    nameCols.forEach(function (c) { colStyles[c] = { halign: 'left' }; });
    colStyles[1].fontStyle = 'bold';
    colStyles[head.indexOf('Main stage')] = { halign: 'left', cellWidth: 68 };
    y = table(doc, head, body, y, colStyles, function (h) {
      if (h.section !== 'body') return;
      if (h.row.index === 0) { h.cell.styles.fillColor = C.total; h.cell.styles.fontStyle = 'bold'; return; }
      if (h.row.index <= FOCUS) h.cell.styles.fillColor = C.top5;
      if (h.column.index === changeCol) { var u = top[h.row.index - 1]; if (u && u.change) h.cell.styles.textColor = u.change > 0 ? C.up : C.down; }
    });

    // ---------------- section 2: where their pending sits
    var stages = A.stagesOf(rep);
    y = sectionHeading(doc, 'Where the pending sits: the same ' + nTop + ' ' + lv[1].toLowerCase() + ' by stage', y + 16, (nTop + 2) * 16 + 30);   // keep the whole stage table together
    var stageTot = stages.map(function (s) { return [s, sum(top, function (u) { return u.st[s[0]]; })]; }).sort(function (a, b) { return b[1] - a[1]; });
    if (stageTot[0] && stageTot[0][1]) {
      doc.setFont('times', 'normal'); doc.setTextColor.apply(doc, C.grey);
      var lead = stageTot[0][0][1] + ' holds the most: ' + A.n(stageTot[0][1]) + ' (' + A.pct(A.ratio(stageTot[0][1], topPend)) + '). Action usually with: ' +
        stageTot[0][0][2] + '. The largest figure in each line is in bold.';
      fitText(doc, lead, M, y, CW, 8.5, 7);
      y += 7;
    }
    var head2 = ['No.', lv[0]].concat(stages.map(function (s) { return short(s[1]); })).concat(['Pending']);
    var body2 = [['', 'These ' + nTop].concat(stages.map(function (s) { return A.n(sum(top, function (u) { return u.st[s[0]]; })); })).concat([A.n(topPend)])]
      .concat(top.map(function (u, i) { return [String(i + 1), clean(u.name)].concat(stages.map(function (s) { return A.n(u.st[s[0]] || 0); })).concat([A.n(u.pend)]); }));
    table(doc, head2, body2, y, { 0: { cellWidth: 26 }, 1: { halign: 'left', fontStyle: 'bold' } }, function (h) {
      if (h.section !== 'body') return;
      if (h.row.index === 0) { h.cell.styles.fillColor = C.total; h.cell.styles.fontStyle = 'bold'; return; }
      var u = top[h.row.index - 1];
      if (h.row.index <= FOCUS) h.cell.styles.fillColor = C.top5;
      var si = h.column.index - 2;
      if (si >= 0 && si < stages.length) {
        var best = stages.reduce(function (b, s, k) { return (u.st[s[0]] || 0) > (u.st[stages[b][0]] || 0) ? k : b; }, 0);
        if (si === best && (u.st[stages[si][0]] || 0) > 0) h.cell.styles.fontStyle = 'bold';
      }
    });

    // ---------------- footer on every page
    var pages = doc.getNumberOfPages();
    for (var i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(210, 214, 222); doc.setLineWidth(0.5); doc.line(M, H - 26, W - M, H - 26);
      doc.setFont('times', 'normal'); doc.setTextColor.apply(doc, C.grey);
      fitText(doc, reportTitle + '  |  ' + repName + '  |  ' + scopeName, M, H - 15, CW - 70, 8, 6.5);
      doc.setFontSize(8); doc.text('Page ' + i + ' of ' + pages, W - M, H - 15, { align: 'right' });
    }
    var file = 'Top20_' + lv[1].replace(/[^A-Za-z]+/g, '') + '_' + repName.replace(/[^A-Za-z0-9]+/g, '_') + '_' + scopeName + '_' +
      (A.asOn ? String(A.asOn).replace(/\s+/g, '-') : made.replace(/\s+/g, '-')) + '.pdf';
    var url = null;
    try { url = doc.output('bloburl'); } catch (e) { /* the download still works */ }
    doc.save(file);
    return { file: file, url: url };

    // ---- helpers that need the page size
    function sectionHeading(d, text, yy, keepWith) {
      if (yy + 24 + (keepWith || 60) > H - 40) { d.addPage(); yy = M; }       // never leave a heading alone at the foot of a page
      d.setFillColor.apply(d, C.band); d.setDrawColor.apply(d, C.bandLine); d.setLineWidth(1.3); d.rect(M, yy, CW, 20, 'FD');
      d.setFillColor.apply(d, C.headBar); d.rect(M, yy, 5, 20, 'F');
      d.setFont('times', 'bold'); d.setTextColor.apply(d, C.title); fitText(d, text, M + 12, yy + 13.8, CW - 20, 11, 8);
      return yy + 32;
    }
    function table(d, hd, rows, startY, colStyles, parse) {
      var bounds = {};
      d.autoTable({
        startY: startY, margin: { left: M, right: M, top: M, bottom: 40 }, head: [hd], body: rows, theme: 'grid',
        styles: { font: 'times', fontSize: 8.4, cellPadding: { top: 3, bottom: 3, left: 3.5, right: 3.5 }, textColor: C.ink, lineColor: C.grid, lineWidth: 0.7,
          halign: 'center', valign: 'middle', overflow: 'linebreak' },
        headStyles: { font: 'times', fontStyle: 'bold', fillColor: C.head, textColor: C.title, halign: 'center', lineColor: C.grid, lineWidth: 0.7 },
        bodyStyles: { fillColor: [255, 255, 255] },
        columnStyles: colStyles,
        didParseCell: parse,
        didDrawCell: function (h) {
          var p = d.internal.getCurrentPageInfo().pageNumber, b = bounds[p] || (bounds[p] = { x0: 1e9, x1: 0, y0: 1e9, y1: 0 });
          b.x0 = Math.min(b.x0, h.cell.x); b.x1 = Math.max(b.x1, h.cell.x + h.cell.width);
          b.y0 = Math.min(b.y0, h.cell.y); b.y1 = Math.max(b.y1, h.cell.y + h.cell.height);
        }
      });
      var last = d.internal.getCurrentPageInfo().pageNumber;
      Object.keys(bounds).forEach(function (p) {             // a darker outer border around the table on each page
        var b = bounds[p]; d.setPage(Number(p)); d.setDrawColor.apply(d, C.outer); d.setLineWidth(1.2); d.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, 'S');
      });
      d.setPage(last);
      return d.lastAutoTable.finalY;
    }
  }

  // fits text inside a width: the size shrinks step by step, then the text is cut with "..."
  function fitText(doc, text, x, y, width, size, min, align) {
    text = clean(text); var s = size;
    doc.setFontSize(s);
    while (doc.getTextWidth(text) > width && s > min) { s -= 0.5; doc.setFontSize(s); }
    if (doc.getTextWidth(text) > width) {
      while (text.length > 1 && doc.getTextWidth(text + '...') > width) text = text.slice(0, -1);
      text += '...';
    }
    doc.text(text, x, y, align ? { align: align } : undefined);
  }
  function clean(s) { return String(s == null ? '' : s).replace(/−/g, '-').replace(/[^\x20-\x7E -ÿ–—‘’“”•]/g, ''); }
  function signed(A, v) { return v === null || v === undefined ? '-' : v > 0 ? '+' + A.n(v) : v < 0 ? '-' + A.n(-v) : '0'; }
  function niceDate(s) {
    var m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(String(s).trim());
    return m ? Number(m[1]) + ' ' + m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase() + ' ' + m[3] : String(s);
  }
  function short(s) {
    s = String(s == null ? '' : s);
    return ({ 'Document verification': 'Doc. verification', 'On hold at document verification': 'Hold: documents', 'Site inspection': 'Site inspection',
      'On hold at site inspection': 'Hold: site', 'Infra installation': 'Infra', 'At AMISP (meter fixing)': 'At AMISP', 'Registration payment': 'Payment',
      'Work order for meter': 'Work order', 'Meter installation': 'Meter install.', 'Meter change not required': 'No meter change', 'On hold': 'On hold' })[s] || clean(s);
  }

  window.NSCPdf = { make: make };
})();
