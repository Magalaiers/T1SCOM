// Acesso a dados de pilotos: todo o SQL da tabela `pilotos` fica aqui.
// Só usa consultas parametrizadas. Os nomes de colunas vêm de constantes, nunca de entrada do usuário.
//
// ISOLAMENTO POR DONO: toda consulta recebe `donoId` e filtra com `dono_id <=> ?`
// (igualdade que também vale para NULL):
//   donoId = null  -> catálogo-modelo (visitante e ADMIN)
//   donoId = <id>  -> cópia pessoal de um MANAGER
// Um registro de outro dono simplesmente "não existe" para quem consulta.
const db = require('../config/db');
const { ATRIBUTOS } = require('../utils/validators');

const SELECT_PILOTO = `
  SELECT p.*, e.nome AS nome_equipe, e.cor_primaria, e.cor_secundaria
  FROM pilotos p
  LEFT JOIN equipes e ON e.id = p.equipe_id
`;

const COLUNAS_ESCRITA = [
  'nome', 'pais', 'idade', 'salario_anual', 'series_preference', 'pay_driver',
  'marketability', 'status_contrato', 'equipe_id', ...ATRIBUTOS,
  'estrelas_atuais', 'estrelas_potencial'
];

// Dados validados + estrelas -> lista de valores na mesma ordem de COLUNAS_ESCRITA
function valoresParaGravar(dados, estrelas) {
  const completo = { ...dados, ...estrelas, ...dados.atributos, pay_driver: dados.pay_driver ? 1 : 0 };
  return COLUNAS_ESCRITA.map((coluna) => completo[coluna]);
}

async function listar(donoId) {
  const [linhas] = await db.execute(`${SELECT_PILOTO} WHERE p.dono_id <=> ? ORDER BY p.nome ASC`, [donoId]);
  return linhas;
}

async function buscarPorId(id, donoId) {
  const [linhas] = await db.execute(`${SELECT_PILOTO} WHERE p.id = ? AND p.dono_id <=> ?`, [id, donoId]);
  return linhas[0] || null;
}

// Retorna o ID gerado
async function inserir(dados, estrelas, donoId) {
  const colunas = [...COLUNAS_ESCRITA, 'dono_id'];
  const marcadores = colunas.map(() => '?').join(', ');
  const [resultado] = await db.execute(
    `INSERT INTO pilotos (${colunas.join(', ')}) VALUES (${marcadores})`,
    [...valoresParaGravar(dados, estrelas), donoId]
  );
  return resultado.insertId;
}

// Retorna true se o piloto existia para esse dono e foi atualizado
async function atualizar(id, donoId, dados, estrelas) {
  const atribuicoes = COLUNAS_ESCRITA.map((coluna) => `${coluna} = ?`).join(', ');
  const [resultado] = await db.execute(
    `UPDATE pilotos SET ${atribuicoes} WHERE id = ? AND dono_id <=> ?`,
    [...valoresParaGravar(dados, estrelas), id, donoId]
  );
  return resultado.affectedRows > 0;
}

// Retorna true se algum registro desse dono foi removido
async function excluir(id, donoId) {
  const [resultado] = await db.execute('DELETE FROM pilotos WHERE id = ? AND dono_id <=> ?', [id, donoId]);
  return resultado.affectedRows > 0;
}

// Copia o catálogo-modelo para um usuário (usado no cadastro e em "restaurar meus dados").
// Aceita uma conexão para participar de uma transação. Retorna quantos pilotos foram copiados.
async function copiarCatalogoPara(donoId, conexao = db) {
  const colunas = COLUNAS_ESCRITA.join(', ');
  const [resultado] = await conexao.execute(
    `INSERT INTO pilotos (${colunas}, dono_id) SELECT ${colunas}, ? FROM pilotos WHERE dono_id IS NULL`,
    [donoId]
  );
  return resultado.affectedRows;
}

async function excluirTodosDoDono(donoId, conexao = db) {
  const [resultado] = await conexao.execute('DELETE FROM pilotos WHERE dono_id = ?', [donoId]);
  return resultado.affectedRows;
}

// Ao apagar uma equipe, os pilotos dela voltam a ser agentes livres (equipe nula e status coerente).
// Retorna quantos pilotos foram liberados.
async function liberarDaEquipe(equipeId, donoId, conexao = db) {
    const [resultado] = await conexao.execute(
      "UPDATE pilotos SET equipe_id = NULL, status_contrato = 'Disponivel' WHERE equipe_id = ? AND dono_id <=> ?",
      [equipeId, donoId]
    );
return resultado.affectedRows;
}
  
  // Quantos pilotos desse dono estão na equipe (usado para respeitar o limite de elenco)
async function contarNaEquipe(equipeId, donoId) {
    const [[linha]] = await db.execute(
        'SELECT COUNT(*) AS total FROM pilotos WHERE equipe_id = ? AND dono_id <=> ?',
    [equipeId, donoId]
    );
    return Number(linha.total);
}
  
module.exports = {
    listar, buscarPorId, inserir, atualizar, excluir, copiarCatalogoPara, excluirTodosDoDono,
    liberarDaEquipe, contarNaEquipe
};