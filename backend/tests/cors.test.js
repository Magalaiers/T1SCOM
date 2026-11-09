// Política de CORS: a API só aceita chamadas de navegador vindas de origens conhecidas.
const express = require('express');
const request = require('supertest');
const { criarCors, origemPermitida } = require('../src/config/cors');

const appCom = (env) => {
  const app = express();
  app.use(criarCors(env));
  app.get('/ola', (req, res) => res.json({ ok: true }));
  return app;
};

describe('CORS', () => {
  it('C1. Origens do próprio computador (qualquer porta) e requisições sem Origin são aceitas', () => {
    ['http://localhost:5500', 'http://127.0.0.1:8080', 'http://localhost', 'http://[::1]:3000']
      .forEach((origem) => expect(origemPermitida(origem)).toBe(true));
    expect(origemPermitida(undefined)).toBe(true); // curl, testes, mesmo servidor
  });

  it('C2. SEGURANÇA: sites de terceiros e imitações de localhost são recusados', () => {
    ['https://evil.example', 'http://evil.example', 'http://localhost.evil.com', 'http://127.0.0.1.evil.com',
      'https://localhost:5500', 'http://localhost:5500.evil.com', 'http://localhost@evil.com']
      .forEach((origem) => expect(origemPermitida(origem)).toBe(false));
  });

  it('C3. Origem "null" (arquivo aberto do disco) só é aceita fora de produção', () => {
    expect(origemPermitida('null', { producao: false })).toBe(true);
    expect(origemPermitida('null', { producao: true })).toBe(false);
  });

  it('C4. Com CORS_ORIGIN definido, vale somente a lista (nem localhost passa)', () => {
    const lista = ['https://meusite.com', 'http://127.0.0.1:5500'];
    expect(origemPermitida('https://meusite.com', { lista })).toBe(true);
    expect(origemPermitida('http://127.0.0.1:5500', { lista })).toBe(true);
    expect(origemPermitida('http://localhost:3000', { lista })).toBe(false);
    expect(origemPermitida('https://outro.com', { lista })).toBe(false);
  });

  it('C5. SEGURANÇA: no servidor, origem estranha não recebe cabeçalhos CORS (o navegador bloqueia a resposta)', async () => {
    const app = appCom({});
    const permitida = await request(app).get('/ola').set('Origin', 'http://127.0.0.1:5500');
    expect(permitida.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5500');

    const estranha = await request(app).get('/ola').set('Origin', 'https://evil.example');
    expect(estranha.headers['access-control-allow-origin']).toBeUndefined();

    const semOrigin = await request(app).get('/ola');
    expect(semOrigin.status).toBe(200);
  });

  it('C6. Preflight (OPTIONS) segue a mesma regra e a lista do .env é respeitada', async () => {
    const app = appCom({ CORS_ORIGIN: 'https://meusite.com' });
    const ok = await request(app).options('/ola').set('Origin', 'https://meusite.com').set('Access-Control-Request-Method', 'POST');
    expect(ok.status).toBe(204);
    expect(ok.headers['access-control-allow-origin']).toBe('https://meusite.com');

    const bloqueada = await request(app).options('/ola').set('Origin', 'http://localhost:5500').set('Access-Control-Request-Method', 'POST');
    expect(bloqueada.headers['access-control-allow-origin']).toBeUndefined();
  });
});