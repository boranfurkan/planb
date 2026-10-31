import json,sys
for line in open(sys.argv[1]):
    if not line.strip(): continue
    e=json.loads(line); t=e['type']
    if t=='agent': print(f"\n### {e['name']}")
    elif t=='call': print(f"  -> {e['name']} {json.dumps(e['args'])[:200]}")
    elif t=='result': print(f"  <- {e['name']} {str(e['result'])[:150]}")
    elif t=='output': print(f"  [out] {e['text'][:600]}")
    elif t=='plan': print("  PLAN:", json.dumps(e['plan'], indent=1)[:3000])
    elif t=='text': print("  TEXT:", e['text'][:400])
    else: print(" ", e)
