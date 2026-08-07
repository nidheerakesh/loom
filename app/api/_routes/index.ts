import type { VercelRequest, VercelResponse } from "@vercel/node";

import r_auth_complete_login from "./auth/complete-login.js";
import r_auth_me from "./auth/me.js";
import r_auth_request_otp from "./auth/request-otp.js";
import r_auth_sign_out from "./auth/sign-out.js";
import r_auth_switch_role from "./auth/switch-role.js";
import r_auth_verify_otp from "./auth/verify-otp.js";
import r_chat_messages from "./chat/messages.js";
import r_chat_threads from "./chat/threads.js";
import r_customers_history from "./customers/history.js";
import r_customers_my_requests from "./customers/my-requests.js";
import r_customers_update_profile from "./customers/update-profile.js";
import r_grievances_mine from "./grievances/mine.js";
import r_grievances_submit from "./grievances/submit.js";
import r_matching_feed from "./matching/feed.js";
import r_narration_get from "./narration/get.js";
import r_providers_get from "./providers/get.js";
import r_providers_portfolio from "./providers/portfolio/index.js";
import r_providers_portfolio_upload_url from "./providers/portfolio/upload-url.js";
import r_providers_search from "./providers/search.js";
import r_providers_update_profile from "./providers/update-profile.js";
import r_ratings_rate from "./ratings/rate.js";
import r_requests_create from "./requests/create.js";
import r_requests_get from "./requests/get.js";
import r_requests_interested_providers from "./requests/interested-providers.js";
import r_requests_my_incoming from "./requests/my-incoming.js";
import r_requests_respond from "./requests/respond.js";
import r_skills_list from "./skills/list.js";
import r_skills_mine from "./skills/mine.js";
import r_skills_resolve from "./skills/resolve.js";
import r_team_assembly_assemble from "./team-assembly/assemble.js";
import r_team_assembly_confirm from "./team-assembly/confirm.js";
import r_team_assembly_get from "./team-assembly/get.js";
import r_team_assembly_my_teams from "./team-assembly/my-teams.js";
import r_team_assembly_respond_invite from "./team-assembly/respond-invite.js";

export type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

// Every API route, keyed by the path after `/api/`. This map is the single source of
// truth for routing: `api/[...path].ts` dispatches production requests through it and
// `scripts/dev-api-server.ts` serves local dev from it, so both run the same handlers.
// Imports are static on purpose — Vercel's bundler traces dependencies at build time
// and a dynamic `import(variable)` would leave the handlers out of the bundle.
export const routes: Record<string, Handler> = {
  "auth/complete-login": r_auth_complete_login,
  "auth/me": r_auth_me,
  "auth/request-otp": r_auth_request_otp,
  "auth/sign-out": r_auth_sign_out,
  "auth/switch-role": r_auth_switch_role,
  "auth/verify-otp": r_auth_verify_otp,
  "chat/messages": r_chat_messages,
  "chat/threads": r_chat_threads,
  "customers/history": r_customers_history,
  "customers/my-requests": r_customers_my_requests,
  "customers/update-profile": r_customers_update_profile,
  "grievances/mine": r_grievances_mine,
  "grievances/submit": r_grievances_submit,
  "matching/feed": r_matching_feed,
  "narration/get": r_narration_get,
  "providers/get": r_providers_get,
  "providers/portfolio": r_providers_portfolio,
  "providers/portfolio/upload-url": r_providers_portfolio_upload_url,
  "providers/search": r_providers_search,
  "providers/update-profile": r_providers_update_profile,
  "ratings/rate": r_ratings_rate,
  "requests/create": r_requests_create,
  "requests/get": r_requests_get,
  "requests/interested-providers": r_requests_interested_providers,
  "requests/my-incoming": r_requests_my_incoming,
  "requests/respond": r_requests_respond,
  "skills/list": r_skills_list,
  "skills/mine": r_skills_mine,
  "skills/resolve": r_skills_resolve,
  "team-assembly/assemble": r_team_assembly_assemble,
  "team-assembly/confirm": r_team_assembly_confirm,
  "team-assembly/get": r_team_assembly_get,
  "team-assembly/my-teams": r_team_assembly_my_teams,
  "team-assembly/respond-invite": r_team_assembly_respond_invite,
};
