# RAK Editing Studio — customer accounts and visitor dashboard

This branch now contains the customer-account UI, Supabase client integration, protected premium-prompts page, and database security foundation. It is still **not live**: `supabase-config.js` contains placeholders, and the Supabase project/schema/owner allow-list must be configured and tested first.

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
6. Run `supabase/seed-premium-prompts.sql` after `supabase/schema.sql`. The seven prompt texts formerly embedded in `prompts.html` have been moved into the protected `premium_prompts` table and the page now loads them only after authentication. Advanced-tool records should also be entered into `advanced_tools` before advertising them as members-only.
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
