// Regras de negócio e validação de pilotos.
// Funções puras (sem acesso a banco): facilitam os testes automatizados.

const ATRIBUTOS = [
  'frenagem', 'curva', 'suavidade', 'ultrapassagem', 'consistencia',
  'adaptabilidade', 'preparo_fisico', 'feedback', 'foco'
];
const ROTULOS_ATRIBUTOS = {
  frenagem: 'Frenagem', curva: 'Curva', suavidade: 'Suavidade',
  ultrapassagem: 'Ultrapassagem', consistencia: 'Consistência',
  adaptabilidade: 'Adaptabilidade', preparo_fisico: 'Preparo físico',
  feedback: 'Feedback', foco: 'Foco'
};
const SERIES = ['Any', 'Single Seater', 'GT', 'Endurance'];
const STATUS_CONTRATO = ['Contratado', 'Disponivel', 'Em Negociacao'];
const CAMPOS_EDITAVEIS = [
  'nome', 'pais', 'idade', 'salario_anual', 'equipe_id', 'series_preference',
  'pay_driver', 'marketability', 'estrelas_potencial', 'status_contrato'
];
const SALARIO_MAXIMO = 9999999999.99; // limite do DECIMAL(12,2)

const temChave = (obj, chave) => Object.prototype.hasOwnProperty.call(obj, chave);
const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const arredondar1 = (n) => Number(n.toFixed(1));

