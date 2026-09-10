let pilotosData = [];
let equipesData = [];

// Estado Global da Listagem
let paginaAtual = 1;
let itensPorPagina = 12;
let termoBusca = '';
let filtroEquipeSelecionada = 'todas';
let criterioOrdenacao = 'rating_desc';

// Mapeamento resiliente dos 9 atributos técnicos (suporta múltiplos nomes de colunas)
const ATRIBUTOS_CONFIG = [
  { chave: 'frenagem', rotulo: 'Frenagem', alias: ['braking', 'frenagem'] },
  { chave: 'curva', rotulo: 'Curva', alias: ['cornering', 'curva'] },
  { chave: 'suavidade', rotulo: 'Suavidade', alias: ['smoothness', 'suavidade'] },
  { chave: 'ultrapassagem', rotulo: 'Ultrapassagem', alias: ['overtaking', 'ultrapassagem'] },
  { chave: 'consistencia', rotulo: 'Consistência', alias: ['consistency', 'consistencia'] },
  { chave: 'adaptabilidade', rotulo: 'Adaptação', alias: ['adaptability', 'adaptabilidade', 'adaptacao'] },
  { chave: 'preparo_fisico', rotulo: 'Preparo Físico', alias: ['fitness', 'preparo_fisico', 'fisico'] },
  { chave: 'feedback', rotulo: 'Feedback', alias: ['feedback'] },
  { chave: 'foco', rotulo: 'Foco', alias: ['focus', 'foco'] }
];

document.addEventListener('DOMContentLoaded', async () => {
  await carregarDados();
  inicializarControles();
  renderizarCatalogo();
  configurarEventosComparacao();
});

// 1. Carregamento Assíncrono da Base de Dados
async function carregarDados() {
  try {
    const resposta = await fetch('./dados.json');
    if (!resposta.ok) throw new Error('Falha ao carregar dados.json');
    const dados = await resposta.json();
    pilotosData = dados.pilotos || [];
    equipesData = dados.equipes || [];
  } catch (erro) {
    console.error('Erro na requisição:', erro);
    const painel = document.getElementById('painel_comparativo');
    if (painel) {
      painel.innerHTML = `
        <div class="msg_erro" role="alert">
          <p>⚠️ Falha ao carregar a base de dados (dados.json).</p>
          <small>Certifique-se de executar via servidor local HTTP com o dados.json na raiz.</small>
        </div>
      `;
    }
  }
}

// 2. Localizadores Flexíveis de Elementos do DOM
function obterSeletoresComparador() {
  const s1 = document.getElementById('select_piloto_1') || document.getElementById('select_p1');
  const s2 = document.getElementById('select_piloto_2') || document.getElementById('select_p2');
  return { s1, s2 };
}

// 3. Regras de Negócio e Cálculos Relacionais
function obterEquipe(equipeId) {
  if (equipeId === null || equipeId === undefined) return null;
  return equipesData.find(e => String(e.id) === String(equipeId)) || null;
}

function obterNomeEquipe(equipeId) {
  const equipe = obterEquipe(equipeId);
  return equipe ? equipe.nome : 'Sem Equipe (Disponível)';
}

function obterValorAtributo(piloto, itemConfig) {
  if (!piloto || !piloto.atributos) return 10;
  if (piloto.atributos[itemConfig.chave] !== undefined) {
    return Number(piloto.atributos[itemConfig.chave]);
  }
  for (const alias of itemConfig.alias) {
    if (piloto.atributos[alias] !== undefined) {
      return Number(piloto.atributos[alias]);
    }
  }
  return 10;
}

function calcularEstrelasAtuais(piloto) {
  if (piloto.estrelas_atuais && !isNaN(piloto.estrelas_atuais) && Number(piloto.estrelas_atuais) > 0) {
    return Number(piloto.estrelas_atuais);
  }
  if (piloto.atributos) {
    const valores = ATRIBUTOS_CONFIG.map(cfg => obterValorAtributo(piloto, cfg));
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    const escala = Math.max(...valores) > 20 ? 100 : 20;
    return Number(((media / escala) * 5).toFixed(1));
  }
  return 3.0;
}

