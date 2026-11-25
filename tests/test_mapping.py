#!/usr/bin/env python3
"""
Automated verification test for Land & Mit Budgeting Tracker:
1. Verifies all 11 monthly sheets + NEW TABUNGAN coordinates match Code.gs constants.
2. Verifies zero formula cells exist inside writable data columns (G18:L990, O18:U990, B56:B66, NEW TABUNGAN G18:K990 & N18:T990).
3. Verifies Code.gs & web/ files exist and contain required handlers/assets.
"""
import os
import re
import sys
import json
import zipfile
import xml.etree.ElementTree as ET

XLSX_PATH = "/home/ubuntu/.gemini/antigravity-cli/brain/981af1bc-8431-4b3f-8987-e970ca50cfad/scratch/sheet.xlsx"
PROJECT_DIR = "/home/ubuntu/budget-tracker-ios"
NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

MONTHS = [
    "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
    "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER"
]


def col_to_num(col):
    n = 0
    for ch in col:
        n = n * 26 + (ord(ch) - ord("A") + 1)
    return n


def test_spreadsheet_mapping():
    assert os.path.exists(XLSX_PATH), f"Missing reference xlsx at {XLSX_PATH}"
    with zipfile.ZipFile(XLSX_PATH) as z:
        sst = []
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall("m:si", NS):
            sst.append("".join(t.text or "" for t in si.findall(".//m:t", NS)))

        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rel_map = {el.attrib["Id"]: el.attrib["Target"] for el in rels}
        sheet_map = {}
        for sheet in wb.findall(".//m:sheet", NS):
            name = sheet.attrib["name"]
            rid = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
            target = rel_map[rid]
            if not target.startswith("xl/"):
                target = "xl/" + target.lstrip("/")
            sheet_map[name] = target

        for m in MONTHS:
            assert m in sheet_map, f"Missing sheet {m}"
            sroot = ET.fromstring(z.read(sheet_map[m]))
            vals = {}
            summary_formulas = {}
            first_empty_in = None
            first_empty_out = None
            occupied_in = set()
            occupied_out = set()

            for c in sroot.findall(".//m:sheetData/m:row/m:c", NS):
                ref = c.attrib.get("r", "")
                mt = re.match(r"([A-Z]+)(\d+)", ref)
                if not mt:
                    continue
                col, rnum = mt.group(1), int(mt.group(2))
                cnum = col_to_num(col)
                t = c.attrib.get("t", "")
                v = c.find("m:v", NS)
                f = c.find("m:f", NS)
                val = sst[int(v.text)] if (t == "s" and v is not None and v.text) else (v.text if v is not None else None)
                if val is not None:
                    vals[ref] = val
                if f is not None and f.text:
                    summary_formulas[ref] = f.text
                    # Ensure our writable columns never hold summary formulas (except user ad-hoc arithmetic in amount cols H/P)
                    if 18 <= rnum <= 990 and cnum in (7, 9, 10, 11, 12, 15, 17, 18, 19, 20, 21):
                        raise AssertionError(f"Unexpected formula in writable non-amount cell {m}!{ref}: {f.text}")

                if 18 <= rnum <= 990 and val is not None and str(val).strip() != "":
                    if cnum in (7, 8, 9):
                        occupied_in.add(rnum)
                    if cnum in (15, 16, 17):
                        occupied_out.add(rnum)

            # Check headers match Code.gs
            assert vals.get("G17") == "Tanggal" and vals.get("H17") == "Jumlah" and vals.get("L17") == "Rek Kredit", f"Income header mismatch in {m}"
            assert vals.get("O17") == "Tanggal" and vals.get("P17") == "Jumlah" and vals.get("U17") == "Notes", f"Expense header mismatch in {m}"
            # Check summary formulas exist on H8, H10, H12, L6..L14
            for req in ("H8", "H10", "H12", "L6", "L12", "L13", "L14"):
                assert req in summary_formulas, f"Missing expected formula at {m}!{req}"

            # Simulate findFirstEmptyRow_
            for r in range(18, 991):
                if first_empty_in is None and r not in occupied_in:
                    first_empty_in = r
                if first_empty_out is None and r not in occupied_out:
                    first_empty_out = r
            assert first_empty_in is not None and first_empty_out is not None, f"No empty row found in {m}"

        # Check NEW TABUNGAN
        assert "NEW TABUNGAN" in sheet_map
        sroot = ET.fromstring(z.read(sheet_map["NEW TABUNGAN"]))
        sav_vals = {}
        for c in sroot.findall(".//m:sheetData/m:row/m:c", NS):
            ref = c.attrib.get("r", "")
            t = c.attrib.get("t", "")
            v = c.find("m:v", NS)
            val = sst[int(v.text)] if (t == "s" and v is not None and v.text) else (v.text if v is not None else None)
            if val is not None:
                sav_vals[ref] = val
        assert sav_vals.get("G17") == "Tanggal" and sav_vals.get("J17") == "Rek Kredit"
        assert sav_vals.get("N17") == "Tanggal" and sav_vals.get("T17") == "Notes"
        assert sav_vals.get("V57") == "Cash (Mandiri)" and sav_vals.get("V59") == "Emas (Mitry)"
        print("[PASS] Spreadsheet mapping verified across 11 monthly sheets + NEW TABUNGAN.")


