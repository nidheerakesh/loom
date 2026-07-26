import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Loom — two-sided marketplace. The "graph" (providers, skills, groups, requests,
// locations with typed edges) is modeled as Convex tables. All matching runs over these.
// Externals (STT/TTS/LLM/embeddings) are mocked; matching stays deterministic.

export const roleValidator = v.union(
  v.literal("provider"),
  v.literal("customer"),
  v.literal("admin"),
);

export default defineSchema({
  // --- Auth (mock phone-OTP; demo-only, no external provider) ---
  otps: defineTable({
    phoneHash: v.string(),
    codeHash: v.string(),
    role: roleValidator,
    expiresAt: v.number(),
  }).index("by_phoneHash", ["phoneHash"]),

  sessions: defineTable({
    token: v.string(),
    role: roleValidator,
    userId: v.string(), // providers._id or customers._id (as string)
    phoneHash: v.string(),
  }).index("by_token", ["token"]),

  // --- Cluster / geography ---
  cds: defineTable({
    name: v.string(),
    panchayat: v.string(),
  }),

  groups: defineTable({
    name: v.string(),
    cdsId: v.id("cds"),
  }).index("by_cds", ["cdsId"]),

  locations: defineTable({
    lat: v.number(),
    lng: v.number(),
    label: v.string(),
  }),

  nearDistances: defineTable({
    fromLocationId: v.id("locations"),
    toLocationId: v.id("locations"),
    distanceKm: v.number(),
  }).index("by_from", ["fromLocationId"]),

  // --- Skills + canonicalization (synonym merge, S9) ---
  skills: defineTable({
    canonicalName: v.string(), // English canonical label
    canonicalNameMl: v.optional(v.string()), // Malayalam label
    iconKey: v.string(),
  }).index("by_name", ["canonicalName"]),

  skillAliases: defineTable({
    skillId: v.id("skills"),
    aliasText: v.string(), // normalized (lowercase, trimmed)
    source: v.union(v.literal("curated"), v.literal("approved")),
  })
    .index("by_alias", ["aliasText"])
    .index("by_skill", ["skillId"]),

  skillCandidates: defineTable({
    rawText: v.string(),
    nearestSkillId: v.optional(v.id("skills")),
    similarity: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
  }),

  // --- Providers (the "skilled" side) ---
  providers: defineTable({
    name: v.string(),
    shopName: v.optional(v.string()),
    phoneHash: v.string(),
    available: v.boolean(),
    capacity: v.number(), // no. of ppl; 1 = solo, >1 = shop
    rate: v.optional(v.number()),
    rateUnit: v.optional(v.string()), // e.g. "piece", "day"
    deliveryDays: v.optional(v.number()),
    experienceYears: v.number(),
    rating: v.number(), // aggregate 0-5 (display-first)
    ratingCount: v.number(),
    languages: v.array(v.string()),
    homeLocationId: v.id("locations"),
    groupId: v.optional(v.id("groups")),
  })
    .index("by_phoneHash", ["phoneHash"])
    .index("by_group", ["groupId"]),

  providerSkills: defineTable({
    providerId: v.id("providers"),
    skillId: v.id("skills"),
    proficiency: v.number(), // graded 1-5
    rate: v.optional(v.number()), // optional per-skill rate
  })
    .index("by_provider", ["providerId"])
    .index("by_skill", ["skillId"]),

  portfolioItems: defineTable({
    providerId: v.id("providers"),
    storageId: v.optional(v.id("_storage")),
    caption: v.optional(v.string()),
  }).index("by_provider", ["providerId"]),

  // --- Customers (demand side; absorbs coordinator) ---
  customers: defineTable({
    name: v.string(),
    company: v.optional(v.string()),
    phoneHash: v.string(),
    locationId: v.id("locations"),
  }).index("by_phoneHash", ["phoneHash"]),

  // --- Requests (demand) ---
  requests: defineTable({
    title: v.string(),
    description: v.string(),
    mode: v.union(v.literal("individual"), v.literal("group")),
    units: v.number(),
    pay: v.optional(v.number()),
    deadline: v.optional(v.string()),
    locationId: v.id("locations"),
    status: v.union(
      v.literal("open"),
      v.literal("assembling"),
      v.literal("assigned"),
      v.literal("completed"),
    ),
    customerId: v.id("customers"),
  })
    .index("by_customer", ["customerId"])
    .index("by_status", ["status"]),

  requestSkills: defineTable({
    requestId: v.id("requests"),
    skillId: v.id("skills"),
    quantity: v.number(),
  })
    .index("by_request", ["requestId"])
    .index("by_skill", ["skillId"]),

  interests: defineTable({
    providerId: v.id("providers"),
    requestId: v.id("requests"),
    state: v.union(
      v.literal("interested"),
      v.literal("accepted"),
      v.literal("declined"),
    ),
  })
    .index("by_request", ["requestId"])
    .index("by_provider", ["providerId"]),

  // --- Matching audit + teams ---
  matches: defineTable({
    type: v.union(v.literal("individual"), v.literal("team")),
    providerId: v.optional(v.id("providers")),
    requestId: v.id("requests"),
    score: v.object({
      skillFit: v.number(),
      proximity: v.number(),
      pay: v.number(),
    }),
    path: v.array(v.array(v.string())),
  })
    .index("by_request", ["requestId"])
    .index("by_provider", ["providerId"]),

  teams: defineTable({
    requestId: v.id("requests"),
    status: v.union(v.literal("proposed"), v.literal("confirmed")),
    rationale: v.string(),
    complete: v.boolean(),
  }).index("by_request", ["requestId"]),

  teamMembers: defineTable({
    teamId: v.id("teams"),
    providerId: v.id("providers"),
    assignedSkillId: v.id("skills"),
    coveredUnits: v.number(),
    state: v.union(
      v.literal("invited"),
      v.literal("accepted"),
      v.literal("declined"),
    ),
  })
    .index("by_team", ["teamId"])
    .index("by_provider", ["providerId"]),

  narrations: defineTable({
    matchId: v.id("matches"),
    lang: v.string(),
    text: v.string(),
    grounded: v.boolean(),
  }).index("by_match", ["matchId"]),

  // --- Marketplace extras (all outside the match decision) ---
  ratings: defineTable({
    providerId: v.id("providers"),
    customerId: v.id("customers"),
    stars: v.number(),
    comment: v.optional(v.string()),
  }).index("by_provider", ["providerId"]),

  grievances: defineTable({
    reporterId: v.string(),
    reporterRole: roleValidator,
    subject: v.string(),
    body: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("reviewing"),
      v.literal("resolved"),
    ),
  }).index("by_reporter", ["reporterId"]),

  chatThreads: defineTable({
    contextType: v.union(
      v.literal("provider"),
      v.literal("request"),
      v.literal("team"),
      v.literal("direct"),
    ),
    contextId: v.string(),
    title: v.string(),
  }).index("by_context", ["contextType", "contextId"]),

  messages: defineTable({
    threadId: v.id("chatThreads"),
    senderId: v.string(),
    senderRole: roleValidator,
    body: v.string(),
    readAt: v.optional(v.number()),
  }).index("by_thread", ["threadId"]),
});
