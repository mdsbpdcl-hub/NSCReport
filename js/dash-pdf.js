/* NSC & Load Change Pendency - the "Top pendency report" PDF (A4 landscape) */
(function () {
  'use strict';
  var INK = [23, 32, 51], SLATE = [85, 96, 112], STEEL = [31, 92, 153], LINE = [223, 228, 236], HEAD = [241, 244, 248];
  var SEV_FILL = { Critical: [253, 236, 234], High: [254, 240, 225], Moderate: [251, 243, 214], Low: [231, 244, 236] };
  var SEV_TEXT = { Critical: [180, 35, 24], High: [181, 71, 8], Moderate: [138, 97, 0], Low: [43, 122, 75] };

  function make(A) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 12;
    var discom = A.S.discom, scope = discom === 'ALL' ? 'Bihar (NBPDCL and SBPDCL)' : discom;
    var today = new Date(), MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var made = today.getDate() + ' ' + MON[today.getMonth()] + ' ' + today.getFullYear();
    var clean = function (s) { return String(s == null ? '' : s).replace(/−/g, '-').replace(/[^\x20-\x7E -ÿ–—‘’“”•]/g, ''); };
    var signed = function (v) { return v === null || v === undefined ? '-' : v > 0 ? '+' + A.n(v) : v < 0 ? '-' + A.n(-v) : '0'; };
    var title = function (s) { return String(s || '').toLowerCase().replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); }); };

    // ---- cover
    doc.setFillColor.apply(doc, STEEL); doc.rect(0, 0, W, 26, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
    doc.text('Top pendency report', M, 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
    doc.text('New service connections and load change requests  |  ' + scope + '  |  Figures as on ' + (A.asOn || '-') + '  |  Prepared on ' + made, M, 20);

    var y = 34;
    doc.setTextColor.apply(doc, INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5);
    doc.text('Pendency at a glance', M, y);
    var body = [];
    A.REPORTS.forEach(function (rep) {
      (discom === 'ALL' ? ['ALL'].concat(A.DISCOMS) : [discom]).forEach(function (d) {
        var t = A.sumUp(A.scopeRecs(rep, d)); if (!t.lines) return;
        var tr = A.trendRows(rep, d), wk = A.histUnits('week', rep, d), lt = A.histUnits('latest', rep, d), ch = null;
        if (wk && lt && wk.date !== lt.date) { var then = tr.filter(function (x) { return x.date === wk.date; })[0]; if (then) ch = t.pend - then.pend; }
        var pt = A.periodText(rep, d);
        body.push([A.REPORT_NAME[rep], d === 'ALL' ? 'Bihar' : d, (d === 'ALL' && A.mixedPeriods(rep)) ? 'Differs' : /last 1 year/.test(pt) ? 'Last 1 year' : (pt ? 'Since 1 Jan 2020' : '-'), A.n(t.reg), A.n(t.pend), A.pct(A.ratio(t.pend, t.reg)),
          A.kindOf(rep) === 'nsc' ? A.pct(A.ratio(t.out15, t.done)) : '-', A.n(t.hold), A.pct(A.ratio(t.canc, t.reg)), signed(ch)]);
      });
    });
    doc.autoTable({
      startY: y + 3, margin: { left: M, right: M }, theme: 'grid',
      head: [['Report', 'DISCOM', 'Period', 'Registered', 'Pending', 'Pending %', 'Completed after 15 days', 'On hold', 'Cancelled %', 'Change in a week']],
      body: body, styles: tableStyle(), headStyles: headStyle(), columnStyles: rightFrom(3, 10),
      didParseCell: function (h) { if (h.section === 'body' && h.row.raw[1] === 'Bihar') h.cell.styles.fontStyle = 'bold'; }
    });

    y = doc.lastAutoTable.finalY + 9;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor.apply(doc, INK);
    if (y > H - 40) { doc.addPage(); y = 18; }
    doc.text('Review points', M, y); y += 6;
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    A.reviewPoints(discom).forEach(function (p) {
      var lines = doc.splitTextToSize(clean(p.text), W - 2 * M - 46);
      if (y + lines.length * 4.6 > H - 14) { doc.addPage(); y = 18; }
      doc.setTextColor.apply(doc, SLATE); doc.setFontSize(8.5); doc.text(clean(p.tag), M, y);
      var c = p.tone === 'c' ? [180, 35, 24] : p.tone === 'h' ? [181, 71, 8] : p.tone === 'l' ? [43, 122, 75] : STEEL;
      doc.setFillColor.apply(doc, c); doc.rect(M + 40, y - 3.2, 1.2, lines.length * 4.6 - 0.6, 'F');
      doc.setTextColor.apply(doc, INK); doc.setFontSize(10); doc.text(lines, M + 44, y);
      y += lines.length * 4.6 + 2.2;
    });

    // ---- one part per report
    A.REPORTS.forEach(function (rep) {
      var kind = A.kindOf(rep), levels = kind === 'nsc' ? (rep === 'NSC <19 kW' ? ['circle', 'division', 'sub', 'section'] : ['circle', 'division', 'sub']) : ['circle', 'division'];
      levels.forEach(function (lvl, li) {
        var units = A.scored(rep, discom, lvl).filter(function (u) { return u.pend > 0; });
        if (!units.length) return;
        var top = lvl === 'circle' ? units : units.slice(0, 20);
        doc.addPage();
        doc.setFillColor.apply(doc, STEEL); doc.rect(0, 0, W, 4, 'F');
        doc.setTextColor.apply(doc, INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
        var label = { circle: 'Circles', division: 'Divisions', sub: 'Sub-divisions', section: 'Sections' }[lvl];
        doc.text(A.REPORT_NAME[rep] + ': ' + (lvl === 'circle' ? 'all circles' : 'top ' + top.length + ' ' + label.toLowerCase()) + ' by criticality', M, 13);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor.apply(doc, SLATE);
        var t = A.sumUp(A.scopeRecs(rep, discom)), per = A.periodText(rep, discom);
        doc.text(scope + (per ? '  |  ' + per : '') + '  |  ' + A.n(t.pend) + ' pending of ' + A.n(t.reg) + ' registered  |  ' + units.length + ' ' + A.PLURAL[lvl] + ' with pending cases  |  ' +
          'Score: pending 40%, pending % 25%' + (kind === 'nsc' ? ', after 15 days 15%' : '') + ', on hold 10%, weekly growth 10%', M, 19);
        var hasChange = units.some(function (u) { return u.change !== null; });
        var head = ['#', label.replace(/s$/, ''), 'Within', 'Pending', 'Pending %'].concat(kind === 'nsc' ? ['After 15 days'] : []).concat(['On hold', 'Main stage']).concat(hasChange ? ['Week change'] : []).concat(['Score', 'Severity']);
        var sevCol = head.length - 1;
        var rows = top.map(function (u) {
          return [String(u.rank), clean(u.name), clean((discom === 'ALL' ? u.discom + (u.context ? ' / ' : '') : '') + (u.context || (discom === 'ALL' ? '' : u.discom))), A.n(u.pend), A.pct(u.pPend)]
            .concat(kind === 'nsc' ? [A.pct(u.pLate)] : []).concat([A.n(u.hold), clean(u.topStage)]).concat(hasChange ? [signed(u.change)] : []).concat([String(u.score), A.sevName(u.sev)]);
        });
        doc.autoTable({
          startY: 23, margin: { left: M, right: M, top: 14 }, theme: 'grid', head: [head], body: rows,
          styles: tableStyle(), headStyles: headStyle(),
          columnStyles: (function () { var cs = Object.assign(rightFrom(3, head.length - 1), { 0: { halign: 'center', cellWidth: 9 }, 1: { fontStyle: 'bold' } }); cs[head.indexOf('Main stage')] = { halign: 'left' }; cs[sevCol] = { halign: 'center' }; return cs; })(),
          didParseCell: function (h) {
            if (h.section !== 'body') return;
            if (h.column.index === sevCol) { var s = h.cell.raw; h.cell.styles.fillColor = SEV_FILL[s]; h.cell.styles.textColor = SEV_TEXT[s]; h.cell.styles.fontStyle = 'bold'; }
            if (hasChange && h.column.index === head.indexOf('Week change')) { var v = String(h.cell.raw); if (v.charAt(0) === '+') h.cell.styles.textColor = [180, 35, 24]; else if (v.charAt(0) === '-' && v !== '-') h.cell.styles.textColor = [43, 122, 75]; }
          }
        });
      });
      // stage table for the report
      var stages = A.stagesOf(rep), per = (discom === 'ALL' ? A.DISCOMS : [discom]).map(function (d) { return [d, A.sumUp(A.scopeRecs(rep, d))]; });
      var y2 = doc.lastAutoTable.finalY + 8;
      if (y2 > H - 60) { doc.addPage(); y2 = 16; }
      doc.setTextColor.apply(doc, INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
      doc.text(A.REPORT_NAME[rep] + ': pending by stage', M, y2);
      doc.autoTable({
        startY: y2 + 3, margin: { left: M, right: M }, theme: 'grid',
        head: [['Stage', 'Usually with'].concat(per.map(function (x) { return x[0]; })).concat(per.length > 1 ? ['Bihar', 'Share'] : ['Share'])],
        body: stages.map(function (s) {
          var vals = per.map(function (x) { return x[1].st[s[0]] || 0; }), tot = vals.reduce(function (a, b) { return a + b; }, 0);
          var all = per.reduce(function (a, x) { return a + x[1].pend; }, 0);
          return [s[1], s[2]].concat(vals.map(A.n)).concat(per.length > 1 ? [A.n(tot), A.pct(A.ratio(tot, all))] : [A.pct(A.ratio(tot, all))]);
        }),
        styles: tableStyle(), headStyles: headStyle(), columnStyles: rightFrom(2, 6)
      });
    });

    // ---- page numbers
    var pages = doc.getNumberOfPages();
    for (var i = 1; i <= pages; i++) {
      doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor.apply(doc, SLATE);
      doc.text('NSC & Load Change Pendency  |  ' + scope + '  |  Figures as on ' + (A.asOn || '-'), M, H - 6);
      doc.text('Page ' + i + ' of ' + pages, W - M, H - 6, { align: 'right' });
    }
    var file = 'Top_Pendency_Report_' + (discom === 'ALL' ? 'Bihar' : discom) + '_' + String(A.asOn || made).replace(/\s+/g, '-') + '.pdf';
    doc.save(file);
    return file;
  }
  function tableStyle() { return { font: 'helvetica', fontSize: 8.6, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 }, lineColor: LINE, lineWidth: 0.2, textColor: INK, overflow: 'linebreak' }; }
  function headStyle() { return { fillColor: HEAD, textColor: SLATE, fontStyle: 'bold', lineColor: LINE, lineWidth: 0.2 }; }
  function rightFrom(a, b) { var o = {}; for (var i = a; i <= b; i++) o[i] = { halign: 'right' }; return o; }

  window.NSCPdf = { make: make };
})();
