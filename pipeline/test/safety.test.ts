import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertAllowedUrl, readCapped } from '../src/sefaria/download.js';
import { safeJoin } from '../src/util.js';

describe('caminhos e URLs vindos do books.json', () => {
  it('safeJoin não deixa sair da pasta do export', () => {
    const root = path.resolve('/tmp/export');
    expect(safeJoin(root, 'json', 'Tanakh', 'Genesis.json')).toBe(path.join(root, 'json', 'Tanakh', 'Genesis.json'));
    expect(() => safeJoin(root, 'json', '..', '..', 'etc', 'passwd')).toThrow(/fora da pasta/);
    expect(() => safeJoin(root, '/etc/passwd')).toThrow(/fora da pasta/);
    expect(() => safeJoin(root, '../export-irmao/x.json')).toThrow(/fora da pasta/);
  });

  it('só baixa por https dos servidores configurados', () => {
    const allowed = ['storage.googleapis.com', 'raw.githubusercontent.com'];
    expect(() => assertAllowedUrl('https://storage.googleapis.com/sefaria-export/json/a.json', allowed)).not.toThrow();
    expect(() => assertAllowedUrl('http://storage.googleapis.com/x.json', allowed)).toThrow(/permitidas/);
    expect(() => assertAllowedUrl('https://evil.example/x.json', allowed)).toThrow(/permitidas/);
    expect(() => assertAllowedUrl('https://169.254.169.254/latest/meta-data', allowed)).toThrow(/permitidas/);
    expect(() => assertAllowedUrl('não é url', allowed)).toThrow(/inválida/);
  });

  it('para de ler o download assim que passa do teto, mesmo sem Content-Length', async () => {
    const big = new Response(new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024));
      },
    }));
    await expect(readCapped(big, 10_000, 'https://x')).rejects.toThrow(/grande demais/);
    const small = new Response('ok');
    expect((await readCapped(small, 10_000, 'https://x')).toString()).toBe('ok');
  });
});
