import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, type TokenStore } from '../src/lib/api-core';

const user = { id: '11111111-1111-4111-8111-111111111111', displayName: 'Ana', isGuest: true, totalPoints: 0 };

function memoryStore(initial: string | null = null): TokenStore & { value: string | null } {
  return {
    value: initial,
    async getRefreshToken() {
      return this.value;
    },
    async setRefreshToken(t) {
      this.value = t;
    },
  };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const me = {
  ...user,
  email: null,
  hasPassword: false,
  identities: [],
  lives: { lives: 5, max: 5, nextLifeAt: null },
  coins: 0,
  locale: 'pt',
  golem: { equipped: { head: 'kipa-azul' } },
  stats: { gamesPlayed: 0, wins: 0, answered: 0, correct: 0 },
};

/** Servidor falso: tokens de acesso "a1", "a2"…, refresh "r1", "r2"…, com rotação e detecção de reuso. */
function fakeServer() {
  let n = 1;
  let validAccess = 'a1';
  let validRefresh: string | null = 'r1';
  const calls: string[] = [];
  const handler = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace('http://api.test', '');
    calls.push(`${init?.method ?? 'GET'} ${path}`);
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (path === '/auth/refresh') {
      const body = JSON.parse(String(init?.body));
      if (body.refreshToken !== validRefresh) {
        validRefresh = null; // reuso: derruba tudo
        return json(401, { code: 'UNAUTHORIZED', message: 'Faça login novamente.' });
      }
      n++;
      validAccess = `a${n}`;
      validRefresh = `r${n}`;
      return json(200, { accessToken: validAccess, refreshToken: validRefresh, user });
    }
    if (path === '/me') {
      return auth === `Bearer ${validAccess}` ? json(200, me) : json(401, { code: 'UNAUTHORIZED', message: 'Sessão expirada.' });
    }
    return json(404, { code: 'NOT_FOUND', message: 'Recurso não encontrado.' });
  });
  return {
    handler,
    calls,
    expireAccess() {
      validAccess = 'expirado';
    },
  };
}

