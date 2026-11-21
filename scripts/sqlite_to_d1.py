#!/usr/bin/env python3
"""
Export the laptop SQLite database (prisma/dev.db) to a SQL file that can be loaded into Cloudflare D1.

  python3 scripts/sqlite_to_d1.py export  <path/to/dev.db> <output.sql>
  python3 scripts/sqlite_to_d1.py fingerprint <path/to/dev.db>

- Opens the source database READ-ONLY. It never modifies your data.
- Emits only INSERT statements for the four existing tables (the schema comes from migrations/).
- Values are copied exactly (dates stay integer milliseconds). No transactions/PRAGMAs, which D1 rejects.
- The output file contains customer data: keep it out of git (data-export/ is git-ignored) and delete it after import.
"""
import sqlite3
import sys
from pathlib import Path

TABLES = ["current_inventory", "resellers", "orders", "stock_movement_history"]
ROWS_PER_INSERT = 25  # keeps every statement well under D1's statement size limit


def connect(path: str) -> sqlite3.Connection:
    p = Path(path)
    if not p.is_file() or p.stat().st_size == 0:
        sys.exit(f"Database not found or empty: {path}  (the real data is usually prisma/dev.db)")
    return sqlite3.connect(f"file:{p.resolve()}?mode=ro", uri=True)


def literal(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, bytes):
        return "X'" + v.hex() + "'"
    return "'" + str(v).replace("'", "''") + "'"


def export(db_path: str, out_path: str) -> None:
    con = connect(db_path)
    if con.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
        sys.exit("Source database failed integrity_check; stop and investigate before migrating.")
    lines = ["-- Jentis Kitchen data export for D1. Contains customer data: do not commit.", ""]
    for table in TABLES:
        cols = [r[1] for r in con.execute(f'PRAGMA table_info("{table}")')]
        col_sql = ", ".join(f'"{c}"' for c in cols)
        rows = con.execute(f'SELECT {col_sql} FROM "{table}" ORDER BY rowid').fetchall()
        for i in range(0, len(rows), ROWS_PER_INSERT):
            chunk = rows[i : i + ROWS_PER_INSERT]
            values = ",\n  ".join("(" + ", ".join(literal(v) for v in row) + ")" for row in chunk)
            lines.append(f'INSERT INTO "{table}" ({col_sql}) VALUES\n  {values};')
        print(f"{table}: {len(rows)} rows")
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")


def fingerprint(db_path: str) -> None:
    con = connect(db_path)
    con.row_factory = sqlite3.Row
    sql = (Path(__file__).parent / "reconcile.sql").read_text()
    row = con.execute(sql).fetchone()
    for k in row.keys():
        print(f"{k}: {row[k]}")


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "export":
        export(sys.argv[2], sys.argv[3])
    elif len(sys.argv) == 3 and sys.argv[1] == "fingerprint":
        fingerprint(sys.argv[2])
    else:
        sys.exit(__doc__)
