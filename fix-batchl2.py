#!/usr/bin/env python3
fp = '/home/gorcore/Drift-Clone/dlob-server/lib/index.js'
with open(fp) as f:
    lines = f.readlines()

q = chr(34)  # double quote

new_block = []
new_block.append('          } else {\n')
new_block.append('            console.log(' + q + 'No L2 in redis for batchL2 ' + q + ' + (0, import_sdk2.getVariant)(normedMarketType) + ' + q + ' market ' + q + ' + normedMarketIndex + ' + q + ', computing from DLOB...' + q + ');\n')
new_block.append('            try {\n')
new_block.append('              var batchL2Result = dlobSubscriber.getL2({\n')
new_block.append('                marketIndex: normedMarketIndex,\n')
new_block.append('                marketType: normedMarketType,\n')
new_block.append('                depth: depth2 || 10,\n')
new_block.append('                includeVamm: true,\n')
new_block.append('                numVammOrders: 10\n')
new_block.append('              });\n')
new_block.append('              var batchBids = (batchL2Result.bids || []).map(function(b) { return { price: b.price.toString(), size: b.size.toString() }; });\n')
new_block.append('              var batchAsks = (batchL2Result.asks || []).map(function(a) { return { price: a.price.toString(), size: a.size.toString() }; });\n')
new_block.append('              var batchOracleData = isSpot ? driftClient.getOracleDataForSpotMarket(normedMarketIndex) : driftClient.getOracleDataForPerpMarket(normedMarketIndex);\n')
new_block.append('              l2Formatted = {\n')
new_block.append('                bids: batchBids,\n')
new_block.append('                asks: batchAsks,\n')
new_block.append('                marketType: normedMarketType,\n')
new_block.append('                marketIndex: normedMarketIndex,\n')
new_block.append('                marketName: void 0,\n')
new_block.append('                slot: batchL2Result.slot || dlobProvider.getSlot(),\n')
new_block.append('                oracle: batchOracleData.price.toNumber(),\n')
new_block.append('                oracleData: {\n')
new_block.append('                  price: batchOracleData.price.toNumber(),\n')
new_block.append('                  slot: batchOracleData.slot.toNumber(),\n')
new_block.append('                  confidence: batchOracleData.confidence.toNumber(),\n')
new_block.append('                  hasSufficientNumberOfDataPoints: true,\n')
new_block.append('                  twap: batchOracleData.twap ? batchOracleData.twap.toNumber() : undefined,\n')
new_block.append('                  twapConfidence: batchOracleData.twapConfidence ? batchOracleData.twapConfidence.toNumber() : undefined\n')
new_block.append('                },\n')
new_block.append('                ts: Date.now(),\n')
new_block.append('                marketSlot: batchL2Result.slot || dlobProvider.getSlot()\n')
new_block.append('              };\n')
new_block.append('            } catch (batchL2Err) {\n')
new_block.append('              console.log(' + q + 'Error computing batchL2 from DLOB: ' + q + ' + batchL2Err.message);\n')
new_block.append('              var oracleData = isSpot ? driftClient.getOracleDataForSpotMarket(normedMarketIndex) : driftClient.getOracleDataForPerpMarket(normedMarketIndex);\n')
new_block.append('              l2Formatted = {\n')
new_block.append('                bids: [],\n')
new_block.append('                asks: [],\n')
new_block.append('                marketType: normedMarketType,\n')
new_block.append('                marketIndex: normedMarketIndex,\n')
new_block.append('                marketName: void 0,\n')
new_block.append('                slot: dlobProvider.getSlot(),\n')
new_block.append('                oracle: oracleData.price.toNumber(),\n')
new_block.append('                oracleData: {\n')
new_block.append('                  price: oracleData.price.toNumber(),\n')
new_block.append('                  slot: oracleData.slot.toNumber(),\n')
new_block.append('                  confidence: oracleData.confidence.toNumber(),\n')
new_block.append('                  hasSufficientNumberOfDataPoints: true,\n')
new_block.append('                  twap: oracleData.twap ? oracleData.twap.toNumber() : undefined,\n')
new_block.append('                  twapConfidence: oracleData.twapConfidence ? oracleData.twapConfidence.toNumber() : undefined\n')
new_block.append('                },\n')
new_block.append('                ts: Date.now(),\n')
new_block.append('                marketSlot: dlobProvider.getSlot()\n')
new_block.append('              };\n')
new_block.append('            }\n')
new_block.append('          }\n')

# First, we need to find where the batchL2 else block starts
# After the previous bad patch, line numbers may have shifted
# Let's search for the pattern
target_start = None
for i in range(474200, min(474300, len(lines))):
    stripped = lines[i].strip()
    if stripped == '} else {' and i > 474210:
        # Check if next lines contain 'No L2' or 'batchL2'
        next_lines = ''.join(lines[i+1:i+5])
        if 'No L2' in next_lines or 'batchL2' in next_lines or 'normedMarketType' in next_lines:
            target_start = i
            break

if target_start is None:
    # Fallback: search more broadly
    for i in range(474180, min(474350, len(lines))):
        if 'No L2' in lines[i] and 'batchL2' in lines[i]:
            # Found the console.log line, go back to find } else {
            for j in range(i, max(i-5, 0), -1):
                if lines[j].strip() == '} else {':
                    target_start = j
                    break
            break

if target_start is None:
    print('ERROR: Could not find batchL2 else block')
    import sys
    sys.exit(1)

# Find the end of the else block - look for the closing }
# We need to count braces
brace_count = 0
target_end = None
for i in range(target_start, min(target_start + 60, len(lines))):
    for c in lines[i]:
        if c == '{':
            brace_count += 1
        elif c == '}':
            brace_count -= 1
            if brace_count == 0:
                target_end = i + 1
                break
    if target_end is not None:
        break

if target_end is None:
    print('ERROR: Could not find end of batchL2 else block')
    import sys
    sys.exit(1)

print(f'Replacing lines {target_start+1} through {target_end} (0-indexed {target_start}:{target_end})')
print(f'Old block ({target_end - target_start} lines):')
for line in lines[target_start:target_end]:
    print('  ', repr(line[:80]))

lines[target_start:target_end] = new_block

with open(fp, 'w') as f:
    f.writelines(lines)

print(f'Done - wrote {len(new_block)} new lines replacing {target_end - target_start} old lines')
