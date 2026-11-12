# NSC & Load Change Report

A web page that turns the NSC and Load Change status reports of NBPDCL and SBPDCL into one Excel report and, if asked, updates the dashboard. It does the same job as the desktop app (`nsc_report_app.py`, version 1.1), but nothing needs to be installed.

**Open it:** https://mdsbpdcl-hub.github.io/nscreport/

## How to use

1. Drop all the report files onto the page, or pick them (.xlsx or .csv, NSC below 19 kW, NSC 19 to 59 kW and Load Change, for one DISCOM or both).
2. Check the list. Files marked in red have a problem, and the reason is shown.
   If a heading cannot be found, press **Match the headings** and choose which heading in the file holds those figures. A sample figure is shown beside each choice. The choice is remembered on that computer for files laid out the same way.
3. Press one of the two buttons:
   - **Create report with dashboard update**: makes the Excel report, asks for the upload password, checks both DISCOMs with the dashboard, and only then writes them.
   - **Create report without dashboard update**: makes the Excel report only.

In Chrome and Edge you are asked where to save the report. Other browsers save it to the Downloads folder.

## Privacy and safety

- The files are read inside the browser. Nothing leaves the computer except the figures sent to the dashboard when you choose to update it.
- The upload password is typed each time. It is not stored in the page, in the browser or in this repository.
- The dashboard checks the password and every figure again before writing anything. If any check fails, nothing is changed.
- If the dashboard cannot be reached directly, the page offers to send the same update through a new tab.

## Checks on every file

- All headings are present. Small changes in wording are accepted, and anything else can be matched by hand.
- Serial numbers run 1, 2, 3 … with none missing.
- Every figure is a whole number, zero or more. An empty cell is taken as 0.
- One DISCOM per file, NBPDCL or SBPDCL.
- The rows add up to the file's own Grand Total line, where the file has one.

## Files

| Path | What it is |
|---|---|
| `index.html`, `css/style.css` | The page |
| `js/app.js` | What the page does |
| `js/engine.js` | Reading, checking and adding up the files, the Excel report, the dashboard update |
| `js/vendor/` | SheetJS (reading Excel) and ExcelJS (writing Excel), with their licences |

To point the page at a different dashboard, change `WEB_APP_URL` near the top of `js/engine.js`.
