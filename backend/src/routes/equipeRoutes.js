const express = require('express');
const router = express.Router();
const equipeController = require('../controllers/equipeController');

// Pública (visitante): usada para montar filtros e o seletor de equipe do formulário
router.get('/', equipeController.listarEquipes);

module.exports = router;