function calcularEstrelasPotencial(piloto, estrelasAtuais) {
  let pot = piloto.estrelas_potencial || piloto.potencial_estrelas || piloto.potencial;
  if (pot && !isNaN(pot) && Number(pot) > 0) {
    let num = Number(pot);
    if (num > 20) num = (num / 100) * 5;
    else if (num > 5) num = (num / 20) * 5;
    return Math.min(5.0, Math.max(estrelasAtuais, Number(num.toFixed(1))));
  }
  return Math.min(5.0, Number((estrelasAtuais + 0.5).toFixed(1)));
}

function formatarSalario(valor) {
  if (!valor || isNaN(valor) || Number(valor) <= 0) return 'Sob Consulta';
  return `$ ${Number(valor).toLocaleString('pt-BR')}/ano`;
}

function renderizarEstrelasVisual(nota) {
  const valor = Math.max(0.5, Math.min(5, Number(nota) || 1.0));
  const cheias = Math.floor(valor);
  const temMeia = (valor - cheias) >= 0.3 && (valor - cheias) <= 0.7;
  const vazias = Math.max(0, 5 - cheias - (temMeia ? 1 : 0));

  let icones = '★'.repeat(cheias);
  if (temMeia) icones += '⯪';
  icones += '☆'.repeat(vazias);

  return `<span class="rating_stars" title="${valor.toFixed(1)} de 5.0 estrelas">${icones} <small>(${valor.toFixed(1)})</small></span>`;
}

// 4. Inicialização dos Controles (Filtros, Buscas, Ordenação)
function inicializarControles() {
  const { s1, s2 } = obterSeletoresComparador();
  const filtroEquipe = document.getElementById('filtro_equipe');
  const campoBusca = document.getElementById('busca_piloto');
  const selectOrdenacao = document.getElementById('ordenar_piloto');
  const selectQtd = document.getElementById('itens_por_pagina');

  if (s1 && s2) {
    const pilotosOrdenados = [...pilotosData].sort((a, b) => a.nome.localeCompare(b.nome));
    pilotosOrdenados.forEach(p => {
      const eq = obterEquipe(p.equipe_id);
      const eqNome = eq ? eq.nome : 'Disponível';
      const rating = calcularEstrelasAtuais(p);
      const label = `${p.nome} [${rating}★] (${eqNome})`;
      s1.add(new Option(label, p.id));
      s2.add(new Option(label, p.id));
    });
  }

  if (filtroEquipe) {
    equipesData.forEach(eq => {
      filtroEquipe.add(new Option(eq.nome, eq.id));
    });
    filtroEquipe.addEventListener('change', (e) => {
      filtroEquipeSelecionada = e.target.value;
      paginaAtual = 1;
      renderizarCatalogo();
    });
  }

  if (campoBusca) {
    campoBusca.addEventListener('input', (e) => {
      termoBusca = e.target.value.toLowerCase().trim();
      paginaAtual = 1;
      renderizarCatalogo();
    });
  }

  if (selectOrdenacao) {
    selectOrdenacao.addEventListener('change', (e) => {
      criterioOrdenacao = e.target.value;
      paginaAtual = 1;
      renderizarCatalogo();
    });
  }

  if (selectQtd) {
    selectQtd.addEventListener('change', (e) => {
      const valor = e.target.value;
      itensPorPagina = valor === 'todos' ? 9999 : Number(valor);
      paginaAtual = 1;
      renderizarCatalogo();
    });
  }
}

