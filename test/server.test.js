const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('真实卡片、双向同意、联系方式保护和删除', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'escape-test-'));
  const port = 44000 + Math.floor(Math.random() * 10000);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), DATA_FILE: path.join(dir, 'store.json') },
    stdio: 'ignore'
  });
  const base = `http://127.0.0.1:${port}`;
  const request = async (url, method = 'GET', input, token) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: input ? JSON.stringify(input) : undefined });
    return { status: res.status, data: await res.json() };
  };
  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try { await fetch(base); ready = true; break; } catch { await sleep(50); }
    }
    assert.equal(ready, true, 'server starts');
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const make = (nickname, contact) => ({ nickname, city: '武汉', destination: '东湖骑行', date, time: '10:00', vibe: 'nature', pace: 'flex', budget: 'low', intro: '一起骑车看湖，路线轻松好商量。', contactType: 'wechat', contact, consent: true });
    const a = await request('/api/cards', 'POST', make('小甲', 'private-a'));
    const b = await request('/api/cards', 'POST', make('小乙', 'private-b'));
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    const listing = await request('/api/cards?city=武汉&vibe=nature');
    assert.equal(listing.data.cards.length, 2);
    assert.equal(JSON.stringify(listing.data).includes('private-a'), false);
    assert.equal(JSON.stringify(listing.data).includes(a.data.token), false);
    const interest = await request('/api/interests', 'POST', { targetId: b.data.card.id }, a.data.token);
    assert.equal(interest.status, 201);
    const before = await request('/api/me', 'GET', undefined, a.data.token);
    assert.equal(before.data.outgoing[0].contact, null);
    const recipient = await request('/api/me', 'GET', undefined, b.data.token);
    assert.equal(recipient.data.incoming[0].contact, null);
    const accepted = await request(`/api/interests/${recipient.data.incoming[0].id}/accept`, 'POST', undefined, b.data.token);
    assert.equal(accepted.status, 200);
    const afterA = await request('/api/me', 'GET', undefined, a.data.token);
    const afterB = await request('/api/me', 'GET', undefined, b.data.token);
    assert.equal(afterA.data.outgoing[0].contact.value, 'private-b');
    assert.equal(afterB.data.incoming[0].contact.value, 'private-a');
    const deleted = await request('/api/me', 'DELETE', undefined, a.data.token);
    assert.equal(deleted.status, 200);
    const afterDelete = await request('/api/me', 'GET', undefined, b.data.token);
    assert.equal(afterDelete.data.incoming.length, 0);
    assert.equal((await request('/api/cards')).data.cards.length, 1);
  } finally {
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
