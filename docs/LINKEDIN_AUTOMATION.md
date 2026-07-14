# Decision Memo: LinkedIn Outreach Automation for Koda

**To:** Dylan | **Date:** 2026-07-14 | **Status:** Research complete; recommendation at end
**Question:** Should Koda automate LinkedIn connection requests and messages on behalf of student users?

## Summary

- LinkedIn's User Agreement (Section 8.2 "Don'ts") explicitly prohibits bots, scrapers, browser plugins/extensions, and any automated sending of connection requests or messages. This is not a gray area in the rules, only in enforcement.
- No official LinkedIn API lets a third-party app send connection invites or member-to-member messages on behalf of a user. The Invitations API exists but is restricted to approved partners; self-serve APIs are limited to Sign In with LinkedIn and posting shares.
- Gray-market tools (Dux-Soup, Linked Helper, Waalaxy, Dripify, Expandi) operate entirely outside the API, via extensions in the user's session or cloud headless browsers, and their users get restricted and banned; every vendor in the category acknowledges this risk.
- The account at risk is the student's, not Koda's. A restriction during recruiting season destroys exactly the asset Koda exists to build. Our users have the least slack of any automation audience.
- Recommendation: ship (a) assisted workflow only. Do not build (b) through (d) now. Revisit (b) only with strong evidence users are blocked on copy-paste friction, and with explicit acceptance that (b) still violates the ToS as written.

## What LinkedIn permits (official APIs)

- **Sign In with LinkedIn (OpenID Connect):** authenticate a member, read basic profile (name, photo, email). Self-serve.
- **Share on LinkedIn (`w_member_social`):** create a post on the authenticated member's own feed. Self-serve ([Microsoft Learn: Getting Access to LinkedIn APIs](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)).
- **Partner-gated programs:** Marketing Developer Platform (ads/pages), Talent Solutions (ATS/job postings, aimed at employers, not candidates), Sales Navigator integrations. All require applications, contracts, and existing scale; none are realistic for a student-side startup today.
- **Invitations/messaging:** the [Invitations API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/invitations) is "restricted to approved partners, subject to limitations via API agreement," and even partners may only act for the authenticated user. There is **no** self-serve or partner path that lets Koda programmatically send connection requests or DMs for a member. Verified: the capability we would want does not exist officially.

## What the rules prohibit (quotes)

