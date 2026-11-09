const express = require('express');
const router = express.Router();
const pilotoController = require('../controllers/pilotoController');
const { autenticarToken, autenticacaoOpcional, autorizarPerfis } = require('../middlewares/authMiddleware');

// Leitura: visitante vê o catálogo-modelo; com login, MANAGER vê a própria cópia e ADMIN o catálogo
router.get('/', autenticacaoOpcional, pilotoController.listarPilotos);
router.get('/:id', autenticacaoOpcional, pilotoController.obterPiloto);

// Escrita (Manager e Admin): cada um altera apenas o seu escopo de dados
router.post('/', autenticarToken, autorizarPerfis(['ADMIN', 'MANAGER']), pilotoController.criarPiloto);
router.put('/:id', autenticarToken, autorizarPerfis(['ADMIN', 'MANAGER']), pilotoController.atualizarPiloto);
router.delete('/:id', autenticarToken, autorizarPerfis(['ADMIN', 'MANAGER']), pilotoController.deletarPiloto);

// Exclusiva do Manager: descarta as edições e recebe uma cópia nova do catálogo-modelo
router.post('/restaurar', autenticarToken, autorizarPerfis(['MANAGER']), pilotoController.restaurarPilotos);

module.exports = router;