function log(tipo, modulo, ...mensagens) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${tipo.toUpperCase()}] [${modulo.toUpperCase()}]`, ...mensagens);
}
  
module.exports = {
    info: (modulo, ...mensagens) => log('INFO', modulo, ...mensagens),
    warn: (modulo, ...mensagens) => log('WARN', modulo, ...mensagens),
    error: (modulo, ...mensagens) => log('ERROR', modulo, ...mensagens)
};