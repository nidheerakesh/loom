import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireRole, sessionByToken } from "./lib/session";
import { distanceKm } from "./lib/geo";

// Collective matching (TDD §6.2). Greedy, capacity-aware set-cover over the cluster.
// Deterministic: candidates sorted by (proficiency desc, distance asc, _id) — no randomness,
// so the same request always yields the same team.
export const assemble = mutation({
  args: { token: v.string(), requestId: v.id("requests") },
  handler: async (ctx, { token, requestId }) => {
    const s = await requireRole(ctx, token, "customer");
    const request = await ctx.db.get("requests", requestId);
    if (!request) throw new Error("Request not found");
    if (request.customerId !== (s.userId as Id<"customers">)) throw new Error("Not your request");

    const reqSkills = await ctx.db
      .query("requestSkills")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .collect();
    const remaining = new Map<string, number>();
    for (const rs of reqSkills) remaining.set(rs.skillId, rs.quantity);

    // build candidate pool: provider + per-skill proficiency + distance + capacity left
    type Cand = {
      provider: Doc<"providers">;
      distance: number;
      capLeft: number;
      prof: Map<string, number>;
    };
    const candMap = new Map<string, Cand>();
    for (const rs of reqSkills) {
      const rows = await ctx.db
        .query("providerSkills")
        .withIndex("by_skill", (q) => q.eq("skillId", rs.skillId))
        .collect();
      for (const row of rows) {
        const key = row.providerId;
        if (!candMap.has(key)) {
          const p = await ctx.db.get("providers", row.providerId);
          if (!p || !p.available) continue;
          const dist = await distanceKm(ctx, p.homeLocationId, request.locationId);
          candMap.set(key, { provider: p, distance: dist, capLeft: p.capacity, prof: new Map() });
        }
        const c = candMap.get(key);
        if (c) c.prof.set(rs.skillId, row.proficiency);
      }
    }

    // assignments: providerId -> skillId -> units
    const assignments = new Map<string, Map<string, number>>();
    let progress = true;
    while (progress) {
      progress = false;
      for (const rs of reqSkills) {
        const need = remaining.get(rs.skillId) ?? 0;
        if (need <= 0) continue;
        // eligible candidates for this skill with capacity left
        const eligible = [...candMap.values()].filter(
          (c) => c.capLeft > 0 && c.prof.has(rs.skillId),
        );
        if (eligible.length === 0) continue;
        eligible.sort((a, b) => {
          const pa = a.prof.get(rs.skillId)!;
          const pb = b.prof.get(rs.skillId)!;
          if (pb !== pa) return pb - pa;
          if (a.distance !== b.distance) return a.distance - b.distance;
          return a.provider._id < b.provider._id ? -1 : 1;
        });
        const pick = eligible[0];
        const take = Math.min(need, pick.capLeft);
        pick.capLeft -= take;
        remaining.set(rs.skillId, need - take);
        const pid = pick.provider._id;
        if (!assignments.has(pid)) assignments.set(pid, new Map());
        const m = assignments.get(pid)!;
        m.set(rs.skillId, (m.get(rs.skillId) ?? 0) + take);
        progress = true;
      }
    }

    const complete = [...remaining.values()].every((x) => x <= 0);

    // rationale
    const chosenProviderIds = [...assignments.keys()];
    const groupIds = new Set<string>();
    for (const pid of chosenProviderIds) {
      const c = candMap.get(pid);
      if (c?.provider.groupId) groupIds.add(c.provider.groupId);
    }
    const skillNames: string[] = [];
    for (const rs of reqSkills) {
      const sk = await ctx.db.get("skills", rs.skillId);
      if (sk) skillNames.push(sk.canonicalName);
    }
    const rationale = `${chosenProviderIds.length} providers across ${groupIds.size} group(s) cover ${skillNames.join(", ")}.${complete ? " Coverage complete." : " Coverage INCOMPLETE."}`;

    // clear any prior team for this request
    const priorTeams = await ctx.db
      .query("teams")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .collect();
    for (const t of priorTeams) {
      const members = await ctx.db
        .query("teamMembers")
        .withIndex("by_team", (q) => q.eq("teamId", t._id))
        .collect();
      for (const m of members) await ctx.db.delete("teamMembers", m._id);
      await ctx.db.delete("teams", t._id);
    }

    const teamId = await ctx.db.insert("teams", {
      requestId,
      status: "proposed",
      rationale,
      complete,
    });
    for (const [pid, skillMap] of assignments) {
      for (const [skillId, units] of skillMap) {
        await ctx.db.insert("teamMembers", {
          teamId,
          providerId: pid as Id<"providers">,
          assignedSkillId: skillId as Id<"skills">,
          coveredUnits: units,
          state: "invited",
        });
      }
    }
    await ctx.db.patch("requests", requestId, { status: "assembling" });
    return { teamId, complete };
  },
});

