#!/usr/bin/env node
/**
 * pnpm lan — o jogo no navegador de qualquer aparelho da sua rede, sem instalar nada.
 *
 * 1. Gera a versão web do app e compila a API (pule com --no-build).
 *    Com --godot, serve o cliente Godot (apps/godot) no lugar do app React Native; a
 *    exportação usa o Godot em GODOT_BIN (ou `godot` no PATH).
 * 2. Sobe a API servindo também o jogo, escutando em todas as interfaces.
 * 3. Mostra o endereço para abrir no celular e um QR code para a câmera.
 *
 * Página e API saem do mesmo endereço (a API fica em /api), então não há CORS nem
 * porta do Metro para liberar: só a porta da API (3000 por padrão).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { networkInterfaces, platform } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderUnicodeCompact } from 'uqr';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const GODOT = args.has('--godot');
const WEB_DIR = GODOT ? 'apps/godot/build/web' : 'apps/mobile/dist';
const isWindows = platform() === 'win32';

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function run(label, cmd, cmdArgs, env = {}) {
  console.log(`\n▸ ${label}`);
  const res = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit', shell: isWindows, env: { ...process.env, ...env } });
  if (res.status !== 0) fail(`${label} falhou (código ${res.status ?? res.signal}).`);
}

function envValue(key) {
  if (process.env[key]) return process.env[key];
  const file = path.join(ROOT, '.env');
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith(`${key}=`));
  return line?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

/** IPv4 da rede local (Wi-Fi/cabo), as de casa primeiro. */
export function lanAddresses(ifaces = networkInterfaces()) {
  const out = [];
  for (const [name, list] of Object.entries(ifaces)) {
    for (const a of list ?? []) {
      const v4 = a.family === 'IPv4' || a.family === 4;
      if (!v4 || a.internal || a.address.startsWith('169.254.')) continue;
      // Adaptadores virtuais (WSL, Hyper-V, Docker, VirtualBox) não são a rede do celular.
      if (/vEthernet|WSL|Hyper-V|docker|br-|veth|VirtualBox|vmnet|utun|tailscale/i.test(name)) continue;
      out.push({ name, address: a.address });
    }
  }
  const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  return out.sort((a, b) => rank(a.address) - rank(b.address));
}

async function waitForHealth(port, child) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) fail('A API parou ao iniciar (veja a mensagem acima).');
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  fail('A API não respondeu em 60 segundos.');
}

async function main() {
  if (!existsSync(path.join(ROOT, '.env'))) {
    fail('Falta o arquivo .env na raiz. Copie o .env.example para .env e rode "pnpm secrets:init" (veja o README).');
  }
  const port = Number(envValue('PORT') ?? 3000);

  if (!args.has('--no-build')) {
    run('Compilando a API', 'pnpm', ['--filter', '@trivia/api', 'build']);
    // A página fala com a API no mesmo endereço; nada de EXPO_PUBLIC_API_URL fixo na versão web.
    if (GODOT) {
      const godot = process.env.GODOT_BIN || 'godot';
      const dir = path.join(ROOT, 'apps/godot');
      run('Importando o projeto Godot', godot, ['--headless', '--path', dir, '--import']);
      run('Exportando o cliente Godot para a web', godot, ['--headless', '--path', dir, '--export-release', 'Web', 'build/web/index.html']);
    } else {
      run('Gerando a versão web do jogo', 'pnpm', ['--filter', '@trivia/mobile', 'export:web'], { EXPO_PUBLIC_API_URL: '' });
    }
  }
  if (!existsSync(path.join(ROOT, WEB_DIR, 'index.html'))) fail(`Não achei ${WEB_DIR}/index.html. Rode sem --no-build.`);
  if (!existsSync(path.join(ROOT, 'apps/api/dist/main.js'))) fail('A API não está compilada. Rode sem --no-build.');

  const child = spawn(process.execPath, ['apps/api/dist/main.js'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, WEB_DIR, HOST: '0.0.0.0', PORT: String(port) },
  });
  const stop = () => child.kill('SIGINT');
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  child.on('exit', (code) => process.exit(code ?? 0));

  await waitForHealth(port, child);
  const lan = lanAddresses();
  const lines = ['', '  Trivia Torá está no ar na sua rede', '', `  Neste computador:  http://localhost:${port}`];
  for (const { name, address } of lan) lines.push(`  Na rede (${name}):  http://${address}:${port}`);
  console.log(lines.join('\n'));
  if (lan.length) {
    const url = `http://${lan[0].address}:${port}`;
    console.log(`\n  Aponte a câmera do celular (no mesmo Wi-Fi) para abrir ${url}:\n`);
    console.log(renderUnicodeCompact(url, { border: 2 }).replace(/^/gm, '  '));
    console.log('\n  No celular, "Adicionar à tela inicial" deixa o jogo com cara de app.');
  } else {
    console.log('\n  Não achei nenhuma rede local neste computador. Ligue o Wi-Fi ou o cabo e rode de novo.');
  }
  if (isWindows) {
    console.log(
      [
        '',
        '  Celular não abre? O Firewall do Windows costuma bloquear a primeira vez:',
        '   • na janela do Windows Defender sobre o "Node.js", marque "Redes privadas" e permita;',
        '   • a rede do Wi-Fi precisa estar como "Privada" (Configurações > Rede e Internet);',
        `   • ou, no PowerShell como administrador:`,
        `     New-NetFirewallRule -DisplayName "Trivia Tora (${port})" -Direction Inbound -Protocol TCP -LocalPort ${port} -Action Allow -Profile Private`,
      ].join('\n'),
    );
  }
  console.log('\n  Ctrl+C encerra.\n');
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
