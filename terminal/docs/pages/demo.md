# Page: Demos (`/demo/<name>`)

**Purpose.** A made-up data set on the real Tags page, so the graph can be seen at the size of a whole life before anyone has typed that much. Justin, 2026-09-29 06:42 UTC: "Give me another example of a much larger tag graph, something way more complete for someone using this as a full harness for multi tenant company os and personal and family life stuff too all in one. Make this a demo that lives at /demo/demoname" ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790664132090239?thread_ts=1790634517.611669&cid=C0C2YAS5TL5)). Built in C-108 (Fable 5.1, Justin's session).

**Where.** `/demo/harness`. An unknown name (`/demo/nope`) lists the demos that exist. Demos are not in the tray: they are links to share and to put on the sales pages.

**What a demo is.** `app/src/demo/index.ts` registers each demo: a name, a title, a blurb and a `build()` that returns boxes (stages) and lines. `DemoView` shows a badge ("Demo · made-up data, nothing is saved"), the title, the blurb, the stage names and counts, a link back to the person's own `/tags`, and then `TagsView` with `source` set to the demo, so every view, filter and graph option works exactly as on the person's own tags. Nothing is written to the browser store.

**The harness demo.** One person, one terminal, five stages over a year (`app/src/demo/harness.ts`):

| Stage | What it holds |
| --- | --- |
| Northwind Dental | a dental clinic: staff, suppliers, insurers, the lease, payroll, recall lists, prices |
| Harbor Bakery | a bakery: flour orders, the market, the weekend menu, the loan, catering for the roastery, an invoice to the clinic |
| Loma Coffee Roasters | a roastery: lots, the farm, wholesale accounts, subscriptions, an export |
| Family | school pick-ups, the kids' dentist (the same clinic), groceries, trips, chores, the dog, insurance, the family budget |
| Personal | gym, reading, passport, therapy, savings, cycling with the coffee farmer, guitar, taxes |

About 300 lines and 300 short replies, spread over 364 days from 5 January 2026, with every kind of tag and about 230 distinct tags linked 450 ways. Lines are templates with marked spans (`{person:Mara Quintero}`, `{date:Monday|2026-03-02}`, `{list:eggs}`) that `compile()` turns into text plus chips with exact offsets, values and list groups. A seeded generator picks stages by weight and rotates templates, so the same seed always yields the same lines. All names, companies and figures are invented.

**Dense graphs.** Past eighty tags the graph uses a 1400×900 box, smaller nodes, tighter spacing, and "busiest labels" (up to forty) unless the person has chosen a label setting; hover still dims the unlinked, click still narrows, and the stage filter shows one life at a time.

**Not yet.** More demos (a solo freelancer; a school), Actions and Replay over demo data, a button that loads a demo into a real stage.
