require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./src/routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Registro dos Endpoints
app.use('/api/auth', authRoutes);

app.get('/api/status', (req, res) => {
  res.status(200).json({ status: 'API operacional', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[INFO] Servidor rodando na porta ${PORT}`);
});