describe('cliente da API', () => {
  it('retoma a sessão salva e guarda o novo refresh token', async () => {
    const server = fakeServer();
    const store = memoryStore('r1');
    const onSession = vi.fn();
    const api = createApiClient({ baseUrl: 'http://api.test/', tokenStore: store, fetch: server.handler as never, onSession });
    expect(await api.restore()).toBe(true);
    expect(store.value).toBe('r2');
    expect(onSession).toHaveBeenCalledWith(user);
    await expect(api.me.get()).resolves.toMatchObject({ displayName: 'Ana' });
  });

  it('várias requisições com token vencido fazem UMA renovação só', async () => {
    const server = fakeServer();
    const store = memoryStore('r1');
    const api = createApiClient({ baseUrl: 'http://api.test', tokenStore: store, fetch: server.handler as never });
    await api.restore();
    server.expireAccess();
    const results = await Promise.all([api.me.get(), api.me.get(), api.me.get()]);
    expect(results).toHaveLength(3);
    expect(server.calls.filter((c) => c === 'POST /auth/refresh')).toHaveLength(2); // restore + 1 renovação
  });

  it('sem sessão válida, limpa o armazenamento e avisa que a sessão terminou', async () => {
    const server = fakeServer();
    const store = memoryStore('token-desconhecido');
    const onSession = vi.fn();
    const api = createApiClient({ baseUrl: 'http://api.test', tokenStore: store, fetch: server.handler as never, onSession });
    expect(await api.restore()).toBe(false);
    expect(store.value).toBeNull();
    expect(onSession).toHaveBeenCalledWith(null);
    await expect(api.me.get()).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
  });

  it('erros da API chegam com o código e a mensagem do servidor', async () => {
    const server = fakeServer();
    const api = createApiClient({ baseUrl: 'http://api.test', tokenStore: memoryStore('r1'), fetch: server.handler as never });
    await api.restore();
    const error = await api.games.state('x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'Recurso não encontrado.' });
  });

  it('falha de rede vira uma mensagem que diz o que conferir, sem derrubar a sessão', async () => {
    const store = memoryStore('r1');
    const api = createApiClient({
      baseUrl: 'http://192.168.0.10:3000',
      tokenStore: store,
      fetch: (async () => {
        throw new TypeError('Network request failed');
      }) as never,
    });
    const error = await api.restore().catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'NETWORK' });
    expect((error as Error).message).toContain('http://192.168.0.10:3000');
    expect(store.value).toBe('r1');
  });

  it('limite de requisições (429) ou erro do servidor não apagam a sessão guardada', async () => {
    for (const response of [
      () => new Response(JSON.stringify({ code: 'RATE_LIMITED', message: 'Muitas tentativas. Tente de novo em 2 minutos.' }), { status: 429, headers: { 'Retry-After': '120' } }),
      () => json(503, { message: 'Fora do ar' }),
    ]) {
      const store = memoryStore('r1');
      const onSession = vi.fn();
      const api = createApiClient({ baseUrl: 'http://api.test', tokenStore: store, fetch: (async () => response()) as never, onSession });
      const error = await api.restore().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(store.value).toBe('r1');
      expect(onSession).not.toHaveBeenCalled();
      expect(await api.hasStoredSession()).toBe(true);
      if ((error as ApiError).status === 429) expect((error as ApiError).retryAfterSeconds).toBe(120);
    }
  });

  it('em produção, recusa API sem https antes de mandar qualquer dado', async () => {
    const fetch = vi.fn();
    const api = createApiClient({ baseUrl: 'http://api.test', tokenStore: memoryStore('r1'), fetch: fetch as never, requireHttps: true });
    await expect(api.restore()).rejects.toMatchObject({ code: 'INSECURE_API_URL' });
    await expect(api.auth.login('a@b.com', 'segredo-qualquer')).rejects.toMatchObject({ code: 'INSECURE_API_URL' });
    expect(fetch).not.toHaveBeenCalled();
    const ok = createApiClient({ baseUrl: 'https://api.test', tokenStore: memoryStore(), fetch: (async () => json(401, {})) as never, requireHttps: true });
    await expect(ok.restore()).resolves.toBe(false);
    // O próprio aparelho (localhost) pode ser http: o tráfego não sai dele.
    for (const local of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
      const api2 = createApiClient({ baseUrl: local, tokenStore: memoryStore('r1'), fetch: (async () => json(401, {})) as never, requireHttps: true });
      await expect(api2.restore()).resolves.toBe(false);
    }
    const lan = createApiClient({ baseUrl: 'http://192.168.0.10:3000', tokenStore: memoryStore('r1'), fetch: fetch as never, requireHttps: true });
    await expect(lan.restore()).rejects.toMatchObject({ code: 'INSECURE_API_URL' });
  });

  it('excluir a conta e sair de todos os aparelhos limpam a sessão local', async () => {
    for (const action of ['delete', 'logoutAll'] as const) {
      const store = memoryStore('r1');
      const onSession = vi.fn();
      const calls: string[] = [];
      const api = createApiClient({
        baseUrl: 'http://api.test',
        tokenStore: store,
        onSession,
        fetch: (async (url: string, init?: RequestInit) => {
          calls.push(`${init?.method} ${url.replace('http://api.test', '')} ${init?.body ?? ''}`);
          if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 'a2', refreshToken: 'r2', user });
          return new Response(null, { status: 204 });
        }) as never,
      });
      await api.restore();
      if (action === 'delete') await api.me.deleteAccount('minha-senha-longa');
      else await api.auth.logoutAll();
      expect(store.value).toBeNull();
      expect(onSession).toHaveBeenLastCalledWith(null);
      expect(calls.at(-1)).toMatch(action === 'delete' ? /POST \/me\/delete .*"confirm":true.*"password":"minha-senha-longa"/ : /POST \/auth\/logout-all/);
    }
  });

  it('login social: sem sessão entra; com sessão manda o token dela (para ligar à conta aberta)', async () => {
    for (const withSession of [false, true]) {
      const store = memoryStore(withSession ? 'r1' : null);
      const onSession = vi.fn();
      const seen: { auth: string | undefined; body: unknown }[] = [];
      const api = createApiClient({
        baseUrl: 'http://api.test',
        tokenStore: store,
        onSession,
        fetch: (async (url: string, init?: RequestInit) => {
          if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 'a2', refreshToken: 'r2', user });
          if (url.endsWith('/auth/social')) {
            seen.push({ auth: (init?.headers as Record<string, string>).Authorization, body: JSON.parse(String(init?.body)) });
            return json(200, { accessToken: 'a3', refreshToken: 'r3', user: { ...user, isGuest: false } });
          }
          return json(404, { code: 'NOT_FOUND', message: 'x' });
        }) as never,
      });
      const input = { provider: 'apple' as const, token: 'header.payload.signature', nonce: 'n'.repeat(32) };
      await expect(api.auth.social(input)).resolves.toMatchObject({ isGuest: false });
      expect(seen).toEqual([{ auth: withSession ? 'Bearer a2' : undefined, body: input }]);
      expect(store.value).toBe('r3');
      expect(onSession).toHaveBeenLastCalledWith(expect.objectContaining({ isGuest: false }));
    }
  });

  it('desligar um login usa DELETE e devolve o perfil atualizado', async () => {
    const calls: string[] = [];
    const api = createApiClient({
      baseUrl: 'http://api.test',
      tokenStore: memoryStore('r1'),
      fetch: (async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method} ${url.replace('http://api.test', '')}`);
        if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 'a2', refreshToken: 'r2', user });
        return json(200, { ...me, identities: ['google'] });
      }) as never,
    });
    await api.restore();
    await expect(api.me.unlink('apple')).resolves.toMatchObject({ identities: ['google'] });
    expect(calls.at(-1)).toBe('DELETE /me/identities/apple');
  });

  it('recusa respostas fora do contrato', async () => {
    const api = createApiClient({
      baseUrl: 'http://api.test',
      tokenStore: memoryStore(),
      fetch: (async () => json(200, { accessToken: 'x' })) as never,
    });
    await expect(api.auth.guest('Ana')).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });
});