export const getTeam = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const team = await ctx.db.get("teams", teamId);
    if (!team) return null;
    const request = await ctx.db.get("requests", team.requestId);
    const memberRows = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    const members = [];
    for (const m of memberRows) {
      const p = await ctx.db.get("providers", m.providerId);
      const sk = await ctx.db.get("skills", m.assignedSkillId);
      let groupName: string | null = null;
      if (p?.groupId) {
        const g = await ctx.db.get("groups", p.groupId);
        groupName = g?.name ?? null;
      }
      members.push({
        providerId: m.providerId,
        name: p?.name ?? "",
        shopName: p?.shopName ?? null,
        group: groupName,
        skill: sk?.canonicalName ?? "",
        skillMl: sk?.canonicalNameMl ?? null,
        coveredUnits: m.coveredUnits,
        state: m.state,
      });
    }
    return {
      _id: team._id,
      status: team.status,
      rationale: team.rationale,
      complete: team.complete,
      requestTitle: request?.title ?? "",
      requestUnits: request?.units ?? 0,
      members,
    };
  },
});

export const confirm = mutation({
  args: { token: v.string(), teamId: v.id("teams") },
  handler: async (ctx, { token, teamId }) => {
    await requireRole(ctx, token, "customer");
    const team = await ctx.db.get("teams", teamId);
    if (!team) throw new Error("Team not found");
    await ctx.db.patch("teams", teamId, { status: "confirmed" });
    await ctx.db.patch("requests", team.requestId, { status: "assigned" });
    return null;
  },
});

export const respondInvite = mutation({
  args: { token: v.string(), teamId: v.id("teams"), accept: v.boolean() },
  handler: async (ctx, { token, teamId, accept }) => {
    const s = await requireRole(ctx, token, "provider");
    const providerId = s.userId as Id<"providers">;
    const rows = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .filter((q) => q.eq(q.field("providerId"), providerId))
      .collect();
    for (const r of rows) {
      await ctx.db.patch("teamMembers", r._id, { state: accept ? "accepted" : "declined" });
    }
    return null;
  },
});

export const myTeams = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const s = await sessionByToken(ctx, token);
    if (!s || s.role !== "provider") return [];
    const providerId = s.userId as Id<"providers">;
    const rows = await ctx.db
      .query("teamMembers")
      .withIndex("by_provider", (q) => q.eq("providerId", providerId))
      .collect();
    const out = [];
    for (const m of rows) {
      const team = await ctx.db.get("teams", m.teamId);
      if (!team) continue;
      const request = await ctx.db.get("requests", team.requestId);
      const sk = await ctx.db.get("skills", m.assignedSkillId);
      out.push({
        teamId: team._id,
        teamStatus: team.status,
        requestTitle: request?.title ?? "",
        skill: sk?.canonicalName ?? "",
        skillMl: sk?.canonicalNameMl ?? null,
        coveredUnits: m.coveredUnits,
        state: m.state,
      });
    }
    return out;
  },
});
