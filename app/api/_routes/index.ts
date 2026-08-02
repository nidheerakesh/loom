import type { VercelRequest, VercelResponse } from "@vercel/node";

import r_auth_me from "./auth/me";
import r_auth_request_otp from "./auth/request-otp";
import r_auth_sign_out from "./auth/sign-out";
import r_auth_verify_otp from "./auth/verify-otp";
import r_chat_messages from "./chat/messages";
import r_chat_threads from "./chat/threads";
import r_customers_history from "./customers/history";
import r_customers_my_requests from "./customers/my-requests";
import r_customers_update_profile from "./customers/update-profile";
import r_grievances_mine from "./grievances/mine";
import r_grievances_submit from "./grievances/submit";
import r_matching_feed from "./matching/feed";
import r_narration_get from "./narration/get";
import r_providers_get from "./providers/get";
import r_providers_portfolio from "./providers/portfolio/index";
import r_providers_portfolio_upload_url from "./providers/portfolio/upload-url";
import r_providers_search from "./providers/search";
import r_providers_update_profile from "./providers/update-profile";
import r_ratings_rate from "./ratings/rate";
import r_requests_create from "./requests/create";
import r_requests_get from "./requests/get";
import r_requests_interested_providers from "./requests/interested-providers";
import r_requests_my_incoming from "./requests/my-incoming";
import r_requests_respond from "./requests/respond";
import r_skills_list from "./skills/list";
import r_skills_mine from "./skills/mine";
import r_skills_resolve from "./skills/resolve";
import r_team_assembly_assemble from "./team-assembly/assemble";
import r_team_assembly_confirm from "./team-assembly/confirm";
import r_team_assembly_get from "./team-assembly/get";
import r_team_assembly_my_teams from "./team-assembly/my-teams";
import r_team_assembly_respond_invite from "./team-assembly/respond-invite";

export type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

// Every API route, keyed by the path after `/api/`. This map is the single source of
// truth for routing: `api/[...path].ts` dispatches production requests through it and
// `scripts/dev-api-server.ts` serves local dev from it, so both run the same handlers.
// Imports are static on purpose — Vercel's bundler traces dependencies at build time
// and a dynamic `import(variable)` would leave the handlers out of the bundle.
export const routes: Record<string, Handler> = {
  "auth/me": r_auth_me,
  "auth/request-otp": r_auth_request_otp,
  "auth/sign-out": r_auth_sign_out,
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
