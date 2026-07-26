/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as customers from "../customers.js";
import type * as grievances from "../grievances.js";
import type * as lib_geo from "../lib/geo.js";
import type * as lib_scoring from "../lib/scoring.js";
import type * as lib_seedHelpers from "../lib/seedHelpers.js";
import type * as lib_session from "../lib/session.js";
import type * as lib_text from "../lib/text.js";
import type * as lib_translate from "../lib/translate.js";
import type * as matching from "../matching.js";
import type * as narration from "../narration.js";
import type * as providers from "../providers.js";
import type * as ratings from "../ratings.js";
import type * as requests from "../requests.js";
import type * as seed from "../seed.js";
import type * as skills from "../skills.js";
import type * as teamAssembly from "../teamAssembly.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  chat: typeof chat;
  customers: typeof customers;
  grievances: typeof grievances;
  "lib/geo": typeof lib_geo;
  "lib/scoring": typeof lib_scoring;
  "lib/seedHelpers": typeof lib_seedHelpers;
  "lib/session": typeof lib_session;
  "lib/text": typeof lib_text;
  "lib/translate": typeof lib_translate;
  matching: typeof matching;
  narration: typeof narration;
  providers: typeof providers;
  ratings: typeof ratings;
  requests: typeof requests;
  seed: typeof seed;
  skills: typeof skills;
  teamAssembly: typeof teamAssembly;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
