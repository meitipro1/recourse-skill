import dns from "node:dns";
import { createMcpHandler } from "mcp-handler";
// The SDK's registerTool types its input schema against zod 4. The 3.x line,
// even through its zod/v4 subpath, lacks the internals it checks for, so this
// project pins zod 4.
import { z } from "zod";

import {
  ADDRESSES, NETWORKS, STATUS, VERDICT, deployment, deployments, readJson, resolveNetwork, toCitation, toPid,
} from "@/lib/chain";
import type { NetworkName } from "@/lib/chain";
import { checkPromise } from "@/lib/linter";

// GitHub's raw host answers on IPv6 and some networks route it nowhere, which
// surfaces inside this process as UND_ERR_CONNECT_TIMEOUT on a fetch that a
// bare node process on the same machine completes. Prefer IPv4; harmless
// where IPv6 works.
dns.setDefaultResultOrder("ipv4first");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Five read only tools. Paying, disputing, withdrawing and signing are
 * deliberately not here: the MCP advises, the agent's own wallet acts. The
 * chain clients behind these have no account (lib/chain.ts), and
 * test/readonly.test.ts asserts that against the object rather than trusting
 * this comment.
 *
 * Every chain reading tool takes an optional `network`; unset, it is the
 * default in addresses.json, studio-next, and the only one offered. studionet
 * is the first deployment, kept as the record, and is read by name only to
 * check that record. A network without an entry there is refused by name.
 */

const SKILL_RAW = "https://raw.githubusercontent.com/meitipro/recourse-skill/main/reference/";
const RECOURSE_RAW = "https://raw.githubusercontent.com/meitipro/Recourse/main/";

const TOPICS: Record<string, string> = {
  overview: "01-what-is-recourse.md",
  "what-is-recourse": "01-what-is-recourse.md",
  promise: "02-write-a-promise.md",
  "write-a-promise": "02-write-a-promise.md",
  pay: "03-pay-with-recourse.md",
  "pay-with-recourse": "03-pay-with-recourse.md",
  check: "04-check-a-response.md",
  "check-a-response": "04-check-a-response.md",
  dispute: "05-file-a-dispute.md",
  "file-a-dispute": "05-file-a-dispute.md",
  verdict: "06-read-a-verdict.md",
  "read-a-verdict": "06-read-a-verdict.md",
  addresses: "07-addresses.json",
};

/**
 * Sixty seconds, no longer. The reference files are fetched live so the skill
 * updates without a redeploy of this server; a longer cache would make that
 * promise false for as long as the cache lasted.
 */
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; body: string; status: number }>();

async function fetchText(url: string): Promise<{ status: number; body: string }> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return { status: hit.status, body: hit.body };
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    // "fetch failed" on its own says nothing. The cause does.
    const cause = (error as { cause?: { code?: string; message?: string } }).cause;
    throw new Error(`${(error as Error).message}: ${cause?.code || cause?.message || "no cause given"}`);
  }
  const body = await response.text();
  cache.set(url, { at: Date.now(), body, status: response.status });
  return { status: response.status, body };
}

function text(payload: unknown) {
  return { content: [{ type: "text" as const, text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2) }] };
}

function failure(message: string) {
  return { isError: true, ...text({ error: message }) };
}

const networkParam = z
  .enum(NETWORKS as [NetworkName, ...NetworkName[]])
  .optional()
  .describe("the network to read. Unset, and the only one offered: studio-next. studionet names the first deployment, kept as the record, and is read only to check that record. A network with no deployment is refused by name");

