# Read a verdict

Two things are true about a Recourse transaction that are not true of most:
ACCEPTED is not SUCCEEDED, and the verdict is not the settlement.

**ACCEPTED means a committee agreed on the receipt.** The receipt can be a
refusal. Every refusal in the README is an ACCEPTED transaction with an
execution result of ERROR, and reading only the status would call each of them
a success.

**The verdict is written to the case; the settlement is a separate message.**
The payment's `status` stays 2 (disputed) after the case row exists, and
becomes 3 (resolved) only when `settle` has run. On studionet, the first
deployment, it did, about thirty seconds after the verdict. On Studio Next it
does not: consensus v0.6 funds a value transfer only from the top of the
transaction, and `settle`'s transfers sit two messages down, so the payment
stays disputed with the verdict on its case and the escrow holding the
payment and the bond. Poll the case for the verdict, and read the payment for
where the money is.

## Poll

```python
import json, time
from genlayer_py import create_account, create_client
from genlayer_py.chains import studio_devnet

studio_devnet.rpc_urls = {"default": {"http": ["https://studio-next.genlayer.com/api"]}}
ESCROW = "0x3d3fa7Fd2E143C4D6b47D31f15D19B102Ec9e0dA"
DISPUTE = "0xba5f285FdB14E3e1d130b3C9346728aBfEC479f4"
STATUS = ["open", "withdrawn", "disputed", "resolved"]
VERDICT = ["pending", "honored", "not_honored", "unclear"]

# The SDK wants a sender address even for a read. A throwaway key holds
# nothing and signs nothing; your real key works too and is never needed here.
reader = create_account()
client = create_client(chain=studio_devnet, account=reader)


def read(address, method, args):
    return json.loads(client.read_contract(address=address, function_name=method, args=args, account=reader))


case = {}
deadline = time.time() + 240
while time.time() < deadline:
    try:
        case = read(DISPUTE, "get_case", [pid])   # "[EXPECTED] unknown case" until adjudicate has written one
    except Exception:
        case = {}
    if case.get("verdict"):
        break
    time.sleep(5)                            # Studio allows ~30 requests a minute

payment = read(ESCROW, "get_payment", [pid])
print(VERDICT[case.get("verdict", 0)], STATUS[payment["status"]])
# "not_honored disputed": judged, and on this runtime the escrow still holds the payment and the bond
```

## Read the case

```python
case = read(DISPUTE, "get_case", [pid])
# {
#   "pid": "p-000003",
#   "promise": "...", "request": "...", "response": "...",
#   "timing": "Request recorded on chain at 2026-09-05T20:18:32Z. Response recorded on chain at 2026-09-05T20:18:43Z.",
#   "verdict": 2, "verdict_name": "not_honored",
#   "reason": "Response timestamp ... far exceeding the 5-second freshness bound stated in the PROMISE.",
#   "opened_at": 1788639536, "decided_at": 1788639536
# }
```

`opened_at` and `decided_at` are one message's fixed datetime and are always
equal. Chain timestamps cannot tell you how long judgment took; only a wall
clock beside the transaction can.

## Read a receipt honestly

The refusal text is not in stderr, which is always empty. It is here:

```python
def execution(receipt):
    """('return', value) or ('rollback', '[EXPECTED] reason')."""
    leader = receipt["consensus_data"]["leader_receipt"]
    result = (leader[0] if isinstance(leader, list) else leader)["result"]
    status = str(result.get("status", "")).lower()
    payload = result.get("payload")
    if status == "return" and isinstance(payload, dict) and "readable" in payload:
        return status, json.loads(payload["readable"])
    return status, payload
```

## Cite it

A case is cited as `RC-<year decided>-<zero padded id>`: payment `p-000043`
decided in 2026 is `RC-2026-0043`. The site, the bot and the MCP server all
accept either form and print the citation.

```python
def citation(pid, decided_at):
    import datetime
    year = datetime.datetime.fromtimestamp(decided_at, datetime.timezone.utc).year
    return f"RC-{year}-{int(pid.split('-')[1]):04d}"
```
