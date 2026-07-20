# True MMA — Marketing Strategy

Living document, companion to [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) (technical) and
[`docs/ecosystem-overview.html`](ecosystem-overview.html) (visual map). This file is where the
marketing strategy, channel plan, content pipeline, monitoring setup and launch plan are decided
and recorded — built the same way the [planned design overhaul](ARCHITECTURE.md) is: step by
step, jointly decided, nothing final without discussion.

**Status as of 2026-07-20:** concept-only. Execution (creating accounts, posting, spending ad
budget) is deliberately deferred until the visual/brand redesign lands — building channels/assets
on the current placeholder branding would mean redoing them once the new identity exists. This
doc is being written now so the full plan is ready to execute the moment branding is final.

**Constraints agreed up front:**
- Small paid-ads budget realistic (not zero, not large) — organic-first, ads as an accelerant
  once there's something worth boosting, not the primary channel from day one.
- No App Store listing yet, no channels/content/assets yet — genuinely starting from zero.
- Solo developer (Christoph) executes this alongside building the app itself — the plan must be
  realistic for one person, not assume a team.

## 1. Positioning & target audience

**Persona: both hardcore fans and casual viewers, deliberately, not one at the expense of the
other.** This is more work than picking one (content needs to work at two depths at once) but
matches the app itself, which already serves both without gating anything behind login — see
[Login / Profile](ARCHITECTURE.md#login--profile) in the architecture doc. Practical implication
for content: a fight-card post needs a scannable headline (works for a casual viewer skimming)
*and* the detail a hardcore fan checks for (record, method, title-fight status) — not two separate
content tracks, one format that serves both simultaneously.

**Two lead-tier differentiators, not one.** Against Tapology (text-heavy, utilitarian), Sherdog
(same), the official UFC app (UFC-only, not neutral across orgs), and Verdict (news/opinion-focused,
not a calendar tool):

1. **Speed & design** — a fast, calendar-first app with a modern UI, not a wall of text or a news
   feed. Chosen as a lead message over "OKTAGON coverage" or "German-language" because it's the
   most defensible claim: directly demonstrable in a screenshot/screen-recording, doesn't depend
   on how a competitor's coverage looks on any given day.
2. **A real native app, and there's little competition on that specific ground.**
   Tapology/Sherdog/Verdict are fundamentally websites (some with a bare wrapper app bolted on);
   the official UFC app exists but is single-org. There is no established "MMA calendar app" on
   iOS/Android the way there is for, say, football fixtures — genuinely thin competition
   specifically *as a smartphone app*, separate from the design/speed argument above. Bundled with
   this: **everything in one place** (events + fighters + fight cards + follows/reminders/
   favorites/voting across every covered org) instead of switching between a news site, an
   official league app, and a separate calendar/reminder app — "all-in-one" is the concrete
   consumer-facing framing of that same point.

OKTAGON coverage and DE/EN bilingual support remain real, true secondary points and should show up
in content/App Store copy, just not as the headline.

**Positioning statement (working draft, revisit once branding/naming is final):**
> True MMA is the fast, clean way to keep track of MMA — every UFC and OKTAGON event, every fight
> card, every fighter you follow, all in one app, without wading through news articles or juggling
> a separate app per league to find out when the prelims start.

**Open for a later phase, not blocking now:**
- Exact tone-of-voice (depends on brand voice work in the design overhaul)
- Whether "both personas" holds once real usage data exists post-launch — revisit after the first
  few months of analytics rather than assuming forever.

## 2. Brand core & messaging

**Name is settled, voice is not.** "True MMA" went through a full rename (repo, bundle id, EAS
project, domain — see the top of [`ARCHITECTURE.md`](ARCHITECTURE.md)), so unlike the logo/visual
identity this isn't waiting on the design overhaul. What *is* still open until that process
happens: exact tone of voice, visual personality, tagline styling. This section covers what's
decidable now (messaging substance) without pre-empting that (voice/style).

**Messaging pillars — the substance behind the two lead differentiators from §1, made concrete
enough to write copy from:**

| Pillar | Consumer-facing idea | Feeds |
|---|---|---|
| Never miss a card | Reminders + the calendar view mean you always know when prelims/main card start | App Store copy, onboarding, retention content |
| Everything in one app | UFC + OKTAGON (+ more later) — no switching between a news site, a league app, and your phone's calendar | App Store copy, comparison-style social content |
| Built for speed, not scrolling | Calendar-first, not a news feed — get in, see the card, get out | Screenshot/screen-recording ad creative, App Store copy |
| *(secondary)* Actually covers OKTAGON | The gap the big English-language apps leave in DACH | OKTAGON-fan-targeted social content, not the App Store headline |
| *(secondary)* Bilingual DE/EN | Full German localization, not a translated afterthought | App Store copy (both locales), onboarding |

**Elevator pitches by context (draft, restyle once brand voice exists):**
- **App Store short description:** "Every UFC & OKTAGON event, every fight card, all in one fast
  app — never miss a fight again."
- **Social bio (one line):** "Your MMA calendar. UFC + OKTAGON, no scrolling required."
- **Ad headline (screenshot/demo creative):** "One app. Every fight card. No news feed to dig
  through."

**Trademark/neutrality guardrail for all messaging (carried over from the design overhaul's legal
concerns around trade dress and league branding):** never imply UFC endorsement or
affiliation, never use UFC's octagon trade dress or logo in owned assets/ads, and keep copy
worded as covering UFC (factually true, allowed) rather than being *of* UFC. This matters more in
paid ads than organic content — ad platforms and league legal teams both scrutinize paid creative
more closely than a screenshot in a social post.

**Not decided here, revisit once the design overhaul lands:**
- Tone of voice (energetic hype vs. calm/utilitarian vs. dry-humor fan voice)
- Whether taglines above survive once real brand voice/visual style exists — treat these as
  content-accurate placeholders, not final copy.

## 3. Channel strategy

**"The full package" doesn't mean equal effort on every platform — it means a deliberate,
complete pipeline where the channels that fit a solo developer's bandwidth get real investment,
and everything else is either repurposed at near-zero extra cost or explicitly deprioritized with
a stated reason.** Spreading thin across six platforms from day one is the actual failure mode to
avoid here, not a channel being left out.

**Tier 1 — primary content creation (where original effort goes):**
- **TikTok** and **Instagram Reels**, treated as one content stream posted to both. Best
  cold-start discovery mechanism available (algorithmic For-You distribution doesn't require an
  existing following, unlike Facebook/X), and short-form video is the natural format for this
  app's actual content: screen-recordings of the calendar/fight-card UI, event countdowns,
  "who's fighting this weekend" rundowns, tale-of-the-tape graphics. Vertical video, so one shoot
  serves both platforms with no reformatting.

**Tier 2 — repurposed distribution (same assets, different surface, near-zero incremental
effort once Tier 1 exists):**
- **Instagram feed posts/Stories** (carousel versions of the same content — event posters,
  fight-card graphics)
- **YouTube Shorts** (identical vertical clips from Tier 1, uploaded as-is)
- **Long-form YouTube deliberately excluded from the plan** — talking-head or edited long-form
  video needs a fundamentally different production effort (scripting, on-camera presence or
  voiceover, longer edit time) that a solo developer building the app itself can't sustain
  alongside Tier 1/2. Revisit only if Tier 1 content proves popular enough to justify hiring this
  out later.

**Tier 3 — community/engagement plays (not content production, participation):**
- **Facebook Groups** (existing UFC-Germany / OKTAGON fan groups, not a branded Page people would
  have to actively follow) — post-as-a-fan engagement, mentioning the app where genuinely useful
  rather than broadcasting at a Page with no existing audience.
- **Reddit** (r/MMA, DACH-specific MMA subreddits if they exist) — same logic: authentic
  participation first, self-promotion rules on most MMA subreddits are strict and a burned account
  can't be undone, so this is a "be a known, useful presence" play, not a posting schedule.
- Both tiers are a good fit specifically for the OKTAGON-gap secondary message (§2) — that
  audience already congregates in these spaces looking for coverage the big English apps skip.

**Owned channel, independent of any platform's algorithm:**
- **Email list / pre-launch waitlist.** Cheap to start (a simple signup form), immune to platform
  algorithm changes, and directly useful for the launch plan (§6) — a list to notify on launch day
  is worth more than a follower count that may not even see an organic post. Recommend starting
  this earlier than the social channels, since it can begin the moment there's a landing page,
  independent of final branding.

**App Store Optimization (ASO) — the store listing itself is a channel, not just packaging.**
Store search (someone browsing/searching directly in the App Store/Play Store) is free organic
distribution and, per §7, the same keyword research feeds paid Apple Search Ads/Google App
Campaigns directly — so ASO isn't a one-time launch checklist item, it's the shared foundation
under both an organic channel and a paid one:
- **Keywords/metadata:** title, subtitle, and keyword field tuned around the same terms used for
  paid keyword bidding in §7 (own name, "MMA calendar"/"Kampfsport Termine"-style generic terms) —
  do this research once, use it in both places.
- **Screenshots/preview video:** reuse Tier 1's screen-recording content (§3/§4) rather than
  producing separate store-listing assets from scratch — the same UI-speed/design argument that
  drives social content (§1's lead differentiator) is exactly what a store listing needs to show.
- Sits in Phase B/C of the launch plan (§6) — needs to be in place before Phase C's public push and
  before any Stage 1 paid spend (§7), since both a cold organic store visitor and a paid-search
  visitor land on the same listing.

**Paid — summary here, full budget/targeting plan in §7:**
- **Apple Search Ads + Google App Campaigns** (install-intent capture, someone already searching
  "MMA calendar" or similar) are likely **higher ROI than social ads** for a niche utility app and
  should not be an afterthought behind Meta/TikTok ads — worth prioritizing once App Store
  Optimization (keywords, screenshots) is in place.
- **Meta/TikTok paid ads** used to boost organic content that's already proven to perform, not to
  fund cold creative from zero — cheaper and lower-risk than producing dedicated ad creative
  before knowing what resonates.

**Considered and explicitly deprioritized:**
- **X/Twitter** — real-time MMA discourse is genuinely active there, but it rewards high-frequency
  posting and community reply-engagement that competes directly with Tier 1's time budget; revisit
  if Tier 1/2 becomes low-maintenance (e.g. content batching works well) and there's spare capacity.
- **Discord** — MMA fan servers exist, but running/moderating one is a standing commitment, not a
  post-and-done channel; not worth it before there's an active user base to justify it.

## 4. Content pipeline & automation

**The editorial calendar is the event calendar — not a separate planning exercise.** MMA already
has a fixed rhythm (events cluster on specific weekends), and the app's own `events`/`fights` data
(synced via [`scripts/sync-balldontlie.ts`](../scripts/sync-balldontlie.ts), see
[Data model](ARCHITECTURE.md#data-model)) already knows what's happening and when. Content
planning should pull from that data, not duplicate it in a separate content-calendar tool.

**Recurring content formats (Tier 1, TikTok/Reels — repeatable templates, not one-off ideas each
week):**
- **Fight-week rundown** — "this weekend's card" countdown, posted a few days before an event
- **Tale-of-the-tape graphic** — reach/height/record comparison for a notable upcoming fight,
  directly mirrors the `FighterDetailScreen` data already in the app
- **Result recap** — quick post-event summary of how the main card went
- **"Who do you pick?"** — a poll mirroring the app's own [fight-voting feature](ARCHITECTURE.md#voting)
  (`fight_votes`), driving both content engagement *and* an actual reason to open the app before a
  fight — this is the one format that directly connects content to product, not just brand
  awareness.

**Batching, not daily ad-hoc creation.** Because events cluster on weekends, the realistic workflow
for a solo developer is recording several short videos in one sitting (e.g. once a week) rather
than trying to create daily content — batch-record, then use a scheduling tool (e.g. Buffer,
Metricool, or even native platform schedulers) to space out posting across the week.

**Automation opportunity worth building, not just conceptual:** a small script (fits the same
pattern as the existing sync scripts — Node, reads Supabase, no new infra) that generates a
**weekly content brief** — upcoming fights in the next N days, notable records/streaks, any
title/main-event flags — as a structured list. This doesn't replace the human editorial judgment
of what to actually post, but removes the repetitive "what's happening this week" research step
each time, the same way `sync-balldontlie.ts` removes manual data entry. Low priority relative to
the branding-gated work above — build this once content production is actually starting, not now.

**Tools (placeholder, revisit for actual cost/fit once execution starts):** a template tool
(Canva or similar) for the recurring graphic formats above, kept as reusable templates rather than
designed from scratch each time; a free-tier scheduler for cross-posting Tier 1/2 content without
manually re-uploading to each platform.

## 5. Monitoring & KPIs

**Two separate monitoring concerns, don't conflate them:** app-side metrics (is the product
working, is anyone using it) and marketing-side metrics (is content/spend actually driving
installs). Same discipline as the project's existing habit of periodic Supabase advisor checks —
periodic, deliberate review, not a dashboard nobody looks at.

**App/product metrics (needs instrumentation not yet built — flag for the app itself, not just
marketing):**
- Installs, DAU/WAU, retention (D1/D7/D30) — none of this is currently tracked; the app has no
  analytics SDK today. This is a prerequisite, not optional, before any channel/spend decision can
  be judged by real data rather than vanity metrics (likes, follows) alone.
- Funnel-relevant in-app events once analytics exist: event-follow/fighter-follow adds (the
  actual retention hook per [Notifications](ARCHITECTURE.md#notifications)), vote casts (ties
  directly to the content pillar in §4), login conversion (optional, but worth watching whether
  marketing-driven users convert to accounts at a different rate than organic).
- **Recommendation, not yet decided:** a privacy-respecting, low-overhead analytics tool (e.g.
  PostHog, Plausible, or Supabase's own logs/an events table) rather than a heavy full Firebase/GA4
  stack — proportionate to a solo-dev, pre-revenue app. Revisit as its own small technical task,
  likely alongside or right after the design overhaul.

**Marketing/channel metrics:**
- **Organic (Tier 1/2):** views, completion rate, and follower growth per platform — completion
  rate matters more than raw views for judging whether a format (§4) is actually working, views
  alone reward hooky-but-shallow content.
- **Paid (§3/§7):** cost-per-install, split by source (Apple Search Ads / Google App Campaigns /
  Meta / TikTok) — this is exactly why launch tagging/attribution (§6) has to exist *before* any
  paid spend, otherwise cost-per-install can't even be measured per channel.
- **Owned (waitlist):** signup count and, post-launch, signup→install conversion — the one metric
  that validates whether the pre-launch list was worth building at all.

**Review cadence (proposal):** weekly glance at organic performance while content is actively
being posted (cheap, catches a format that isn't working fast); monthly deeper review once
analytics exist, covering retention and paid CPI together — matches the existing project habit of
periodic-not-constant checks rather than a live dashboard.

**Not decided here:**
- Exact analytics tool choice — small technical decision, worth its own short discussion when
  it's time to instrument the app, not buried inside this strategy doc.
- Specific target numbers (e.g. "X% D7 retention") — meaningless to set before there's a baseline;
  set targets after the first real data point, not before.

## 6. Launch plan

**Hard gate, not a scheduling detail: an actual App Store/Play Store submission needs its own
explicit joint go/no-go conversation when the time comes — nothing in this document authorizes
that step.** This section plans the marketing *around* a launch date, it doesn't set one or imply
one is imminent.

**Phase A — pre-launch waitlist (the one exception to "everything waits for branding," per §3).**
A landing page + email capture can start before the visual redesign lands, since it needs only
minimal styling, not final brand assets — every day it's live before launch is a day of list
growth that a post-launch start would lose. Feed it from Tier 3 community participation (§3) and,
once branding exists, early Tier 1 teaser content ("something's coming").

**Phase B — soft launch before any marketing push.** Release quietly (store listing live, but
before Tier 1/2/paid activity points anyone at it) to a small first cohort — ideally people
willing to leave an honest review. Rationale: a store listing with zero ratings converts poorly
against the exact same ad spend that would work fine once there are a handful of genuine reviews;
better to eat that cold-start cost with organic/waitlist traffic than with paid clicks. This also
buys a real-world bug/crash check on a live install before any channel points volume at it —
consistent with this project's existing habit of always verifying on a real standalone build
rather than trusting Expo Go/emulator checks alone.

**Phase C — coordinated public launch**, once Phase B has produced a small base of ratings/reviews:
- Same-day push across every active channel: Tier 1/2 announcement content, Tier 3 community
  posts, an email to the waitlist (this is the actual payoff for building it in Phase A).
- **Tie launch timing to a real upcoming UFC/OKTAGON event if the calendar allows it** — "download
  before this weekend's card" is a concrete, dated reason to act, rather than a generic "check out
  our new app" with no urgency.
- Store featuring (Apple's "New apps we love" etc.) is entirely outside a solo developer's control
  — don't plan around it or delay launch hoping for it.

**Tagging/tracking — must exist *before* Phase C, especially before any paid spend (§3/§7),
otherwise cost-per-install can't be attributed per channel at all:**
- **UTM parameters** on every outbound link (social bio, waitlist emails, ad creative) pointing at
  the landing page pre-launch / store listing post-launch, so §5's channel-level metrics are
  actually possible to compute, not just organic vanity numbers.
- **iOS:** Apple Search Ads' own attribution (and SKAdNetwork if Meta/TikTok app-install campaigns
  run) — required specifically because iOS doesn't expose the referrer data Android does by
  default.
- **Android:** Google Play Install Referrer API — captures which UTM-tagged source drove a given
  install, the Android-side equivalent of the iOS attribution above.
- A single branded/shortened link (UTM-preserving) for contexts that only support one link (e.g.
  a TikTok/Instagram bio) rather than juggling multiple raw tagged URLs.

**Not decided here:**
- The actual launch date/event to tie to — depends on both app readiness and the design overhaul,
  revisit once both are closer to done.
- Who provides Phase B's first-cohort reviews (friends/family vs. waitlist volunteers) — small
  logistics decision, not a strategic one.

## 7. Paid ads strategy

**Sequenced, not simultaneous — a small budget spread across four ad platforms at once produces
four underpowered tests instead of one conclusive one.** Given the "small but real" budget agreed
at the top of this doc, the plan spends it in stages rather than splitting it evenly from day one.

**Stage 1 — Apple Search Ads + Google App Campaigns, first.** Reasoning carried over from §3:
install-intent search converts better than a cold social impression, and both platforms are
relatively low-effort to set up (keyword-based for Apple Search Ads, largely automated
creative-and-keyword optimization for Google App Campaigns) — a good fit for solo-developer
bandwidth. Runs only after Phase C of the launch plan (§6), never against a pre-launch landing
page or a zero-review Phase B listing.

**Stage 2 — boost proven organic content (Meta + TikTok), only after Stage 1 has a baseline
CPI.** Both platforms support directly boosting an existing organic post (TikTok Spark Ads, Meta's
boost-post flow) rather than requiring dedicated ad creative — the natural next step once §4's
content pipeline has actually produced something that performed well organically. This is
deliberately not "run static app-install ads with stock creative" — that skips the one signal
(organic performance) that tells you which message/format is worth paying to amplify.

**Targeting, both stages:**
- **Geo: strictly DACH** (Germany/Austria/Switzerland) — matches the app's actual positioning and
  data coverage; broader English-speaking targeting would compete head-on with Tapology/Sherdog's
  home turf where True MMA's DE/EN and OKTAGON advantages (§1/§2) don't apply.
- **Interest targeting (Meta/TikTok):** UFC/MMA/OKTAGON page-follower and interest categories
  first; a lookalike audience built from real early users becomes available (and is usually
  stronger than interest targeting alone) only once Phase B/C (§6) has produced actual installs —
  not available at launch, revisit once there's a seed audience.
- **Keywords (Apple Search Ads/Google), three distinct tiers, each with different risk:**
  1. **Own name + close variants** — no restriction.
  2. **Generic terms** — "MMA calendar", "UFC events app", "Kampfsport Termine" — safe, describe
     the product rather than any specific brand.
  3. **League/brand names as bid keywords — "UFC", "OKTAGON", "Bellator" etc.** — a genuinely
     different question from bidding on a *competitor app's* name (Tapology, Sherdog), even though
     both need a policy check before use. UFC/OKTAGON are the leagues the app *covers*, not rivals
     — bidding on their name as a keyword is closer to "someone searching for UFC event times" than
     to trying to divert a competitor's branded search traffic, but it's still a third party's
     trademark, so this needs the same platform-policy verification as tier-3 competitor bidding
     before use, not an automatic pass just because the intent differs. Check each platform's
     trademark-bidding rules for the specific term before running it, separate from the ad-content
     trademark-neutrality guardrail in §2 (which covers what the ad *shows*, not what keyword
     triggers it).

**Test-budget discipline:** run each new platform/audience combination at a small, fixed daily
spend for a defined test window (a couple of weeks, not a single day — MMA content has an
event-driven cadence, so a test window should span at least one real event cycle) before deciding
to scale it up or kill it. Evaluate against §5's actual metrics (CPI plus early retention, not
just click volume) — a cheap install that churns immediately is worse than a slightly pricier one
that sticks.

**Not decided here:**
- Concrete daily/monthly € figures — depends on the actual budget number, which hasn't been
  pinned down yet; revisit once that's known.
- Whether to ever bid on competitor brand terms — a platform-policy and legal question, not a
  strategy question, check at the time rather than deciding abstractly now.

## 8. Risks & open items

**Capacity risk — the biggest one.** Every phase above assumes a solo developer who is
*simultaneously* still building the app itself. Content batching (§4) and channel prioritization
(§3) exist specifically to manage this, but the real risk is marketing time quietly crowding out
development time (or vice versa) once execution starts — worth an explicit check-in once
execution begins, not just at planning time.

**Everything here is sequenced behind the design overhaul.** That's a deliberate choice (see the
top of this doc), not a hidden assumption — but it means this entire plan's timeline is only as
firm as that process's. If the redesign stalls, so does every execution step here; the waitlist
(§6 Phase A) is the one piece that doesn't have to wait.

**No analytics instrumentation exists yet (§5).** Everything in §5/§7 that talks about measuring
CPI, retention, or format performance is only possible once that's built — treat "add basic
analytics" as a prerequisite task for the app itself, not a marketing task, and sequence it before
Stage 1 paid spend (§7) at the latest.

**Trademark/brand-adjacency risk, both UFC and OKTAGON.** §2's guardrail (no octagon trade dress,
no implied endorsement) covers the obvious UFC risk; the same logic applies to OKTAGON and any
other covered league — worth an explicit pass over ad creative and App Store screenshots
specifically (not just organic posts) before Stage 1 paid spend goes live, since paid creative
gets more scrutiny than an organic post.

**Community-channel account risk (§3, Tier 3).** Facebook groups and MMA subreddits enforce
self-promotion rules strictly, and a banned/shadowbanned account can't be undone — treat this as
"participate as a genuine fan first," not a posting cadence to hit, especially in the first weeks
of engaging with any group/subreddit.

**Cold-start store risk (§6).** The soft-launch phase exists specifically to avoid a zero-review
listing meeting paid traffic, but it only works if Phase B genuinely produces a few honest reviews
before Phase C starts — if it doesn't, the launch plan needs a real pause here rather than
proceeding to Phase C anyway on a fixed timeline.

**Platform algorithm dependency (§3, Tier 1).** TikTok/Reels organic reach is not guaranteed or
stable — the whole cold-start channel strategy leans on algorithmic discovery working the way it
currently does. No mitigation beyond diversifying into Tier 2 (already planned) and not
over-committing paid budget to amplify a format before it's proven organically.

**No monetization live yet.** Marketing spend (§7) has to be justified on install/engagement
metrics alone for now, with no revenue to measure payback against — fine for a small test budget,
but worth remembering before scaling any paid stage up, since "worth spending more" can't yet be
answered in € terms.

---

**This closes the first full pass of the strategy (§1–8).** Nothing here is authorized to execute
yet — per the status note at the top, everything except the waitlist (§6 Phase A) waits on the
design overhaul, and any real store submission needs its own separate go/no-go conversation
regardless of what this document says. Treat this as the plan to pick back up once branding lands,
not a queue of tasks to start now.
