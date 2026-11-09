let pilotosData = [];
let equipesData = [];
let campeonatosData = [];
let minhaEquipe = null; // { equipe, resumo, elenco } do MANAGER logado, ou null se ainda não criou

// Estado Global da Listagem e Paginação
let paginaAtual = 1;
let itensPorPagina = 12;
let termoBusca = '';
let filtroEquipeSelecionada = 'todas';
let criterioOrdenacao = 'rating_desc';

const API_URL = 'http://localhost:3000/api';

// Escape de HTML para todo texto vindo do servidor/usuário que entra em innerHTML (defesa contra XSS)
function esc(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Aceita apenas cores hexadecimais; qualquer outra coisa cai no valor padrão
function corSegura(cor, padrao) {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(cor || '')) ? cor : padrao;
}

// Configuração canônica dos 9 atributos técnicos
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
  await Promise.all([carregarDados(), carregarEquipes()]);
  inicializarControles();
  renderizarCatalogo();
  configurarEventosComparacao();
  gerenciarSessaoInterface(); // Inicializado por último para não travar a UI!
});

// 1. Carregamento Assíncrono da Base de Dados MYSQL via API
async function carregarDados() {
  try {
    // Com login, a API devolve os pilotos do usuário (MANAGER) ou o catálogo-modelo (ADMIN)
    const token = localStorage.getItem('jwt_token');
    let resposta = await fetch(`${API_URL}/pilotos`, token ? { headers: { 'Authorization': `Bearer ${token}` } } : {});

    // Token vencido ou usuário removido: encerra a sessão local e carrega como visitante
    if (resposta.status === 401 && token) {
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('usuario_nome');
      localStorage.removeItem('usuario_perfil');
      resposta = await fetch(`${API_URL}/pilotos`);
    }
    if (!resposta.ok) {
      throw new Error('Falha na resposta do servidor Node.js');
    }
    const respostaFinal = await resposta.json();
    pilotosData = respostaFinal.dados || []; 
  } catch (erro) {
    console.error('Falha na conexão:', erro);
    const painel = document.getElementById('painel_comparativo');
    if (painel) {
      painel.innerHTML = `
        <div class="msg_erro" role="alert">
          <p>⚠️ Falha ao conectar com o servidor backend (Node.js).</p>
          <small>Certifique-se de que a API Node.js (porta 3000) e o MySQL estão rodando.</small>
        </div>
      `;
    }
  }
}

// Equipes (alimentam o seletor de equipe do formulário de cadastro/edição)
async function carregarEquipes() {
  try {
    const token = localStorage.getItem('jwt_token');
    let resposta = await fetch(`${API_URL}/equipes`, token ? { headers: { 'Authorization': `Bearer ${token}` } } : {});
    // Sessão inválida: carregarDados() encerra a sessão local; aqui só carrega como visitante
    if (resposta.status === 401 && token) resposta = await fetch(`${API_URL}/equipes`);
    if (!resposta.ok) throw new Error('Falha ao carregar equipes');
    const corpo = await resposta.json();
    equipesData = corpo.dados || [];
  } catch (erro) {
    console.error('Falha ao carregar equipes:', erro);
    equipesData = [];
  }
}

// 2. Localizadores Flexíveis de Elementos do DOM
function obterSeletoresComparador() {
  const s1 = document.getElementById('select_piloto_1') || document.getElementById('select_p1');
  const s2 = document.getElementById('select_piloto_2') || document.getElementById('select_p2');
  return { s1, s2 };
}

// 3. Regras de Negócio e Cálculos Relacionais
function obterValorAtributo(piloto, itemConfig) {
  if (!piloto || !piloto.atributos) return null; // sem dado: a interface mostra "—" (não inventa valor)
  
  if (piloto.atributos[itemConfig.chave] !== undefined) {
    return Number(piloto.atributos[itemConfig.chave]);
  }
  for (const alias of itemConfig.alias) {
    if (piloto.atributos[alias] !== undefined) {
      return Number(piloto.atributos[alias]);
    }
  }
  return null;
}

