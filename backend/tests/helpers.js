// Utilitários dos testes: criam usuários REAIS (o middleware confere o usuário no banco).
const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');

const SENHA = 'Senha1234';
const sufixo = Date.now().toString(36);
let contador = 0;
const unico = () => `${sufixo}${(contador++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function logar(app, usuario) {
  const r = await request(app).post('/api/auth/login').send({ email: usuario.email, senha: SENHA });
  if (r.status !== 200) throw new Error(`Falha ao logar usuário de teste (${r.status}): ${JSON.stringify(r.body)}`);
  return { ...usuario, id: r.body.usuario.id, token: r.body.token };
}

// MANAGER criado pela API de cadastro (recebe a cópia do catálogo, como um usuário real)
async function criarManager(app) {
  const id = unico();
  const usuario = { nome: `jest_${id}`, email: `jest.${id}@teste.com`, senha: SENHA };
  const r = await request(app).post('/api/auth/registrar').send(usuario);
  if (r.status !== 201) throw new Error(`Falha ao cadastrar MANAGER de teste (${r.status}): ${JSON.stringify(r.body)}`);
  return logar(app, usuario);
}

// ADMIN criado direto no banco (não existe cadastro público de ADMIN)
async function criarAdmin(app) {
  const id = unico();
  const usuario = { nome: `jest_adm_${id}`, email: `jest.adm.${id}@teste.com`, senha: SENHA };
  await db.execute(
    'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)',
    [usuario.nome, usuario.email, bcrypt.hashSync(SENHA, 10), 'ADMIN']
  );
  return logar(app, usuario);
}

// Apagar o usuário apaga também a cópia de pilotos dele (ON DELETE CASCADE)
async function removerUsuarios(ids) {
  const validos = ids.filter(Boolean);
  if (validos.length) await db.query('DELETE FROM usuarios WHERE id IN (?)', [validos]);
}

module.exports = { SENHA, criarManager, criarAdmin, removerUsuarios };