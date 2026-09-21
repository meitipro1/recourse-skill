/**
 * The promise linter, reached over HTTP. This server holds none of the logic:
 * the one implementation lives in the Recourse repository (linter/service.py)
 * and is hosted at LINTER_URL, so the site panel, the bot and this tool cannot
 * drift apart. What comes back is forwarded unchanged.
 */

import addresses from "../addresses.json";

export type LintResult = {
  judgeable: boolean;
  reason: string;
  failed_check: string | null;
  suggestion: string | null;
  stage: 1 | 2;
};

export type LintOutcome = { ok: true; result: LintResult } | { ok: false; error: string; status: number };

export const LINTER_URL = process.env.LINTER_URL || addresses.linter;

export async function checkPromise(promise: string): Promise<LintOutcome> {
  let response: Response;
  try {
    response = await fetch(LINTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promise }),
      signal: AbortSignal.timeout(200_000),
    });
  } catch (error) {
    return { ok: false, error: `could not reach the linter: ${String(error).slice(0, 120)}`, status: 503 };
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: "the linter returned no usable answer", status: 502 };
  }
  if (!response.ok) {
    const message = (payload as { error?: string })?.error || `linter answered ${response.status}`;
    return { ok: false, error: message, status: response.status };
  }
  return { ok: true, result: payload as LintResult };
}
