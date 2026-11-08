/**
 * Página pública de exclusão de conta, em /conta/excluir.
 *
 * O Google Play exige um link na web onde a pessoa possa pedir a exclusão da conta
 * sem reinstalar o app. A página faz o mesmo que o app: entra com e-mail e senha e
 * chama POST /me/delete. Convidados não têm e-mail nem senha, então excluem pelo app.
 */
import { PAGE_BASE_STYLE } from '../common/pages.js';

const STYLE = `${PAGE_BASE_STYLE}
main{max-width:560px;margin:0 auto;padding:40px 16px 64px}
h1{font-size:26px;line-height:1.2;margin:0 0 12px}
p,li{color:var(--fg)}.muted{color:var(--muted)}
ul{padding-left:20px}li{margin:4px 0}
form{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin-top:24px}
label{display:block;font-weight:600;margin:14px 0 6px}
input[type=email],input[type=password]{width:100%;padding:11px 12px;border:1.5px solid var(--line);border-radius:10px;background:var(--bg);color:var(--fg)}
.check{display:flex;gap:10px;align-items:flex-start;font-weight:400;margin-top:18px}
.check input{margin-top:4px}
button{margin-top:18px;width:100%;padding:13px;border:0;border-radius:10px;background:var(--bad);color:#fff;font-weight:700;cursor:pointer}
button:disabled{opacity:.6;cursor:default}
.error{color:var(--bad);min-height:1.5em;margin:12px 0 0}
.done{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin-top:24px}
`;

export function deletePageHtml(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Excluir conta</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <h1>Excluir sua conta do Trivia Torá</h1>
  <p>Ao excluir a conta:</p>
  <ul>
    <li>seu e-mail, sua senha, seu nome no jogo e seus pontos são apagados;</li>
    <li>você sai do ranking e todas as sessões abertas são encerradas;</li>
    <li>partidas em andamento terminam com vitória do adversário;</li>
    <li>comentários que você escreveu em denúncias são apagados.</li>
  </ul>
  <p class="muted">O histórico das partidas dos seus adversários continua existindo, mas sem nada que identifique você. Não há como desfazer.</p>
  <p class="muted">Jogando como convidado, sem e-mail? Abra o app e vá em Perfil, Conta e segurança, Excluir conta.</p>
  <form id="form" novalidate>
    <label for="email">E-mail da conta</label>
    <input id="email" type="email" autocomplete="username" required>
    <label for="password">Senha</label>
    <input id="password" type="password" autocomplete="current-password" required>
    <label class="check"><input id="confirm" type="checkbox"> Entendo que a exclusão é definitiva.</label>
    <p class="error" id="error" role="alert"></p>
    <button id="submit" type="submit">Excluir minha conta</button>
  </form>
  <div class="done" id="done" hidden>
    <h2>Conta excluída</h2>
    <p>Seus dados foram apagados. Se quiser, pode desinstalar o app.</p>
  </div>
</main>
<script src="/conta/excluir.js"></script>
</body>
</html>`;
}

/* JavaScript puro, sem crases nem interpolação, servido em /conta/excluir.js. */
export const DELETE_PAGE_JS = String.raw`
(function () {
  'use strict';
  var form = document.getElementById('form');
  var error = document.getElementById('error');
  var submit = document.getElementById('submit');
  function post(path, body, token) {
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(path, { method: 'POST', headers: headers, body: JSON.stringify(body) }).then(function (res) {
      return res.text().then(function (text) {
        var data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (e) { data = {}; }
        if (!res.ok) throw new Error(data.message || ('Erro ' + res.status));
        return data;
      });
    });
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = document.getElementById('email').value.trim();
    var password = document.getElementById('password').value;
    error.textContent = '';
    if (!email || !password) { error.textContent = 'Preencha o e-mail e a senha.'; return; }
    if (!document.getElementById('confirm').checked) { error.textContent = 'Marque a confirmação para continuar.'; return; }
    submit.disabled = true;
    post('/auth/login', { email: email, password: password })
      .then(function (tokens) { return post('/me/delete', { confirm: true, password: password }, tokens.accessToken); })
      .then(function () { form.hidden = true; document.getElementById('done').hidden = false; })
      .catch(function (err) { error.textContent = err.message; submit.disabled = false; });
  });
})();
`;
