---
description: Read the GolaVisa exchange-rate API in the Claude app's built-in browser and publish it for the site
---

Update the GolaVisa rates on the site. Run this on the user's own computer in the Claude desktop app. The site
`golavisa.co` blocks automated clients (Vercel bot check), so it must be read in a real browser on that computer:
the app's built-in browser (tools named `mcp__Claude_Browser__*`).

1. Read the `anthropic-skills:built-in-browser` skill first if it is available. Open the built-in browser at
   `https://www.golavisa.co/api/exchange-rates` (`preview_start` with that `url`, or `navigate` if the pane is
   already open) and read it with `get_page_text`. Do nothing else in the browser: no clicking, no other sites.
   Only if the built-in browser tools are missing from this session, use Claude in Chrome instead (new tab, same
   rules) and say so in the report.
2. If the page shows a "Security Checkpoint" or any verification instead of JSON, **stop** and tell the user to
   complete it themselves in that browser, then continue. Never try to get around it.
3. Save the JSON text, exactly as shown, to a temporary file (for example `/tmp/golavisa.json`, or the session's
   scratchpad directory).
4. Run `node scripts/publish-golavisa.ts <that file>`. It validates the numbers first and only then pushes
   `golavisa.json` to the `data` branch. If it reports an error, show it to the user and stop.
5. Report the line it printed (the rates and the site's update time). Delete the temporary file.

Once a day is enough: Hung Long updates about once per working day. Do not loop or poll.
