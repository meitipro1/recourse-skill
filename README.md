# recourse-skill

The installable half of [Recourse](https://github.com/meitipro/Recourse): a
skill that tells an agent when and how to use a dispute right for machine
payments, and a read only MCP server that answers the questions the skill
raises.

The contracts it points at run on GenLayer's Studio Next, chain 61997, as
the same logic, the same prompt and the same strings first frozen on
studionet, with a published diff that touches only API names; the studionet
deployment stays in the record and is not offered as somewhere to go. Every
address, bound and code table lives in
[`reference/07-addresses.json`](reference/07-addresses.json), which is JSON so
that a tool can parse it rather than read it. On Studio Next a dispute is
judged and its settlement does not pay out, because consensus v0.6 funds a
value transfer only from the top of a transaction; the Recourse README's
[Settlement on Studio Next](https://github.com/meitipro/Recourse#settlement-on-studio-next)
has the transactions.

## Install

As a Claude Code plugin, from this repository:

```bash
claude plugin marketplace add meitipro/recourse-skill
claude plugin install recourse@recourse
```

Or drop the skill in by hand: copy `SKILL.md` and `reference/` into
`.claude/skills/recourse/` in any project. The MCP server is remote and needs
no install; add it to any MCP client as Streamable HTTP:

```json
{ "mcpServers": { "recourse": { "type": "http", "url": "https://recourse-mcp-eight.vercel.app/api/mcp" } } }
```

## What is in here

| | |
| --- | --- |
| `SKILL.md` | The router. A situation table, the three failure modes, five rules for the agent. The only registered file. |
| `reference/01` to `06` | One situation each. Every file ends in a call you can run as written. |
| `reference/07-addresses.json` | The frozen deployment, as data. |
| `mcp/` | The server. Five read only tools, Streamable HTTP, deployed on Vercel. |

## What has been run

The reads in the reference files were executed against the deployed contracts
on Studio Next as they were written. The writes were not: `register_seller` in
02, `pay` and `record_response` in 03, and `open_dispute` in 05 each need a
funded account and each adds a payment to the published record. They call
`shared/chain.py` in the Recourse repository, which is the code that
repository's own `scripts/demo.py` sends against these same two contracts.

## The one sentence about safety

**The MCP advises. The agent's own wallet acts.** Paying, disputing,
withdrawing and signing are deliberately not tools. The server is created
without an account and `mcp/test/readonly.test.ts` asserts that against the
client object, and scans the server's source for any write method name. This
skill never asks for a private key, and anything claiming to be Recourse that
does is not Recourse.

## Keep it honest

The skill quotes two evaluation numbers and always together: on Studio Next,
16 of 18 on the set the judgment question was narrowed against and 2 of 3 on a
held out set committed before it could be run; on studionet, the first
deployment, 17 of 18 and 1 of 3. A skill that quoted only the first of either
pair would be lying by omission, and `recourse_stats` returns both.

MIT.
