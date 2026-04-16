import sqlite3
from datetime import datetime

db = sqlite3.connect('./.data/dev.db')
cursor = db.cursor()

# Buscar os NCMs existentes
cursor.execute('SELECT id, ncm_code, description, econet_status FROM ncm_items LIMIT 5')
rows = cursor.fetchall()

print("NCMs encontrados no banco:")
for row in rows:
    print(f"  ID: {row[0]}, NCM: {row[1]}, Desc: {row[2]}, Status: {row[3]}")

# NCMs já estão PENDING! Vamos rescan-los
cursor.execute('SELECT COUNT(*) FROM ncm_items WHERE econet_status = ?', ('PENDING',))
count = cursor.fetchone()[0]
print(f"\n✅ {count} NCMs já estão marcados como 'PENDING' para scan")

cursor.execute('SELECT ncm_code FROM ncm_items WHERE econet_status = ?', ('PENDING',))
pending_ncms = cursor.fetchall()
print("\nNCMs marcados como PENDING:")
for ncm in pending_ncms:
    print(f"  - {ncm[0]}")

db.close()
