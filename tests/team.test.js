import test from "node:test";
import assert from "node:assert/strict";
import { checkTeamAction, newInviteCode, normalizeInviteCode, teamIdOf } from "../src/lib/team.js";
import * as teams from "../src/lib/team-service.js";

// In-memory stand-in for the service-role client.
function fakeAdmin(seed = {}) {
  const db = { User: [], Team: [], WaterSystem: [], ServiceLine: [], NoticeBatch: [], ...structuredClone(seed) };
  let n = 0;
  const match = (r, q) => Object.entries(q).every(([k, v]) => (r[k] ?? null) === v);
  const entity = (name) => ({
    get: async (id) => {
      const r = db[name].find((x) => x.id === id);
      if (!r) throw Object.assign(new Error("not found"), { status: 404 });
      return r;
    },
    filter: async (q, opts = {}) => ({ items: db[name].filter((r) => match(r, q)).slice(0, opts.limit ?? 5000) }),
    create: async (data) => {
      const r = { ...data, id: `${name}-${++n}` };
      db[name].push(r);
      return r;
    },
    update: async (id, data) => Object.assign(db[name].find((x) => x.id === id), data),
    updateMany: async (q, { $set }) => {
      db[name].filter((r) => match(r, q)).forEach((r) => Object.assign(r, $set));
      return { has_more: false };
    },
  });
  return { db, entities: new Proxy({}, { get: (_, name) => entity(name) }) };
}

const alice = { id: "alice", email: "alice@example.com", full_name: "Alice" };
const bob = { id: "bob", email: "bob@example.com", full_name: "Bob" };
const userRow = (admin, id) => admin.db.User.find((u) => u.id === id);

test("invite codes are 8 unambiguous characters", () => {
  for (let i = 0; i < 200; i++) assert.match(newInviteCode(), /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/);
  assert.equal(normalizeInviteCode(" abcd-2345 "), "ABCD2345");
});

test("rules", () => {
  assert.equal(checkTeamAction("create", alice), null);
  assert.match(checkTeamAction("join", { ...alice, team_id: "t" }), /already on a team/);
  assert.match(checkTeamAction("leave", { ...alice, team_id: "t", team_role: "owner" }), /owners can't leave/);
  assert.equal(checkTeamAction("leave", { ...bob, team_id: "t", team_role: "member" }), null);
  assert.match(checkTeamAction("manage", { ...bob, team_id: "t", team_role: "member" }), /Only the team owner/);
  const owner = { ...alice, team_id: "t", team_role: "owner" };
  assert.equal(checkTeamAction("remove", owner, { ...bob, team_id: "t" }), null);
  assert.match(checkTeamAction("remove", owner, { ...bob, team_id: "other" }), /isn't on your team/);
  assert.match(checkTeamAction("remove", owner, owner), /can't remove yourself/);
  assert.equal(teamIdOf({ data: { team_id: "x" } }), "x");
});

test("create team makes the caller owner and moves their personal records", async () => {
  const admin = fakeAdmin({
    User: [alice, bob],
    WaterSystem: [
      { id: "s1", created_by_id: "alice", team_id: null },
      { id: "s2", created_by_id: "bob", team_id: null },
    ],
  });
  const team = await teams.create(admin, alice, { name: "Tri-County" });
  assert.equal(userRow(admin, "alice").team_id, team.id);
  assert.equal(userRow(admin, "alice").team_role, "owner");
  assert.equal(admin.db.WaterSystem.find((s) => s.id === "s1").team_id, team.id);
  assert.equal(admin.db.WaterSystem.find((s) => s.id === "s2").team_id, null, "other users' records stay put");
});

test("join with a code, optionally bringing records; bad codes are refused", async () => {
  const admin = fakeAdmin({ User: [alice, bob], WaterSystem: [{ id: "s2", created_by_id: "bob", team_id: null }] });
  const team = await teams.create(admin, alice, { name: "Tri-County" });
  const code = admin.db.Team[0].invite_code;
  await assert.rejects(teams.join(admin, bob, { code: "WRONG234", bringRecords: true }), /isn't valid/);
  await assert.rejects(teams.join(admin, bob, { code: "ab", bringRecords: true }), /Enter the invite code/);
  const joined = await teams.join(admin, bob, { code: code.toLowerCase(), bringRecords: false });
  assert.equal(joined.id, team.id);
  assert.equal(userRow(admin, "bob").team_role, "member");
  assert.equal(admin.db.WaterSystem[0].team_id, null, "records stay personal when not brought");
});

test("only the owner sees the invite code and manages members", async () => {
  const admin = fakeAdmin({ User: [alice, bob] });
  const team = await teams.create(admin, alice, { name: "Tri-County" });
  const ownerMe = userRow(admin, "alice");
  await teams.join(admin, bob, { code: admin.db.Team[0].invite_code, bringRecords: false });
  const bobMe = userRow(admin, "bob");

  const asOwner = await teams.overview(admin, ownerMe);
  assert.equal(asOwner.team.invite_code, admin.db.Team[0].invite_code);
  assert.deepEqual(asOwner.members.map((m) => [m.name, m.role]), [["Alice", "owner"], ["Bob", "member"]]);
  const asMember = await teams.overview(admin, bobMe);
  assert.equal(asMember.team.invite_code, null);

  await assert.rejects(teams.resetInvite(admin, bobMe), /Only the team owner/);
  await assert.rejects(teams.remove(admin, bobMe, { userId: "alice" }), /Only the team owner/);
  await assert.rejects(teams.leave(admin, ownerMe), /owners can't leave/);

  const before = admin.db.Team[0].invite_code;
  await teams.resetInvite(admin, ownerMe);
  assert.notEqual(admin.db.Team[0].invite_code, before);
  await teams.rename(admin, ownerMe, { name: "TCWS" });
  assert.equal(admin.db.Team[0].name, "TCWS");

  await teams.remove(admin, ownerMe, { userId: "bob" });
  assert.equal(userRow(admin, "bob").team_id, null);
  assert.equal((await teams.overview(admin, userRow(admin, "bob"))).team, null);
  assert.equal(team.name, "Tri-County");
});

test("a member can leave", async () => {
  const admin = fakeAdmin({ User: [alice, bob] });
  await teams.create(admin, alice, { name: "T" });
  await teams.join(admin, bob, { code: admin.db.Team[0].invite_code, bringRecords: false });
  await teams.leave(admin, userRow(admin, "bob"));
  assert.equal(userRow(admin, "bob").team_id, null);
  assert.equal(userRow(admin, "bob").team_role, null);
});
