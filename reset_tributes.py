import sqlite3
from datetime import datetime

db = sqlite3.connect('./.data/dev.db')
cursor = db.cursor()

# Buscar os IDs dos NCM items pendentes
cursor.execute('''
    SELECT id, ncm_code FROM ncm_items 
    WHERE econet_status = ?
    LIMIT 3
''', ('PENDING',))

ncm_items = cursor.fetchall()
print(f"Encontrados {len(ncm_items)} NCMs PENDING\n")

# Deletar os tributes desses NCMs
for ncm_id, ncm_code in ncm_items:
    cursor.execute('DELETE FROM tributes WHERE ncm_item_id = ?', (ncm_id,))
    print(f"✅ Deletados tributes do NCM {ncm_code}")

db.commit()

# Verificar resultado
cursor.execute('SELECT COUNT(*) FROM ncm_items WHERE econet_status = ?', ('PENDING',))
total_pending = cursor.fetchone()[0]
print(f"\n✅ Total de NCMs PENDING para scan: {total_pending}")

db.close()
