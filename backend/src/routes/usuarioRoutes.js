const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuarioController');
const { autenticarToken, autorizarPerfis } = require('../middlewares/authMiddleware');

// Gestão de usuários: exclusiva do perfil ADMIN (vale para todas as rotas abaixo)
router.use(autenticarToken, autorizarPerfis(['ADMIN']));

router.get('/', usuarioController.listarUsuarios);
router.post('/', usuarioController.criarUsuario);
router.put('/:id/perfil', usuarioController.alterarPerfil);
router.put('/:id/senha', usuarioController.redefinirSenha);
router.delete('/:id', usuarioController.excluirUsuario);

module.exports = router;