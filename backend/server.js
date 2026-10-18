require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./src/routes/authRoutes');
const pilotoRoutes = require('./src/routes/pilotoRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Registro dos Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/pilotos', pilotoRoutes);
app.use(express.json());

app.get('/api/status', (req, res) => {
  res.status(200).json({ status: 'API operacional', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[INFO] Servidor rodando na porta ${PORT}`);
});

app.use((req, res) => {
  res.status(404).json({status:'erro', mensagem: 'Rota não encontrada.'});
});

module.exports = app;