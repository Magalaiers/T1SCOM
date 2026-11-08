let pilotosData = [];
let equipesData = [];

// Estado Global da Listagem e Paginação
let paginaAtual = 1;
let itensPorPagina = 12;
let termoBusca = '';
let filtroEquipeSelecionada = 'todas';
let criterioOrdenacao = 'rating_desc';

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
  await carregarDados();
  inicializarControles();
  renderizarCatalogo();
  configurarEventosComparacao();
  gerenciarSessaoInterface(); // Inicializado por último para não travar a UI!
});

// 1. Carregamento Assíncrono da Base de Dados MYSQL via API
async function carregarDados() {
  try {
    const resposta = await fetch('http://localhost:3000/api/pilotos');
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

// 2. Localizadores Flexíveis de Elementos do DOM
function obterSeletoresComparador() {
  const s1 = document.getElementById('select_piloto_1') || document.getElementById('select_p1');
  const s2 = document.getElementById('select_piloto_2') || document.getElementById('select_p2');
  return { s1, s2 };
}

// 3. Regras de Negócio e Cálculos Relacionais
function obterValorAtributo(piloto, itemConfig) {
  if (!piloto || !piloto.atributos) return 10; // Valor neutro base se falhar
  
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
  // 1. Usa o valor precalculado se vier do banco/planilha
  if (piloto.estrelas_atuais && !isNaN(piloto.estrelas_atuais) && Number(piloto.estrelas_atuais) > 0) {
    return Number(piloto.estrelas_atuais);
  }
  
  // 2. Calcula a média dinâmica dos 9 atributos reais se não vier
  if (piloto.atributos) {
    const valores = ATRIBUTOS_CONFIG.map(cfg => obterValorAtributo(piloto, cfg));
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    // O jogo usa nota máxima 20 por atributo
    const estrelas = (media / 20) * 5;
    return Number(Math.max(0.5, Math.min(5.0, estrelas)).toFixed(1));
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

// 4. Inicialização dos Controles (Filtros, Buscas, Ordenação)
function inicializarControles() {
  const { s1, s2 } = obterSeletoresComparador();
  const filtroEquipe = document.getElementById('filtro_equipe');
  const campoBusca = document.getElementById('busca_piloto');
  const selectOrdenacao = document.getElementById('ordenar_piloto');
  const selectQtd = document.getElementById('itens_por_pagina');

  if (s1 && s2) {
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
    const badgeBg = livre ? '#1f6f43' : (piloto.cor_primaria || '#383e4d');
    const badgeCor = livre ? '#ffffff' : (piloto.cor_secundaria || '#ffffff');
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
          <button class="btn_editar_piloto" onclick="editarPiloto(${piloto.id})" title="Editar piloto" style="background:transparent; border:none; cursor:pointer;">✏️</button>
          <button class="btn_excluir_piloto" onclick="excluirPiloto(${piloto.id})" title="Demitir piloto" style="background:transparent; border:none; cursor:pointer;">🗑️</button>
        </div>
      ` : '';

    const itensAttr = ATRIBUTOS_CONFIG.map(attr => `
      <li>${attr.rotulo}: <span>${obterValorAtributo(piloto, attr)}</span></li>
    `).join('');

    const card = document.createElement('article');
    card.className = `card_piloto ${livre ? 'card_piloto_livre' : ''}`;
    card.setAttribute('tabindex', '0');

    card.innerHTML = `
      <figure>
        <div class="avatar_piloto" aria-hidden="true">${(piloto.nome || 'P').charAt(0)}</div>
        <figcaption style="display: flex; flex-direction: column; width: 100%;">
          <div style="display: flex; justify-content: space-between; align-items: start; width: 100%;">
             <h3 style="margin:0;">${piloto.nome} ${payBadge}</h3>
             ${botoesAcao}
          </div>
          <span class="badge_equipe" style="background-color: ${badgeBg}; color: ${badgeCor}; border: ${badgeBorda}; width: fit-content; margin-top: 5px;">
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
        <span>Origem: <strong>${piloto.nacionalidade || piloto.pais || 'N/A'}</strong></span>
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
          <td><span class="tabela_tag">${p1.equipe_id ? p1.nome_equipe : 'Disponível'}</span></td>
          <td><span class="tabela_tag">${p2.equipe_id ? p2.nome_equipe : 'Disponível'}</span></td>
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
    // 1. Renderiza crachá logado
    if (authContainer) {
      authContainer.innerHTML = `
        <span class="user_badge">Olá, <strong>${nomeUsuario}</strong> <span class="user_perfil">${perfilUsuario}</span></span>
        <button onclick="fazerLogout()" class="btn_logout">Sair</button>
      `;
    }
    
    // 2. Libera recursos ADMIN e MANAGER
    if ((perfilUsuario === 'ADMIN' || perfilUsuario === 'MANAGER') && painelAdmin) {
      painelAdmin.style.display = 'flex';
      
      const btnNovo = document.getElementById('btn_novo_piloto');
      const modal = document.getElementById('modal_piloto');
      const formCrud = document.getElementById('form_crud_piloto');
      const btnFechar = document.getElementById('btn_fechar_modal');
      const btnCancelar = document.getElementById('btn_cancelar_modal');

      if (btnNovo && modal) {
        // Blinda listeners duplicados recriando o botão visualmente
        const novoBotao = btnNovo.cloneNode(true);
        btnNovo.parentNode.replaceChild(novoBotao, btnNovo);
        
        // Abre Modal e popula Select de Equipes
        novoBotao.addEventListener('click', () => {
          if (formCrud) formCrud.reset();
          const selectEq = document.getElementById('crud_equipe');
          if (selectEq && selectEq.options.length <= 1) {
            equipesData.forEach(eq => selectEq.add(new Option(eq.nome, eq.id)));
          }
          modal.showModal();
        });

        // Fecha Modal
        const fecharModal = () => modal.close();
        if (btnFechar) btnFechar.addEventListener('click', fecharModal);
        if (btnCancelar) btnCancelar.addEventListener('click', fecharModal);

        // Dispara POST API Node.js
        if (formCrud) {
          const novoForm = formCrud.cloneNode(true);
          formCrud.parentNode.replaceChild(novoForm, formCrud);
          
          novoForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnSalvarAtual = document.getElementById('btn_salvar_piloto');
            if (btnSalvarAtual) {
              btnSalvarAtual.disabled = true;
              btnSalvarAtual.textContent = 'Salvando...';
            }

            const novoPiloto = {
              nome: document.getElementById('crud_nome').value.trim(),
              pais: document.getElementById('crud_pais').value.trim(), 
              idade: Number(document.getElementById('crud_idade').value),
              salario_anual: Number(document.getElementById('crud_salario').value),
              overrall: Number(document.getElementById('crud_overall').value),
              equipe_id: document.getElementById('crud_equipe').value ? Number(document.getElementById('crud_equipe').value) : null,
              status_contrato: document.getElementById('crud_equipe').value ? 'Contratado' : 'Agente Livre'
            };

            try {
              const resposta = await fetch('http://localhost:3000/api/pilotos', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify(novoPiloto)
              });

              const data = await resposta.json();
              if (!resposta.ok) throw new Error(data.mensagem || 'Falha ao cadastrar.');

              alert('Piloto cadastrado com sucesso!');
              document.getElementById('modal_piloto').close();
              
              await carregarDados(); 
              inicializarControles(); // Atualiza selectores do comparador
              renderizarCatalogo(); // Atualiza a tela
            } catch (err) {
              alert(err.message);
            } finally {
              if (btnSalvarAtual) {
                btnSalvarAtual.disabled = false;
                btnSalvarAtual.textContent = 'Salvar Piloto';
              }
            }
          });
        }
      }
    }
  } else {
    // Modo Visitante (Não logado)
    if (authContainer) {
      authContainer.innerHTML = `<a href="login.html" class="btn_login_nav">Entrar / Gerenciar</a>`;
    }
  }
}

window.fazerLogout = function() {
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
    const resposta = await fetch(`http://localhost:3000/api/pilotos/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}` 
      }
    });

    const data = await resposta.json();
    if (!resposta.ok) throw new Error(data.mensagem || 'Falha ao excluir o piloto.');

    alert('✅ Piloto demitido com sucesso!');
    
    // Atualiza a tela puxando do banco novamente
    await carregarDados(); 
    inicializarControles();
    renderizarCatalogo();
  } catch (err) {
    alert("Erro na exclusão: " + err.message);
  }
};

