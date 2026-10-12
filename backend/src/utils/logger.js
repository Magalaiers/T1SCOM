function log(tipo, modulo, mensagem) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${tipo.toUpperCase()}] [${modulo.toUpperCase()}] ${mensagem}`);
}
  
module.exports = {
    info: (modulo, msg) => log('INFO', modulo, msg),
    warn: (modulo, msg) => log('WARN', modulo, msg),
    error: (modulo, msg) => log('ERROR', modulo, msg)
};