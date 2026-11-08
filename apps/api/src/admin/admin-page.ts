/**
 * Página de revisão humana (HTML + JS sem dependências), servida pela própria API em /admin.
 *
 * - Login com a conta pessoal do revisor (e-mail e senha, papel reviewer/admin; veja
 *   `pnpm reviewers`). Os tokens ficam no sessionStorage: fechar a aba encerra o acesso.
 * - Todo conteúdo vindo do banco é inserido com textContent, nunca como HTML, e a CSP
 *   da página só permite o script deste mesmo servidor.
 */
import { CATEGORIES, CATEGORY_IDS, DIFFICULTIES, DIFFICULTY_LABELS_PT } from '@trivia/shared';

const CONFIG = {
  categories: CATEGORY_IDS.map((id) => ({ id, label: CATEGORIES[id].labelPt, color: CATEGORIES[id].color })),
  difficulties: DIFFICULTIES.map((id) => ({ id, label: DIFFICULTY_LABELS_PT[id] })),
  statuses: [
    { id: 'pending_review', label: 'Aguardando revisão' },
    { id: 'approved', label: 'Aprovadas' },
    { id: 'rejected', label: 'Reprovadas' },
    { id: 'retired', label: 'Retiradas' },
  ],
};

const STYLE = `
:root{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1f;--muted:#6b6b70;--line:#e3e1dc;--accent:#2B59C3;--ok:#2f7d32;--bad:#b3261e;--warn:#9a6700;--chip:#efede8}
@media (prefers-color-scheme:dark){:root{--bg:#141416;--card:#1d1d20;--ink:#ececee;--muted:#9a9aa2;--line:#2c2c31;--accent:#7aa2ff;--ok:#6cc070;--bad:#ff8a80;--warn:#e3b341;--chip:#26262b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{position:sticky;top:0;z-index:5;background:var(--card);border-bottom:1px solid var(--line);padding:12px 20px;display:flex;flex-wrap:wrap;gap:12px;align-items:center}
h1{font-size:18px;margin:0 16px 0 0}main{max-width:980px;margin:0 auto;padding:20px 16px 80px}
input,select,textarea,button{font:inherit;color:inherit}input,select,textarea{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:7px 10px}
textarea{width:100%;resize:vertical}button{border:1px solid var(--line);background:var(--card);border-radius:8px;padding:7px 14px;cursor:pointer}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff}button.ok{background:var(--ok);border-color:var(--ok);color:#fff}button.bad{color:var(--bad);border-color:var(--bad)}
button:disabled{opacity:.5;cursor:default}.tabs button.active{background:var(--ink);color:var(--card);border-color:var(--ink)}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.muted{color:var(--muted)}.grow{flex:1}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:14px 0}
.meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13px;margin-bottom:10px}
.chip{background:var(--chip);border-radius:999px;padding:2px 10px}.dot{width:10px;height:10px;border-radius:50%;display:inline-block}
.opt{display:flex;gap:8px;align-items:center;margin:6px 0}.opt input[type=text]{flex:1}.opt.correct input[type=text]{border-color:var(--ok);box-shadow:0 0 0 1px var(--ok)}
label.f{display:block;font-size:13px;font-weight:600;color:var(--muted);margin:12px 0 4px}
.evidence{border-left:3px solid var(--accent);padding:6px 12px;background:var(--chip);border-radius:0 8px 8px 0}
.issues div{font-size:13px}.err{color:var(--bad)}.warn{color:var(--warn)}
details{margin-top:10px}summary{cursor:pointer;color:var(--muted)}.seg{margin:8px 0;padding:8px 10px;border:1px solid var(--line);border-radius:8px}
.he{direction:rtl;text-align:right;font-size:17px;font-family:"SBL Hebrew","Ezra SIL","Times New Roman",serif}
.actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
.login{max-width:420px;margin:40px auto}.login h2{margin:0 0 4px;font-size:20px}.login input{width:100%}.small{font-size:13px;margin-top:8px}
.card.urgent{border-color:var(--bad);border-width:2px}.chip.warn{color:var(--warn)}
.bulk{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--card);border-radius:12px;padding:10px 14px;display:none;gap:10px;align-items:center;box-shadow:0 6px 24px rgba(0,0,0,.25)}
.bulk.show{display:flex}.toast{position:fixed;top:70px;right:16px;background:var(--ink);color:var(--card);padding:10px 14px;border-radius:10px;opacity:0;transition:opacity .2s}.toast.show{opacity:1}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;font-size:14px}
@media (max-width:600px){header{padding:10px 12px}main{padding:12px 8px 80px}.card{padding:12px}}
`;

