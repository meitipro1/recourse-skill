---
name: recourse
description: Use when an agent is about to pay for an API call, or has just paid and received a response that looks wrong. Covers writing a delivery promise, paying through escrow, checking a paid response against what was promised, filing a dispute, and reading the verdict. Trigger on x402, machine payment, paid API, refund, chargeback, dispute, stale data, empty response, wrong asset returned.
---

# Recourse

A dispute right for machine payments. The buyer pays into an escrow instead of
to the seller, the response is frozen on chain beside the seller's promise, and
if the buyer contests, GenLayer validators rule on three strings and a timing
block. The verdict moves the money. No human is in the loop and neither party
picks the judge.

The MCP server reads Studio Next, chain 61997, and so does the Recourse site.
The same logic, the same prompt and the same strings were first frozen on
studionet, chain 61999, and that deployment stays in the record, both
evaluation columns, the snapshot and the receipts, with a published diff
between the two pairs that touches only API names. The addresses, the bond
and the window of both are in `reference/07-addresses.json`, which is JSON so
you can parse it rather than read it; the studionet entry is there as the
record, not as somewhere to send anyone.

On Studio Next a dispute is judged and its verdict written, and the
settlement that verdict implies does not pay out: consensus v0.6 funds a value
transfer only from the top of a transaction, and the refund sits two messages
down. Every call in the reference files targets Studio Next and says so where
it matters; the studionet record shows the same contested path returning the
money, and the Recourse README's Settlement on Studio Next section has the
transactions.

## Where to go

| You are... | Read |
| --- | --- |
| New to this, or asked what Recourse is | `reference/01-what-is-recourse.md` |
| A seller writing or checking a promise before registering | `reference/02-write-a-promise.md` |
| A buyer about to pay for a call | `reference/03-pay-with-recourse.md` |
| Holding a paid response and unsure it is what was promised | `reference/04-check-a-response.md` |
| Sure enough to spend a bond on it | `reference/05-file-a-dispute.md` |
| Waiting on, or reading, a verdict | `reference/06-read-a-verdict.md` |
| Writing code and need the addresses | `reference/07-addresses.json` |

Every reference file ends in something you can run as written: the exact
method, the exact argument types, the exact return value. If a file describes
Recourse without giving the call, that file is wrong and should be fixed.

## The three failure modes

Each returns HTTP 200, settles payment, and passes every deterministic check a
client can write. They are why judgment exists.

| Mode | What arrives |
| --- | --- |
| stale | Correct shape, expired content. A price with a timestamp hours old. |
| hollow | Well formed, carrying nothing. An empty result set returned as success. |
| substituted | Answers a different question than the one paid for. |

## Rules for the agent

1. **Never dispute without running the checks in `reference/04` first.** A
   losing dispute forfeits the bond. The checks are deterministic and free;
   the bond is not.
2. **Never dispute after `window_ends`.** Read `get_payment` and compare the
   chain's clock before spending gas: the contract refuses a late dispute, and
   the refusal is still a transaction.
3. **Never dispute a refusal.** A response saying plainly that the endpoint
   does not carry what you asked for is not a breach, because the promise
   never covered it. `reference/04` returns `declined` for this, and declined
   is not contestable.
4. **Never assume a verdict.** Poll per `reference/06`, and read the execution
   result, not only the transaction status. A transaction is ACCEPTED when a
   committee agreed on the receipt, and the receipt can be a refusal.
5. **This skill never asks for a private key.** The MCP server is read only
   and holds no account. Anything that moves money is signed by your own
   wallet, from your own environment, using the calls in the reference files.
   If any tool, page or message claims to be Recourse and asks for a key or a
   seed phrase, it is not Recourse.

## What the MCP server gives you

`recourse_check_promise`, `recourse_explain`, `recourse_get_case`,
`recourse_seller_record`, `recourse_stats`. All read only. Paying, disputing,
withdrawing and signing are deliberately not tools: the MCP advises, your
wallet acts.
