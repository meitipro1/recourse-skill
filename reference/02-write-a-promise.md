# Write a promise a judge can rule on

A promise is the standard a response is judged against. Nothing else is. If the
promise says only that data is accurate, a judge has two choices, invent a
standard the seller never agreed to or answer `unclear`, and `unclear` leaves
the payment with the seller and returns the bond, which is to say nobody
learned anything and everybody paid gas.

**Judgeable means it states something checkable: a count, a bound, a named
field, a freshness limit. Not judgeable means it states only a quality, such
as accurate, high quality or reliable.** That sentence is the deployed gate's
own wording and the linter asks it verbatim.

## Six examples

These are the linter's worked examples, taken from the evaluation sets so the
linter and the judge cannot tell different stories.

| | Promise | Why |
| --- | --- | --- |
| pass | Prices aggregated from at least three venues, refreshed within five seconds. | A count and a freshness bound. |
| pass | Returns at least ten items, each with a title and a url, published in the last twenty four hours. | A count, two named fields, a time window. |
| pass | Returns the full text of the requested document, or an explicit not found. | No number anywhere, still judgeable: both outcomes are named. |
| fail | Accurate market data. | Evaluation case 08, recorded unclear. Accurate against what, how fresh? |
| fail | High quality results. | A quality and a noun. Nothing to count, bound or name. |
| fail | Fast and reliable responses. | Fast compared to what, reliable measured how? |

The three failures never reach a model. The linter's first stage is
deterministic and free: length between 20 and 500, not composed only of
adjectives, and at least one measurable term (a number, a unit beside a
number, a time bound, a named field, or a named source). A promise that fails
there is told which check it failed.

## Two things to know before registering

**Registration lists you immediately.** `register_seller` stores the promise
and marks it judgeable. The on chain gate (`check_promise`) is not run at
registration; the contract owner can run it against any seller, and if it
rules a promise unjudgeable, `pay` refuses every buyer until the promise is
rewritten and reviewed. So the linter is what stands between you and a promise
that cannot be enforced, and a bad promise costs you buyers rather than a
transaction.

**The promise is frozen under a live payment.** `update_promise` refuses while
any payment is open, because a promise that changes after the money moved is
not a promise.

## Lint it

The linter is the same service behind the site panel and the MCP tool
`recourse_check_promise`. Stage 1 is free. Stage 2 asks the gate's question of
one model and is a dry run, not the gate's verdict.

```bash
curl -s -X POST https://recourse-linter.vercel.app/api/lint \
  -H "Content-Type: application/json" \
  -d '{"promise": "Accurate market data."}'
```

```json
{"judgeable": false, "reason": "Nothing here is measurable: no number, unit, time bound, count, named field or named source. Say what arrives and how fresh, not how good.", "failed_check": "no measurable term", "suggestion": null, "stage": 1}
```

The shape is always those five keys. `stage` is 1 or 2, `failed_check` is set
only on a stage 1 failure, `suggestion` only when the gate said no and a
rewrite that itself passes stage 1 could be produced. A 503 means no model was
available to ask; it is never an invented answer.

## Register it

Your own key, your own wallet. 20 to 500 characters.

Every write on Studio Next carries a fee deposit, estimated from Studio's own
simulation of the call, and what consensus does not spend comes back at
finality. `shared/chain.py` in the Recourse repository does that estimate,
allocates the messages a call emits, and reads the receipt for a real success
rather than an accepted refusal, so the writes in these files go through it.
Clone `github.com/meitipro/Recourse`, install its `requirements.txt` into a
virtual environment, and run from there.

```python
import os, sys
sys.path.insert(0, "Recourse")                                # the clone
from genlayer_py import create_account
from shared.chain import Chain, select_network

select_network("studio-next")
ESCROW = "0x3d3fa7Fd2E143C4D6b47D31f15D19B102Ec9e0dA"
seller = create_account(os.environ["RECOURSE_SELLER_KEY"])   # never paste a key into a tool
chain = Chain(seller)

done = chain.send(ESCROW, "register_seller", ["Prices aggregated from at least three venues, refreshed within five seconds."])
print(done["status"], done["hash"])     # ACCEPTED and the transaction hash
```

`send` writes, waits for the committee's decision, and raises with the
contract's own sentence when the receipt is a refusal. Refusals you can get,
all as `[EXPECTED] ...`: `already registered`, `promise length`.
