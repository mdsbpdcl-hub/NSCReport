/* NSC & Load Change Report - the page */
(function () {
  'use strict';
  var E = window.NSCEngine;
  var $ = function (id) { return document.getElementById(id); };
  var state = { files: [], busy: false, seq: 0 };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var canPickPlace = typeof window.showSaveFilePicker === 'function';

  // ------------------------------------------------------------ colours
  var THEMES = {
    sky: ['#2f7df6', '#22c1dc'], mint: ['#0a9b85', '#4eb068'],
    sunrise: ['#f0752f', '#f7a531'], lavender: ['#7a65c2', '#e27aab']
  };
  function alpha(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function setTheme(name, keep) {
    if (!THEMES[name]) name = 'sunrise';
    var t = THEMES[name], s = document.documentElement.style;
    s.setProperty('--t1', t[0]); s.setProperty('--t2', t[1]);
    s.setProperty('--t1a', alpha(t[0], 0.16)); s.setProperty('--t2a', alpha(t[1], 0.14)); s.setProperty('--t1s', alpha(t[0], 0.09));
    document.querySelectorAll('.dot').forEach(function (d) { d.setAttribute('aria-pressed', String(d.dataset.theme === name)); });
    if (keep) { try { localStorage.setItem('nscreport-theme', name); } catch (e) { /* the page still works */ } }
  }
  var saved = 'sunrise';
  try { saved = localStorage.getItem('nscreport-theme') || 'sunrise'; } catch (e) { /* ignore */ }
  setTheme(saved, false);
  document.querySelectorAll('.dot').forEach(function (d) { d.addEventListener('click', function () { setTheme(d.dataset.theme, true); }); });

  $('openDash').href = E.WEB_APP_URL;
  $('doneDash').href = E.WEB_APP_URL;

  // ------------------------------------------------------------ log
  var logEmpty = true;
  function say(text, tone) {
    var log = $('log');
    if (logEmpty) { log.innerHTML = ''; logEmpty = false; }
    var li = document.createElement('li');
    if (tone) li.className = tone;
    li.textContent = text;
    log.appendChild(li);
    log.scrollTop = log.scrollHeight;
  }
  function status(text) { $('status').textContent = text || ''; }

  // ------------------------------------------------------------ files
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pendingOf(rep) { return E.tally(rep.kind, rep.rows).pend; }
  var REPORT_ORDER = E.REPORTS;

  // ---- headings matched by hand are remembered on this computer for files laid out the same way
  function layoutKey(err) { return 'nscreport-match:' + err.found.map(function (f) { return E.norm(f.text); }).join('|'); }
  function remembered(err) {
    try { var v = JSON.parse(localStorage.getItem(layoutKey(err)) || 'null'); return v && v.map ? v : null; } catch (e) { return null; }
  }
  function remember(err, choice) { try { localStorage.setItem(layoutKey(err), JSON.stringify(choice)); } catch (e) { /* not kept */ } }

  function parseItem(item, choice) {
    return E.parseReport(window.XLSX, item.name, item.data, choice || undefined);
  }
  function readFile(file, item) {
    return file.arrayBuffer().then(function (buf) {
      item.data = new Uint8Array(buf);
      try { return parseItem(item); }
      catch (err) {
        var saved = err && err.canMatch ? remembered(err) : null;
        if (!saved) throw err;
        try { var rep = parseItem(item, saved); rep.notes.push('The heading matches chosen earlier for this layout were used.'); return rep; }
        catch (e2) { throw err; }
      }
    });
  }

  function addFiles(list) {
    var files = Array.prototype.slice.call(list || []);
    if (!files.length || state.busy) return;
    hideDone();
    var jobs = files.map(function (file) {
      var item = { id: ++state.seq, name: file.name, rep: null, error: null, reading: true };
      state.files = state.files.filter(function (f) { return f.name !== file.name; });   // the same file again replaces the old one
      state.files.push(item);
      return readFile(file, item).then(function (rep) {
        item.rep = rep;
        say(rep.name + ': ' + rep.discom + ' ' + rep.report + ', ' + E.fmtIn(rep.rows.length) + ' rows, ' + E.fmtIn(rep.registered()) + ' registered.');
        rep.notes.forEach(function (n) { say('   ' + n, 'soft'); });
      }).catch(function (err) {
        item.error = (err && err.name === 'ReportError') ? err.message : 'This file could not be read (' + (err && err.message ? err.message : err) + ').';
        item.err = err && err.canMatch ? err : null;
        say(file.name + ': ' + item.error, 'bad');
      }).then(function () { item.reading = false; render(); });
    });
    render();
    Promise.all(jobs).then(render);
  }

  function render() {
    var rows = state.files.slice().sort(function (a, b) {
      if (!a.rep || !b.rep) return (a.rep ? 0 : 1) - (b.rep ? 0 : 1) || a.id - b.id;
      return E.DISCOMS.indexOf(a.rep.discom) - E.DISCOMS.indexOf(b.rep.discom) ||
        REPORT_ORDER.indexOf(a.rep.report) - REPORT_ORDER.indexOf(b.rep.report);
    });
    $('fileBox').hidden = !rows.length;
    $('clearBtn').hidden = !rows.length;
    $('fileRows').innerHTML = rows.map(function (f) {
      var r = f.rep, st;
      if (f.reading) st = '<span class="st wait">Reading</span>';
      else if (f.error) st = '<span class="st bad">Problem</span><div class="why">' + esc(f.error) + '</div>' +
        (f.err ? '<button class="btn grad match-btn" data-match="' + f.id + '">Match the headings</button>' : '');
      else if (r.notes.length) st = '<span class="st note">Ready, ' + r.notes.length + ' note' + (r.notes.length > 1 ? 's' : '') + '</span>' +
        '<ul class="notes">' + r.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';
      else st = '<span class="st ok">Ready</span>';
      return '<tr class="' + (r ? '' : 'norep') + '"><td class="fname">' + esc(f.name) + '</td>' +
        '<td class="c-d">' + (r ? '<span class="chip ' + (r.discom === 'NBPDCL' ? 'nb' : 'sb') + '">' + r.discom + '</span>' : '') + '</td>' +
        '<td class="c-r">' + (r ? esc(r.report) : '') + '</td>' +
        '<td class="r n" data-label="Rows">' + (r ? E.fmtIn(r.rows.length) : '') + '</td>' +
        '<td class="r n" data-label="Registered">' + (r ? E.fmtIn(r.registered()) : '') + '</td>' +
        '<td class="r n" data-label="Pending">' + (r ? E.fmtIn(pendingOf(r)) : '') + '</td>' +
        '<td class="c-s">' + st + '</td>' +
        '<td><button class="x" data-id="' + f.id + '" title="Remove this file" aria-label="Remove ' + esc(f.name) + '">&times;</button></td></tr>';
    }).join('');

    var good = state.files.filter(function (f) { return f.rep; }), bad = state.files.filter(function (f) { return f.error; });
    $('tFiles').textContent = E.fmtIn(good.length);
    var ds = E.DISCOMS.filter(function (d) { return good.some(function (f) { return f.rep.discom === d; }); });
    $('tDiscoms').textContent = ds.length ? ds.join(' + ') : 'None yet';
    $('tRows').textContent = E.fmtIn(good.reduce(function (s, f) { return s + f.rep.rows.length; }, 0));
    $('tBad').textContent = bad.length;
    document.querySelector('.t-d').classList.toggle('clear', !bad.length);

    var ends = good.map(function (f) { return f.rep.periodTo; }).filter(Boolean);
    var last = ends.sort(function (a, b) { return toDate(a) - toDate(b); }).pop();
    $('asOn').textContent = last ? 'As on ' + last.replace(/-/g, ' ') : 'NBPDCL and SBPDCL: Excel report and dashboard update';
    if (!nameTouched) $('outName').value = 'NSC_Load_Change_Report_' + (last || today()) + '.xlsx';
    var busyOrEmpty = state.busy || !state.files.length;
    $('withBtn').disabled = busyOrEmpty; $('withoutBtn').disabled = busyOrEmpty;
  }
  function toDate(s) {
    var m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s || '');
    return m ? new Date(+m[3], MONTHS.indexOf(m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase()), +m[1]).getTime() : 0;
  }
  function today() { var d = new Date(); return ('0' + d.getDate()).slice(-2) + '-' + MONTHS[d.getMonth()] + '-' + d.getFullYear(); }

  var nameTouched = false;
  $('outName').addEventListener('input', function () { nameTouched = true; });
  $('saveHint').textContent = canPickPlace
    ? 'You will be asked where to save the report.'
    : 'The report goes to your Downloads folder.';

  $('fileInput').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
  var drop = $('drop');
  ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { addFiles(e.dataTransfer && e.dataTransfer.files); });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); });
  $('fileRows').addEventListener('click', function (e) {
    var m = e.target.closest('[data-match]');
    if (m && !state.busy) { openMatch(state.files.filter(function (f) { return String(f.id) === m.dataset.match; })[0]); return; }
    var b = e.target.closest('.x');
    if (!b || state.busy) return;
    state.files = state.files.filter(function (f) { return String(f.id) !== b.dataset.id; });
    hideDone(); render();
  });
  $('clearBtn').addEventListener('click', function () {
    if (state.busy) return;
    state.files = []; hideDone(); render(); say('The list was cleared.', 'soft');
  });

  // ------------------------------------------------------------ matching headings by hand
  var matching = null;
  function openMatch(item) {
    if (!item || !item.err) return;
    var err = item.err;
    matching = { item: item, err: err };
    $('mapSub').textContent = item.name + ': for each heading below, choose the heading in the file that holds those figures.';
    $('mapKindRow').hidden = !!err.kind;
    $('mapKind').value = err.kind || '';
    $('mapErr').hidden = true;
    drawMatchList();
    $('mapScrim').hidden = false;
    setTimeout(function () { var f = $('mapForm').querySelector('select:not([hidden])'); if (f) f.focus(); }, 30);
  }
  function neededHeadings(err, kind) {
    if (!kind) return [];
    if (err.kind === kind && err.missing) return err.missing;
    var have = err.found.map(function (f) { return E.canonical(f.text); });
    return err.needs[kind].filter(function (n) { return have.indexOf(n) < 0; });
  }
  function drawMatchList() {
    var err = matching.err, kind = $('mapKind').value || err.kind;
    var need = neededHeadings(err, kind);
    var opts = err.found.map(function (f) {
      return '<option value="' + f.index + '">' + esc(f.text) + (f.sample !== '' ? '  (first row: ' + esc(f.sample) + ')' : '') + '</option>';
    }).join('');
    $('mapList').innerHTML = !kind ? '' : need.length ? need.map(function (n, i) {
      return '<div class="map-row"><label for="mp' + i + '">' + esc(n) + '</label>' +
        '<select id="mp' + i + '" data-std="' + esc(n) + '"><option value="">Choose</option>' + opts + '</select></div>';
    }).join('') : '<p>All headings for this report were found. Press "Use these headings" to read the file again.</p>';
  }
  $('mapKind').addEventListener('change', drawMatchList);
  function closeMatch() { $('mapScrim').hidden = true; matching = null; }
  $('mapCancel').addEventListener('click', closeMatch);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && matching) closeMatch(); });
  $('mapForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = matching.err, item = matching.item, kind = $('mapKind').value || err.kind, map = {}, used = {}, problem = '';
    if (!kind) problem = 'Say which report this file is.';
    $('mapList').querySelectorAll('select').forEach(function (s) {
      if (problem) return;
      if (s.value === '') problem = 'Choose a heading for ' + s.dataset.std + '.';
      else if (used[s.value]) problem = 'The same heading is chosen for ' + used[s.value] + ' and ' + s.dataset.std + '.';
      else { used[s.value] = s.dataset.std; map[s.dataset.std] = Number(s.value); }
    });
    if (problem) { $('mapErr').textContent = problem; $('mapErr').hidden = false; return; }
    var choice = { map: map, kind: kind };
    try {
      var rep = parseItem(item, choice);
      item.rep = rep; item.error = null; item.err = null;
      remember(err, choice);
      say(rep.name + ': read with headings matched by hand. ' + rep.discom + ' ' + rep.report + ', ' + E.fmtIn(rep.rows.length) +
        ' rows, ' + E.fmtIn(rep.registered()) + ' registered.', 'good');
      closeMatch(); hideDone(); render();
    } catch (e2) {
      $('mapErr').textContent = 'The file still cannot be read with these choices:\n' + (e2 && e2.message ? e2.message : e2);
      $('mapErr').hidden = false;
    }
  });

  // ------------------------------------------------------------ password
  function askPassword(again) {
    return new Promise(function (resolve) {
      var scrim = $('pwScrim'), input = $('pwInput'), sub = $('pwSub');
      $('pwTitle').textContent = again ? 'The password was not accepted' : 'Type the upload password';
      sub.textContent = again ? 'Type it again. It is used for this update only and is not kept anywhere.'
        : 'It is used for this update only and is not kept anywhere.';
      sub.className = again ? 'again' : '';
      input.value = '';
      scrim.hidden = false;
      setTimeout(function () { input.focus(); }, 30);
      function finish(value) {
        scrim.hidden = true; input.value = '';
        $('pwForm').removeEventListener('submit', onSubmit);
        $('pwCancel').removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKey);
        resolve(value);
      }
      function onSubmit(e) { e.preventDefault(); var v = input.value; if (v) finish(v); }
      function onCancel() { finish(null); }
      function onKey(e) { if (e.key === 'Escape') finish(null); }
      $('pwForm').addEventListener('submit', onSubmit);
      $('pwCancel').addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey);
    });
  }

  // ------------------------------------------------------------ the two buttons
  function setBusy(flag, text) {
    state.busy = flag;
    $('progress').hidden = !flag;
    if (text !== undefined) status(text);
    render();
  }
  function hideDone() { $('doneCard').hidden = true; }
  function showDone(ok, title, text, withLink) {
    var c = $('doneCard');
    c.hidden = false; c.classList.toggle('bad', !ok);
    c.querySelector('.done-ico').innerHTML = ok
      ? '<svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>';
    $('doneTitle').textContent = title; $('doneSub').textContent = text;
    $('doneDash').hidden = !withLink;
    $('tabSend').hidden = true;
    c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function saveBlob(blob, name, handle) {
    if (handle) {
      return handle.createWritable().then(function (w) { return w.write(blob).then(function () { return w.close(); }); })
        .then(function () { return handle.name; });
    }
    var a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    return Promise.resolve(name);
  }

  function start(update) {
    if (state.busy) return;
    hideDone();
    if (state.files.some(function (f) { return f.reading; })) { alertMsg('The files are still being read. Try again in a moment.'); return; }
    var reps = state.files.filter(function (f) { return f.rep; }).map(function (f) { return f.rep; });
    var bad = state.files.filter(function (f) { return f.error; });
    if (!state.files.length) { alertMsg('Choose the report files first.'); return; }
    if (bad.length) { alertMsg(bad.length + ' chosen file(s) have a problem and are shown in red. Remove them or choose correct files, then try again.'); return; }
    var name = $('outName').value.trim().replace(/[\\/:*?"<>|]/g, '-');
    if (!name) { alertMsg('Give the report a file name.'); return; }
    if (!/\.xlsx$/i.test(name)) { name += '.xlsx'; $('outName').value = name; }
    var set = E.checkSet(reps);
    if (set.problems.length) { set.problems.forEach(function (p) { say(p, 'bad'); }); alertMsg(set.problems.join('\n')); return; }

    var placeStep = canPickPlace
      ? window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Excel report', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }] })
        .catch(function (err) { if (err && err.name === 'AbortError') return 'cancel'; return null; })
      : Promise.resolve(null);

    placeStep.then(function (handle) {
      if (handle === 'cancel') { status('Stopped: no place was chosen for the report.'); return; }
      var pw = update ? askPassword(false) : Promise.resolve(null);
      return pw.then(function (password) {
        if (update && !password) { status('Stopped: no password was given.'); return; }
        set.notes.forEach(function (n) { say(n, 'soft'); });
        setBusy(true, 'Working');
        return work(reps, name, handle, password);
      });
    });
  }

  function work(reps, name, handle, password) {
    say('Making the Excel report');
    status('Making the Excel report');
    var book;
    try { book = E.makeWorkbook(window.ExcelJS, reps); }
    catch (err) { return finishFail('The report could not be made (' + (err.message || err) + ').'); }
    return book.xlsx.writeBuffer().then(function (buf) {
      var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      return saveBlob(blob, name, handle);
    }).then(function (savedAs) {
      say('Report saved: ' + savedAs + (handle ? '' : ' (in your Downloads folder)'), 'good');
      if (password === null) {
        setBusy(false, 'The Excel report is ready. The dashboard was not changed.');
        showDone(true, 'The Excel report is ready', savedAs + ' is saved. The dashboard was not changed.', false);
        return;
      }
      return send(reps, password, savedAs);
    }, function (err) {
      return finishFail('The report could not be saved (' + (err && err.message ? err.message : err) + '). Close the file if it is open in Excel, or choose another place.');
    });
  }

  function send(reps, password, savedAs) {
    return E.upload(reps, password, { say: function (t) { say(t); status(t); } }).then(function (done) {
      var text = 'The Excel report is ready and the dashboard is updated for ' + done.join(' and ') + '.';
      say(text, 'good');
      setBusy(false, text);
      showDone(true, 'Dashboard updated', savedAs + ' is saved, and the dashboard now shows these figures for ' + done.join(' and ') + '.', true);
      try { window.open(E.WEB_APP_URL, '_blank', 'noopener'); } catch (e) { /* the button is there */ }
    }).catch(function (err) {
      if (err && err.code === 'PASSWORD') {
        say(err.message || 'The password was not accepted.', 'bad');
        status('The password was not accepted.');
        $('progress').hidden = true;
        return askPassword(true).then(function (again) {
          if (!again) {
            setBusy(false, 'The Excel report is saved. The dashboard was not updated.');
            showDone(false, 'The dashboard was not updated', savedAs + ' is saved. No password was given, so the dashboard was left as it was.', false);
            return;
          }
          $('progress').hidden = false;
          return send(reps, again, savedAs);
        });
      }
      var msg = err && err.message ? err.message : String(err);
      say(msg, 'bad');
      setBusy(false, 'The Excel report is saved. The dashboard was not updated.');
      if (err && err.code === 'NET') {
        showDone(false, 'The dashboard could not be reached directly', savedAs + ' is saved. Nothing on the dashboard was changed.\n' +
          'The update can still go through a new tab: press the button. The password you typed is used once more and then forgotten.', false);
        pendingTab = { reps: reps, password: password };
        $('tabSend').hidden = false;
      } else {
        showDone(false, 'The dashboard was not updated', savedAs + ' is saved.\n' + msg, false);
      }
    });
  }

  var pendingTab = null;
  $('tabSend').addEventListener('click', function () {
    if (!pendingTab) return;
    var f = document.createElement('form');
    f.method = 'post'; f.action = E.WEB_APP_URL; f.target = '_blank'; f.acceptCharset = 'utf-8'; f.hidden = true;
    var p = document.createElement('textarea'); p.name = 'payload'; p.value = E.browserBatch(pendingTab.reps);
    var w = document.createElement('input'); w.type = 'hidden'; w.name = 'password'; w.value = pendingTab.password;
    f.appendChild(p); f.appendChild(w); document.body.appendChild(f);
    f.submit();
    f.remove(); pendingTab = null;
    $('tabSend').hidden = true;
    say('The update was sent through a new tab. The result shows in that tab.', 'good');
    $('doneTitle').textContent = 'Sent through a new tab';
    $('doneSub').textContent = 'See the new tab for the result. If it says the dashboard is updated, you are done.';
  });

  function finishFail(text) {
    say(text, 'bad');
    setBusy(false, 'Stopped.');
    showDone(false, 'Stopped', text, false);
  }
  function alertMsg(text) { window.alert(text); }

  $('withBtn').addEventListener('click', function () { start(true); });
  $('withoutBtn').addEventListener('click', function () { start(false); });
  render();
})();
