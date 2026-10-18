const express = require('express');
const router = express.Router();
const pilotoController = require('../controllers/pilotoController');
const { autenticarToken, autorizarPerfis } = require('../middlewares/authMiddleware');

// Rotas de leitura
router.get('/', autenticarToken, pilotoController.listarPilotos);
router.get('/:id', autenticarToken, pilotoController.obterPiloto);

// Rotas de Escrita
router.post('/', autenticarToken, autorizarPerfis('ADMIN'), pilotoController.criarPiloto);
router.put('/:id', autenticarToken, autorizarPerfis('ADMIN'), pilotoController.atualizarPiloto);
router.delete('/:id', autenticarToken, autorizarPerfis('ADMIN'), pilotoController.deletarPiloto);

module.exports = router;

