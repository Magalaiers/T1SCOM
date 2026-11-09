require('dotenv').config();
const express = require('express');
const cors = require('cors');
const logger = require('./src/utils/logger');

const authRoutes = require('./src/routes/authRoutes');
const pilotoRoutes = require('./src/routes/pilotoRoutes');
const equipeRoutes = require('./src/routes/equipeRoutes');
const campeonatoRoutes = require('./src/routes/campeonatoRoutes');
const usuarioRoutes = require('./src/routes/usuarioRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Registro dos Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/pilotos', pilotoRoutes);
app.use('/api/equipes', equipeRoutes);
app.use('/api/campeonatos', campeonatoRoutes);
app.use('/api/usuarios', usuarioRoutes);

app.get('/api/status', (req, res) => {
  res.status(200).json({ status: 'API operacional', timestamp: new Date().toISOString() });
});

// 404 para rotas inexistentes
app.use((req, res) => {
  res.status(404).json({ status: 'erro', mensagem: 'Rota não encontrada.' });
});

// Tratamento centralizado de erros (ex.: JSON malformado no corpo da requisição)
app.use((err, req, res, next) => {
  const codigo = err.status >= 400 && err.status < 500 ? err.status : 500;
  if (codigo === 500) logger.error('SERVER', err.message);
  const mensagem = err.type === 'entity.parse.failed'
    ? 'JSON inválido no corpo da requisição.'
    : (codigo === 500 ? 'Erro interno no servidor.' : 'Requisição inválida.');
  const extras = process.env.NODE_ENV === 'development' ? { detalhe: err.message } : {};
  res.status(codigo).json({ status: 'erro', mensagem, ...extras });
});

// Só abre a porta quando executado diretamente (os testes importam o app sem subir servidor)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[INFO] Servidor rodando na porta ${PORT}`);
  });
}

module.exports = app;