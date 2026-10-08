---
description: Read the GolaVisa exchange-rate API in the user's own Chrome and publish it for the site
---

Update the GolaVisa rates on the site. Run this on the user's own computer with the Claude in Chrome
extension. The site `golavisa.co` blocks automated clients, so only the user's real browser works.

1. Use Claude in Chrome (read `anthropic-skills:chrome-browser` first if it is available). Open a
   **new tab** at `https://www.golavisa.co/api/exchange-rates` and read the page text. Do nothing else
   in the browser: no clicking, no other sites.
2. If the tab shows a "Security Checkpoint" or any verification instead of JSON, **stop** and tell the
   user to complete it themselves in that tab, then continue. Never try to get around it.
3. Save the JSON text, exactly as shown, to a temporary file (for example `/tmp/golavisa.json`).
4. Run `node scripts/publish-golavisa.ts /tmp/golavisa.json`. It validates the numbers first and only then
   pushes `golavisa.json` to the `data` branch. If it reports an error, show it to the user and stop.
5. Report the line it printed (the rates and the site's update time). Delete the temporary file.

Once a day is enough: Hung Long updates about once per working day. Do not loop or poll.
