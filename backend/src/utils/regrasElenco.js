// Regra de negócio: tamanho máximo do elenco de uma equipe, por tipo de campeonato.
//   Endurance          -> 6 pilotos
//   Single Seater e GT -> 3 pilotos
// As equipes OFICIAIS nunca ficam abaixo do elenco com que vieram do jogo (algumas têm 6),
// e isso é resolvido na consulta de equipes (GREATEST), não aqui.
const LIMITE_ENDURANCE = 6;
const LIMITE_PADRAO = 3;

// Fragmento de SQL com a regra (recebe o NOME DE UMA COLUNA fixo do código, nunca entrada do usuário)
const limitePorTipoSql = (colunaTipo) =>
  `CASE ${colunaTipo} WHEN 'Endurance' THEN ${LIMITE_ENDURANCE} ELSE ${LIMITE_PADRAO} END`;

module.exports = { LIMITE_ENDURANCE, LIMITE_PADRAO, limitePorTipoSql };