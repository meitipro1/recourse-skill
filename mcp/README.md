# recourse-mcp

A read only MCP server for [Recourse](https://github.com/meitipro/Recourse),
served over Streamable HTTP from Vercel.

```
https://recourse-mcp-eight.vercel.app/api/mcp
```

**The MCP advises. The agent's own wallet acts.** That sentence is the
difference between a useful tool and a liability, so it is enforced rather
than promised: the chain client is created without an account, there is no
key anywhere in this process, and `test/readonly.test.ts` asserts both against
the running client object and against the source.

## Five tools

| Tool | Answers | Reads |
| --- | --- | --- |
| `recourse_check_promise(promise)` | The linter's shape: judgeable, reason, failed_check, suggestion, stage | The hosted linter, one implementation for the site, the bot and this |
| `recourse_explain(topic)` | A reference file, fetched live from this repository so the skill updates without a redeploy. Cached 60 seconds, no longer | raw.githubusercontent.com |
| `recourse_get_case(case_id)` | One adjudicated case: the frozen strings, the verdict, the reason, the timings. Takes `p-000043` or `RC-2026-0043` | the dispute contract |
| `recourse_seller_record(address)` | The public record: promise, payments, upheld, live, judgeable | the escrow |
| `recourse_stats()` | Live counts from chain beside the two frozen evaluation figures, always together | both contracts |

## Not tools, deliberately

`pay`, `open_dispute`, `withdraw`, `reclaim`, `register_seller`, any signing,
any key handling. The reference files the skill carries give the exact calls
for each, to be run from the agent's own environment with the agent's own key.

## Run it locally

```bash
npm install
npm test          # the read only assertions
npm run dev       # http://localhost:4504/api/mcp
```

`LINTER_URL` points `recourse_check_promise` at a linter; it defaults to the
hosted one in `addresses.json`. Stage 2 of the linter needs an Anthropic
credential on the linter's side, not here.
