const express = require('express');
const router = express.Router();
const equipeController = require('../controllers/equipeController');
const { autenticarToken, autenticacaoOpcional, autorizarPerfis } = require('../middlewares/authMiddleware');

// Leitura: visitante e ADMIN veem as equipes oficiais; o MANAGER vê também a que ele criou
router.get('/', autenticacaoOpcional, equipeController.listarEquipes);

// Equipe que o MANAGER comanda (uma por usuário): exclusiva do perfil MANAGER
const somenteManager = [autenticarToken, autorizarPerfis(['MANAGER'])];
router.get('/minha', ...somenteManager, equipeController.obterMinhaEquipe);
router.post('/minha/assumir', ...somenteManager, equipeController.assumirEquipe);
router.post('/minha', ...somenteManager, equipeController.criarMinhaEquipe);
router.put('/minha', ...somenteManager, equipeController.atualizarMinhaEquipe);
router.delete('/minha', ...somenteManager, equipeController.deixarEquipe);

module.exports = router;