document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('jwt_token')) {
        window.location.href = window.location.pathname.replace('login.html', 'index.html');
        return; // Interrompe a execução do resto do script de login
      }

    const tabLogin = document.getElementById('tab_login');
    const tabCadastro = document.getElementById('tab_cadastro');
    const formLogin = document.getElementById('form_login');
    const formCadastro = document.getElementById('form_cadastro');
    const boxFeedback = document.getElementById('box_feedback');
  
    // Alternância entre as abas
    tabLogin.addEventListener('click', () => {
      tabLogin.classList.add('is_active');
      tabCadastro.classList.remove('is_active');
      formLogin.style.display = 'flex';
      formCadastro.style.display = 'none';
      limparFeedback();
    });
  
    tabCadastro.addEventListener('click', () => {
      tabCadastro.classList.add('is_active');
      tabLogin.classList.remove('is_active');
      formCadastro.style.display = 'flex';
      formLogin.style.display = 'none';
      limparFeedback();
    });
  
    // 1. Processar LOGIN
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login_email').value.trim();
      const senha = document.getElementById('login_senha').value;
      const btn = document.getElementById('btn_login');
  
      btn.disabled = true;
      btn.textContent = 'Autenticando...';
  
      try {
        const res = await fetch('http://localhost:3000/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, senha })
        });
  
        const data = await res.json();
        if (!res.ok) throw new Error(data.mensagem || 'Credenciais inválidas.');
  
        // Guarda os dados na sessão
        localStorage.setItem('jwt_token', data.token);
        localStorage.setItem('usuario_perfil', data.usuario.perfil);
        localStorage.setItem('usuario_nome', data.usuario.nome);
  
        mostrarFeedback(`Bem-vindo, ${data.usuario.nome}! Redirecionando...`, 'sucesso');
        setTimeout(() => { window.location.href = 'index.html'; }, 1000);
  
      } catch (err) {
        mostrarFeedback(err.message, 'erro');
          btn.disabled = false;
          btn.textContent = 'Entrar no Sistema';
      }
    });
  
  // 2. Processar CADASTRO
  formCadastro.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('cad_nome').value.trim();
    const email = document.getElementById('cad_email').value.trim();
    const senha = document.getElementById('cad_senha').value;
    const btn = document.getElementById('btn_cadastro');

    // Estado 1: Processando (Desabilita o botão para evitar múltiplos cliques)
    btn.disabled = true;
    btn.textContent = 'Criando conta...';
    btn.style.backgroundColor = '#555'; // Cinza de processamento
    btn.style.color = '#fff';

    try {
      const res = await fetch('http://localhost:3000/api/auth/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, email, senha })
      });

      const data = await res.json();
      
      // Valida se ocorreu um erro no backend (ex: email já existe)
      if (data.status === 'erro' || !res.ok) {
        throw new Error(data.mensagem || 'Falha ao cadastrar. Verifique os dados.');
      }

      // Estado 2: Sucesso! O botão fica verde.
      btn.style.backgroundColor = '#3fb950'; // Verde sucesso
      btn.textContent = 'Conta criada! Redirecionando...';
      formCadastro.reset();

      // Troca suave para a aba de login após 1.5 segundos
      setTimeout(() => {
        tabLogin.click();
        document.getElementById('login_email').value = email;
        
        // Restaura o botão de cadastro para o padrão
        btn.disabled = false;
        btn.style.backgroundColor = ''; 
        btn.textContent = 'Cadastrar-se';
      }, 1500);

    } catch (err) {
      // Estado 3: Erro! O botão fica vermelho escuro e exibe o problema.
      btn.style.backgroundColor = '#e74c3c'; // Vermelho erro
      btn.textContent = err.message; // Ex: "Este e-mail já está cadastrado no sistema."
      
      // Restaura o botão ao normal após 3.5 segundos para nova tentativa
      setTimeout(() => {
        btn.disabled = false;
        btn.style.backgroundColor = ''; 
        btn.textContent = 'Cadastrar-se';
      }, 3500);
    }
  });

  function mostrarFeedback(texto, tipo) {
    boxFeedback.textContent = texto;
    boxFeedback.className = `alerta_feedback alerta_${tipo}`;
  }
  
  function limparFeedback() {
    boxFeedback.textContent = '';
    boxFeedback.className = 'alerta_feedback'; // a classe já esconde a caixa (display: none no CSS)
  }
});