// 5. Filtragem, Ordenação e Renderização do Plantel
function processarPilotosFiltrados() {
  return pilotosData
    .filter(p => {
      if (filtroEquipeSelecionada === 'livres') {
        if (p.equipe_id !== null && p.equipe_id !== undefined) return false;
      } else if (filtroEquipeSelecionada && filtroEquipeSelecionada !== 'todas') {
        if (String(p.equipe_id) !== String(filtroEquipeSelecionada)) return false;
      }

      if (termoBusca) {
        const nomeOk = (p.nome || '').toLowerCase().includes(termoBusca);
        const paisOk = (p.nacionalidade || '').toLowerCase().includes(termoBusca);
        if (!nomeOk && !paisOk) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const rA = calcularEstrelasAtuais(a);
      const rB = calcularEstrelasAtuais(b);
      const pA = calcularEstrelasPotencial(a, rA);
      const pB = calcularEstrelasPotencial(b, rB);
      const sA = Number(a.salario_anual) || 0;
      const sB = Number(b.salario_anual) || 0;

      switch (criterioOrdenacao) {
        case 'rating_desc': return rB - rA;
        case 'potencial_desc': return pB - pA;
        case 'salario_asc': return sA - sB;
        case 'salario_desc': return sB - sA;
        case 'nome_asc': return (a.nome || '').localeCompare(b.nome || '');
        default: return 0;
      }
    });
}

function renderizarCatalogo() {
  const container = document.getElementById('cards_container');
  const pagNav = document.getElementById('paginacao_container');
  if (!container) return;

  const filtrados = processarPilotosFiltrados();
  const totalItens = filtrados.length;
  const totalPaginas = Math.ceil(totalItens / itensPorPagina) || 1;

  if (paginaAtual > totalPaginas) paginaAtual = totalPaginas;

  const inicio = (paginaAtual - 1) * itensPorPagina;
  const paginaPilotos = filtrados.slice(inicio, inicio + itensPorPagina);

  container.innerHTML = '';

  if (paginaPilotos.length === 0) {
    container.innerHTML = '<p class="msg_placeholder">Nenhum piloto encontrado para os critérios selecionados.</p>';
    if (pagNav) pagNav.innerHTML = '';
    return;
  }

  paginaPilotos.forEach(piloto => {
    const eq = obterEquipe(piloto.equipe_id);
    const livre = !eq;
    const badgeTxt = livre ? 'Disponível' : eq.nome;
    const badgeBg = livre ? '#1f6f43' : (eq.cor_primaria || '#383e4d');
    const badgeCor = livre ? '#ffffff' : (eq.cor_secundaria || '#ffffff');
    const badgeBorda = livre ? '1px solid #2ea043' : 'none';

    const estrelasAtuais = calcularEstrelasAtuais(piloto);
    const estrelasPot = calcularEstrelasPotencial(piloto, estrelasAtuais);

    const payBadge = piloto.pay_driver
      ? '<span class="badge_pay_driver" title="Piloto traz aporte financeiro">Sim</span>'
      : '';

    const itensAttr = ATRIBUTOS_CONFIG.map(attr => `
      <li>${attr.rotulo}: <span>${obterValorAtributo(piloto, attr)}</span></li>
    `).join('');

    const card = document.createElement('article');
    card.className = `card_piloto ${livre ? 'card_piloto_livre' : ''}`;
    card.setAttribute('tabindex', '0');

    card.innerHTML = `
      <figure>
        <div class="avatar_piloto" aria-hidden="true">${(piloto.nome || 'P').charAt(0)}</div>
        <figcaption>
          <h3>${piloto.nome} ${payBadge}</h3>
          <span class="badge_equipe" style="background-color: ${badgeBg}; color: ${badgeCor}; border: ${badgeBorda}">
            ${badgeTxt}
          </span>
        </figcaption>
      </figure>

      <div class="ratings_container">
        <div class="rating_row">
          <span class="rating_label">Habilidade Atual:</span>
          ${renderizarEstrelasVisual(estrelasAtuais)}
        </div>
        <div class="rating_row">
          <span class="rating_label">Potencial Máximo:</span>
          ${renderizarEstrelasVisual(estrelasPot)}
        </div>
      </div>

      <div class="piloto_info_basica">
        <span>Idade: <strong>${piloto.idade || 25} anos</strong></span>
        <span>Origem: <strong>${piloto.nacionalidade || 'N/A'}</strong></span>
        <span>Salário: <strong>${formatarSalario(piloto.salario_anual)}</strong></span>
        <span>Série: <strong>${piloto.series_preference || 'Any'}</strong></span>
        <span>Comercial: <strong>${piloto.marketability || '0%'}</strong></span>
        <span>Piloto Pagante: <strong>${piloto.pay_driver ? '<span class="tag_sim_verde">Sim</span>' : 'Não'}</strong></span>
      </div>

      <ul class="atributos_lista">
        ${itensAttr}
      </ul>
    `;
    container.appendChild(card);
  });

  renderizarPaginacao(totalPaginas, totalItens);
}

// 6. Paginação Numérica com Atalhos e Acessibilidade
function renderizarPaginacao(totalPaginas, totalItens) {
  const nav = document.getElementById('paginacao_container');
  if (!nav) return;

  if (totalPaginas <= 1) {
    nav.innerHTML = `<div class="paginacao_info_unica"><span>Exibindo <strong>${totalItens}</strong> pilotos</span></div>`;
    return;
  }

  let botoesNumericos = '';
  const range = 2;
  const inicioRange = Math.max(1, paginaAtual - range);
  const fimRange = Math.min(totalPaginas, paginaAtual + range);

  if (inicioRange > 1) {
    botoesNumericos += `<button type="button" class="pag_num_btn" data-page="1">1</button>`;
    if (inicioRange > 2) botoesNumericos += `<span class="pag_reticencias">...</span>`;
  }

  for (let i = inicioRange; i <= fimRange; i++) {
    const activeClass = i === paginaAtual ? 'is_active' : '';
    const ariaCurrent = i === paginaAtual ? 'aria-current="page"' : '';
    botoesNumericos += `<button type="button" class="pag_num_btn ${activeClass}" data-page="${i}" ${ariaCurrent}>${i}</button>`;
  }

  if (fimRange < totalPaginas) {
    if (fimRange < totalPaginas - 1) botoesNumericos += `<span class="pag_reticencias">...</span>`;
    botoesNumericos += `<button type="button" class="pag_num_btn" data-page="${totalPaginas}">${totalPaginas}</button>`;
  }

  nav.innerHTML = `
    <div class="paginacao_wrapper">
      <button type="button" class="paginacao_btn" id="btn_ant" ${paginaAtual === 1 ? 'disabled' : ''} aria-label="Página anterior">&laquo; Anterior</button>
      <div class="pag_numeros_container">${botoesNumericos}</div>
      <button type="button" class="paginacao_btn" id="btn_prox" ${paginaAtual === totalPaginas ? 'disabled' : ''} aria-label="Próxima página">Próxima &raquo;</button>
    </div>
    <div class="paginacao_subinfo">
      Página <strong>${paginaAtual}</strong> de <strong>${totalPaginas}</strong> (${totalItens} pilotos no total)
    </div>
  `;

  document.getElementById('btn_ant')?.addEventListener('click', () => {
    if (paginaAtual > 1) {
      paginaAtual--;
      renderizarCatalogo();
      document.getElementById('grid_catalogo')?.scrollIntoView({ behavior: 'smooth' });
    }
  });

  document.getElementById('btn_prox')?.addEventListener('click', () => {
    if (paginaAtual < totalPaginas) {
      paginaAtual++;
      renderizarCatalogo();
      document.getElementById('grid_catalogo')?.scrollIntoView({ behavior: 'smooth' });
    }
  });

  nav.querySelectorAll('.pag_num_btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetPage = Number(e.target.getAttribute('data-page'));
      if (targetPage && targetPage !== paginaAtual) {
        paginaAtual = targetPage;
        renderizarCatalogo();
        document.getElementById('grid_catalogo')?.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
}

// 7. Comparador Direto Lado a Lado (Regra dos 3 Cliques)
function configurarEventosComparacao() {
  const { s1, s2 } = obterSeletoresComparador();
  if (!s1 || !s2) return;

  const atualizar = () => {
    const id1 = s1.value;
    const id2 = s2.value;
    const painel = document.getElementById('painel_comparativo');

    if (!id1 || !id2) {
      painel.innerHTML = '<p class="msg_placeholder">Selecione ambos os pilotos para visualizar a comparação lado a lado.</p>';
      return;
    }

    if (id1 === id2) {
      painel.innerHTML = '<p class="msg_placeholder aviso_selecao">Selecione dois pilotos distintos para comparar.</p>';
      return;
    }

    const p1 = pilotosData.find(p => String(p.id) === String(id1));
    const p2 = pilotosData.find(p => String(p.id) === String(id2));

    if (p1 && p2) renderizarPainelComparativo(p1, p2);
  };

  s1.addEventListener('change', atualizar);
  s2.addEventListener('change', atualizar);
}

function renderizarPainelComparativo(p1, p2) {
  const painel = document.getElementById('painel_comparativo');

  const r1 = calcularEstrelasAtuais(p1);
  const r2 = calcularEstrelasAtuais(p2);
  const pot1 = calcularEstrelasPotencial(p1, r1);
  const pot2 = calcularEstrelasPotencial(p2, r2);

  const comparar = (v1, v2) => ({
    c1: Number(v1) > Number(v2) ? 'is_winner' : (Number(v1) < Number(v2) ? 'is_loser' : ''),
    c2: Number(v2) > Number(v1) ? 'is_winner' : (Number(v2) < Number(v1) ? 'is_loser' : '')
  });

  const compararIdade = (i1, i2) => ({
    c1: Number(i1) < Number(i2) ? 'is_winner' : (Number(i1) > Number(i2) ? 'is_loser' : ''),
    c2: Number(i2) < Number(i1) ? 'is_winner' : (Number(i2) > Number(i1) ? 'is_loser' : '')
  });

  const resRating = comparar(r1, r2);
  const resPot = comparar(pot1, pot2);
  const resIdade = compararIdade(p1.idade || 25, p2.idade || 25);

  const linhasAtributos = ATRIBUTOS_CONFIG.map(cfg => {
    const v1 = obterValorAtributo(p1, cfg);
    const v2 = obterValorAtributo(p2, cfg);
    const res = comparar(v1, v2);
    return `
      <tr>
        <th scope="row">${cfg.rotulo}</th>
        <td class="${res.c1}"><strong>${v1}</strong></td>
        <td class="${res.c2}"><strong>${v2}</strong></td>
      </tr>
    `;
  }).join('');

  painel.innerHTML = `
    <table class="comparacao_tabela" aria-label="Comparação direta entre ${p1.nome} e ${p2.nome}">
      <thead>
        <tr>
          <th scope="col" style="width: 34%;">Métrica / Atributo</th>
          <th scope="col" style="width: 33%;">${p1.nome}</th>
          <th scope="col" style="width: 33%;">${p2.nome}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">Equipe</th>
          <td><span class="tabela_tag">${obterNomeEquipe(p1.equipe_id)}</span></td>
          <td><span class="tabela_tag">${obterNomeEquipe(p2.equipe_id)}</span></td>
        </tr>
        <tr>
          <th scope="row">Idade</th>
          <td class="${resIdade.c1}"><strong>${p1.idade || 25} anos</strong></td>
          <td class="${resIdade.c2}"><strong>${p2.idade || 25} anos</strong></td>
        </tr>
        <tr>
          <th scope="row">Preferência de Série</th>
          <td><span class="tabela_tag">${p1.series_preference || 'Any'}</span></td>
          <td><span class="tabela_tag">${p2.series_preference || 'Any'}</span></td>
        </tr>
        <tr>
          <th scope="row">Piloto Pagante</th>
          <td><strong>${p1.pay_driver ? '<span class="tag_sim_verde">Sim</span>' : 'Não'}</strong></td>
          <td><strong>${p2.pay_driver ? '<span class="tag_sim_verde">Sim</span>' : 'Não'}</strong></td>
        </tr>
        <tr>
          <th scope="row">Apelo Comercial</th>
          <td><strong>${p1.marketability || '0%'}</strong></td>
          <td><strong>${p2.marketability || '0%'}</strong></td>
        </tr>
        <tr>
          <th scope="row">Salário Anual</th>
          <td>${formatarSalario(p1.salario_anual)}</td>
          <td>${formatarSalario(p2.salario_anual)}</td>
        </tr>
        <tr>
          <th scope="row">Habilidade Atual</th>
          <td class="${resRating.c1}">${renderizarEstrelasVisual(r1)}</td>
          <td class="${resRating.c2}">${renderizarEstrelasVisual(r2)}</td>
        </tr>
        <tr>
          <th scope="row">Potencial Máximo</th>
          <td class="${resPot.c1}">${renderizarEstrelasVisual(pot1)}</td>
          <td class="${resPot.c2}">${renderizarEstrelasVisual(pot2)}</td>
        </tr>
        ${linhasAtributos}
      </tbody>
    </table>
  `;
}