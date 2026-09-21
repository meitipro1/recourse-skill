# Pay through Recourse

Paying through Recourse means paying the escrow, not the seller, and telling
the seller which payment you are presenting. The seller delivers instantly and
records the response on chain, signed. Nothing about this path runs consensus
on the happy case, so it adds no latency to an honest sale.

## What you need

- A funded Studio Next account. The faucet is programmatic, and the SDK's
  wrapper is the way to call it: a raw JSON-RPC `sim_fundAccount` from
  `urllib` came back `403 Forbidden` while this file was being verified.
  Read your balance before and after; the faucet's own reply is not evidence,
  it has been seen crediting and then erroring. `Chain.fund` below does
  exactly that and prints the difference.

  ```python
  chain.fund(buyer.address, 100 * GEN)                  # amount in wei; prints before -> after
  ```

  Every write on Studio Next carries a fee deposit, refunded at finality for
  what consensus did not spend, so keep a few GEN beyond the payment and the
  bond.
- The seller's address and their promise (`get_seller`).
- A request string that says what you are asking for. It is frozen on chain
  and the judge reads it, so make it the actual request.

`shared/chain.py` mounts the retrying session from `01-what-is-recourse.md`
under the SDK when it is imported. Without it a dropped handshake, which
Studio produces routinely, fails the whole script.

## The call

`pay(seller: str, request: str) -> str`, payable. The return value is the
payment id, `p-000NNN`. Read it from the receipt rather than from `recent(1)`,
which is whichever payment landed last and is not necessarily yours.

```python
import json, os, sys
sys.path.insert(0, "Recourse")                                # a clone of github.com/meitipro/Recourse, see 02
from genlayer_py import create_account
from shared.chain import GEN, Chain, select_network

select_network("studio-next")
ESCROW = "0x3d3fa7Fd2E143C4D6b47D31f15D19B102Ec9e0dA"
SELLER = "0x965c98389197055CFb3FD8b1E3e9a11AE6d40C99"      # the demo seller on this deployment

buyer = create_account(os.environ["RECOURSE_BUYER_KEY"])
chain = Chain(buyer)

promise = chain.read_json(ESCROW, "get_seller", [SELLER])["promise"]
request = "GET /quote?pair=ETH-USD"

paid = chain.send(ESCROW, "pay", [SELLER, request], value=4 * GEN)
pid = paid["result"]             # "p-000012": the contract's return value, read off the receipt
```

Refusals: `unknown seller`, `seller inactive`, `promise not judgeable`,
`zero value`, `request too long` (2000 characters).

## Present it to the seller

Ask the endpoint without paying first; a 402 tells you the scheme and the
header to put the proof in. On x402 that header is `x-payment-proof` and the
proof is the payment id. On an endpoint settling elsewhere the header and the
reference are that rail's own; the contracts never see either.

```python
import urllib.error, urllib.request

ENDPOINT = "http://localhost:4501/quote?pair=ETH-USD"     # the seller's URL

# 1. Ask without paying. A 402 is the expected answer and urllib raises on it.
try:
    urllib.request.urlopen(ENDPOINT, timeout=20)
    raise SystemExit("the endpoint served without payment; nothing to prove")
except urllib.error.HTTPError as challenge:
    assert challenge.code == 402, challenge.code
    offer = json.loads(challenge.read().decode("utf-8"))["accepts"][0]
    header = offer["header"]                          # "x-payment-proof" on x402

# 2. Present the payment id in the header the challenge named.
req = urllib.request.Request(ENDPOINT, headers={header: pid})
with urllib.request.urlopen(req, timeout=20) as response:
    body = response.read().decode("utf-8")           # record THIS string, byte for byte
    signature = response.headers.get("x-response-sig", "")
```

## Record the response

The seller normally records and signs. If the seller has not, you may record
it yourself with an empty signature: the row then shows `recorded_by` as you
and `signed` false, which is visibly a response the seller never stood behind.
Recording is required before a dispute can be opened, and it must happen
inside the window.

```python
chain.send(ESCROW, "record_response", [pid, body, ""])
```

Refusals: `not a party`, `not open`, `response already recorded`,
`empty response`, `window closed`, `response too long` (4000),
`signature too long` (200).

Now go to `04-check-a-response.md` before doing anything else.
