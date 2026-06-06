import re

with open('src/pages/admin/CenterStress.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace(r'\', '')

with open('src/pages/admin/CenterStress.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