// 2. Ação de EDITAR (PUT)
window.editarPiloto = function(id) {
  const token = localStorage.getItem('jwt_token');
  if (!token) return alert("Sessão expirada. Faça login novamente.");

  // 1. Encontra os dados atuais do piloto selecionado
  const pilotoSelecionado = pilotosData.find(p => String(p.id) === String(id));
  if (!pilotoSelecionado) return alert("Erro: Piloto não encontrado na base.");

  // 2. Puxa os elementos visuais do Modal
  const modal = document.getElementById('modal_piloto');
  const formCrud = document.getElementById('form_crud_piloto');
  const selectEq = document.getElementById('crud_equipe');
  const tituloModal = document.getElementById('modal_crud_titulo');
  const btnSalvar = document.getElementById('btn_salvar_piloto');

  // Garante que o dropdown de equipes está populado (como no botão Novo)
  if (selectEq && selectEq.options.length <= 1) {
    equipesData.forEach(eq => selectEq.add(new Option(eq.nome, eq.id)));
  }

  // 3. Preenche os formulários com os dados do piloto
  if (formCrud) {
    document.getElementById('crud_nome').value = pilotoSelecionado.nome || '';
    document.getElementById('crud_pais').value = pilotoSelecionado.nacionalidade || pilotoSelecionado.pais || '';
    document.getElementById('crud_idade').value = pilotoSelecionado.idade || '';
    document.getElementById('crud_salario').value = pilotoSelecionado.salario_anual || '';
    document.getElementById('crud_overall').value = pilotoSelecionado.overrall || '';
    
    if (selectEq) {
      selectEq.value = pilotoSelecionado.equipe_id || '';
    }

    // Marca o formulário com o ID do piloto (usaremos isso para saber que é um PUT, não um POST)
    formCrud.dataset.modo = 'editar';
    formCrud.dataset.idEdicao = id;
  }

  // 4. Adapta os textos para o modo "Edição"
  if (tituloModal) tituloModal.textContent = 'Editar Piloto';
  if (btnSalvar) btnSalvar.textContent = 'Atualizar Piloto';

  // 5. Abre a janela para o usuário!
  if (modal) modal.showModal();
};