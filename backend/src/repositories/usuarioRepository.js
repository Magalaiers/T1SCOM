// Acesso a dados de usuários: todo o SQL da tabela `usuarios` fica aqui.
const db = require('../config/db');

async function buscarPorEmail(email) {
  const [linhas] = await db.execute(
    'SELECT id, nome, email, senha_hash, perfil FROM usuarios WHERE email = ? LIMIT 1',
    [email]
  );
  return linhas[0] || null;
}

async function buscarPorNome(nome) {
  const [linhas] = await db.execute(
    'SELECT id, nome, email, senha_hash, perfil FROM usuarios WHERE nome = ? LIMIT 1',
    [nome]
  );
  return linhas[0] || null;
}

// Usado a cada requisição autenticada: confirma que o usuário ainda existe e traz o perfil ATUAL
async function buscarPorId(id) {
  const [linhas] = await db.execute(
    'SELECT id, nome, email, perfil FROM usuarios WHERE id = ? LIMIT 1',
    [id]
  );
  return linhas[0] || null;
}

// Usado para detectar cadastro duplicado (devolve todos os conflitos)
async function buscarPorEmailOuNome(email, nome) {
  const [linhas] = await db.execute(
    'SELECT email, nome FROM usuarios WHERE email = ? OR nome = ?',
    [email, nome]
  );
  return linhas;
}

// Retorna o ID gerado. Aceita uma conexão para participar de uma transação.
async function inserir({ nome, email, senhaHash, perfil }, conexao = db) {
  const [resultado] = await conexao.execute(
    'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)',
    [nome, email, senhaHash, perfil]
  );
  return resultado.insertId;
}

module.exports = { buscarPorEmail, buscarPorNome, buscarPorId, buscarPorEmailOuNome, inserir };