function calcularEstrelasAtuais(piloto) {
  // 1. Usa o valor precalculado se vier do banco/planilha
  if (piloto.estrelas_atuais && !isNaN(piloto.estrelas_atuais) && Number(piloto.estrelas_atuais) > 0) {
    return Number(piloto.estrelas_atuais);
  }
  
  // 2. Calcula a média dinâmica dos 9 atributos reais se não vier
  if (piloto.atributos) {
    const valores = ATRIBUTOS_CONFIG.map(cfg => obterValorAtributo(piloto, cfg)).filter(v => v !== null);
    if (valores.length > 0) {
      const media = valores.reduce((a, b) => a + b, 0) / valores.length;
      // O jogo usa nota máxima 20 por atributo
      const estrelas = (media / 20) * 5;
      return Number(Math.max(0.5, Math.min(5.0, estrelas)).toFixed(1));
    }
  }
  
  return 3.0; // Padrão se não houver telemetria
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

// 4. Controles (Filtros, Buscas, Ordenação)
// popularControles() pode ser chamada de novo após cadastrar/editar/excluir;
// inicializarControles() registra os listeners uma única vez.
function popularControles() {
  const { s1, s2 } = obterSeletoresComparador();
  const filtroEquipe = document.getElementById('filtro_equipe');

  if (s1 && s2) {
    const anterior1 = s1.value;
    const anterior2 = s2.value;
    s1.innerHTML = '<option value="">Selecione um piloto...</option>';
    s2.innerHTML = '<option value="">Selecione um piloto...</option>';

    const pilotosOrdenados = [...pilotosData].sort((a, b) => a.nome.localeCompare(b.nome));
    pilotosOrdenados.forEach(p => {
      const eqNome = p.equipe_id ? p.nome_equipe : 'Disponível';
      const rating = calcularEstrelasAtuais(p);
      const label = `${p.nome} [${rating}★] (${eqNome})`;
      s1.add(new Option(label, p.id));
      s2.add(new Option(label, p.id));
    });

    // Mantém a seleção do comparador (se o piloto ainda existir) e redesenha o painel
    if ([...s1.options].some(o => o.value === anterior1)) s1.value = anterior1;
    if ([...s2.options].some(o => o.value === anterior2)) s2.value = anterior2;
    if (s1.value && s2.value) s1.dispatchEvent(new Event('change'));
  }

  if (filtroEquipe) {
    filtroEquipe.innerHTML = '<option value="todas">Todas as Equipes</option>';
    const equipesUnicas = [];
    pilotosData.forEach(p => {
      if (p.equipe_id && !equipesUnicas.some(e => e.id === p.equipe_id)) {
        equipesUnicas.push({ id: p.equipe_id, nome: p.nome_equipe });
      }
    });

    filtroEquipe.add(new Option('🟢 Agentes Livres (Disponíveis)', 'livres'));
    equipesUnicas.forEach(eq => {
      filtroEquipe.add(new Option(eq.nome, eq.id));
    });

    const aindaExiste = [...filtroEquipe.options].some(o => o.value === String(filtroEquipeSelecionada));
    if (!aindaExiste) filtroEquipeSelecionada = 'todas';
    filtroEquipe.value = String(filtroEquipeSelecionada);
  }
}

function inicializarControles() {
  const filtroEquipe = document.getElementById('filtro_equipe');
  const campoBusca = document.getElementById('busca_piloto');
  const selectOrdenacao = document.getElementById('ordenar_piloto');
  const selectQtd = document.getElementById('itens_por_pagina');

  popularControles();

  if (filtroEquipe) {
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

// Recarrega dados do servidor e atualiza toda a interface (usado após criar/editar/excluir)
async function recarregarTela() {
  await Promise.all([carregarDados(), carregarEquipes()]);
  popularControles();
  renderizarCatalogo();
  await carregarMinhaEquipe();
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
        const paisOk = (p.nacionalidade || p.pais || '').toLowerCase().includes(termoBusca);
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
    const livre = !piloto.equipe_id;
    const badgeTxt = livre ? 'Disponível' : piloto.nome_equipe;
    const badgeBg = livre ? '#1f6f43' : corSegura(piloto.cor_primaria, '#383e4d');
    const badgeCor = livre ? '#ffffff' : corSegura(piloto.cor_secundaria, '#ffffff');
    const badgeBorda = livre ? '1px solid #2ea043' : 'none';

    const estrelasAtuais = calcularEstrelasAtuais(piloto);
    const estrelasPot = calcularEstrelasPotencial(piloto, estrelasAtuais);

    const payBadge = piloto.pay_driver
      ? '<span class="badge_pay_driver" title="Piloto traz aporte financeiro">Sim</span>'
      : '';

      const perfilLogado = localStorage.getItem('usuario_perfil');
      const podeEditar = (perfilLogado === 'ADMIN' || perfilLogado === 'MANAGER');
      
      const botoesAcao = podeEditar ? `
        <div class="card_acoes_crud">
          <button class="btn_editar_piloto" onclick="editarPiloto(${Number(piloto.id)})" title="Editar piloto" style="background:transparent; border:none; cursor:pointer;">✏️</button>
          <button class="btn_excluir_piloto" onclick="excluirPiloto(${Number(piloto.id)})" title="Demitir piloto" style="background:transparent; border:none; cursor:pointer;">🗑️</button>
        </div>
      ` : '';

    const itensAttr = ATRIBUTOS_CONFIG.map(attr => `
      <li>${attr.rotulo}: <span>${obterValorAtributo(piloto, attr) ?? '—'}</span></li>
    `).join('');

    const card = document.createElement('article');
    card.className = `card_piloto ${livre ? 'card_piloto_livre' : ''}`;
    card.setAttribute('tabindex', '0');

    card.innerHTML = `
      <figure>
        <div class="avatar_piloto" aria-hidden="true">${esc((piloto.nome || 'P').charAt(0))}</div>
        <figcaption style="display: flex; flex-direction: column; width: 100%;">
          <div style="display: flex; justify-content: space-between; align-items: start; width: 100%;">
             <h3 style="margin:0;">${esc(piloto.nome)} ${payBadge}</h3>
             ${botoesAcao}
          </div>
          <span class="badge_equipe" style="background-color: ${badgeBg}; color: ${badgeCor}; border: ${badgeBorda}; width: fit-content; margin-top: 5px;">
            ${esc(badgeTxt)}
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
        <span>Origem: <strong>${esc(piloto.nacionalidade || piloto.pais || 'N/A')}</strong></span>
        <span>Salário: <strong>${formatarSalario(piloto.salario_anual)}</strong></span>
        <span>Série: <strong>${esc(piloto.series_preference || 'Any')}</strong></span>
        <span>Comercial: <strong>${esc(piloto.marketability || '0%')}</strong></span>
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

// 6. Paginação Numérica com Atalhos e Acessibilidade (COM RETICÊNCIAS)
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

  // Maior valor vence (▲)
  const comparar = (v1, v2) => ({
    c1: Number(v1) > Number(v2) ? 'is_winner' : (Number(v1) < Number(v2) ? 'is_loser' : ''),
    c2: Number(v2) > Number(v1) ? 'is_winner' : (Number(v2) < Number(v1) ? 'is_loser' : '')
  });

  // Menor valor é vantajoso (▼) — idade mais jovem
  const compararMenor = (v1, v2) => ({
    c1: Number(v1) < Number(v2) ? 'is_winner_down' : (Number(v1) > Number(v2) ? 'is_loser' : ''),
    c2: Number(v2) < Number(v1) ? 'is_winner_down' : (Number(v2) > Number(v1) ? 'is_loser' : '')
  });

  // Comparações de perfil
  const resIdade = compararMenor(p1.idade || 25, p2.idade || 25);
  
  const neg1 = parseFloat(String(p1.negociabilidade || p1.marketability || '0').replace('%', '')) || 0;
  const neg2 = parseFloat(String(p2.negociabilidade || p2.marketability || '0').replace('%', '')) || 0;
  const resNeg = comparar(neg1, neg2);

  // Comparações de estrelas
  const resRating = comparar(r1, r2);
  const resPot = comparar(pot1, pot2);

  // Comparações dos atributos técnicos
  const linhasAtributos = ATRIBUTOS_CONFIG.map(cfg => {
    const v1 = obterValorAtributo(p1, cfg);
    const v2 = obterValorAtributo(p2, cfg);
    const res = comparar(v1, v2);
    return `
      <tr>
        <th scope="row">${cfg.rotulo}</th>
        <td class="${res.c1}"><strong>${v1 ?? '—'}</strong></td>
        <td class="${res.c2}"><strong>${v2 ?? '—'}</strong></td>
      </tr>
    `;
  }).join('');

  painel.innerHTML = `
    <table class="comparacao_tabela" aria-label="Comparação direta entre ${esc(p1.nome)} e ${esc(p2.nome)}">
      <thead>
        <tr>
          <th scope="col" style="width: 34%;">Métrica / Atributo</th>
          <th scope="col" style="width: 33%;">${esc(p1.nome)}</th>
          <th scope="col" style="width: 33%;">${esc(p2.nome)}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">Equipe</th>
          <td><span class="tabela_tag">${esc(p1.equipe_id ? p1.nome_equipe : 'Disponível')}</span></td>
          <td><span class="tabela_tag">${esc(p2.equipe_id ? p2.nome_equipe : 'Disponível')}</span></td>
        </tr>
        <tr>
          <th scope="row">Idade</th>
          <td class="${resIdade.c1}"><strong>${p1.idade || 25} anos</strong></td>
          <td class="${resIdade.c2}"><strong>${p2.idade || 25} anos</strong></td>
        </tr>
        <tr>
          <th scope="row">Preferência de Série</th>
          <td><span class="tabela_tag">${esc(p1.series_preference || 'Any')}</span></td>
          <td><span class="tabela_tag">${esc(p2.series_preference || 'Any')}</span></td>
        </tr>
        <tr>
          <th scope="row">Piloto Pagante</th>
          <td><strong>${p1.pay_driver ? '<span class="tag_sim_verde">Sim</span>' : 'Não'}</strong></td>
          <td><strong>${p2.pay_driver ? '<span class="tag_sim_verde">Sim</span>' : 'Não'}</strong></td>
        </tr>
        <tr>
          <th scope="row">Negociabilidade</th>
          <td class="${resNeg.c1}"><strong>${p1.negociabilidade || p1.marketability || '0%'}</strong></td>
          <td class="${resNeg.c2}"><strong>${p2.negociabilidade || p2.marketability || '0%'}</strong></td>
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

// 8. SCROLL SPY - Menu Navegação Ativo
function atualizarMenuAtivo() {
  const secoes = document.querySelectorAll('main > section');
  const links = document.querySelectorAll('.main_nav a');
  let secaoAtualId = '';

  secoes.forEach(secao => {
    const topo = secao.offsetTop - 120; 
    if (window.scrollY >= topo) {
      secaoAtualId = secao.getAttribute('id');
    }
  });

  if (!secaoAtualId && secoes.length > 0) {
    secaoAtualId = secoes[0].getAttribute('id');
  }

  links.forEach(link => {
    const ativo = link.getAttribute('href') === `#${secaoAtualId}`;
    link.classList.toggle('is_active', ativo);
    if (ativo) {
      link.setAttribute('aria-current', 'location');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}
window.addEventListener('scroll', atualizarMenuAtivo);
document.addEventListener('DOMContentLoaded', atualizarMenuAtivo);


// ==========================================
// --- 9. CONTROLE DE SESSÃO E RBAC (T2)  ---
// ==========================================
function gerenciarSessaoInterface() {
  const authContainer = document.getElementById('auth_container');
  const painelAdmin = document.getElementById('painel_admin');
  const token = localStorage.getItem('jwt_token');
  const nomeUsuario = localStorage.getItem('usuario_nome');
  const perfilUsuario = localStorage.getItem('usuario_perfil');

  // Oculta painel administrativo por segurança
  if (painelAdmin) painelAdmin.style.display = 'none';

  if (token && nomeUsuario) {
    // 1. Renderiza crachá logado (nome e perfil vêm do localStorage: sempre escapados)
    if (authContainer) {
      authContainer.innerHTML = `
        <span class="user_badge">Olá, <strong>${esc(nomeUsuario)}</strong> <span class="user_perfil">${esc(perfilUsuario)}</span></span>
        <button onclick="fazerLogout()" class="btn_logout">Sair</button>
      `;
    }

    // 2. Libera recursos ADMIN e MANAGER (a API revalida o perfil a cada requisição)
    if ((perfilUsuario === 'ADMIN' || perfilUsuario === 'MANAGER') && painelAdmin) {
      painelAdmin.style.display = 'flex';
      configurarModalPiloto();

      const aviso = document.getElementById('aviso_escopo');
      const btnRestaurar = document.getElementById('btn_restaurar_dados');
      if (perfilUsuario === 'MANAGER') {
        if (aviso) aviso.textContent = 'Você está vendo e editando a sua cópia pessoal dos pilotos.';
        const painelEquipe = document.getElementById('painel_minha_equipe');
        if (painelEquipe) {
          painelEquipe.style.display = 'block';
          configurarModalEquipe();
          carregarMinhaEquipe();
        }
        if (btnRestaurar) {
          btnRestaurar.style.display = 'inline-block';
          btnRestaurar.addEventListener('click', restaurarMeusDados);
        }
      } else if (aviso) {
        aviso.textContent = 'Você está editando o catálogo-modelo (a base copiada para cada novo usuário).';
      }
    }
  } else {
    // Modo Visitante (Não logado)
    if (authContainer) {
      authContainer.innerHTML = `<a href="login.html" class="btn_login_nav">Entrar / Gerenciar</a>`;
    }
  }
}

// Descarta as edições do MANAGER e recebe uma cópia nova do catálogo-modelo
async function restaurarMeusDados() {
  const token = localStorage.getItem('jwt_token');
  if (!token) return alert('Sessão expirada. Faça login novamente.');
  if (!confirm('Isso apaga TODAS as suas alterações (pilotos criados, editados e excluídos), faz você deixar a equipe que comanda (se for uma equipe criada por você, ela é excluída) e restaura o catálogo original. Deseja continuar?')) return;

  try {
    const resposta = await fetch(`${API_URL}/pilotos/restaurar`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(data.mensagem || 'Falha ao restaurar os dados.');

    await recarregarTela();
    alert(`Dados restaurados: ${data.dados.total} pilotos.`);
  } catch (err) {
    alert('Erro ao restaurar: ' + err.message);
  }
}

window.fazerLogout = async function() {
  const token = localStorage.getItem('jwt_token');
  try {
    if (token) {
      await fetch(`${API_URL}/auth/logout`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
    }
  } catch (_) { /* logout local acontece de qualquer forma */ }
  localStorage.removeItem('jwt_token');
  localStorage.removeItem('usuario_nome');
  localStorage.removeItem('usuario_perfil');
  window.location.href = window.location.pathname;
};

// ==========================================
// --- 10. EXCLUSÃO DIRETA NO BANCO (DELETE)-
// ==========================================
window.excluirPiloto = async function(id) {
  const token = localStorage.getItem('jwt_token');

  if (!token) {
    alert("Sessão expirada. Faça login novamente.");
    return;
  }

  const confirmacao = confirm(`Você tem certeza que deseja demitir/excluir permanentemente este piloto?`);
  if (!confirmacao) return;

  try {
    const resposta = await fetch(`${API_URL}/pilotos/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await resposta.json();
    if (!resposta.ok) throw new Error(data.mensagem || 'Falha ao excluir o piloto.');

    alert('✅ Piloto demitido com sucesso!');
    await recarregarTela();
  } catch (err) {
    alert("Erro na exclusão: " + err.message);
  }
};

// ==========================================
// --- 11. CADASTRO E EDIÇÃO (POST / PUT)   ---
// ==========================================
let modalPilotoConfigurado = false;

// Os 9 campos de atributo são gerados a partir de ATRIBUTOS_CONFIG (fonte única da lista)
function montarCamposAtributos() {
  const container = document.getElementById('crud_atributos');
  if (!container || container.childElementCount > 0) return;

  ATRIBUTOS_CONFIG.forEach(cfg => {
    const grupo = document.createElement('div');
    grupo.className = 'form_group';

    const label = document.createElement('label');
    label.htmlFor = `crud_attr_${cfg.chave}`;
    label.textContent = cfg.rotulo;

    const input = document.createElement('input');
    input.type = 'number';
    input.id = `crud_attr_${cfg.chave}`;
    input.min = '0';
    input.max = '20';
    input.step = '1';
    input.required = true;
    input.setAttribute('value', '10'); // valor inicial visível; form.reset() volta para ele

    grupo.append(label, input);
    container.appendChild(grupo);
  });
}

// Equipes completas aparecem desabilitadas (a API também recusa); a equipe atual do piloto continua escolhível
function popularSelectEquipesModal(equipeAtualId = null) {
  const select = document.getElementById('crud_equipe');
  if (!select) return;
  select.innerHTML = '<option value="">Nenhuma (Agente Livre)</option>';

  const ocupacao = contarPilotosPorEquipe();
  [...equipesData]
    .sort((a, b) => (Number(b.propria) - Number(a.propria)) || a.nome.localeCompare(b.nome))
    .forEach(eq => {
      const ocupadas = ocupacao[eq.id] || 0;
      const completa = ocupadas >= eq.elenco_maximo && eq.id !== equipeAtualId;
      const rotulo = `${eq.propria ? '★ ' : ''}${eq.nome}${eq.propria ? ' (minha equipe)' : ''} — ${ocupadas}/${eq.elenco_maximo}${completa ? ' (completa)' : ''}`;
      const opcao = new Option(rotulo, eq.id);
      opcao.disabled = completa;
      select.add(opcao);
    });
}

function mostrarErroModal(mensagens, idCaixa = 'crud_erros') {
  const caixa = document.getElementById(idCaixa);
  if (!caixa) return;
  caixa.textContent = '';
  if (!mensagens || mensagens.length === 0) {
    caixa.hidden = true;
    return;
  }
  mensagens.forEach(texto => {
    const linha = document.createElement('div');
    linha.textContent = `• ${texto}`; // textContent: mensagens do servidor nunca viram HTML
    caixa.appendChild(linha);
  });
  caixa.hidden = false;
}

function prepararModal(modo, titulo, textoBotao, equipeAtualId = null) {
  const form = document.getElementById('form_crud_piloto');
  const tituloModal = document.getElementById('modal_titulo');
  const btnSalvar = document.getElementById('btn_salvar_piloto');

  form.reset();
  mostrarErroModal([]);
  popularSelectEquipesModal(equipeAtualId);

  form.dataset.modo = modo;
  if (modo === 'criar') delete form.dataset.idEdicao;
  if (tituloModal) tituloModal.textContent = titulo;
  if (btnSalvar) btnSalvar.textContent = textoBotao;
  return form;
}

function abrirModalNovo() {
  prepararModal('criar', 'Cadastrar Novo Piloto', 'Salvar Piloto');
  document.getElementById('modal_piloto').showModal();
}

function configurarModalPiloto() {
  if (modalPilotoConfigurado) return; // evita listeners duplicados
  const modal = document.getElementById('modal_piloto');
  const form = document.getElementById('form_crud_piloto');
  const btnNovo = document.getElementById('btn_novo_piloto');
  if (!modal || !form) return;

  montarCamposAtributos();

  if (btnNovo) btnNovo.addEventListener('click', abrirModalNovo);
  document.getElementById('btn_fechar_modal')?.addEventListener('click', () => modal.close());
  document.getElementById('btn_cancelar_modal')?.addEventListener('click', () => modal.close());
  form.addEventListener('submit', salvarPiloto);

  modalPilotoConfigurado = true;
}

// Lê o formulário e monta o corpo JSON enviado à API
function lerFormularioPiloto() {
  const valor = (id) => document.getElementById(id).value;
  const atributos = {};
  ATRIBUTOS_CONFIG.forEach(cfg => {
    atributos[cfg.chave] = Number(valor(`crud_attr_${cfg.chave}`));
  });

  const corpo = {
    nome: valor('crud_nome').trim(),
    pais: valor('crud_pais').trim(),
    idade: Number(valor('crud_idade')),
    salario_anual: Number(valor('crud_salario')),
    equipe_id: valor('crud_equipe') ? Number(valor('crud_equipe')) : null,
    series_preference: valor('crud_serie'),
    pay_driver: document.getElementById('crud_pay_driver').checked,
    marketability: Number(valor('crud_marketability')),
    atributos
  };
  if (valor('crud_potencial') !== '') corpo.estrelas_potencial = Number(valor('crud_potencial'));
  return corpo;
}

// Único tratador de submit: decide entre POST (novo) e PUT (edição) pelo modo do formulário
async function salvarPiloto(evento) {
  evento.preventDefault();
  const form = evento.currentTarget;
  const token = localStorage.getItem('jwt_token');
  if (!token) {
    alert('Sessão expirada. Faça login novamente.');
    return;
  }

  const editando = form.dataset.modo === 'editar' && form.dataset.idEdicao;
  const url = editando ? `${API_URL}/pilotos/${form.dataset.idEdicao}` : `${API_URL}/pilotos`;
  const btnSalvar = document.getElementById('btn_salvar_piloto');
  const textoOriginal = btnSalvar ? btnSalvar.textContent : '';

  if (btnSalvar) {
    btnSalvar.disabled = true;
    btnSalvar.textContent = 'Salvando...';
  }
  mostrarErroModal([]);

  try {
    const resposta = await fetch(url, {
      method: editando ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(lerFormularioPiloto())
    });
    const data = await resposta.json().catch(() => ({}));

    if (resposta.status === 401) {
      alert('Sessão expirada. Faça login novamente.');
      return window.fazerLogout();
    }
    if (!resposta.ok) {
      const detalhes = Array.isArray(data.erros) ? data.erros.map(e => e.mensagem) : [];
      mostrarErroModal(detalhes.length ? detalhes : [data.mensagem || 'Falha ao salvar o piloto.']);
      return;
    }

    document.getElementById('modal_piloto').close();
    await recarregarTela();
    alert(editando ? 'Piloto atualizado com sucesso!' : 'Piloto cadastrado com sucesso!');
  } catch (err) {
    mostrarErroModal([`Não foi possível falar com o servidor: ${err.message}`]);
  } finally {
    if (btnSalvar) {
      btnSalvar.disabled = false;
      btnSalvar.textContent = textoOriginal;
    }
  }
}

// Ação de EDITAR (PUT): abre o mesmo modal já preenchido com os dados atuais do piloto
window.editarPiloto = function(id) {
  const token = localStorage.getItem('jwt_token');
  if (!token) return alert('Sessão expirada. Faça login novamente.');

  const piloto = pilotosData.find(p => String(p.id) === String(id));
  if (!piloto) return alert('Erro: piloto não encontrado na base.');

  configurarModalPiloto();
  const form = prepararModal('editar', `Editar Piloto: ${piloto.nome}`, 'Atualizar Piloto', piloto.equipe_id);
  form.dataset.idEdicao = String(piloto.id);

  const definir = (campo, valor) => { document.getElementById(campo).value = valor ?? ''; };
  definir('crud_nome', piloto.nome);
  definir('crud_pais', piloto.pais || piloto.nacionalidade);
  definir('crud_idade', piloto.idade);
  definir('crud_salario', piloto.salario_anual);
  definir('crud_equipe', piloto.equipe_id);
  definir('crud_serie', piloto.series_preference || 'Any');
  definir('crud_marketability', parseInt(String(piloto.marketability), 10) || 0);
  definir('crud_potencial', piloto.estrelas_potencial);
  document.getElementById('crud_pay_driver').checked = Boolean(piloto.pay_driver);

  ATRIBUTOS_CONFIG.forEach(cfg => {
    definir(`crud_attr_${cfg.chave}`, obterValorAtributo(piloto, cfg));
  });

  document.getElementById('modal_piloto').showModal();
};

// ==========================================
// --- 12. MINHA EQUIPE (MANAGER)           ---
// ==========================================
// O MANAGER comanda UMA equipe: uma oficial do jogo (assumida) ou uma que ele criou.
let modalEquipeConfigurado = false;

const formatarDolar = (valor) => `US$ ${Number(valor || 0).toLocaleString('pt-BR')}`;

// Chamada autenticada à API. Em caso de erro lança Error com .status e .lista (mensagens por campo).
async function chamarApi(metodo, caminho, corpo) {
  const token = localStorage.getItem('jwt_token');
  const resposta = await fetch(`${API_URL}${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  });
  const data = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const falha = new Error(data.mensagem || 'Falha na requisição.');
    falha.status = resposta.status;
    falha.lista = Array.isArray(data.erros) ? data.erros.map(e => e.mensagem) : [];
    throw falha;
  }
  return data;
}

const textoDoErro = (err) => (err.lista && err.lista.length ? err.lista.join(' ') : err.message);

async function carregarCampeonatos() {
  try {
    const resposta = await fetch(`${API_URL}/campeonatos`);
    if (!resposta.ok) throw new Error('Falha ao carregar campeonatos');
    campeonatosData = (await resposta.json()).dados || [];
  } catch (erro) {
    console.error('Falha ao carregar campeonatos:', erro);
    campeonatosData = [];
  }
}

// Busca a equipe que o MANAGER comanda (404 = nenhuma) e redesenha o painel
async function carregarMinhaEquipe() {
  const token = localStorage.getItem('jwt_token');
  if (!token || localStorage.getItem('usuario_perfil') !== 'MANAGER') {
    minhaEquipe = null;
    return;
  }

  try {
    const resposta = await fetch(`${API_URL}/equipes/minha`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (resposta.status === 404) minhaEquipe = null;
    else if (resposta.ok) minhaEquipe = (await resposta.json()).dados;
    else throw new Error('Falha ao carregar a equipe');
  } catch (erro) {
    console.error('Falha ao carregar a equipe:', erro);
    minhaEquipe = null;
  }
  renderizarMinhaEquipe();
}

// Quantos pilotos (da cópia do usuário) há em cada equipe: { equipeId: quantidade }
function contarPilotosPorEquipe() {
  const contagem = {};
  pilotosData.forEach(p => {
    if (p.equipe_id) contagem[p.equipe_id] = (contagem[p.equipe_id] || 0) + 1;
  });
  return contagem;
}

function renderizarMinhaEquipe() {
  if (minhaEquipe) renderizarEquipeComandada();
  else renderizarEscolhaDeEquipe();
}

// Estado 1: ainda não comanda nenhuma equipe -> assumir uma oficial ou criar a própria
function renderizarEscolhaDeEquipe() {
  const conteudo = document.getElementById('conteudo_minha_equipe');
  if (!conteudo) return;

  const ocupacao = contarPilotosPorEquipe();
  const oficiais = equipesData.filter(e => !e.propria).sort((a, b) => a.nome.localeCompare(b.nome));
  const opcoes = oficiais
    .map(e => `<option value="${Number(e.id)}">${esc(e.nome)} — ${esc(e.nome_campeonato)} (${ocupacao[e.id] || 0}/${Number(e.elenco_maximo)} pilotos)</option>`)
    .join('');

  conteudo.innerHTML = `
    <div class="equipe_escolha">
      <div class="equipe_opcao">
        <h3>Assumir uma equipe do jogo</h3>
        <p>Comande uma das ${oficiais.length} equipes existentes e gerencie o elenco dela.</p>
        <select id="select_assumir" aria-label="Equipe a assumir">${opcoes}</select>
        <button type="button" id="btn_assumir" class="btn_acao">Assumir esta equipe</button>
      </div>
      <div class="equipe_opcao">
        <h3>Criar a minha equipe</h3>
        <p>Monte uma equipe nova: escolha nome, país, campeonato e cores. O tamanho do elenco depende do campeonato.</p>
        <button type="button" id="btn_criar_equipe" class="btn_acao">+ Criar minha equipe</button>
      </div>
    </div>`;

  document.getElementById('btn_assumir').addEventListener('click', assumirEquipe);
  document.getElementById('btn_criar_equipe').addEventListener('click', () => abrirModalEquipe('criar'));
}

// Estados 2 e 3: comandando uma equipe oficial ou uma criada pelo usuário
function renderizarEquipeComandada() {
  const conteudo = document.getElementById('conteudo_minha_equipe');
  if (!conteudo) return;

  const { equipe, resumo, elenco } = minhaEquipe;
  const criada = equipe.tipo === 'criada';
  const completo = resumo.total_pilotos >= equipe.elenco_maximo;
  const cor1 = corSegura(equipe.cor_primaria, '#383e4d');
  const cor2 = corSegura(equipe.cor_secundaria, '#ffffff');

  // Sugestões de contratação: pilotos da cópia do usuário que ainda não estão na equipe
  const idsNoElenco = new Set(elenco.map(p => p.id));
  const sugestoes = pilotosData
    .filter(p => !idsNoElenco.has(p.id))
    .map(p => `<option value="${esc(`${p.nome} — ${p.equipe_id ? p.nome_equipe : 'Agente livre'} [#${p.id}]`)}"></option>`)
    .join('');

  const linhas = elenco.length
    ? elenco.map(p => `
        <tr>
          <td>${esc(p.nome)}${p.pay_driver ? ' <span class="badge_pay_driver" title="Piloto traz aporte financeiro">Pagante</span>' : ''}</td>
          <td>${esc(p.pais)}</td>
          <td>${Number(p.idade)}</td>
          <td>${p.estrelas_atuais.toFixed(1)} ★ <small>(pot. ${p.estrelas_potencial.toFixed(1)})</small></td>
          <td>${formatarDolar(p.salario_anual)}</td>
          <td><button type="button" class="btn_dispensar" data-id="${Number(p.id)}">Dispensar</button></td>
        </tr>`).join('')
    : '<tr><td colspan="6" class="equipe_elenco_vazio">Elenco vazio. Contrate pilotos pelo campo acima.</td></tr>';

  const acoes = criada
    ? `<button type="button" id="btn_editar_equipe" class="btn_secundario">Editar equipe</button>
       <button type="button" id="btn_deixar_equipe" class="btn_secundario btn_perigo">Excluir equipe</button>`
    : `<button type="button" id="btn_deixar_equipe" class="btn_secundario btn_perigo">Deixar a equipe</button>`;

  conteudo.innerHTML = `
    <div class="equipe_cabecalho">
      <div class="equipe_identidade">
        <span class="equipe_badge" style="background:${cor1}; color:${cor2};">${esc(equipe.nome)}</span>
        <span class="equipe_meta">${esc(equipe.pais)} • ${esc(equipe.nome_campeonato)} • ${criada ? 'Criada por você' : 'Equipe oficial'}</span>
      </div>
      <div class="equipe_acoes">${acoes}</div>
    </div>

    <div class="equipe_kpis">
      <div class="equipe_kpi"><span>Elenco</span><strong>${resumo.total_pilotos}/${equipe.elenco_maximo}</strong></div>
      <div class="equipe_kpi"><span>Folha salarial / ano</span><strong>${formatarDolar(resumo.folha_salarial)}</strong></div>
      <div class="equipe_kpi"><span>Média de estrelas</span><strong>${resumo.media_estrelas.toFixed(1)} ★</strong> <small>(pot. ${resumo.media_potencial.toFixed(1)})</small></div>
      <div class="equipe_kpi"><span>Pilotos pagantes</span><strong>${resumo.pilotos_pagantes}</strong></div>
    </div>

    <div class="equipe_contratar">
      <input type="search" id="busca_contratar" list="lista_contratar" placeholder="${completo ? 'Elenco completo' : 'Digite o nome de um piloto para contratar...'}" autocomplete="off" ${completo ? 'disabled' : ''}>
      <datalist id="lista_contratar">${sugestoes}</datalist>
      <button type="button" id="btn_contratar" class="btn_acao" ${completo ? 'disabled' : ''}>Contratar</button>
    </div>
    ${completo ? `<p class="equipe_aviso">Elenco completo (${resumo.total_pilotos}/${equipe.elenco_maximo}). Dispense um piloto para contratar outro.</p>` : ''}

    <div class="equipe_tabela_wrap">
      <table class="equipe_tabela">
        <thead><tr><th>Piloto</th><th>País</th><th>Idade</th><th>Estrelas</th><th>Salário</th><th></th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`;

  document.getElementById('btn_deixar_equipe').addEventListener('click', deixarEquipe);
  document.getElementById('btn_editar_equipe')?.addEventListener('click', () => abrirModalEquipe('editar'));
  document.getElementById('btn_contratar').addEventListener('click', contratarPiloto);
  document.getElementById('busca_contratar').addEventListener('keydown', (e) => { if (e.key === 'Enter') contratarPiloto(); });
  conteudo.querySelectorAll('.btn_dispensar').forEach(botao => {
    botao.addEventListener('click', () => dispensarPiloto(Number(botao.dataset.id)));
  });
}

async function assumirEquipe() {
  const equipeId = Number(document.getElementById('select_assumir').value);
  if (!equipeId) return;
  try {
    await chamarApi('POST', '/equipes/minha/assumir', { equipe_id: equipeId });
    await recarregarTela();
  } catch (err) {
    alert('Não foi possível assumir a equipe: ' + textoDoErro(err));
  }
}

// Move um piloto para a equipe (ou para agente livre, com equipeId = null) usando o PUT de pilotos
const moverPilotoParaEquipe = (pilotoId, equipeId) => chamarApi('PUT', `/pilotos/${pilotoId}`, { equipe_id: equipeId });

async function contratarPiloto() {
  const campo = document.getElementById('busca_contratar');
  const achado = String(campo.value).match(/\[#(\d+)\]\s*$/); // o id vem no fim do texto escolhido na lista
  if (!achado) return alert('Escolha um piloto na lista de sugestões (digite parte do nome e selecione).');

  try {
    await moverPilotoParaEquipe(Number(achado[1]), minhaEquipe.equipe.id);
    await recarregarTela();
  } catch (err) {
    alert('Não foi possível contratar: ' + textoDoErro(err));
  }
}

async function dispensarPiloto(pilotoId) {
  if (!confirm('Dispensar este piloto? Ele volta a ser agente livre.')) return;
  try {
    await moverPilotoParaEquipe(pilotoId, null);
    await recarregarTela();
  } catch (err) {
    alert('Não foi possível dispensar: ' + textoDoErro(err));
  }
}

// Equipe oficial: só deixa de comandá-la. Equipe criada: é excluída e o elenco vira agentes livres.
async function deixarEquipe() {
  const { equipe, resumo } = minhaEquipe;
  const pergunta = equipe.tipo === 'criada'
    ? `Excluir a sua equipe? Os ${resumo.total_pilotos} piloto(s) do elenco voltam a ser agentes livres.`
    : `Deixar de comandar ${equipe.nome}? O elenco continua como está.`;
  if (!confirm(pergunta)) return;

  try {
    const data = await chamarApi('DELETE', '/equipes/minha');
    await recarregarTela();
    alert(data.mensagem);
  } catch (err) {
    alert('Erro: ' + textoDoErro(err));
  }
}

function configurarModalEquipe() {
  if (modalEquipeConfigurado) return; // evita listeners duplicados
  const modal = document.getElementById('modal_equipe');
  const form = document.getElementById('form_equipe');
  if (!modal || !form) return;

  document.getElementById('btn_fechar_modal_equipe').addEventListener('click', () => modal.close());
  document.getElementById('btn_cancelar_modal_equipe').addEventListener('click', () => modal.close());
  form.addEventListener('submit', salvarEquipe);
  modalEquipeConfigurado = true;
}

async function abrirModalEquipe(modo) {
  configurarModalEquipe();
  if (campeonatosData.length === 0) await carregarCampeonatos();

  const form = document.getElementById('form_equipe');
  form.reset();
  mostrarErroModal([], 'equipe_erros');
  form.dataset.modo = modo;

  const seletor = document.getElementById('equipe_campeonato');
  seletor.innerHTML = '';
  campeonatosData.forEach(c => seletor.add(new Option(`${c.nome} (${c.tipo} ${c.categoria}) — elenco de até ${c.elenco_maximo} pilotos`, c.id)));

  const editando = modo === 'editar' && minhaEquipe;
  document.getElementById('modal_equipe_titulo').textContent = editando ? 'Editar minha equipe' : 'Criar minha equipe';
  if (editando) {
    const { equipe } = minhaEquipe;
    document.getElementById('equipe_nome').value = equipe.nome;
    document.getElementById('equipe_pais').value = equipe.pais;
    seletor.value = String(equipe.campeonato_id);
    document.getElementById('equipe_cor_primaria').value = corSegura(equipe.cor_primaria, '#383e4d').slice(0, 7);
    document.getElementById('equipe_cor_secundaria').value = corSegura(equipe.cor_secundaria, '#ffffff').slice(0, 7);
  }
  document.getElementById('modal_equipe').showModal();
}

// Único tratador do formulário: POST (criar) ou PUT (editar), conforme o modo do modal
async function salvarEquipe(evento) {
  evento.preventDefault();
  const form = evento.currentTarget;
  if (!localStorage.getItem('jwt_token')) return alert('Sessão expirada. Faça login novamente.');

  const editando = form.dataset.modo === 'editar';
  const botao = document.getElementById('btn_salvar_equipe');
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Salvando...';
  mostrarErroModal([], 'equipe_erros');

  try {
    await chamarApi(editando ? 'PUT' : 'POST', '/equipes/minha', {
      nome: document.getElementById('equipe_nome').value.trim(),
      pais: document.getElementById('equipe_pais').value.trim(),
      campeonato_id: Number(document.getElementById('equipe_campeonato').value),
      cor_primaria: document.getElementById('equipe_cor_primaria').value,
      cor_secundaria: document.getElementById('equipe_cor_secundaria').value
    });

    document.getElementById('modal_equipe').close();
    await recarregarTela();
    alert(editando ? 'Equipe atualizada com sucesso!' : 'Equipe criada com sucesso!');
  } catch (err) {
    if (err.status === 401) {
      alert('Sessão expirada. Faça login novamente.');
      return window.fazerLogout();
    }
    mostrarErroModal(err.lista && err.lista.length ? err.lista : [err.message], 'equipe_erros');
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
}