type Payment = {
  pid: string; buyer: string; seller: string; amount: string; bond: string;
  request: string; response: string; response_sig: string; recorded_by: string;
  created_at: number; responded_at: number; window_ends: number; dispute_ends: number;
  status: number; verdict: number;
};
type Case = {
  pid: string; promise: string; request: string; response: string; timing: string;
  verdict: number; verdict_name: string; reason: string; opened_at: number; decided_at: number;
};
type Seller = {
  address: string; promise: string; active: boolean; judgeable: boolean;
  registered_at: number; total: number; upheld: number; live: number; reviewed: string;
};

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "recourse_check_promise",
      {
        title: "Check whether a promise is judgeable",
        description:
          "Runs the Recourse promise linter. Stage 1 is deterministic and free (length, adjectives only, a measurable term). " +
          "Stage 2 asks the deployed gate's exact question of one model, which is a dry run and not the gate's verdict. " +
          "Returns {judgeable, reason, failed_check, suggestion, stage}. A 503 means no model was available; it is never an invented answer.",
        inputSchema: { promise: z.string().min(1).max(2000).describe("The seller's delivery promise, in plain language") },
      },
      async ({ promise }) => {
        const outcome = await checkPromise(promise);
        if (!outcome.ok) return failure(`${outcome.error} (linter answered ${outcome.status})`);
        return text(outcome.result);
      },
    );

    server.registerTool(
      "recourse_explain",
      {
        title: "Explain one part of Recourse",
        description:
          "Returns one reference file from the recourse-skill repository, fetched live (cached 60 seconds). " +
          "Topics: overview, promise, pay, check, dispute, verdict, addresses. Every file ends in a call you can run as written.",
        inputSchema: { topic: z.string().describe("overview | promise | pay | check | dispute | verdict | addresses, or a reference file name") },
      },
      async ({ topic }) => {
        const key = topic.trim().toLowerCase().replace(/^reference\//, "");
        const file = TOPICS[key] || (Object.values(TOPICS).includes(key) ? key : null);
        if (!file) return failure(`unknown topic ${topic}. Use one of: ${Object.keys(TOPICS).join(", ")}`);
        try {
          const fetched = await fetchText(SKILL_RAW + file);
          if (fetched.status !== 200) return failure(`could not fetch ${file}: HTTP ${fetched.status}`);
          return text(fetched.body);
        } catch (error) {
          return failure(`could not fetch ${file}: ${String(error).slice(0, 120)}`);
        }
      },
    );

    server.registerTool(
      "recourse_get_case",
      {
        title: "One adjudicated case",
        description:
          "The frozen strings, the verdict, the reason and the timings for one payment on one network. " +
          "Takes p-000043 or the citation RC-2026-0043. A payment that was never disputed has no case and says so.",
        inputSchema: { case_id: z.string().describe("p-000043 or RC-2026-0043"), network: networkParam },
      },
      async ({ case_id, network: requested }) => {
        let pid: string;
        let network: NetworkName;
        try {
          pid = toPid(case_id);
          network = resolveNetwork(requested);
        } catch (error) {
          return failure(String((error as Error).message));
        }
        const where = deployment(network);
        try {
          const payment = await readJson<Payment>(network, where.escrow, "get_payment", [pid]);
          let decided: Case | null = null;
          if (payment.status === 2 || payment.status === 3) {
            try {
              decided = await readJson<Case>(network, where.dispute, "get_case", [pid]);
            } catch {
              decided = null;
            }
          }
          return text({
            network,
            pid,
            citation: decided ? toCitation(pid, decided.decided_at) : null,
            status: STATUS[payment.status] ?? payment.status,
            verdict: VERDICT[payment.verdict] ?? payment.verdict,
            note:
              payment.status === 2 && !decided
                ? "disputed, judgment still running: no case row yet"
                : payment.status < 2
                  ? "never disputed, so there is no case to read"
                  : "verdict written on acceptance; money moved when status became resolved",
            payment,
            case: decided,
            explorer: where.explorer,
          });
        } catch (error) {
          return failure(`could not read ${pid} on ${network}: ${String(error).slice(0, 160)}`);
        }
      },
    );

    server.registerTool(
      "recourse_seller_record",
      {
        title: "A seller's public record",
        description: "The promise, whether it is active and judgeable, payments taken, disputes upheld against it, and payments still live, on one network.",
        inputSchema: { address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe("The seller's address"), network: networkParam },
      },
      async ({ address, network: requested }) => {
        let network: NetworkName;
        try {
          network = resolveNetwork(requested);
        } catch (error) {
          return failure(String((error as Error).message));
        }
        const where = deployment(network);
        try {
          const seller = await readJson<Seller>(network, where.escrow, "get_seller", [address]);
          let gateReason: string | null = null;
          try {
            gateReason = (await readJson<string>(network, where.dispute, "gate_reason", [address])) || null;
          } catch {
            gateReason = null;
          }
          return text({ network, ...seller, gate_reason: gateReason });
        } catch (error) {
          return failure(`could not read seller ${address} on ${network}: ${String(error).slice(0, 160)}`);
        }
      },
    );

    server.registerTool(
      "recourse_stats",
      {
        title: "Live counts and the frozen evaluation figures",
        description:
          "Payments, held funds, cases and the bond from chain for one network, every network the frozen bytes are deployed on, " +
          "and both evaluation numbers per network read from the committed results files: the tuned set and the held out set, always together.",
        inputSchema: { network: networkParam },
      },
      async ({ network: requested }) => {
        let network: NetworkName;
        try {
          network = resolveNetwork(requested);
        } catch (error) {
          return failure(String((error as Error).message));
        }
        const where = deployment(network);
        const out: Record<string, unknown> = {
          network,
          escrow: where.escrow,
          dispute: where.dispute,
          frozen: ADDRESSES.frozen,
          deployed_on: Object.fromEntries(Object.entries(deployments()).map(([n, d]) => [n, { chain_id: d.chain_id, escrow: d.escrow, dispute: d.dispute }])),
        };
        try {
          out.escrow_stats = await readJson<Record<string, unknown>>(network, where.escrow, "stats");
          out.dispute_stats = await readJson<Record<string, unknown>>(network, where.dispute, "stats");
        } catch (error) {
          out.chain_error = `could not read ${network}: ${String(error).slice(0, 120)}`;
        }
        // Read, never typed. One column per network the sets have run on; a
        // file that cannot be fetched is reported as unavailable rather than
        // recalled from memory, and nothing is ever merged across networks.
        const evaluation: Record<string, Record<string, unknown>> = {};
        for (const n of Object.keys(deployments())) {
          const suffix = n === "studionet" ? "" : `.${n}`;
          const column: Record<string, unknown> = {};
          for (const [label, base] of [["tuned_set", "results"], ["held_out_set", "results-v2"]] as const) {
            try {
              const fetched = await fetchText(`${RECOURSE_RAW}eval/${base}${suffix}.json`);
              if (fetched.status === 200) {
                const data = JSON.parse(fetched.body) as { accuracy: number; n: number; stability: number; unclear: number; instance: string };
                column[label] = { accuracy: `${data.accuracy}/${data.n}`, stability: `${data.stability}/${data.n}`, unclear: `${data.unclear}/${data.n}`, instance: data.instance };
              } else {
                column[label] = "not measured on this network";
              }
            } catch {
              column[label] = "unavailable";
            }
          }
          evaluation[n] = column;
        }
        out.evaluation = evaluation;
        out.reading = "Both sets are always shown together per network, never one without the other, and never merged across networks. The tuned set is the one the question was narrowed against; the held out set was committed before it could be run and never tuned against.";
        return text(out);
      },
    );
  },
  {
    serverInfo: { name: "recourse", version: "0.2.0" },
    instructions:
      "Read only. Recourse is a dispute right for the un-negotiated machine payment on GenLayer: two contracts on " +
      "Studio Next, chain 61997; the first deployment, on studionet, chain 61999, stays in the record. Use recourse_explain for the exact calls; paying, disputing and withdrawing are done from " +
      "the agent's own wallet and are not tools here. Never ask for a private key.",
    verboseLogs: false,
  },
);

export { handler as GET, handler as POST, handler as DELETE };
