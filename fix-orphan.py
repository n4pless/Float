#!/usr/bin/env python3
fp = '/home/gorcore/Drift-Clone/dlob-server/lib/index.js'
with open(fp) as f:
    lines = f.readlines()

# Lines 474278-474300 are orphaned remnants from a bad patch
# Lines 474301-474303 are orphaned cache counter fragment
# We need to delete 474278-474303 and insert proper if(l2Formatted) block

# Verify we're looking at the right thing
line_278 = lines[474278-1].strip()
line_300 = lines[474300-1].strip()
line_301 = lines[474301-1].strip()
print(f'Line 474278: {line_278[:60]}')
print(f'Line 474300: {line_300[:60]}')
print(f'Line 474301: {line_301[:60]}')

# Delete lines 474278-474303 (indices 474277 through 474302)
# and replace with proper if(l2Formatted) block
q = chr(34)
replacement = [
    '          if (l2Formatted) {\n',
    '            cacheHitCounter.add(1, {\n',
]

lines[474277:474303] = replacement

with open(fp, 'w') as f:
    f.writelines(lines)

print('Done - removed orphaned lines and added if(l2Formatted) block')
