const labels = {
  vibe: { nature: '☘ 去野一下', city: '✧ 城市乱逛', food: '◡ 吃喝优先', chill: '☼ 慢慢放空' },
  pace: { early: '早起出发', flex: '随缘走走', late: '睡饱再走' },
  budget: { low: '200 以内', medium: '200–500', high: '500 以上' },
  contact: { wechat: '微信', xiaohongshu: '小红书', douyin: '抖音', qq: 'QQ', other: '其他社媒' }
};
const tokenKey = 'weekend_escape_manage_token';
const publishForm = document.querySelector('#publish-form');
const filterForm = document.querySelector('#filter-form');
let token = localStorage.getItem(tokenKey) || '';
let myData = null;
let visibleCards = [];
const wantedCard = new URLSearchParams(location.search).get('card');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function setStatus(id, message, kind = '') {
  const el = document.querySelector(id);
  el.textContent = message;
  el.className = `inline-status ${kind}`;
}
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
  });
  let result;
  try { result = await response.json(); } catch { throw new Error('无法连接配对服务。请通过项目服务器打开页面。'); }
  if (!response.ok) throw new Error(result.error || '操作失败，请稍后重试。');
  return result;
}
function cardMarkup(card, withAction = true) {
  const mine = myData?.card?.id === card.id;
  const sent = myData?.outgoing?.some(item => item.card.id === card.id);
  const matched = myData?.incoming?.some(item => item.card.id === card.id && item.status === 'accepted') || myData?.outgoing?.some(item => item.card.id === card.id && item.status === 'accepted');
  const action = !withAction ? '' : mine ? '<span class="card-action-note">这是你的卡片</span>' : matched ? '<span class="card-action-note">已经互相同意 ✓</span>' : sent ? '<span class="card-action-note">已发送意向，等待回应</span>' : `<button class="interest-button" data-interest="${escapeHtml(card.id)}">我想一起去 ↗</button>`;
  return `<article class="wall-card ${card.id === wantedCard ? 'featured-card' : ''}" id="card-${escapeHtml(card.id)}">
    <div class="wall-card-top"><span class="vibe-sticker">${labels.vibe[card.vibe] || ''}</span><span class="card-date">${escapeHtml(card.date)}</span></div>
    <h3>${escapeHtml(card.destination)}</h3><p class="card-author">由 <strong>${escapeHtml(card.nickname)}</strong> 发起 · ${escapeHtml(card.city)} 出发</p>
    <p class="card-intro">${escapeHtml(card.intro)}</p>
    <div class="card-tags"><span>◷ ${escapeHtml(card.time)}</span><span>${labels.pace[card.pace] || ''}</span><span>¥ ${labels.budget[card.budget] || ''}</span></div>
    <div class="card-bottom">${action}<span>联系方式双方同意后可见</span></div>
  </article>`;
}
async function loadCards() {
  const data = new FormData(filterForm);
  const query = new URLSearchParams();
  if (String(data.get('city') || '').trim()) query.set('city', String(data.get('city')).trim());
  if (data.get('vibe')) query.set('vibe', data.get('vibe'));
  const result = await api(`/api/cards?${query}`);
  visibleCards = result.cards;
  const list = document.querySelector('#card-list');
  list.innerHTML = visibleCards.length ? visibleCards.map(card => cardMarkup(card)).join('') : '<div class="empty-wall"><span>✳</span><strong>这面墙还在等第一张出逃卡</strong><p>换个筛选条件看看，或者先发布你的周末计划。</p><a href="#matcher">去发布出逃卡 ↗</a></div>';
  document.querySelector('#card-count').textContent = `找到 ${visibleCards.length} 张正在招募的出逃卡`;
  if (wantedCard && visibleCards.some(card => card.id === wantedCard)) document.querySelector(`#card-${CSS.escape(wantedCard)}`)?.scrollIntoView({ block: 'center' });
}
function interestMarkup(item, incoming) {
  const person = item.card;
  const accepted = item.status === 'accepted';
  const contact = accepted && item.contact ? `<div class="contact-reveal"><span>联系方式已解锁 · ${labels.contact[item.contact.type] || '社媒'}</span><strong>${escapeHtml(item.contact.value)}</strong><button type="button" data-copy="${escapeHtml(item.contact.value)}">复制账号</button></div>` : '';
  const action = incoming && !accepted ? `<button class="interest-button" data-accept="${escapeHtml(item.id)}">我也想一起去 ✓</button>` : `<span class="interest-state">${accepted ? '已双向同意 ✓' : incoming ? '等待你回应' : '等待对方回应'}</span>`;
  return `<article class="interest-card"><div><strong>${escapeHtml(person.nickname)}</strong><span>${escapeHtml(person.city)} · ${escapeHtml(person.date)}</span></div><p>${escapeHtml(person.destination)}</p>${action}${contact}</article>`;
}
function renderMy(data) {
  myData = data;
  document.querySelector('#my-empty').hidden = true;
  document.querySelector('#my-dashboard').hidden = false;
  const card = data.card;
  document.querySelector('#my-summary').innerHTML = `<div><span class="section-kicker">${card.open ? '招募中' : '已停止招募'}</span><h3>${escapeHtml(card.destination)}</h3><p>${escapeHtml(card.city)} · ${escapeHtml(card.date)} · ${escapeHtml(card.time)}</p></div><span class="summary-mark">${card.open ? 'OPEN!' : 'CLOSED'}</span>`;
  document.querySelector('#incoming-count').textContent = `${data.incoming.length}`;
  document.querySelector('#outgoing-count').textContent = `${data.outgoing.length}`;
  document.querySelector('#incoming-list').innerHTML = data.incoming.length ? data.incoming.map(item => interestMarkup(item, true)).join('') : '<p class="list-empty">还没有人发来同行意向。把你的卡片分享出去吧 ↗</p>';
  document.querySelector('#outgoing-list').innerHTML = data.outgoing.length ? data.outgoing.map(item => interestMarkup(item, false)).join('') : '<p class="list-empty">你还没有向别人发出同行意向。</p>';
  document.querySelector('#close-card').hidden = !card.open;
}
async function loadMy() {
  if (!token) {
    myData = null;
    document.querySelector('#my-empty').hidden = false;
    document.querySelector('#my-dashboard').hidden = true;
    return;
  }
  try { renderMy(await api('/api/me')); }
  catch (error) {
    if (error.message.includes('口令')) { token = ''; localStorage.removeItem(tokenKey); }
    document.querySelector('#my-empty').hidden = false;
    document.querySelector('#my-dashboard').hidden = true;
    setStatus('#my-status', error.message, 'error');
  }
}
async function refresh() { await loadMy(); await loadCards(); }
function dateChina() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
const dateInput = publishForm.elements.date;
dateInput.min = dateChina();
const limit = new Date(`${dateChina()}T12:00:00+08:00`);
limit.setUTCDate(limit.getUTCDate() + 60);
dateInput.max = limit.toISOString().slice(0, 10);

publishForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (token) { setStatus('#publish-status', '当前浏览器已有一张出逃卡。请先在“我的出逃角落”管理它。', 'error'); return; }
  const values = Object.fromEntries(new FormData(publishForm));
  values.consent = publishForm.elements.consent.checked;
  const button = publishForm.querySelector('button[type="submit"]');
  button.disabled = true;
  setStatus('#publish-status', '正在发布…');
  try {
    const result = await api('/api/cards', { method: 'POST', body: JSON.stringify(values) });
    token = result.token;
    localStorage.setItem(tokenKey, token);
    publishForm.reset();
    setStatus('#publish-status', '发布成功！你的卡片已经出现在出逃墙上。请备份管理口令。', 'success');
    await refresh();
    document.querySelector('#my-card').scrollIntoView({ behavior: 'smooth' });
  } catch (error) { setStatus('#publish-status', error.message, 'error'); }
  finally { button.disabled = false; }
});
filterForm.addEventListener('submit', async event => { event.preventDefault(); try { await loadCards(); } catch (error) { setStatus('#browse-status', error.message, 'error'); } });
document.querySelector('#clear-filter').addEventListener('click', async () => { filterForm.reset(); try { await loadCards(); } catch (error) { setStatus('#browse-status', error.message, 'error'); } });
document.querySelector('#card-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-interest]');
  if (!button) return;
  if (!token) { setStatus('#browse-status', '先发布自己的出逃卡，才能向别人发出同行意向。', 'error'); document.querySelector('#matcher').scrollIntoView({ behavior: 'smooth' }); return; }
  button.disabled = true;
  try { const result = await api('/api/interests', { method: 'POST', body: JSON.stringify({ targetId: button.dataset.interest }) }); await refresh(); setStatus('#browse-status', result.status === 'accepted' ? '你们已互相同意！去“我的出逃角落”查看联系方式。' : '同行意向已发送。对方同意后，联系方式会在“我的出逃角落”显示。', 'success'); }
  catch (error) { setStatus('#browse-status', error.message, 'error'); button.disabled = false; }
});
document.querySelector('#my-dashboard').addEventListener('click', async event => {
  const accept = event.target.closest('[data-accept]');
  const copy = event.target.closest('[data-copy]');
  if (copy) { try { await navigator.clipboard.writeText(copy.dataset.copy); setStatus('#my-status', '账号已复制 ✓', 'success'); } catch { setStatus('#my-status', '复制失败，请手动选择账号。', 'error'); } return; }
  if (!accept) return;
  accept.disabled = true;
  try { await api(`/api/interests/${accept.dataset.accept}/accept`, { method: 'POST' }); await refresh(); setStatus('#my-status', '双方已同意！彼此的联系方式已经解锁。', 'success'); }
  catch (error) { setStatus('#my-status', error.message, 'error'); accept.disabled = false; }
});
document.querySelector('#recover-button').addEventListener('click', async () => {
  const value = document.querySelector('#recover-token').value.trim();
  if (!/^[a-f0-9]{64}$/.test(value)) { setStatus('#my-status', '请输入完整的 64 位管理口令。', 'error'); return; }
  token = value;
  try { const data = await api('/api/me'); localStorage.setItem(tokenKey, token); renderMy(data); await loadCards(); setStatus('#my-status', '卡片已找回 ✓', 'success'); }
  catch (error) { token = ''; setStatus('#my-status', error.message, 'error'); }
});
async function copyText(value, success) { try { await navigator.clipboard.writeText(value); setStatus('#my-status', success, 'success'); } catch { setStatus('#my-status', '复制失败，请检查浏览器剪贴板权限。', 'error'); } }
document.querySelector('#copy-share').addEventListener('click', () => { if (myData) copyText(`${location.origin}/?card=${encodeURIComponent(myData.card.id)}#browse`, '分享链接已复制，发给朋友来一起报名 ↗'); });
document.querySelector('#copy-post').addEventListener('click', () => {
  if (!myData) return;
  const card = myData.card;
  const link = `${location.origin}/?card=${encodeURIComponent(card.id)}#browse`;
  const message = `周末出逃搭子招募｜${card.city}出发\n\n${card.date} ${card.time}，想去${card.destination}。\n${labels.vibe[card.vibe]} · 人均 ¥${labels.budget[card.budget]} · ${labels.pace[card.pace]}\n\n${card.intro}\n\n想一起去？打开出逃卡发个同行意向：${link}\n双方同意后再交换联系方式。\n\n#周末出逃 #同城搭子 #${card.city}周末去哪儿`;
  copyText(message, '招募文案已复制，发布到你的社媒就能邀请更多人。');
});
document.querySelector('#copy-token').addEventListener('click', () => copyText(token, '管理口令已复制。请妥善保存，任何拿到它的人都能管理你的卡片。'));
document.querySelector('#close-card').addEventListener('click', async () => { try { await api('/api/me/close', { method: 'POST' }); await refresh(); setStatus('#my-status', '已停止招募，卡片不再公开展示。', 'success'); } catch (error) { setStatus('#my-status', error.message, 'error'); } });
document.querySelector('#delete-card').addEventListener('click', async () => {
  if (!confirm('确定删除你的出逃卡、联系方式和所有同行意向吗？删除后无法恢复。')) return;
  try { await api('/api/me', { method: 'DELETE' }); token = ''; localStorage.removeItem(tokenKey); await refresh(); setStatus('#my-status', '卡片与联系信息已删除。', 'success'); }
  catch (error) { setStatus('#my-status', error.message, 'error'); }
});
if (location.protocol === 'file:') document.querySelector('#runtime-notice').hidden = false;
else refresh().catch(error => setStatus('#browse-status', error.message, 'error'));
