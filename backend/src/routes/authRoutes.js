const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { autenticarToken } = require('../middlewares/authMiddleware');

router.post('/login', authController.login);
router.post('/logout', authController.logout);

// Rota de verificação do usuário logado (exige token)
router.get('/perfil', autenticarToken, authController.obterPerfilLogado);

module.exports = router;