/* NSC & Load Change Pendency - "Top 20 pendency" PDFs, one per level (A4 landscape, Times New Roman) */
(function () {
  'use strict';
  var INK = [23, 32, 51], SLATE = [86, 96, 112], STEEL = [31, 92, 153], LINE = [214, 220, 229], HEADFILL = [243, 245, 249];
  var ORANGE = [253, 231, 210], ORANGE_INK = [168, 76, 12], GREEN = [226, 243, 230], GREEN_INK = [36, 112, 66], BAR = [31, 92, 153];
  var LEVEL_NAME = { circle: ['Circle', 'Circles'], division: ['Division', 'Divisions'], sub: ['Sub-division', 'Sub-divisions'], section: ['Section', 'Sections'] };
  var TOP = 20;

  function make(A, level) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 14;
    var rep = A.S.report, repName = A.REPORT_NAME[rep], discom = A.S.discom, kind = A.kindOf(rep);
    var scope = discom === 'ALL' ? 'Bihar (NBPDCL and SBPDCL)' : discom;
    var lv = LEVEL_NAME[level];
    var period = (A.periodText(rep, discom) || '').replace(/\. Bihar totals.*$/, '');
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], now = new Date();
    var made = now.getDate() + ' ' + MON[now.getMonth()] + ' ' + now.getFullYear();
    var clean = function (s) { return String(s == null ? '' : s).replace(/−/g, '-').replace(/[^\x20-\x7E -ÿ–—‘’“”•]/g, ''); };
    var signed = function (v) { return v === null || v === undefined ? '-' : v > 0 ? '+' + A.n(v) : v < 0 ? '-' + A.n(-v) : '0'; };

    var total = A.sumUp(A.scopeRecs(rep, discom));
    var overall = A.ratio(total.pend, total.reg) || 0;
    var units = A.scored(rep, discom, level).filter(function (u) { return u.pend > 0; })
      .sort(function (a, b) { return b.pend - a.pend || (b.pPend || 0) - (a.pPend || 0); });
    var top = units.slice(0, TOP);
    var topPend = top.reduce(function (s, u) { return s + u.pend; }, 0);
    var hasChange = top.some(function (u) { return u.change !== null; });
    var showDiscom = discom === 'ALL';
    var FOCUS = 5;                                                  // the top 5 are shaded light orange
    var top5Pend = top.slice(0, FOCUS).reduce(function (s, u) { return s + u.pend; }, 0);

    // ---------------- page 1: the top 20
    header(doc, 'Top ' + top.length + ' ' + lv[1].toLowerCase() + ' by pendency', repName + '  |  ' + scope + (period ? '  |  ' + period : '') + '  |  Figures as on ' + (A.asOn || '-'));

    // four figures
    var boxes = [
      ['Pending, ' + (discom === 'ALL' ? 'Bihar' : discom), A.n(total.pend), A.pct(overall) + ' of ' + A.n(total.reg) + ' registered'],
      ['Held by these ' + top.length + ' ' + lv[1].toLowerCase(), A.n(topPend), A.pct(A.ratio(topPend, total.pend)) + ' of all pending'],
      ['Largest', clean(top[0] ? top[0].name : '-'), top[0] ? A.n(top[0].pend) + ' pending, ' + A.pct(top[0].pPend) : ''],
      ['Held by the top ' + Math.min(FOCUS, top.length), A.n(top5Pend), A.pct(A.ratio(top5Pend, total.pend)) + ' of all pending']
    ];
    var bw = (W - 2 * M - 3 * 6) / 4, by = 30;
    boxes.forEach(function (b, i) {
      var x = M + i * (bw + 6);
      doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.3); doc.roundedRect(x, by, bw, 20, 1.5, 1.5, 'S');
      doc.setFont('times', 'normal'); doc.setFontSize(10); doc.setTextColor.apply(doc, SLATE); doc.text(b[0], x + 4, by + 6);
      doc.setFont('times', 'bold'); doc.setFontSize(16); doc.setTextColor.apply(doc, INK); doc.text(fit(doc, b[1], bw - 8), x + 4, by + 13.5);
      doc.setFont('times', 'normal'); doc.setFontSize(9.5); doc.setTextColor.apply(doc, SLATE); doc.text(fit(doc, b[2], bw - 8), x + 4, by + 18.5);
    });

    // key
    var ky = by + 26;
    doc.setFont('times', 'normal'); doc.setFontSize(10);
    doc.setFillColor.apply(doc, ORANGE); doc.rect(M, ky - 3.2, 5, 4, 'F');
    doc.setTextColor.apply(doc, INK); doc.text('Top ' + Math.min(FOCUS, top.length) + ' by pending', M + 7, ky);
    doc.setTextColor.apply(doc, SLATE);
    doc.text('Ranked by number of pending applications', W - M, ky, { align: 'right' });

    var maxPend = top.length ? top[0].pend : 1;
    var head = ['#', lv[0]].concat(level === 'circle' ? [] : ['Within']).concat(showDiscom ? ['DISCOM'] : [])
      .concat(['Registered', 'Pending', '', 'Pending %', 'Main stage'])
      .concat(kind === 'nsc' ? ['After 15 days'] : []).concat(['On hold']).concat(hasChange ? ['Week change'] : []);
    var barCol = head.indexOf(''), changeCol = head.indexOf('Week change');
    var body = top.map(function (u, i) {
      return [String(i + 1), clean(u.name)].concat(level === 'circle' ? [] : [clean(u.context)]).concat(showDiscom ? [u.discom] : [])
        .concat([A.n(u.reg), A.n(u.pend), '', A.pct(u.pPend), short(u.topStage)])
        .concat(kind === 'nsc' ? [A.pct(u.pLate)] : []).concat([A.n(u.hold)]).concat(hasChange ? [signed(u.change)] : []);
    });
    var colStyles = { 0: { halign: 'center', cellWidth: 9 }, 1: { fontStyle: 'bold' } };
    head.forEach(function (h, i) { if (['Registered', 'Pending', 'Pending %', 'After 15 days', 'On hold', 'Week change'].indexOf(h) >= 0) colStyles[i] = { halign: 'right' }; });
    colStyles[barCol] = { cellWidth: 38 };
    doc.autoTable({
      startY: ky + 3, margin: { left: M, right: M, bottom: 13 }, head: [head], body: body, theme: 'plain',
      styles: { font: 'times', fontSize: 10.5, cellPadding: { top: 0.95, bottom: 0.95, left: 2.2, right: 2.2 }, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.2 }, valign: 'middle', overflow: 'ellipsize' },
      headStyles: { font: 'times', fontStyle: 'bold', fontSize: 10, fillColor: HEADFILL, textColor: SLATE, overflow: 'visible' },
      columnStyles: colStyles,
      didParseCell: function (h) {
        if (h.section !== 'body') return;
        var u = top[h.row.index];
        h.cell.styles.fillColor = h.row.index < FOCUS ? ORANGE : [255, 255, 255];
        if (h.column.index === changeCol && u.change) h.cell.styles.textColor = u.change > 0 ? ORANGE_INK : GREEN_INK;
      },
      didDrawCell: function (h) {
        if (h.section !== 'body' || h.column.index !== barCol) return;
        var u = top[h.row.index], w = (h.cell.width - 4) * u.pend / maxPend;
        doc.setFillColor.apply(doc, BAR); doc.rect(h.cell.x + 2, h.cell.y + h.cell.height / 2 - 1.6, Math.max(0.6, w), 3.2, 'F');
      }
    });

    // ---------------- page 2: where their pending sits
    var stages = A.stagesOf(rep);
    doc.addPage();
    header(doc, 'Where the pending sits: top ' + top.length + ' ' + lv[1].toLowerCase() + ' by stage', repName + '  |  ' + scope + '  |  Figures as on ' + (A.asOn || '-'));
    doc.setFont('times', 'normal'); doc.setFontSize(10.5); doc.setTextColor.apply(doc, SLATE);
    var stageTot = stages.map(function (s) { return [s, top.reduce(function (a, u) { return a + (u.st[s[0]] || 0); }, 0)]; }).sort(function (a, b) { return b[1] - a[1]; });
    var lead = stageTot[0] && stageTot[0][1] ? 'Across these ' + top.length + ' ' + lv[1].toLowerCase() + ', ' + stageTot[0][0][1].toLowerCase() + ' holds the most: ' + A.n(stageTot[0][1]) +
      ' (' + A.pct(A.ratio(stageTot[0][1], topPend)) + '). Action usually with: ' + stageTot[0][0][2] + '. The largest figure in each line is in bold.' : '';
    doc.text(doc.splitTextToSize(clean(lead), W - 2 * M), M, 34);
    var head2 = ['#', lv[0]].concat(stages.map(function (s) { return short(s[1]); })).concat(['Pending']);
    var body2 = top.map(function (u, i) { return [String(i + 1), clean(u.name)].concat(stages.map(function (s) { return A.n(u.st[s[0]] || 0); })).concat([A.n(u.pend)]); });
    body2.push(['', 'These ' + top.length].concat(stages.map(function (s) { return A.n(top.reduce(function (a, u) { return a + (u.st[s[0]] || 0); }, 0)); })).concat([A.n(topPend)]));
    var cs2 = { 0: { halign: 'center', cellWidth: 9 }, 1: { fontStyle: 'bold' } };
    for (var c = 2; c < head2.length; c++) cs2[c] = { halign: 'right' };
    doc.autoTable({
      startY: 40, margin: { left: M, right: M, bottom: 13 }, head: [head2], body: body2, theme: 'plain',
      styles: { font: 'times', fontSize: 10.5, cellPadding: { top: 1.0, bottom: 1.0, left: 2.2, right: 2.2 }, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.2 }, overflow: 'ellipsize' },
      headStyles: { font: 'times', fontStyle: 'bold', fontSize: 10, fillColor: HEADFILL, textColor: SLATE, overflow: 'visible' },
      columnStyles: cs2,
      didParseCell: function (h) {
        if (h.section !== 'body') return;
        if (h.row.index === top.length) { h.cell.styles.fontStyle = 'bold'; h.cell.styles.fillColor = HEADFILL; return; }
        var u = top[h.row.index];
        h.cell.styles.fillColor = h.row.index < FOCUS ? ORANGE : [255, 255, 255];
        var si = h.column.index - 2;
        if (si >= 0 && si < stages.length) {
          var best = stages.reduce(function (b, s, k) { return (u.st[s[0]] || 0) > (u.st[stages[b][0]] || 0) ? k : b; }, 0);
          if (si === best && (u.st[stages[si][0]] || 0) > 0) h.cell.styles.fontStyle = 'bold';
        }
      }
    });

    // ---------------- footers
    var pages = doc.getNumberOfPages();
    for (var i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.3); doc.line(M, H - 11, W - M, H - 11);
      doc.setFont('times', 'normal'); doc.setFontSize(9); doc.setTextColor.apply(doc, SLATE);
      doc.text('Top ' + top.length + ' ' + lv[1].toLowerCase() + ' by pendency  |  ' + repName + '  |  ' + scope + '  |  Prepared on ' + made, M, H - 6.5);
      doc.text('Page ' + i + ' of ' + pages, W - M, H - 6.5, { align: 'right' });
    }
    var file = 'Top20_' + lv[1].replace(/[^A-Za-z]+/g, '') + '_' + repName.replace(/[^A-Za-z0-9]+/g, '_') + '_' + (discom === 'ALL' ? 'Bihar' : discom) + '_' +
      String(A.asOn || made).replace(/\s+/g, '-') + '.pdf';
    doc.save(file);
    return file;

    function header(d, title, sub) {
      d.setFillColor.apply(d, STEEL); d.rect(0, 0, W, 2.2, 'F');
      d.setFont('times', 'bold'); d.setFontSize(19); d.setTextColor.apply(d, INK); d.text(clean(title), M, 15);
      d.setFont('times', 'normal'); d.setFontSize(11); d.setTextColor.apply(d, SLATE); d.text(fit(d, clean(sub), W - 2 * M), M, 22);
      d.setDrawColor.apply(d, LINE); d.setLineWidth(0.3); d.line(M, 25.5, W - M, 25.5);
    }
  }
  function fit(doc, text, width) {
    text = String(text);
    if (doc.getTextWidth(text) <= width) return text;
    while (text.length > 1 && doc.getTextWidth(text + '...') > width) text = text.slice(0, -1);
    return text + '...';
  }
  function short(s) {
    s = String(s == null ? '' : s);
    return ({ 'Document verification': 'Doc. verification', 'On hold at document verification': 'Hold: documents', 'Site inspection': 'Site inspection',
      'On hold at site inspection': 'Hold: site', 'Infra installation': 'Infra', 'At AMISP (meter fixing)': 'At AMISP', 'Registration payment': 'Payment',
      'Work order for meter': 'Work order', 'Meter installation': 'Meter install.', 'Meter change not required': 'No meter change', 'On hold': 'On hold' })[s] || s.replace(/[^\x20-\x7E]/g, '');
  }

  window.NSCPdf = { make: make };
})();
