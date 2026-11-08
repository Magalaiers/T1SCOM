const express = require('express');
const router = express.Router();
const pilotoController = require('../controllers/pilotoController');
const { autenticarToken, autorizarPerfis } = require('../middlewares/authMiddleware');

// Rotas públicas (visitante)
router.get('/', pilotoController.listarPilotos);
router.get('/:id', pilotoController.obterPiloto);

// Rotas restritas (Manager e Admin)
router.post('/', autenticarToken, autorizarPerfis(['ADMIN', 'MANAGER']), pilotoController.criarPiloto);
router.put('/:id', autenticarToken, autorizarPerfis(['ADMIN', 'MANAGER']), pilotoController.atualizarPiloto);
router.delete('/:id', autenticarToken, autorizarPerfis(['ADMIN', 'MANAGER']), pilotoController.deletarPiloto);

module.exports = router;
