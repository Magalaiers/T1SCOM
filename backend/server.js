require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Rota de status inicial
app.get('/api/status', (req, res) => {
  res.status(200).json({ status: 'API em execucao', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[INFO] Servidor rodando na porta ${PORT}`);
});