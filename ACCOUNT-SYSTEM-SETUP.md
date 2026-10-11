# RAK Editing Studio — customer accounts and visitor dashboard

This branch contains a draft customer-account UI, Supabase client integration, a premium-prompts page that queries a protected database, and database security foundation. It is still **not live**: `supabase-config.js` contains placeholders, and the Supabase project/schema/owner allow-list must be configured and tested first.

## Planned behavior

- Public without login: home, videos, photos, public resources, basic prompt tools.
- Login required: premium/exclusive prompts, saved prompts, advanced tools, customer account and order history.
- Owner-only dashboard: total recorded visits, approximate unique visitors for the last 30 days, registered accounts, users who logged in during the last 30 days, and order counts/status.
- RAK AI website knowledge must be updated when the real features are deployed; it must not claim they are live before setup is complete.

## Why Supabase is needed

GitHub Pages serves static files. It cannot securely manage passwords, shared customer records, private premium prompts, order history, or a private owner dashboard by itself. This project uses Supabase Auth + Postgres Row Level Security (RLS) as the proposed backend.

## Setup steps (after connecting/creating the Supabase project)

1. Create a Supabase project and enable email/password authentication. Set the site URL to `https://rakeditingstudio.github.io/Rakeditingstudio/` and add the same URL to allowed redirect URLs.
2. In Supabase SQL Editor, run `supabase/schema.sql` once.
3. Publish the public Supabase project URL and anon/publishable key to the frontend config only. **Never** put the `service_role` key in `index.html`, any client-side file, or GitHub.
4. After the owner signs up through the real site, use the SQL Editor to grant owner access (replace the placeholder with the owner email):
   ```sql
   insert into public.studio_admins (user_id)
   select id from auth.users where email = 'OWNER_EMAIL_HERE'
   on conflict (user_id) do nothing;
   ```
5. The frontend files `account.js` and `premium-prompts.js` already implement email sign-up/sign-in, password reset on the main site, sign-out, saved prompts, customer order history/enquiry saving, visit recording, and owner-only dashboard calls. Configure `supabase-config.js` with the project's public URL and anon/publishable key. Never use a service-role key in frontend code.
6. Do not commit exclusive prompt text to this public repository. After applying the schema, add only newly created private prompts directly through the Supabase Dashboard Table Editor (`premium_prompts`). Add advanced-tool records to `advanced_tools` before advertising them as members-only. Prompts previously included in public HTML or Git history must be treated as public; moving them to a database later cannot make copies already published in Git history secret.
7. Anonymous visit recording is wired through `record_site_visit`. It uses a random browser-generated UUID and does not require storing IP addresses. Counts are estimates; one browser/profile may be counted as a separate visitor.
8. Test with a regular customer account and an owner account. Confirm that customers cannot read other users' saved prompts/orders or access dashboard statistics. Then merge the draft pull request to publish the website changes. Do not merge until configuration and tests are complete.

## Database tables/functions in this branch

- `profiles`: one record per authenticated account.
- `studio_admins`: owner/admin allow-list; not writable by normal clients.
- `saved_prompts`: each user can read/write only their own saved prompts.
- `premium_prompts`: readable by signed-in users; only owner/admin can manage them.
- `advanced_tools`: readable by signed-in users; only owner/admin can manage them.
- `customer_orders`: customers can create/read their own orders; only owner/admin can update status.
- `site_visits`: anonymous daily page-view events; raw rows are owner-only.
- `login_events`: login events; readable only by owner/admin.
- `record_site_visit`, `record_login_event`, `get_studio_dashboard_stats`: restricted database functions for tracking and dashboard metrics.

No payment integration is included. Login does not mean a payment has been verified, and the existing ₹200 monthly / ₹1,000 yearly displayed plans must not automatically unlock paid benefits until a real payment-verification flow exists.


## Privacy limitation for a public GitHub repository

The repository is public. Any prompt text committed to HTML, SQL seed files, or Git history can be viewed by visitors even if the current page hides it behind sign-in. Do not use old publicly committed prompts as secret paid content. Keep new exclusive prompt text out of Git and enter it directly into Supabase after access policies are configured. A database login gate does not make previously published text private.
