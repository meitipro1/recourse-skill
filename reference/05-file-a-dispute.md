# File a dispute

You have run the checks in `04`, `contestable` is `True`, the response is
recorded, and `window_ends` is still ahead of the chain's clock. Now, and only
now, post the bond.

## What happens

`open_dispute(pid: str)`, payable, value exactly the bond (1 GEN on this
deployment, read `stats()["bond_amount"]` rather than assuming). The escrow
marks the payment DISPUTED, sets `dispute_ends` one hour out, and emits
`adjudicate` to the dispute contract. The dispute contract asks the question
in both presentation orders inside one consensus round, writes the verdict to
the case, and emits `settle` back. On Studio Next the verdict is written to
the case about forty seconds after the dispute is accepted (a median of 37 s
over the record), and the settlement `settle` emits is never funded:
consensus v0.6 funds a value transfer only from the top of the transaction,
and this one sits two messages down. So the escrow keeps the payment and the
bond, the verdict is the outcome, and `06-read-a-verdict.md` reads it from
the case. On studionet, the first deployment, the same path returned the
money about thirty seconds after the verdict; that is on the record, not
somewhere to file.

Neither party writes the timing block. The escrow builds it from the chain's
own record of when the request and the response were recorded, so neither
party can move the boundary they are judged against.

## The call

The fee deposit for `open_dispute` has to fund `adjudicate` and, below it,
`settle`, which Studio's own estimate does not see; `shared/chain.py`
allocates both, so the call goes through it.

```python
import os, sys
sys.path.insert(0, "Recourse")                                # a clone of github.com/meitipro/Recourse, see 02
from genlayer_py import create_account
from shared.chain import Chain, select_network

select_network("studio-next")
ESCROW = "0x3d3fa7Fd2E143C4D6b47D31f15D19B102Ec9e0dA"
buyer = create_account(os.environ["RECOURSE_BUYER_KEY"])
chain = Chain(buyer)

bond = int(chain.read_json(ESCROW, "stats")["bond_amount"])
opened = chain.send(ESCROW, "open_dispute", [pid], value=bond)
print(opened["hash"])            # a refusal raises with the contract's own sentence instead
```

Refusals, each `[EXPECTED] ...`: `not buyer`, `not open`,
`no response`, `window closed`, `wrong bond` (exact, not merely enough),
`dispute contract not set`.

**A refused dispute is still an ACCEPTED transaction.** The committee agreed
that refusing was the correct result. Read the execution result, not the
status. `06-read-a-verdict.md` is how.

## If judgment never lands

A model call inside consensus can fail to land: a rotation exhausts, a committee
never agrees, a transaction is dropped. After `dispute_ends` has passed with no
verdict, either party can unwind:

```python
chain.send(ESCROW, "reclaim", [pid])
# payment to the seller, bond back to the buyer: the split neither party chose.
# A payout from the top of its own transaction, which is the kind Studio Next
# does fund; shared/chain.py allocates it at the root.
```

Refusals: `not a party`, `not disputed`, `judgment still running`,
`unknown payment`.
