const express = require('express');
const router = express.Router();
const campeonatoController = require('../controllers/campeonatoController');

// Pública: alimenta o seletor de campeonato do formulário de equipe
router.get('/', campeonatoController.listarCampeonatos);

module.exports = router;