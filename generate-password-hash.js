/**
 * Genera el hash bcrypt de una contraseña para ADMIN_PASSWORD_HASH.
 *
 * Uso:
 *   node generate-password-hash.js "miContraseñaSegura"
 *
 * Copia el hash resultante a tu archivo .env como ADMIN_PASSWORD_HASH.
 * NUNCA pongas la contraseña en texto plano en el código ni en el frontend.
 */
const bcrypt = require('bcrypt');

const password = process.argv[2];
if (!password) {
  console.error('Uso: node generate-password-hash.js "TuContraseñaSegura"');
  process.exit(1);
}

const SALT_ROUNDS = 10;
bcrypt.hash(password, SALT_ROUNDS).then((hash) => {
  console.log('\nHash generado (cópialo a ADMIN_PASSWORD_HASH en tu .env):\n');
  console.log(hash);
  console.log('');
});