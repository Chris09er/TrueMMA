<!--
Internal reference, not a published legal document. Maps the data model in
docs/ARCHITECTURE.md to the structured questionnaires Google Play ("Data
safety" section) and Apple App Store Connect ("App Privacy" / nutrition
label) require at submission time. Update whenever the data model changes.
Fill the actual forms in Play Console / App Store Connect using this as a
cheat sheet — this file itself isn't uploaded anywhere.
-->

# Store data-safety / app-privacy cheat sheet

## Google Play Console → App content → Data safety

**Does your app collect or share any of the required user data types?**
Yes.

| Data type | Collected? | Shared with 3rd parties? | Purpose | Optional or required | Linked to identity? |
|---|---|---|---|---|---|
| Email address | Yes | No (Supabase/IONOS act as processors, not "sharing" under Play's definition — see note) | Account management | Optional (account is opt-in) | Yes, if account created |
| User-generated content (nickname) | Yes | No | App functionality (profile display) | Optional | Yes, if account created |
| Device or other IDs (push token, fighter/organization follow) | Yes | No | App functionality (push notifications) | Optional (only if user enables follow/reminders) | Only if account exists, otherwise not linked |
| Device or other IDs (voting identifier) | Yes | No | App functionality (community fight predictions) | Optional (only if user casts a vote) | Never — no account-linking path exists for `fight_votes` |

**Note on "shared":** Expo (push relay), Firebase Cloud Messaging, and
IONOS (SMTP) are service providers processing data strictly to operate the
app's own features, not third parties using data for their own purposes —
Play's Data Safety form has a specific exemption for this ("service
providers" under its help text). Don't tick "shared" for these; do list
them if the form asks for a processor/sub-processor breakdown.

**Security practices section:**
- "Data is encrypted in transit" → Yes (HTTPS/TLS to Supabase and Expo).
- "You can request that data be deleted" → Yes (email support@true-mma.com,
  see [privacy-policy.en.md](privacy-policy.en.md) §7).
- "Committed to the Play Families Policy" → No (app isn't directed at
  children, but also isn't explicitly designed for the Families program).

## Apple App Store Connect → App Privacy

**Data Used to Track You:** None. (No advertising/analytics SDKs, no
cross-app/cross-site tracking.)

**Data Linked to You** (only applies once a user creates an account):
- **Contact Info → Email Address** — used for App Functionality (account
  login), not linked to Advertising.
- **Identifiers → User ID** — the Supabase `auth.users` id, used for App
  Functionality.
- **Other Data → Other User Content** — the optional nickname.
- **Identifiers → Device ID** — the push token, *only* when a
  `push_subscriptions`/`organization_follows` row is linked to a
  logged-in `user_id`.

**Data Not Linked to You:**
- **Identifiers → Device ID** — the push token for anonymous
  (not-logged-in) follows, since Apple's "linked" definition is about
  linkage to the user's identity, and an anonymous row has none.
- **Identifiers → Device ID** — the app-generated voting identifier
  (`fight_votes`), which never links to an account at all, logged in or
  not (see [Voting](../ARCHITECTURE.md#voting)).

**Data collection purposes to select, per data type above:** "App
Functionality" only — none of these are used for Analytics, Advertising,
Third-Party Advertising, or Product Personalization.

## Things to double check before submitting either form

- If [FCM V1 / Android push](../ARCHITECTURE.md#notifications) or the
  auth/email provider ever changes, re-check both forms — they're
  currently accurate as of 2026-07-19's data model.
- Both stores require a **published, reachable Privacy Policy URL** at
  submission time — the drafts in this folder need to be hosted somewhere
  public (e.g. a static page at `true-mma.com/privacy`) before they can be
  linked in either console. Not yet done — see
  [Known open items](../ARCHITECTURE.md#known-open-items).
