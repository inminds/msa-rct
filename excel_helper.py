"""
excel_helper.py — CLI helper for Node.js to read/write bcoDados.xlsx

Usage:
  python excel_helper.py read          → JSON array of all rows
  python excel_helper.py add NCM1 ...  → add NCMs to col A if not present
"""
import sys
import json
import shutil
import tempfile
import os

EXCEL_PATH = "bcoDados.xlsx"
SHEET_NAME = "Plan1"

# Fixed headers that occupy columns 1-10
FIXED_HEADERS = [
    "NCM", "NCM Econet", "Descrição",
    "PIS Cumulativo", "COFINS Cumulativo",
    "PIS Não Cumulativo", "COFINS Não Cumulativo",
    "Regime", "Legislação", "Observações (Regra Geral)",
]


def _open_wb(path):
    try:
        import openpyxl
        return openpyxl.load_workbook(path)
    except PermissionError:
        tmp = shutil.copy2(path, tempfile.mktemp(suffix=".xlsx"))
        import openpyxl
        return openpyxl.load_workbook(tmp)


def cmd_read():
    if not os.path.exists(EXCEL_PATH):
        print(json.dumps([]))
        return

    wb = _open_wb(EXCEL_PATH)
    ws = wb[SHEET_NAME] if SHEET_NAME in wb.sheetnames else wb.active

    # Build col_map from header row
    headers = {}
    for cell in ws[1]:
        if cell.value:
            headers[cell.column] = str(cell.value).strip()

    ncm_col = None
    for col, h in headers.items():
        if h == "NCM":
            ncm_col = col
            break
    if ncm_col is None:
        ncm_col = 1

    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        ncm_val = row[ncm_col - 1] if len(row) >= ncm_col else None
        if not ncm_val:
            continue
        entry = {}
        for col_idx, h in headers.items():
            val = row[col_idx - 1] if len(row) >= col_idx else None
            entry[h] = str(val).strip() if val is not None else ""
        rows.append(entry)

    print(json.dumps(rows, ensure_ascii=True))


def cmd_add(ncm_codes: list[str]):
    if not os.path.exists(EXCEL_PATH):
        # Create fresh workbook
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = SHEET_NAME
        for i, h in enumerate(FIXED_HEADERS, 1):
            ws.cell(row=1, column=i, value=h)
        existing = set()
    else:
        wb = _open_wb(EXCEL_PATH)
        ws = wb[SHEET_NAME] if SHEET_NAME in wb.sheetnames else wb.active

        # Ensure header row has NCM in col 1
        if ws.cell(row=1, column=1).value != "NCM":
            ws.cell(row=1, column=1, value="NCM")

        # Collect existing NCMs
        existing = set()
        for row in ws.iter_rows(min_row=2, max_col=1, values_only=True):
            if row[0]:
                existing.add(str(row[0]).strip())

    added = []
    for ncm in ncm_codes:
        ncm = str(ncm).strip()
        if ncm and ncm not in existing:
            next_row = ws.max_row + 1
            ws.cell(row=next_row, column=1, value=ncm)
            existing.add(ncm)
            added.append(ncm)

    try:
        wb.save(EXCEL_PATH)
    except PermissionError:
        fallback = "bcoDados_resultado.xlsx"
        wb.save(fallback)
        print(json.dumps({"added": added, "saved_to": fallback}), ensure_ascii=True)
        return

    print(json.dumps({"added": added, "saved_to": EXCEL_PATH}), ensure_ascii=True)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python excel_helper.py read | add NCM1 NCM2 ...", file=sys.stderr)
        sys.exit(1)

    cmd = sys.argv[1].lower()
    if cmd == "read":
        cmd_read()
    elif cmd == "add":
        cmd_add(sys.argv[2:])
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        sys.exit(1)
