interface Env {
  DB: D1Database;
  NTFY_TOPIC: string;
}

const API =
  "https://bills-api.parliament.uk/api/v1/Bills?SortOrder=DateUpdatedDescending&Take=50";

const TOPICS: Record<string, string[]> = {
  Housing: ["housing", "planning", "tenant", "landlord", "rent", "leasehold"],
  Trade: ["tariffs", "trade", "customs", "import", "export"],
  Tech: ["artificial intelligence", "online safety", "digital", "data"],
};

// Matches keywords at the start of a word, so "rent" catches "Renters" but not "current"
function matchTopics(title: string): string[] {
  const found: string[] = [];
  for (const [topic, words] of Object.entries(TOPICS)) {
    if (words.some((w) => new RegExp("\\b" + w, "i").test(title))) {
      found.push(topic);
    }
  }
  return found;
}

async function sendAlert(env: Env, relevant: any[]) {
  if (relevant.length === 0) return;

  const body = relevant
    .map(
      (b) =>
        `[${b.topics.join(", ")}] ${b.shortTitle}\n${b.currentStage?.description ?? "Unknown stage"} (${b.currentHouse})\nhttps://bills.parliament.uk/bills/${b.billId}`
    )
    .join("\n\n");

  await fetch(`https://ntfy.sh/${env.NTFY_TOPIC}`, {
    method: "POST",
    headers: { Title: `${relevant.length} bill update(s)` },
    body,
  });
}

async function run(env: Env) {
  const res = await fetch(API);
  const data = (await res.json()) as { items: any[] };

  const changed: any[] = [];

  for (const b of data.items) {
    const row = await env.DB
      .prepare("SELECT last_update FROM bills WHERE id = ?")
      .bind(b.billId)
      .first<{ last_update: string }>();

    if (!row || row.last_update !== b.lastUpdate) {
      changed.push(b);
      await env.DB
        .prepare(
          "INSERT OR REPLACE INTO bills (id, title, stage, house, last_update) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(b.billId, b.shortTitle, b.currentStage?.description ?? null, b.currentHouse, b.lastUpdate)
        .run();
    }
  }

  const relevant = changed
    .filter((b) => !b.isDefeated && !b.billWithdrawn)
    .map((b) => ({ ...b, topics: matchTopics(b.shortTitle) }))
    .filter((b) => b.topics.length > 0);

  await sendAlert(env, relevant);

  return { total: data.items.length, changed: changed.length, relevant };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (new URL(req.url).hostname !== "localhost") {
      return new Response("Parliament digest is running.");
    }
    const { total, changed, relevant } = await run(env);
    const lines = relevant.map(
      (b) =>
        `[${b.topics.join(", ")}] ${b.shortTitle} | ${b.currentStage?.description} | ${b.currentHouse}`
    );
    return new Response(
      `Checked ${total} bills. ${changed} new or changed, ${relevant.length} on your topics.\n\n${lines.join("\n")}`
    );
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(run(env));
  },
};