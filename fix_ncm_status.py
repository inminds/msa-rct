import sqlite3

db = sqlite3.connect('./.data/dev.db')
cursor = db.cursor()

# Mudar todos os NCMs com status ERROR para PENDING
cursor.execute('''
    UPDATE ncm_items 
    SET econet_status = 'PENDING'
    WHERE econet_status = 'ERROR'
''')

db.commit()

# Verificar resultado
cursor.execute('SELECT COUNT(*) FROM ncm_items WHERE econet_status = ?', ('PENDING',))
total_pending = cursor.fetchone()[0]

cursor.execute('SELECT ncm_code FROM ncm_items WHERE econet_status = ?', ('PENDING',))
pending_ncms = cursor.fetchall()

print(f"✅ Total de NCMs agora marcados como PENDING: {total_pending}\n")
print("NCMs PENDING para scan:")
for ncm in pending_ncms:
    print(f"  - {ncm[0]}")

db.close()