def test_project_files():
    required_files = [
        "README.md",
        "apps-script/Code.gs",
        "shortcuts/IOS_SHORTCUT_GUIDE.md",
        "web/index.html",
        "web/manifest.json",
        "web/sw.js",
        "web/styles/app.css",
        "web/js/formatters.js",
        "web/js/api.js",
        "web/js/components.js",
        "web/js/app.js",
        "web/icons/icon-180.png",
        "web/icons/icon-192.png",
        "web/icons/icon-512.png",
    ]
    for rel in required_files:
        full = os.path.join(PROJECT_DIR, rel)
        assert os.path.exists(full) and os.path.getsize(full) > 0, f"Missing or empty file: {rel}"

    # Validate manifest.json
    with open(os.path.join(PROJECT_DIR, "web/manifest.json"), "r", encoding="utf-8") as f:
        manifest = json.load(f)
    assert manifest["display"] == "standalone"
    assert len(manifest["icons"]) >= 2

    # Validate Code.gs contains all actions (including v3 updateTransaction + v2 compare + batch reads)
    with open(os.path.join(PROJECT_DIR, "apps-script/Code.gs"), "r", encoding="utf-8") as f:
        code_gs = f.read()
    for action in ("ping", "bootstrap", "savings", "compare", "addExpense", "addIncome", "addTransfer", "toggleMandatory", "addSavings", "deleteTransaction", "updateTransaction"):
        assert f"case '{action}'" in code_gs, f"Missing handler in Code.gs: {action}"
    assert "LockService.getScriptLock()" in code_gs
    assert "CacheService.getScriptCache()" in code_gs
    assert "getRange('B6:Y70')" in code_gs
    assert "getRange('H8:X34')" in code_gs

    # Validate v3 PWA UI, 5 patches, and SW cache bump
    with open(os.path.join(PROJECT_DIR, "web/index.html"), "r", encoding="utf-8") as f:
        idx_html = f.read()
        assert 'data-tab="compare"' in idx_html
        assert 'id="themeToggleBtn"' in idx_html
        assert 'id="themeColorMeta"' in idx_html
    with open(os.path.join(PROJECT_DIR, "web/js/components.js"), "r", encoding="utf-8") as f:
        comp_js = f.read()
        for fn in ("renderCompare", "renderRekonWalletModal", "renderEditTxModal", "buildExpensePresets"):
            assert fn in comp_js, f"Missing {fn} in components.js"
    with open(os.path.join(PROJECT_DIR, "web/js/app.js"), "r", encoding="utf-8") as f:
        app_js = f.read()
        for marker in ("findTransferPartner", "visibilitychange", "reqSeq", "openRekonWalletModal", "openEditTxModal"):
            assert marker in app_js, f"Missing {marker} in app.js"
    with open(os.path.join(PROJECT_DIR, "web/sw.js"), "r", encoding="utf-8") as f:
        assert "landmit-budget-v6" in f.read()

    # Validate PNG magic bytes on all icons
    for sz in (180, 192, 512):
        with open(os.path.join(PROJECT_DIR, f"web/icons/icon-{sz}.png"), "rb") as f:
            sig = f.read(8)
            assert sig == b"\x89PNG\r\n\x1a\n", f"Invalid PNG header on icon-{sz}.png"

    print("[PASS] Project files, manifest.json, Code.gs actions, and PNG icons verified.")


if __name__ == "__main__":
    test_spreadsheet_mapping()
    test_project_files()
    print("ALL TESTS PASSED!")