// Sanitização: remove caracteres de controle e < >, normaliza espaços.
// (A defesa principal contra XSS continua sendo o escape na saída do frontend.)
function limparTexto(valor) {
  return String(valor)
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function validarId(valor) {
  const texto = String(valor);
  if (!/^[1-9]\d{0,9}$/.test(texto)) return null;
  const n = Number(texto);
  return n <= 2147483647 ? n : null;
}

// Estrelas atuais = média dos 9 atributos (escala 0-20) convertida para 0.5-5.0.
// Mesma fórmula usada pelo frontend como fallback.
function calcularEstrelasAtuais(atributos) {
  const media = ATRIBUTOS.reduce((soma, chave) => soma + Number(atributos[chave]), 0) / ATRIBUTOS.length;
  return arredondar1(Math.max(0.5, Math.min(5, (media / 20) * 5)));
}

// Mescla o piloto existente com o corpo do PUT: campos omitidos mantêm o valor atual.
function mesclarPiloto(existente, corpo) {
  const mesclado = { ...existente };
  if (!ehObjeto(corpo)) return corpo;
  CAMPOS_EDITAVEIS.forEach((campo) => {
    if (temChave(corpo, campo)) mesclado[campo] = corpo[campo];
  });
  if (temChave(corpo, 'atributos')) {
    mesclado.atributos = ehObjeto(corpo.atributos)
      ? { ...existente.atributos, ...corpo.atributos }
      : corpo.atributos; // tipo inválido: o validador reporta
  }
  return mesclado;
}

function validarPiloto(entrada) {
  if (!ehObjeto(entrada)) {
    return { valido: false, dados: null, erros: [{ campo: 'body', mensagem: 'Corpo da requisição inválido.' }] };
  }

  const erros = [];
  const dados = {};
  const erro = (campo, mensagem) => erros.push({ campo, mensagem });

  // Textos obrigatórios
  [['nome', 'Nome', 2, 100], ['pais', 'País', 2, 60]].forEach(([campo, rotulo, min, max]) => {
    if (typeof entrada[campo] !== 'string') return erro(campo, `${rotulo} é obrigatório e deve ser um texto.`);
    const limpo = limparTexto(entrada[campo]);
    if (limpo.length < min || limpo.length > max) return erro(campo, `${rotulo} deve ter entre ${min} e ${max} caracteres.`);
    dados[campo] = limpo;
  });

  // Idade
  if (!Number.isInteger(entrada.idade) || entrada.idade < 16 || entrada.idade > 60) {
    erro('idade', 'Idade deve ser um número inteiro entre 16 e 60.');
  } else dados.idade = entrada.idade;

  // Salário
  if (typeof entrada.salario_anual !== 'number' || !Number.isFinite(entrada.salario_anual)
      || entrada.salario_anual < 0 || entrada.salario_anual > SALARIO_MAXIMO) {
    erro('salario_anual', 'Salário anual deve ser um número entre 0 e 9.999.999.999,99.');
  } else dados.salario_anual = Math.round(entrada.salario_anual * 100) / 100;

  // Equipe (opcional)
  const equipe = entrada.equipe_id === undefined ? null : entrada.equipe_id;
  if (equipe !== null && (!Number.isInteger(equipe) || equipe < 1)) {
    erro('equipe_id', 'Equipe deve ser um identificador inteiro positivo ou nulo.');
  } else dados.equipe_id = equipe;

  // Série preferida
  const serie = entrada.series_preference === undefined ? 'Any' : entrada.series_preference;
  if (!SERIES.includes(serie)) erro('series_preference', `Série preferida deve ser uma de: ${SERIES.join(', ')}.`);
  else dados.series_preference = serie;

  // Piloto pagante
  const pagante = entrada.pay_driver === undefined ? false : entrada.pay_driver;
  if (typeof pagante !== 'boolean') erro('pay_driver', 'Piloto pagante deve ser verdadeiro ou falso.');
  else dados.pay_driver = pagante;

  // Apelo comercial
  const mkt = entrada.marketability === undefined ? 0 : entrada.marketability;
  if (!Number.isInteger(mkt) || mkt < 0 || mkt > 100) erro('marketability', 'Apelo comercial deve ser um inteiro entre 0 e 100.');
  else dados.marketability = mkt;

  // Potencial (opcional): a coerência com as estrelas atuais é resolvida em resolverEstrelas
  if (entrada.estrelas_potencial !== undefined && entrada.estrelas_potencial !== null) {
    const pot = entrada.estrelas_potencial;
    if (typeof pot !== 'number' || !Number.isFinite(pot) || pot < 0 || pot > 5) {
      erro('estrelas_potencial', 'Potencial deve ser um número entre 0 e 5.');
    } else dados.estrelas_potencial = arredondar1(pot);
  }

  // Situação contratual: sempre coerente com a equipe
  const status = entrada.status_contrato === undefined ? undefined : entrada.status_contrato;
  if (status !== undefined && !STATUS_CONTRATO.includes(status)) {
    erro('status_contrato', `Status do contrato deve ser um de: ${STATUS_CONTRATO.join(', ')}.`);
  } else if (dados.equipe_id === null) dados.status_contrato = 'Disponivel';
  else dados.status_contrato = status === 'Em Negociacao' ? 'Em Negociacao' : 'Contratado';

  // Atributos técnicos (0 a 20, inteiros)
  if (!ehObjeto(entrada.atributos)) {
    erro('atributos', 'Atributos são obrigatórios e devem ser um objeto.');
  } else {
    dados.atributos = {};
    ATRIBUTOS.forEach((chave) => {
      const v = entrada.atributos[chave];
      if (!Number.isInteger(v) || v < 0 || v > 20) {
        erro(`atributos.${chave}`, `${ROTULOS_ATRIBUTOS[chave]} deve ser um inteiro entre 0 e 20.`);
      } else dados.atributos[chave] = v;
    });
  }

  return { valido: erros.length === 0, dados: erros.length === 0 ? dados : null, erros };
}

// Define estrelas atuais/potencial para persistir.
// - Atributos alterados (ou piloto novo): recalcula as estrelas atuais pela média.
// - Caso contrário preserva as estrelas atuais já gravadas (ex.: valores do jogo).
// - Potencial nunca fica abaixo das estrelas atuais.
function resolverEstrelas(dados, existente) {
  const atributosAlterados = !existente || ATRIBUTOS.some((c) => dados.atributos[c] !== existente.atributos[c]);
  const atuais = atributosAlterados ? calcularEstrelasAtuais(dados.atributos) : existente.estrelas_atuais;
  const base = dados.estrelas_potencial !== undefined
    ? dados.estrelas_potencial
    : (existente ? existente.estrelas_potencial : atuais + 0.5);
  const potencial = arredondar1(Math.min(5, Math.max(atuais, base)));
  return { estrelas_atuais: atuais, estrelas_potencial: potencial };
}

// ---------------------------------------------------------------------
// Autenticação: cadastro e login
// ---------------------------------------------------------------------
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarRegistro(entrada) {
  if (!ehObjeto(entrada)) {
    return { valido: false, dados: null, erros: [{ campo: 'body', mensagem: 'Corpo da requisição inválido.' }] };
  }
  const erros = [];
  const dados = {};
  const erro = (campo, mensagem) => erros.push({ campo, mensagem });

  // Nome de usuário (também serve para login): sem "@", para nunca se confundir com um e-mail
  if (typeof entrada.nome !== 'string') {
    erro('nome', 'Nome de usuário é obrigatório e deve ser um texto.');
  } else {
    const nome = limparTexto(entrada.nome);
    if (nome.length < 3 || nome.length > 60) erro('nome', 'Nome de usuário deve ter entre 3 e 60 caracteres.');
    else if (nome.includes('@')) erro('nome', 'Nome de usuário não pode conter "@".');
    else dados.nome = nome;
  }

  // E-mail
  if (typeof entrada.email !== 'string') {
    erro('email', 'E-mail é obrigatório e deve ser um texto.');
  } else {
    const email = entrada.email.trim().toLowerCase();
    if (email.length > 120 || !REGEX_EMAIL.test(email)) erro('email', 'Informe um e-mail válido (até 120 caracteres).');
    else dados.email = email;
  }

  // Senha: 8 a 72 bytes (limite do bcrypt), com ao menos uma letra e um número
  if (typeof entrada.senha !== 'string') {
    erro('senha', 'Senha é obrigatória e deve ser um texto.');
  } else if (entrada.senha.length < 8 || Buffer.byteLength(entrada.senha, 'utf8') > 72) {
    erro('senha', 'A senha deve ter entre 8 e 72 caracteres.');
  } else if (!/[A-Za-z]/.test(entrada.senha) || !/\d/.test(entrada.senha)) {
    erro('senha', 'A senha deve conter pelo menos uma letra e um número.');
  } else dados.senha = entrada.senha;

  return { valido: erros.length === 0, dados: erros.length === 0 ? dados : null, erros };
}

// Login: o campo continua se chamando "email" no JSON (o frontend envia assim),
// mas aceita e-mail OU nome de usuário.
function validarLogin(entrada) {
  if (!ehObjeto(entrada)) {
    return { valido: false, dados: null, erros: [{ campo: 'body', mensagem: 'Corpo da requisição inválido.' }] };
  }
  const erros = [];
  const dados = {};

  if (typeof entrada.email !== 'string' || entrada.email.trim().length < 1 || entrada.email.trim().length > 120) {
    erros.push({ campo: 'email', mensagem: 'Informe o e-mail ou nome de usuário (até 120 caracteres).' });
  } else dados.identificador = entrada.email.trim();

  if (typeof entrada.senha !== 'string' || entrada.senha.length < 1 || entrada.senha.length > 128) {
    erros.push({ campo: 'senha', mensagem: 'Informe a senha (até 128 caracteres).' });
  } else dados.senha = entrada.senha;

  return { valido: erros.length === 0, dados: erros.length === 0 ? dados : null, erros };
}

// ---------------------------------------------------------------------
// Equipe própria do MANAGER
// ---------------------------------------------------------------------
const REGEX_COR = /^#[0-9a-fA-F]{6}$/;
const COR_PRIMARIA_PADRAO = '#383e4d';
const COR_SECUNDARIA_PADRAO = '#ffffff';
const CAMPOS_EDITAVEIS_EQUIPE = ['nome', 'pais', 'campeonato_id', 'cor_primaria', 'cor_secundaria'];

function validarEquipe(entrada) {
  if (!ehObjeto(entrada)) {
    return { valido: false, dados: null, erros: [{ campo: 'body', mensagem: 'Corpo da requisição inválido.' }] };
  }
  const erros = [];
  const dados = {};
  const erro = (campo, mensagem) => erros.push({ campo, mensagem });

  [['nome', 'Nome da equipe', 2, 80], ['pais', 'País', 2, 60]].forEach(([campo, rotulo, min, max]) => {
    if (typeof entrada[campo] !== 'string') return erro(campo, `${rotulo} é obrigatório e deve ser um texto.`);
    const limpo = limparTexto(entrada[campo]);
    if (limpo.length < min || limpo.length > max) return erro(campo, `${rotulo} deve ter entre ${min} e ${max} caracteres.`);
    dados[campo] = limpo;
  });

  if (!Number.isInteger(entrada.campeonato_id) || entrada.campeonato_id < 1) {
    erro('campeonato_id', 'Campeonato é obrigatório (identificador inteiro positivo).');
  } else dados.campeonato_id = entrada.campeonato_id;

  [['cor_primaria', 'Cor primária', COR_PRIMARIA_PADRAO], ['cor_secundaria', 'Cor secundária', COR_SECUNDARIA_PADRAO]]
    .forEach(([campo, rotulo, padrao]) => {
      const valor = entrada[campo] === undefined ? padrao : entrada[campo];
      if (typeof valor !== 'string' || !REGEX_COR.test(valor)) erro(campo, `${rotulo} deve estar no formato #rrggbb.`);
      else dados[campo] = valor.toLowerCase();
    });

  return { valido: erros.length === 0, dados: erros.length === 0 ? dados : null, erros };
}

// Edição parcial da equipe: campos omitidos mantêm o valor atual
function mesclarEquipe(existente, corpo) {
  if (!ehObjeto(corpo)) return corpo;
  const mesclado = { ...existente };
  CAMPOS_EDITAVEIS_EQUIPE.forEach((campo) => {
    if (temChave(corpo, campo)) mesclado[campo] = corpo[campo];
  });
  return mesclado;
}

module.exports = {
  ATRIBUTOS, SERIES, STATUS_CONTRATO,
  validarId, validarPiloto, mesclarPiloto, resolverEstrelas, calcularEstrelasAtuais, limparTexto,
  validarRegistro, validarLogin, validarEquipe, mesclarEquipe
};