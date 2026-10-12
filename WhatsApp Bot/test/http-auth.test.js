const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequireAdmin } = require('../http-auth');
test('shared bot data requires verified administrator claim', async () => {
  for (const [header, user, expected] of [
    [undefined, null, 401], ['Bearer bad', null, 401],
    ['Bearer ordinary', { uid: 'ordinary' }, 403],
    ['Bearer profile-role', { uid: 'ordinary', role: 'Admin', timekeeperAdmin: 'true' }, 403],
    ['Bearer admin', { uid: 'admin', timekeeperAdmin: true }, 200],
  ]) {
    let calls = 0, nextCalls = 0, code = 200;
    const guard = createRequireAdmin(async (token, revoked) => { calls++; assert.equal(revoked, true); if (!user) throw Error('expired'); return user; });
    const res = { status(c) { code = c; return this; }, json() { return this; } };
    await guard({ headers: { authorization: header } }, res, () => { nextCalls++; });
    assert.equal(code, expected); assert.equal(nextCalls, expected === 200 ? 1 : 0);
    assert.equal(calls, header ? 1 : 0);
  }
});
