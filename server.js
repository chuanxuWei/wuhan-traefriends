const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const DATA_FILE = process.env.DATA_FILE || path.join(ROOT, 'data', 'store.json');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 12 * 1024;
const allowed = {
  vibe: ['nature', 'city', 'food', 'chill'],
  pace: ['early', 'flex', 'late'],
  budget: ['low', 'medium', 'high'],
  contactType: ['wechat', 'xiaohongshu', 'douyin', 'qq', 'other']
};

function loadStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return { cards: parsed.cards || [], interests: parsed.interests || [] };
  } catch (error) {
    if (error.code === 'ENOENT') return { cards: [], interests: [] };
    throw error;
  }
}
let store = loadStore();

function saveStore() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true, mode: 0o700 });
  const temp = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.renameSync(temp, DATA_FILE);
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}

function fail(res, status, message) { json(res, status, { error: message }); }
function clean(value, max) { return String(value ?? '').trim().slice(0, max); }
function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00+08:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function todayChina() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function daysFromToday(date) { return Math.round((Date.parse(`${date}T12:00:00+08:00`) - Date.parse(`${todayChina()}T12:00:00+08:00`)) / 86400000); }
function publicCard(card) {
  const { id, nickname, city, destination, date, time, vibe, pace, budget, intro, createdAt, open } = card;
  return { id, nickname, city, destination, date, time, vibe, pace, budget, intro, createdAt, open };
}
function findMe(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return store.cards.find(card => card.token === token) || null;
}
function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > MAX_BODY) { reject(Object.assign(new Error('内容过长'), { status: 413 })); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch { reject(Object.assign(new Error('请求格式错误'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
function addSecurityHeaders(res) {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'");
}

async function api(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/cards') {
    const city = clean(url.searchParams.get('city'), 30).toLowerCase();
    const vibe = clean(url.searchParams.get('vibe'), 12);
    const cards = store.cards.filter(card => card.open && daysFromToday(card.date) >= 0 && (!city || card.city.toLowerCase().includes(city)) && (!vibe || card.vibe === vibe));
    cards.sort((a, b) => a.date.localeCompare(b.date) || b.createdAt.localeCompare(a.createdAt));
    return json(res, 200, { cards: cards.map(publicCard) });
  }
  if (req.method === 'POST' && url.pathname === '/api/cards') {
    const input = await body(req);
    const card = {
      id: crypto.randomUUID(), token: crypto.randomBytes(32).toString('hex'),
      nickname: clean(input.nickname, 18), city: clean(input.city, 30), destination: clean(input.destination, 45),
      date: clean(input.date, 10), time: clean(input.time, 20), vibe: clean(input.vibe, 12),
      pace: clean(input.pace, 12), budget: clean(input.budget, 12), intro: clean(input.intro, 240),
      contactType: clean(input.contactType, 16), contact: clean(input.contact, 80),
      createdAt: new Date().toISOString(), open: true
    };
    if (!card.nickname || !card.city || !card.destination || !card.time || !card.intro || !card.contact || !isDate(card.date) || daysFromToday(card.date) < 0 || daysFromToday(card.date) > 60 || Object.entries(allowed).some(([key, values]) => !values.includes(card[key])) || input.consent !== true) {
      return fail(res, 400, '请完整填写出逃卡；日期需在未来 60 天内，并同意联系方式交换规则。');
    }
    store.cards.push(card); saveStore();
    return json(res, 201, { card: publicCard(card), token: card.token });
  }
  if (req.method === 'GET' && url.pathname === '/api/me') {
    const me = findMe(req);
    if (!me) return fail(res, 401, '管理口令无效，请重新输入。');
    const incoming = store.interests.filter(item => item.to === me.id).map(item => {
      const from = store.cards.find(card => card.id === item.from);
      return from ? { id: item.id, status: item.status, card: publicCard(from), contact: item.status === 'accepted' ? { type: from.contactType, value: from.contact } : null } : null;
    }).filter(Boolean);
    const outgoing = store.interests.filter(item => item.from === me.id).map(item => {
      const to = store.cards.find(card => card.id === item.to);
      return to ? { id: item.id, status: item.status, card: publicCard(to), contact: item.status === 'accepted' ? { type: to.contactType, value: to.contact } : null } : null;
    }).filter(Boolean);
    return json(res, 200, { card: publicCard(me), contact: { type: me.contactType, value: me.contact }, incoming, outgoing });
  }
  if (req.method === 'POST' && url.pathname === '/api/interests') {
    const me = findMe(req);
    if (!me) return fail(res, 401, '请先发布自己的出逃卡。');
    if (!me.open || daysFromToday(me.date) < 0) return fail(res, 400, '请先发布有效的公开出逃卡。');
    const input = await body(req);
    const target = store.cards.find(card => card.id === input.targetId);
    if (!target || !target.open || daysFromToday(target.date) < 0) return fail(res, 404, '这张出逃卡已不可报名。');
    if (target.id === me.id) return fail(res, 400, '不能向自己的卡片发送意向。');
    if (store.interests.some(item => item.from === me.id && item.to === target.id)) return fail(res, 409, '你已经向 TA 发过同行意向。');
    const reverse = store.interests.find(item => item.from === target.id && item.to === me.id);
    if (reverse) {
      reverse.status = 'accepted';
      saveStore();
      return json(res, 200, { status: 'accepted' });
    }
    store.interests.push({ id: crypto.randomUUID(), from: me.id, to: target.id, status: 'pending', createdAt: new Date().toISOString() });
    saveStore();
    return json(res, 201, { status: 'pending' });
  }
  const accept = url.pathname.match(/^\/api\/interests\/([a-f0-9-]+)\/accept$/);
  if (req.method === 'POST' && accept) {
    const me = findMe(req);
    if (!me) return fail(res, 401, '管理口令无效。');
    const interest = store.interests.find(item => item.id === accept[1] && item.to === me.id);
    if (!interest) return fail(res, 404, '没有找到这条同行意向。');
    if (!me.open || daysFromToday(me.date) < 0) return fail(res, 400, '你的出逃卡已关闭或过期。');
    interest.status = 'accepted'; saveStore();
    return json(res, 200, { status: 'accepted' });
  }
  if (req.method === 'POST' && url.pathname === '/api/me/close') {
    const me = findMe(req);
    if (!me) return fail(res, 401, '管理口令无效。');
    me.open = false; saveStore();
    return json(res, 200, { card: publicCard(me) });
  }
  if (req.method === 'DELETE' && url.pathname === '/api/me') {
    const me = findMe(req);
    if (!me) return fail(res, 401, '管理口令无效。');
    store.cards = store.cards.filter(card => card.id !== me.id);
    store.interests = store.interests.filter(item => item.from !== me.id && item.to !== me.id);
    saveStore();
    return json(res, 200, { deleted: true });
  }
  return fail(res, 404, '没有找到这个接口。');
}

function staticFile(req, res, url) {
  const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/styles.css': ['styles.css', 'text/css; charset=utf-8'], '/script.js': ['script.js', 'text/javascript; charset=utf-8'] };
  const entry = files[url.pathname];
  if (!entry || !['GET', 'HEAD'].includes(req.method)) return fail(res, 404, '页面不存在。');
  res.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(path.join(ROOT, entry[0])).pipe(res);
}

const server = http.createServer(async (req, res) => {
  addSecurityHeaders(res);
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
  catch { return fail(res, 400, '地址格式错误。'); }
  try { if (url.pathname.startsWith('/api/')) await api(req, res, url); else staticFile(req, res, url); }
  catch (error) { if (!res.headersSent) fail(res, error.status || 500, error.status ? error.message : '服务器暂时出错，请稍后重试。'); }
});

server.listen(PORT, HOST, () => console.log(`周末出逃配对器运行于 http://${HOST}:${PORT}`));
