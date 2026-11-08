// backend/src/routes/pilotoRoutes.js
const express = require('express');
const router = express.Router();
const pilotoController = require('../controllers/pilotoController');
const { autenticarToken, autorizarPerfis } = require('../middlewares/authMiddleware');

// Rotas Públicas (Visitante)
router.get('/', pilotoController.listarPilotos);

// Rotas Restritas ao CRUD do Plantel (Manager e Admin)
router.post('/', autenticarToken, autorizarPerfis(['ADMIN', 'MANAGER']), pilotoController.criarPiloto);
router.put('/:id', autenticarToken, autorizarPerfis(['ADMIN', 'MANAGER']), pilotoController.atualizarPiloto);
router.delete('/:id', autenticarToken, autorizarPerfis(['ADMIN', 'MANAGER']), pilotoController.deletarPiloto);

module.exports = router;