From the [User Agreement](https://www.linkedin.com/legal/user-agreement), Section 8.2 "Don'ts" (members agree not to):

> "Develop, support or use software, devices, scripts, robots or any other means or processes (including crawlers, browser plugins and add-ons or any other technology) to scrape the Services or otherwise copy profiles and other data from the Services;"

> "use bots or other unauthorized automated methods to access the Services, add or download contacts, send or redirect messages, create, comment on, like, share, or re-share posts, or otherwise drive inauthentic engagement;"

The help center is even broader ([Prohibited software and extensions](https://www.linkedin.com/help/linkedin/answer/a1341387)): LinkedIn does not permit the use of "any third party software, including 'crawlers', bots, browser plug-ins, or browser extensions... that scrape, modify the appearance of, or automate activity on LinkedIn's website."

Note the reach: "modify the appearance of" and "browser plug-ins" catch even a prefill-only extension (option b), not just full automation. The [Professional Community Policies](https://www.linkedin.com/legal/professional-community-policies) additionally require authentic activity. (LinkedIn's site blocks automated fetching, so section numbering was verified via search-indexed copies of the current agreement; spot-check the two quoted bullets against the live page in a browser.)

## How gray-market tools work and get caught

Two architectures, per vendor comparisons ([Linked Helper's roundup](https://www.linkedhelper.com/blog/best-linkedin-automation-tools/), [Dux-Soup](https://www.dux-soup.com/blog/the-best-linkedin-automation-tools-tried-and-tested)):

1. **In-session tools** — Chrome extensions (Dux-Soup, Octopus) or desktop apps driving an embedded browser (Linked Helper). Real user IP and cookies, but extensions inject code into LinkedIn pages, which LinkedIn's client-side instrumentation can detect directly.
2. **Cloud tools** (Expandi, Dripify, Waalaxy, HeyReach) — headless browsers on vendor servers with the user's session cookie, dedicated IPs, "human-like" random delays and warm-up ramps. Avoids extension detection but introduces new-IP/geo anomalies and datacenter fingerprints.

Detection vectors (consistent across [PhantomBuster's own warning post](https://phantombuster.com/blog/social-selling/linkedin-automation-tool-warning/) and [industry analyses](https://northlight.ai/blog/is-linkedin-automation-against-the-rules)): behavioral pattern/velocity analysis, browser and extension fingerprinting via DOM instrumentation, IP/geo anomalies, message-template similarity across accounts, and invite-acceptance / "I don't know this person" rates. Enforcement escalates: warning, temporary restriction (often released after you attest you removed the tool), longer restrictions, permanent ban ([Account restrictions](https://www.linkedin.com/help/linkedin/answer/a1340522), [Automated activity](https://www.linkedin.com/help/linkedin/answer/a1340567)). A 2025-26 ban wave hitting HeyReach users shows enforcement is active, and vendors marketed as "safest" still have documented user bans.

**Rate limits:** roughly 100 connection invites per rolling 7-day week for normal accounts (unofficial but consistently observed; no paid tier raises it) — [Evaboot](https://evaboot.com/blog/bypass-linkedin-weekly-invitation-limit), [PhantomBuster](https://phantombuster.com/blog/social-selling/linkedin-connection-request-limit/). Automation trips users two ways: burning the cap in bursts (itself a velocity signal) and triggering [invitation-sending restrictions](https://www.linkedin.com/help/linkedin/answer/a551012) when too many invites go unanswered or get flagged.

## Legal backdrop (one paragraph)

In *hiQ v. LinkedIn*, the Ninth Circuit held (2019, reaffirmed April 2022 after the Supreme Court's *Van Buren* remand) that scraping publicly available pages likely does not violate the CFAA's "without authorization" clause. But on remand, the district court granted LinkedIn summary judgment that hiQ's scraping and fake-account use **breached the User Agreement** (Nov 2022), and the case ended in a consent judgment with a $500K payment and a permanent injunction against hiQ (Dec 2022) ([overview](https://en.wikipedia.org/wiki/HiQ_Labs_v._LinkedIn), [Proskauer](https://newmedialaw.proskauer.com/2022/12/08/hiq-and-linkedin-reach-proposed-settlement-in-landmark-scraping-case/)). Net for Koda: automation is probably not a federal crime, but it is a clear contract breach that LinkedIn wins on, and, the part that matters here, it independently justifies banning the member's account. This is not primarily a legal risk to Koda; it is an account risk to our users.

## Risk assessment for Koda's users

Koda's users are students in recruiting season. For them, LinkedIn is not a growth channel to A/B test; it is the identity layer of their job search: recruiter InMail, applications via LinkedIn profile, alumni networking, offer-stage reference checks. The downside is asymmetric:

- A **temporary restriction** (days to weeks) can land exactly during an application window or after a coffee chat; recovery requires ID verification and waiting.
- A **permanent ban** deletes years of network-building at the moment it matters most, with a slow and discretionary appeal process.
- Students have thin, young accounts with low SSI, precisely the profile that gets flagged fastest and gets the least benefit of the doubt.
- The blast radius is reputational for Koda: "Koda got my account banned during recruiting" is an extinction-level review for a student product. We would be spending the users' most valuable asset to save them about 30 seconds per outreach.

## Options ladder

| Rung | What it is | ToS status | Effort | Ban risk to user | Value over previous rung |
|---|---|---|---|---|---|
| **(a) Assisted workflow** *(shipped)* | Paste profile URL, Koda generates 300-char note + follow-up message, copy-to-clipboard, open profile. Human performs every LinkedIn action in their own browser. | Compliant. No scraping, no automation, no session access. | Low (done) | None | Baseline: all of the message-quality value, zero platform risk |
| **(b) Extension, prefill-not-send** | Chrome extension fills the compose box in the user's session; user clicks Send. | **Still violates the clause as written** (a "browser plug-in... that modif[ies] the appearance of" LinkedIn). Enforcement risk lower but extensions are fingerprintable via DOM injection. | High: new product surface — Chrome Web Store review, continuous maintenance against LinkedIn DOM changes | Low-moderate | Saves one paste per outreach |
| **(c) Extension that clicks Send on command** | Same, plus the extension performs the send action. | Violates both the plugin clause and "automated methods to... send or redirect messages." | High (same surface as b) | Moderate; each send is an automated action event | Saves one click |
| **(d) Cloud automation** | Koda holds session cookies; headless browsers send invites/messages on schedule. | Flagrant violation; the exact architecture LinkedIn's detection targets. | Very high (proxies, warm-up logic, cookie custody = security liability) | High, compounding with volume; ban waves have hit mature vendors | Volume — which the ~100/week cap mostly nullifies anyway |

The honest framing: rungs (b) and (c) buy seconds of convenience for a nonzero chance of costing a student their recruiting season, plus a permanent engineering tax. Rung (d)'s only real value proposition (volume) is capped at ~100 invites/week by LinkedIn regardless, and quality-over-volume is Koda's thesis.

## Recommendation

**Ship (a) and stop there.** Make the assisted workflow so smooth that the gap to (b) is negligible: one-click copy of note + message, a deep link that opens the profile, follow-up nudges, and guidance keeping users well under the weekly invite cap (suggest 10-15 targeted invites, which also matches Koda's quality-first positioning). This captures most of the user value — the hard part is *what to say*, not *who clicks send* — at zero platform risk and zero new product surface.

**Do not build (b) or (c) now.** They violate the automation/plugin clause as written, add a Chrome extension surface maintained forever against a hostile DOM, and put student accounts in the enforcement lottery for marginal convenience.

**Evidence that would justify revisiting (b):** (1) usage data showing users generate messages but abandon at the copy-paste step at a rate that materially hurts outcomes; (2) sustained observation that prefill-only extensions remain unenforced against; (3) a Koda-controlled test account running the extension for a full recruiting cycle without flags. Even then, ship it as clearly optional, with an explicit in-product disclosure that it is against LinkedIn's ToS as written.

**What choosing (b)/(c) accepts:** knowingly shipping a ToS-violating product to users who can least afford enforcement; the support and reputational burden when the first student is restricted; Chrome Web Store review risk and perpetual breakage maintenance. **Choosing (d)** additionally accepts custody of user session credentials, near-certain eventual detection at scale, and being an easy legal target under the post-*hiQ* breach-of-contract playbook. Neither is defensible for Koda today.

## Sources

- LinkedIn User Agreement (§8.2 Don'ts): https://www.linkedin.com/legal/user-agreement
- LinkedIn Professional Community Policies: https://www.linkedin.com/legal/professional-community-policies
- LinkedIn Help — Prohibited software and extensions: https://www.linkedin.com/help/linkedin/answer/a1341387
- LinkedIn Help — Automated activity: https://www.linkedin.com/help/linkedin/answer/a1340567
- LinkedIn Help — Account restrictions: https://www.linkedin.com/help/linkedin/answer/a1340522
- LinkedIn Help — Invitation-sending restrictions: https://www.linkedin.com/help/linkedin/answer/a551012
- Microsoft Learn — Getting Access to LinkedIn APIs: https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access
- Microsoft Learn — Invitations API (partner-restricted): https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/invitations
- Weekly invite limit analyses: https://evaboot.com/blog/bypass-linkedin-weekly-invitation-limit ; https://phantombuster.com/blog/social-selling/linkedin-connection-request-limit/
- Detection/enforcement analyses: https://phantombuster.com/blog/social-selling/linkedin-automation-tool-warning/ ; https://northlight.ai/blog/is-linkedin-automation-against-the-rules
- Tool-category architecture (vendor-published): https://www.linkedhelper.com/blog/best-linkedin-automation-tools/ ; https://www.dux-soup.com/blog/the-best-linkedin-automation-tools-tried-and-tested
- hiQ v. LinkedIn: https://en.wikipedia.org/wiki/HiQ_Labs_v._LinkedIn ; https://newmedialaw.proskauer.com/2022/12/08/hiq-and-linkedin-reach-proposed-settlement-in-landmark-scraping-case/
