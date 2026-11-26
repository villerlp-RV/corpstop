import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import * as teams from "@/lib/team-service";

// Team membership lives in User.team_id / User.team_role, which field-level
// security makes read-only for users, so these server functions are the only
// way to change it. Each one authenticates the caller (requireUser) and
// validates input; src/lib/team-service.js checks the team rule before it
// uses the service role.

const admin = (context) => context.getBase44().asServiceRole;
const name = z.string().trim().min(1).max(80);

export const getTeamOverview = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(({ context }) => teams.overview(admin(context), context.user));

export const createTeam = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ name }))
  .handler(({ data, context }) => teams.create(admin(context), context.user, data));

export const joinTeam = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ code: z.string().max(40), bringRecords: z.boolean() }))
  .handler(({ data, context }) => teams.join(admin(context), context.user, data));

export const leaveTeam = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(({ context }) => teams.leave(admin(context), context.user));

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ userId: z.string().min(1).max(100) }))
  .handler(({ data, context }) => teams.remove(admin(context), context.user, data));

export const resetInviteCode = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(({ context }) => teams.resetInvite(admin(context), context.user));

export const renameTeam = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ name }))
  .handler(({ data, context }) => teams.rename(admin(context), context.user, data));
