# Parliament Digest

A small Cloudflare Worker that checks the UK Parliament Bills API every morning and sends a push notification to my phone when a bill on housing, trade or AI has changed.

I'm a first-year student at LSE and wanted to follow policy as it moves through Parliament without refreshing the Bills website every day. This was also a chance to build something small that runs without me.

## How it works

1. A cron trigger starts the Worker at 07:00 UTC each day.
2. It pulls the 50 most recently updated bills from the Parliament Bills API, which needs no key.
3. For each bill it checks a Cloudflare D1 table to see whether the bill is new or its last-updated time has changed.
4. Changed bills that haven't been defeated or withdrawn are matched against keyword lists for three topics: housing, trade (tariffs) and tech (AI).
5. Matches are sent through ntfy, with the bill's current stage, which house it's in and a link to the official page.

Built with TypeScript, Cloudflare Workers, D1 and ntfy. It runs on free tiers.

## What it has done so far

- A local test against the live API checked 50 bills and matched 4 of them.
- The deployed version's first alert arrived in the first week of November. Since then it has sent 2 alerts covering 3 bill updates, as of 10 November 2026.

## What went wrong

**A false match.** My first keyword list used "tariff" for the trade topic. It flagged the Utilities (Social Tariff) Bill, which is about energy bills, not trade policy. I changed the keyword to "tariffs" (plural), which stops that match. The cost is that a trade bill with a singular "Tariff" in its title would now be missed. The trade topic hasn't produced a genuine match yet, so I can't say yet whether the trade-off was right.

**Alerts don't say what changed.** The API gives a last-updated timestamp but not a reason for it. The Social Housing Bill triggered an alert on 6 November even though it had already been at Report stage on 4 November, so the change was something other than a new stage.

## Limitations

- Keywords are matched against bill titles only, so a bill with a vague title could be missed.
- It only looks at the 50 most recently updated bills.

## Ideas for next

- Store the previous stage and say "moved from 2nd reading to Committee stage" in the alert.
- Match against bill summaries as well as titles.
- Add Hansard debates as a second source.

## Running your own copy

You need a Cloudflare account (with a verified email), Node.js and the ntfy app.

    npm install
    npx wrangler d1 create parliament
    npx wrangler d1 execute parliament --remote --file=schema.sql
    npx wrangler secret put NTFY_TOPIC
    npx wrangler deploy

Copy the database ID that the create command prints into wrangler.jsonc. For local testing, put NTFY_TOPIC=your-topic in a file called .dev.vars, which is already git-ignored. Pick a long random topic name, since anyone who knows it can read your alerts.