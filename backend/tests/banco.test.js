// Garantias do próprio banco: nome de usuário único (mesmo em cadastros simultâneos) e o que o schema.sql cria.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../server');
const db = require('../src/config/db');
const { SENHA, removerUsuarios } = require('./helpers');

const unico = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe('Restrições do banco', () => {
  const ids = [];
  afterAll(async () => {
    await removerUsuarios(ids);
    await db.end();
  });

  it('D1. O banco recusa dois usuários com o mesmo nome (inclusive com maiúsculas diferentes)', async () => {
    const marca = unico();
    const senhaHash = bcrypt.hashSync(SENHA, 4);
    const [r] = await db.execute('INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)', [`Nome_${marca}`, `d1a.${marca}@teste.com`, senhaHash]);
    ids.push(r.insertId);

    const repetido = db.execute('INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)', [`NOME_${marca.toUpperCase()}`, `d1b.${marca}@teste.com`, senhaHash]);
    try {
      await expect(repetido).rejects.toMatchObject({ code: 'ER_DUP_ENTRY', sqlMessage: expect.stringMatching(/uq_usuarios_nome/) });
    } finally {
      await db.execute('DELETE FROM usuarios WHERE email = ?', [`d1b.${marca}@teste.com`]); // só existiria se a restrição faltasse
    }
  });

  it('D2. Dois cadastros SIMULTÂNEOS com o mesmo nome: um é criado (201), o outro recebe 409 pela mensagem do nome', async () => {
    const marca = unico();
    const cadastro = (n) => request(app).post('/api/auth/registrar').send({ nome: `corrida_${marca}`, email: `d2.${n}.${marca}@teste.com`, senha: SENHA });
    const respostas = await Promise.all([cadastro(1), cadastro(2)]);

    expect(respostas.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(respostas.find((r) => r.status === 409).body.mensagem).toMatch(/nome de usuário/i);

    const [linhas] = await db.execute('SELECT id FROM usuarios WHERE nome = ?', [`corrida_${marca}`]);
    ids.push(...linhas.map((l) => l.id)); // rastreia todos, para a limpeza funcionar mesmo se a restrição faltar
    expect(linhas).toHaveLength(1);
  });

  it('D3. O schema.sql criou a tabela de tokens revogados e a restrição de nome único', async () => {
    const [tabela] = await db.query("SHOW TABLES LIKE 'tokens_revogados'");
    const [restricao] = await db.query(
      "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND CONSTRAINT_NAME = 'uq_usuarios_nome'"
    );
    expect(tabela).toHaveLength(1);
    expect(restricao).toHaveLength(1);
  });
});