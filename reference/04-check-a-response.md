# Check a response before spending a bond

Three deterministic checks, no model. They are deliberately dumb: the point is
that the agent detects a mismatch with hardcoded rules and the actual judgment
happens in consensus, where neither party chose the judge. A losing dispute
forfeits the bond, so run these first, every time.

## Read the bounds out of the promise

The promise names its own standard. Read the freshness bound and the source
count out of it; if it names neither, you have no grounds and no complaint.

```python
import re

WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
         "eight": 8, "nine": 9, "ten": 10, "fifteen": 15, "twenty": 20, "thirty": 30, "sixty": 60}


def number(text):
    m = re.search(r"(\d+|" + "|".join(WORDS) + r")", text)
    return None if not m else (int(m.group(1)) if m.group(1).isdigit() else WORDS[m.group(1)])


def bounds(promise):
    """(max_age_seconds, min_sources). Unreadable means no complaint is possible."""
    p = promise.lower()
    age = re.search(r"(?:within|no more than|at most|older than|refreshed(?: within)?)\s+([a-z0-9]+)\s+second", p)
    src = re.search(r"at least\s+([a-z0-9]+)\s+(?:venues?|sources?|exchanges?)", p)
    max_age = number(age.group(1)) if age else 10**9
    min_sources = number(src.group(1)) if src else 0
    return max_age, min_sources
```

## The checks

Measure freshness against the moment the response **arrived**, not the moment
you got round to checking. Recording on chain takes a consensus round, and a
five second promise measured after it will read as broken by the transaction
rather than by the seller.

```python
import datetime


def check(body: dict, requested_pair: str, max_age: int, min_sources: int, received_at):
    """
    Returns (contestable, reason).

    contestable False with a reason starting "declined" is not a pass: the
    endpoint refused a request the promise never covered, and there is nothing
    for a committee to rule on. Never dispute it.
    """
    if not isinstance(body, dict) or not body:
        return True, "hollow: empty body"
    if isinstance(body.get("error"), str) and body.get("price") is None:
        return False, f"declined: {body['error']}, which the promise never covered"
    if "results" in body and not body.get("results"):
        return True, "hollow: empty result set"
    pair = body.get("pair")
    if isinstance(pair, str) and pair and pair != requested_pair:
        return True, f"substituted: asked {requested_pair}, got {pair}"
    price = body.get("price")
    if price in (None, "", 0) or not isinstance(price, (int, float)):
        return True, "hollow: no usable price"
    ts = body.get("ts")
    try:
        stamp = datetime.datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=datetime.timezone.utc)
    except ValueError:
        return True, "stale: no usable timestamp"
    age = int((received_at - stamp).total_seconds())
    if age > max_age:
        return True, f"stale: {age}s old, promise allows {max_age}s"
    if not isinstance(body.get("sources"), int) or body["sources"] < min_sources:
        return True, f"sources: {body.get('sources')} against a floor of {min_sources}"
    return False, "ok"
```

## Use it

```python
import json

received_at = datetime.datetime.now(datetime.timezone.utc)   # set this when the HTTP response lands
max_age, min_sources = bounds(promise)
contestable, reason = check(json.loads(body), "ETH-USD", max_age, min_sources, received_at)
print(contestable, reason)
# True  "stale: 32400s old, promise allows 5s"      -> 05-file-a-dispute.md
# False "ok"                                         -> let the window expire, the seller withdraws
# False "declined: unsupported pair, ..."            -> do not dispute; you asked for something outside the promise
```

## Check the window before spending gas

```python
payment = json.loads(client.read_contract(ESCROW, "get_payment", [pid]))
import time
if time.time() > payment["window_ends"]:
    raise SystemExit("the window has closed; a dispute would be refused and the refusal still costs a transaction")
if payment["response"] == "":
    raise SystemExit("no response is recorded yet; record it first (03) or the dispute is refused")
```