export function adminPageHtml(): string {
  const config = JSON.stringify(CONFIG).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Revisão de perguntas</title>
<style>${STYLE}</style>
</head>
<body>
<header>
  <h1>Revisão de perguntas</h1>
  <div class="tabs row" id="tabs"></div>
  <div class="grow"></div>
  <div class="row" id="auth"></div>
</header>
<main id="main"><p class="muted">Carregando…</p></main>
<div class="bulk" id="bulk"><span id="bulkCount"></span><button id="bulkApprove" class="ok">Aprovar selecionadas</button><button id="bulkReject" class="bad">Reprovar selecionadas</button><button id="bulkClear">Limpar</button></div>
<div class="toast" id="toast"></div>
<script id="config" type="application/json">${config}</script>
<script src="/admin/app.js"></script>
</body>
</html>`;
}

/* O script abaixo é JavaScript puro, sem crases nem interpolação, servido em /admin/app.js. */
export const ADMIN_APP_JS = String.raw`
(function () {
  'use strict';
  var CONFIG = JSON.parse(document.getElementById('config').textContent);
  var catLabel = {}, catColor = {}, diffLabel = {};
  CONFIG.categories.forEach(function (c) { catLabel[c.id] = c.label; catColor[c.id] = c.color; });
  CONFIG.difficulties.forEach(function (d) { diffLabel[d.id] = d.label; });
  var LANG = { he: 'hebraico', en: 'inglês', pt: 'português' };
  var store = {
    get: function (k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set: function (k, v) { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch (e) { /* aba privada */ } }
  };
  var state = { access: store.get('reviewer.access'), refresh: store.get('reviewer.refresh'), reviewer: null, tab: 'questions', status: 'pending_review', category: '', book: '', offset: 0, limit: 20, selected: {} };
  var REASON = { incorrect: 'Resposta errada', ambiguous: 'Ambígua', disrespectful: 'Desrespeito', typo: 'Erro de digitação', other: 'Outro' };
  var RESOLUTION = { dismiss: 'improcedente', retire: 'retirada', restore: 'mantida' };

  function el(tag, attrs) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') node.className = v;
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), v);
      else if (k === 'value') node.value = v;
      else if (k === 'checked') node.checked = !!v;
      else node.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }
  function append(node, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(node, c); }); return; }
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function http(url, options, token) {
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(url, { method: options.method || 'GET', headers: headers, body: options.body ? JSON.stringify(options.body) : undefined })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) { return { res: res, data: data }; });
      });
  }
  function fail(r) {
    var err = new Error((r.data && r.data.message) || ('Erro ' + r.res.status));
    err.status = r.res.status;
    throw err;
  }
  function saveTokens(t) {
    state.access = t ? t.accessToken : ''; state.refresh = t ? t.refreshToken : '';
    store.set('reviewer.access', state.access); store.set('reviewer.refresh', state.refresh);
  }
  var refreshing = null;
  function renew() {
    if (!state.refresh) return Promise.resolve(false);
    refreshing = refreshing || http('/auth/refresh', { method: 'POST', body: { refreshToken: state.refresh } })
      .then(function (r) { if (!r.res.ok) { saveTokens(null); return false; } saveTokens(r.data); return true; })
      .finally(function () { refreshing = null; });
    return refreshing;
  }
  function api(path, options) {
    options = options || {};
    var sent = state.access;
    return http('/admin/api' + path, options, sent).then(function (r) {
      if (r.res.status !== 401) return r.res.ok ? r.data : fail(r);
      var again = state.access && state.access !== sent ? Promise.resolve(true) : renew();
      return again.then(function (ok) {
        if (!ok) { signedOut('Sua sessão terminou. Entre de novo.'); throw new Error('Sessão encerrada.'); }
        return http('/admin/api' + path, options, state.access).then(function (r2) { return r2.res.ok ? r2.data : fail(r2); });
      });
    });
  }

  function renderAuth() {
    var box = document.getElementById('auth');
    box.replaceChildren();
    if (state.reviewer) {
      box.append(el('span', { class: 'muted' }, state.reviewer.displayName + ' (' + (state.reviewer.role === 'admin' ? 'admin' : 'revisor') + ')'),
        el('button', { onclick: logout }, 'Sair'));
    }
  }
  function loginForm(message) {
    var email = el('input', { type: 'email', placeholder: 'E-mail', autocomplete: 'username', required: true });
    var password = el('input', { type: 'password', placeholder: 'Senha', autocomplete: 'current-password', required: true });
    var error = el('p', { class: 'err', role: 'alert' }, message || '');
    var button = el('button', { class: 'primary', type: 'submit' }, 'Entrar');
    var form = el('form', { class: 'card login', novalidate: true },
      el('h2', {}, 'Entrar como revisor'),
      el('p', { class: 'muted' }, 'Use a conta de revisor criada com "pnpm reviewers create". Contas comuns de jogador não têm acesso.'),
      el('label', { class: 'f' }, 'E-mail'), email, el('label', { class: 'f' }, 'Senha'), password, error,
      el('div', { class: 'actions' }, button));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      button.disabled = true; error.textContent = '';
      http('/auth/login', { method: 'POST', body: { email: email.value.trim(), password: password.value } })
        .then(function (r) {
          if (!r.res.ok) fail(r);
          saveTokens(r.data);
          return api('/me');
        })
        .then(function (me) { state.reviewer = me; password.value = ''; load(); })
        .catch(function (err) {
          if (err.status === 403) { logout(); error.textContent = 'Esta conta não tem permissão de revisão.'; }
          else error.textContent = err.message;
          button.disabled = false;
        });
    });
    setMain(form);
    email.focus();
  }
  function signedOut(message) {
    saveTokens(null); state.reviewer = null; renderAuth(); renderTabs(); loginForm(message);
  }
  function logout() {
    var token = state.refresh;
    if (token) http('/auth/logout', { method: 'POST', body: { refreshToken: token } }).catch(function () { return null; });
    signedOut('');
  }
  function main() { return document.getElementById('main'); }
  function setMain() { var m = main(); m.replaceChildren(); for (var i = 0; i < arguments.length; i++) append(m, arguments[i]); }

  function renderTabs() {
    var tabs = document.getElementById('tabs');
    tabs.replaceChildren();
    if (!state.reviewer) return;
    [['questions', 'Perguntas'], ['reports', 'Denúncias'], ['stats', 'Números']].forEach(function (t) {
      tabs.append(el('button', { class: state.tab === t[0] ? 'active' : '', onclick: function () { state.tab = t[0]; load(); } }, t[1]));
    });
  }

  function filters() {
    var status = el('select', { onchange: function (e) { state.status = e.target.value; state.offset = 0; load(); } },
      CONFIG.statuses.map(function (s) { var o = el('option', { value: s.id }, s.label); o.selected = s.id === state.status; return o; }));
    var cat = el('select', { onchange: function (e) { state.category = e.target.value; state.offset = 0; load(); } },
      el('option', { value: '' }, 'Todas as categorias'),
      CONFIG.categories.map(function (c) { var o = el('option', { value: c.id }, c.label); o.selected = c.id === state.category; return o; }));
    var book = el('input', { type: 'text', placeholder: 'Livro (ex.: Genesis)', value: state.book, size: 18 });
    var go = el('button', { onclick: function () { state.book = book.value.trim(); state.offset = 0; load(); } }, 'Filtrar');
    book.addEventListener('keydown', function (e) { if (e.key === 'Enter') go.click(); });
    return el('div', { class: 'row' }, status, cat, book, go);
  }

  function issuesOf(item) {
    var r = item.validationReport || {};
    var out = [];
    (r.errors || []).forEach(function (e) { out.push(el('div', { class: 'err' }, '✖ ' + e.message)); });
    (r.warnings || []).forEach(function (w) { out.push(el('div', { class: 'warn' }, '⚠ ' + w.message)); });
    var v = r.verification;
    if (v && v.result) out.push(el('div', { class: 'muted' }, 'Verificador: confiança ' + Number(v.result.confidence).toFixed(2) + (v.result.notes ? ' — ' + v.result.notes : '')));
    if (v && v.verdict && v.verdict.reasons && v.verdict.reasons.length) v.verdict.reasons.forEach(function (x) { out.push(el('div', { class: 'err' }, '✖ ' + x)); });
    if (v && v.error) out.push(el('div', { class: 'warn' }, '⚠ Verificador não rodou: ' + v.error));
    return out.length ? el('div', { class: 'issues' }, out) : null;
  }

  function card(item) {
    var original = { text: item.text, options: item.options.slice(), correctIndex: item.correctIndex, explanation: item.explanation, difficulty: item.difficulty };
    var text = el('textarea', { rows: 2 }); text.value = item.text;
    var explanation = el('textarea', { rows: 2 }); explanation.value = item.explanation;
    var radioName = 'c_' + item.id;
    var optionInputs = [], rows = [];
    item.options.forEach(function (o, i) {
      var input = el('input', { type: 'text', value: o });
      var radio = el('input', { type: 'radio', name: radioName, checked: i === item.correctIndex, title: 'Alternativa correta' });
      var row = el('div', { class: 'opt' + (i === item.correctIndex ? ' correct' : '') }, radio, input);
      radio.addEventListener('change', function () { rows.forEach(function (r, j) { r.classList.toggle('correct', j === i); }); });
      optionInputs.push({ input: input, radio: radio }); rows.push(row);
    });
    var difficulty = el('select', {}, CONFIG.difficulties.map(function (d) { var o = el('option', { value: d.id }, d.label); o.selected = d.id === item.difficulty; return o; }));
    var check = el('input', { type: 'checkbox', checked: !!state.selected[item.id], onchange: function (e) { if (e.target.checked) state.selected[item.id] = true; else delete state.selected[item.id]; updateBulk(); } });

    function edits() {
      var e = {};
      if (text.value.trim() !== original.text) e.text = text.value.trim();
      var opts = optionInputs.map(function (x) { return x.input.value.trim(); });
      if (opts.join('\u0001') !== original.options.join('\u0001')) e.options = opts;
      var ci = optionInputs.findIndex(function (x) { return x.radio.checked; });
      if (ci !== original.correctIndex) e.correctIndex = ci;
      if (explanation.value.trim() !== original.explanation) e.explanation = explanation.value.trim();
      if (difficulty.value !== original.difficulty) e.difficulty = difficulty.value;
      return e;
    }
    function decide(decision, node) {
      var body = { decision: decision };
      var e = edits();
      if (Object.keys(e).length) body.edits = e;
      if (decision === 'reject') { var notes = prompt('Motivo da reprovação (opcional):'); if (notes === null) return; if (notes.trim()) body.notes = notes.trim(); }
      api('/questions/' + item.id + '/review', { method: 'POST', body: body }).then(function () {
        toast(decision === 'approve' ? 'Aprovada' : 'Reprovada');
        delete state.selected[item.id]; updateBulk(); node.remove();
      }).catch(function (err) { toast(err.message); });
    }

    var segments = (item.passage.segments || []).map(function (s) {
      return el('div', { class: 'seg' }, el('div', { class: 'muted' }, s.ref),
        s.he ? el('div', { class: 'he', lang: 'he', dir: 'rtl' }, s.he) : null,
        s.en ? el('div', { lang: 'en' }, s.en) : null,
        s.pt ? el('div', { lang: 'pt' }, s.pt) : null);
    });
    var versions = ['he', 'en', 'pt'].map(function (l) { var v = item.passage.versions[l]; return v ? l + ': ' + v.title + ' (' + v.license + ')' : null; }).filter(Boolean).join(' · ');
    var reports = item.reports.length ? el('div', { class: 'issues' }, item.reports.map(function (r) { return el('div', { class: 'warn' }, '⚑ Denúncia: ' + (REASON[r.reason] || r.reason) + (r.trusted ? '' : ' (conta nova ou convidado)') + (r.comment ? ': ' + r.comment : '')); })) : null;
    var history = item.reviews.length ? el('div', { class: 'muted small' }, item.reviews.map(function (r) {
      return el('div', {}, (r.decision === 'approve' ? 'Aprovada' : 'Reprovada') + ' por ' + (r.reviewer || 'revisor antigo') + ' em ' + new Date(r.createdAt).toLocaleString('pt-BR') + (r.notes ? ': ' + r.notes : ''));
    })) : null;

    var node = el('article', { class: 'card' },
      el('div', { class: 'meta' }, check,
        el('span', { class: 'chip' }, el('span', { class: 'dot', style: 'background:' + (catColor[item.category] || '#888') }), ' ', catLabel[item.category] || item.category),
        el('span', { class: 'chip' }, diffLabel[item.difficulty] + (item.aiDifficulty !== item.difficulty ? ' (IA: ' + diffLabel[item.aiDifficulty] + ')' : '')),
        el('a', { href: item.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, item.sourceRef),
        item.timesServed ? el('span', { class: 'muted' }, item.timesCorrect + '/' + item.timesServed + ' acertos') : null),
      el('label', { class: 'f' }, 'Pergunta'), text,
      el('label', { class: 'f' }, 'Alternativas (marque a correta)'), rows,
      el('label', { class: 'f' }, 'Explicação'), explanation,
      el('div', { class: 'row' }, el('label', { class: 'f' }, 'Dificuldade'), difficulty, el('span', { class: 'muted' }, item.difficultyRationale || '')),
      el('label', { class: 'f' }, 'Evidência (' + (LANG[item.evidenceLanguage] || item.evidenceLanguage) + ')'),
      el('div', { class: 'evidence' + (item.evidenceLanguage === 'he' ? ' he' : ''), dir: item.evidenceLanguage === 'he' ? 'rtl' : 'ltr' }, item.evidenceQuote),
      issuesOf(item), reports, history,
      el('details', {}, el('summary', {}, 'Trecho ' + item.passage.ref), segments, el('div', { class: 'muted' }, versions)));
    node.append(el('div', { class: 'actions' },
      el('button', { class: 'bad', onclick: function () { decide('reject', node); } }, 'Reprovar'),
      el('button', { class: 'ok', onclick: function () { decide('approve', node); } }, 'Aprovar')));
    return node;
  }

  function updateBulk() {
    var n = Object.keys(state.selected).length;
    document.getElementById('bulk').classList.toggle('show', n > 0);
    document.getElementById('bulkCount').textContent = n + ' selecionada(s)';
  }
  function bulk(decision) {
    var ids = Object.keys(state.selected);
    if (!ids.length) return;
    if (!confirm((decision === 'approve' ? 'Aprovar ' : 'Reprovar ') + ids.length + ' pergunta(s) sem edições?')) return;
    api('/questions/bulk-review', { method: 'POST', body: { ids: ids, decision: decision } }).then(function (r) {
      toast(r.updated + ' atualizada(s)'); state.selected = {}; updateBulk(); load();
    }).catch(function (err) { toast(err.message); });
  }

  function loadQuestions() {
    var q = '?limit=' + state.limit + '&offset=' + state.offset + '&status=' + state.status +
      (state.category ? '&category=' + state.category : '') + (state.book ? '&book=' + encodeURIComponent(state.book) : '');
    setMain(filters(), el('p', { class: 'muted' }, 'Carregando…'));
    return api('/questions' + q).then(function (data) {
      var pager = el('div', { class: 'row' },
        el('span', { class: 'muted grow' }, data.total + ' pergunta(s)' + (data.total ? ' — mostrando ' + (state.offset + 1) + '–' + Math.min(state.offset + state.limit, data.total) : '')),
        el('button', { disabled: state.offset === 0, onclick: function () { state.offset = Math.max(0, state.offset - state.limit); load(); } }, '← Anteriores'),
        el('button', { disabled: state.offset + state.limit >= data.total, onclick: function () { state.offset += state.limit; load(); } }, 'Próximas →'));
      var selectAll = data.items.length ? el('button', { onclick: function () {
        data.items.forEach(function (i) { state.selected[i.id] = true; });
        document.querySelectorAll('article.card input[type=checkbox]').forEach(function (c) { c.checked = true; });
        updateBulk();
      } }, 'Selecionar todas desta página') : null;
      setMain(filters(), pager, selectAll, data.items.length ? data.items.map(card) : el('p', { class: 'muted' }, 'Nada por aqui.'));
    });
  }

  function loadReports() {
    setMain(el('p', { class: 'muted' }, 'Carregando…'));
    return api('/reports?open=true').then(function (list) {
      if (!list.length) { setMain(el('p', { class: 'muted' }, 'Nenhuma denúncia aberta.')); return; }
      setMain(list.map(function (r) {
        function act(action) { return function () { api('/reports/' + r.id + '/resolve', { method: 'POST', body: { action: action } }).then(function () { toast('Feito'); load(); }).catch(function (e) { toast(e.message); }); }; }
        return el('article', { class: 'card' + (r.reason === 'disrespectful' ? ' urgent' : '') },
          el('div', { class: 'meta' },
            el('span', { class: 'chip' }, REASON[r.reason] || r.reason),
            el('span', { class: 'chip' }, r.trusted ? 'Denunciante confiável' : (r.reporterIsGuest ? 'Convidado' : 'Conta nova')),
            r.triggeredRetirement ? el('span', { class: 'chip warn' }, 'Retirada automaticamente') : null,
            el('span', { class: 'muted' }, r.reporter + ', ' + new Date(r.createdAt).toLocaleString('pt-BR')),
            el('span', { class: 'chip' }, r.question.status)),
          el('div', {}, r.question.text), r.comment ? el('p', { class: 'muted' }, '“' + r.comment + '”') : null,
          el('div', { class: 'actions' },
            el('button', { onclick: act('dismiss') }, 'Improcedente'),
            el('button', { class: 'bad', onclick: act('retire') }, 'Retirar pergunta'),
            el('button', { class: 'ok', onclick: act('restore') }, 'Manter aprovada')));
      }));
    });
  }

  function loadStats() {
    return api('/stats').then(function (s) {
      function table(rows) {
        return el('table', {}, el('tr', {}, el('th', {}, 'Categoria'), el('th', {}, 'Status'), el('th', {}, 'Total')),
          rows.map(function (r) { return el('tr', {}, el('td', {}, catLabel[r.category] || r.category), el('td', {}, r.status), el('td', {}, r.count)); }));
      }
      setMain(el('div', { class: 'card' }, el('h3', {}, 'Perguntas'), table(s.questions)),
        el('div', { class: 'card' }, el('h3', {}, 'Passagens'), table(s.passages)),
        el('p', { class: 'muted' }, s.openReports + ' denúncia(s) aberta(s).'));
    });
  }

  function load() {
    renderAuth();
    renderTabs();
    if (!state.reviewer) return;
    var p = state.tab === 'questions' ? loadQuestions() : state.tab === 'reports' ? loadReports() : loadStats();
    p.catch(function (err) { if (state.reviewer) setMain(el('p', { class: 'err' }, err.message)); });
  }

  function start() {
    if (!state.access && !state.refresh) { signedOut(''); return; }
    api('/me').then(function (me) { state.reviewer = me; load(); }).catch(function (err) {
      if (err.status === 403) { logout(); return; }
      if (state.reviewer === null && (state.access || state.refresh)) setMain(el('p', { class: 'err' }, err.message));
    });
  }

  document.getElementById('bulkApprove').addEventListener('click', function () { bulk('approve'); });
  document.getElementById('bulkReject').addEventListener('click', function () { bulk('reject'); });
  document.getElementById('bulkClear').addEventListener('click', function () { state.selected = {}; updateBulk(); load(); });
  start();
})();
`;
