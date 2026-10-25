const db = require('../config/db');
const logger = require('../utils/logger');

// GET /api/pilotos
exports.listarPilotos = async (req, res) => {
  try {
    // Esse JOIN junta o piloto com a equipe dele, trazendo as cores da equipe para o Frontend desenhar as badges!
    const query = `
      SELECT p.*, e.nome AS nome_equipe, e.cor_primaria, e.cor_secundaria
      FROM pilotos p
      LEFT JOIN equipes e ON p.equipe_id = e.id
      ORDER BY p.nome ASC
    `;
    const [pilotos] = await db.query(query);
    
    return res.status(200).json({ status: 'sucesso', dados: pilotos });
  } catch (erro) {
    console.error('------- ERRO NO MYSQL (GET TODOS) -------', erro);
    return res.status(500).json({ status: 'erro', mensagem: 'Erro interno no servidor.' });
  }
};

// GET /api/pilotos/:id
exports.obterPiloto = async (req, res) => {
  try {
    const { id } = req.params;
    const [piloto] = await db.query('SELECT * FROM pilotos WHERE id = ?', [id]);
    
    if (piloto.length === 0) {
      return res.status(404).json({ status: 'erro', mensagem: 'Piloto não encontrado.' });
    }
    
    return res.status(200).json({ status: 'sucesso', dados: piloto[0] });
  } catch (erro) {
    console.error(`------- ERRO NO MYSQL (GET ID ${req.params.id}) -------`, erro);
    logger.error('PILOTOS', `Erro ao buscar piloto ${req.params.id}: ${erro.message}`);
    return res.status(500).json({ status: 'erro', mensagem: 'Erro interno no servidor.' });
  }
};

// POST /api/pilotos (Restrito no RBAC)
exports.criarPiloto = async (req, res) => {
  const { nome, pais, idade, salario_anual, overrall, status_contrato, equipe_id } = req.body;
  
  if (!nome || !pais || !idade || !salario_anual || !overrall) {
    return res.status(400).json({ 
      status: 'erro', 
      mensagem: 'Campos obrigatórios: nome, pais, idade, salario_anual e overrall.' 
    });
  }

  try {
    const insertQuery = `
      INSERT INTO pilotos (nome, pais, idade, salario_anual, overrall, status_contrato, equipe_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const valores = [nome, pais, idade, salario_anual, overrall, status_contrato || 'Ativo', equipe_id || null];
    
    const [resultado] = await db.query(insertQuery, valores);
    const novoPilotoId = resultado.insertId;

    logger.info('PILOTOS', `Piloto criado com sucesso: ID ${novoPilotoId} por usuário ID ${req.usuario.id}`);
    
    return res.status(201).json({ 
      status: 'sucesso', 
      mensagem: 'Piloto criado com sucesso.',
      dados: { id: novoPilotoId, nome, pais }
    });
  } catch (erro) {
    console.error('------- ERRO DO MYSQL AO INSERIR PILOTO -------', erro);
    logger.error('PILOTOS', `Erro ao criar piloto: ${erro.message}`);
    return res.status(500).json({ status: 'erro', mensagem: 'Erro ao persistir os dados.' });
  }
};

// PUT /api/pilotos/:id (Restrito no RBAC)
exports.atualizarPiloto = async (req, res) => {
  const { id } = req.params;
  const { equipe_id, salario_anual, status_contrato } = req.body;

  try {
    const [existente] = await db.query('SELECT id FROM pilotos WHERE id = ?', [id]);
    if (existente.length === 0) {
      return res.status(404).json({ status: 'erro', mensagem: 'Piloto não encontrado.' });
    }

    const updateQuery = `
      UPDATE pilotos 
      SET equipe_id = ?, salario_anual = ?, status_contrato = ?
      WHERE id = ?
    `;
    await db.query(updateQuery, [equipe_id || null, salario_anual, status_contrato, id]);

    logger.info('PILOTOS', `Piloto ID ${id} atualizado por usuário ID ${req.usuario.id}`);
    
    return res.status(200).json({ status: 'sucesso', mensagem: 'Dados do contrato atualizados.' });
  } catch (erro) {
    console.error(`------- ERRO NO MYSQL (PUT ID ${req.params.id}) -------`, erro);
    logger.error('PILOTOS', `Erro ao atualizar piloto ${req.params.id}: ${erro.message}`);
    return res.status(500).json({ status: 'erro', mensagem: 'Erro interno no servidor.' });
  }
};

// DELETE /api/pilotos/:id (Restrito no RBAC)
exports.deletarPiloto = async (req, res) => {
  const { id } = req.params;
  
  try {
    const [resultado] = await db.query('DELETE FROM pilotos WHERE id = ?', [id]);
    
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ status: 'erro', mensagem: 'Piloto não encontrado.' });
    }

    logger.info('PILOTOS', `Piloto ID ${id} removido por usuário ID ${req.usuario.id}`);
    
    return res.status(200).json({ status: 'sucesso', mensagem: 'Registro do piloto removido definitivamente.' });
  } catch (erro) {
    console.error(`------- ERRO NO MYSQL (DELETE ID ${req.params.id}) -------`, erro);
    logger.error('PILOTOS', `Erro ao deletar piloto ${req.params.id}: ${erro.message}`);
    return res.status(500).json({ status: 'erro', mensagem: 'Erro interno no servidor.' });
  }
};