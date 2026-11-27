import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MEMBER, permissionCode, permissionsOf } from "../src/lib/permissions.js";
import * as teams from "../src/lib/team-service.js";

test("personal accounts and owners can do everything", () => {
  assert.deepEqual(permissionsOf({ id: "a" }), { view: true, read: true, write: true, edit: true, admin: true });
  assert.equal(permissionsOf({ team_id: "t", team_role: "owner" }).admin, true);
  assert.equal(permissionsOf(null).view, false);
});

test("members get exactly their flags, never admin", () => {
  const p = permissionsOf({ team_id: "t", team_role: "member", perm_read: true, perm_write: false, data: { perm_edit: true } });
  assert.deepEqual(p, { view: true, read: true, write: false, edit: true, admin: false });
  assert.deepEqual(permissionsOf({ team_id: "t", team_role: "member", perm_read: false }), { view: true, read: false, write: false, edit: false, admin: false });
  assert.equal(permissionCode(p), "REV");
  assert.equal(permissionCode({ view: true, read: true, write: true, edit: true }), "RWEV");
  assert.deepEqual(DEFAULT_MEMBER, { read: true, write: true, edit: false });
});

function fakeAdmin(users) {
  const db = { User: users.map((u) => ({ ...u })), Team: [] };
  let n = 0;
  const ent = (name) => ({
    get: async (id) => { const r = db[name].find((x) => x.id === id); if (!r) throw { status: 404 }; return r; },
    filter: async (q) => ({ items: db[name].filter((r) => Object.entries(q).every(([k, v]) => (r[k] ?? null) === v)) }),
    create: async (d) => { const r = { ...d, id: `${name}-${++n}` }; db[name].push(r); return r; },
    update: async (id, d) => Object.assign(db[name].find((x) => x.id === id), d),
    updateMany: async () => ({ has_more: false }),
  });
  return { db, entities: new Proxy({}, { get: (_, name) => ent(name) }) };
}

test("joining gives default permissions; only the owner can change them", async () => {
  const admin = fakeAdmin([{ id: "o", full_name: "Owner" }, { id: "m", full_name: "Member" }, { id: "x", full_name: "Outsider" }]);
  await teams.create(admin, admin.db.User[0], { name: "T" });
  await teams.join(admin, admin.db.User[1], { code: admin.db.Team[0].invite_code, bringRecords: false });
  const m = admin.db.User[1];
  assert.deepEqual([m.perm_read, m.perm_write, m.perm_edit], [true, true, false]);

  const owner = admin.db.User[0];
  await teams.setPermissions(admin, owner, { userId: "m", read: false, write: true, edit: true });
  assert.deepEqual([m.perm_read, m.perm_write, m.perm_edit], [false, true, true]);
  const ov = await teams.overview(admin, owner);
  assert.deepEqual(ov.members.find((x) => x.id === "m").perms, { view: true, read: false, write: true, edit: true });
  assert.deepEqual(ov.members.find((x) => x.id === "o").perms, { view: true, read: true, write: true, edit: true });

  await assert.rejects(teams.setPermissions(admin, m, { userId: "m", read: true, write: true, edit: true }), /Only the team owner can change permissions/);
  await assert.rejects(teams.setPermissions(admin, owner, { userId: "x", read: true, write: true, edit: true }), /isn't on your team/);
  await assert.rejects(teams.setPermissions(admin, owner, { userId: "o", read: false, write: false, edit: false }), /always has every permission/);

  await teams.leave(admin, m);
  assert.deepEqual([m.perm_read, m.perm_write, m.perm_edit], [false, false, false], "leaving clears permissions");
});

test("only the owner (or a personal record's creator) can remove photos", async () => {
  const admin = fakeAdmin([{ id: "o", full_name: "Owner" }, { id: "m", full_name: "Member" }]);
  admin.db.ServiceLine = [];
  await teams.create(admin, admin.db.User[0], { name: "T" });
  await teams.join(admin, admin.db.User[1], { code: admin.db.Team[0].invite_code, bringRecords: false });
  const [owner, member] = admin.db.User;
  admin.db.ServiceLine.push(
    { id: "l1", team_id: owner.team_id, photo_uri: "old", photo_uris: ["a", "b"] },
    { id: "l2", team_id: null, created_by_id: "m", photo_uris: ["p"] },
    { id: "l3", team_id: "other-team", photo_uris: ["z"] }
  );
  await assert.rejects(teams.removePhoto(admin, member, { lineId: "l1", uri: "a" }), /Only the team owner/);
  const r = await teams.removePhoto(admin, owner, { lineId: "l1", uri: "old" });
  assert.deepEqual(r.photo_uris, ["a", "b"]);
  assert.equal(admin.db.ServiceLine[0].photo_uri, null);
  await teams.removePhoto(admin, owner, { lineId: "l1", uri: "a" });
  assert.deepEqual(admin.db.ServiceLine[0].photo_uris, ["b"]);
  await assert.rejects(teams.removePhoto(admin, owner, { lineId: "l1", uri: "a" }), /already gone/);
  await assert.rejects(teams.removePhoto(admin, owner, { lineId: "l3", uri: "z" }), /Only the team owner/);
  await assert.rejects(teams.removePhoto(admin, owner, { lineId: "nope", uri: "z" }), /no longer exists/);
  await teams.leave(admin, member);
  await teams.removePhoto(admin, member, { lineId: "l2", uri: "p" });
  assert.deepEqual(admin.db.ServiceLine[1].photo_uris, []);
});

test("members from before permissions get the defaults", async () => {
  assert.deepEqual(permissionsOf({ team_id: "t", team_role: "member" }), { view: true, read: true, write: true, edit: false, admin: false });
  const admin = fakeAdmin([{ id: "o", full_name: "Owner" }]);
  await teams.create(admin, admin.db.User[0], { name: "T" });
  admin.db.User.push({ id: "old", full_name: "Old", team_id: admin.db.User[0].team_id, team_role: "member" });
  const ov = await teams.overview(admin, admin.db.User[0]);
  assert.deepEqual(ov.members.find((m) => m.id === "old").perms, { view: true, read: true, write: true, edit: false });
  const old = admin.db.User[1];
  assert.deepEqual([old.perm_read, old.perm_write, old.perm_edit], [true, true, false]);
});
