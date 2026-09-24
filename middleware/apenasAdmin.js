/**
 * Middleware para restringir acesso a administradores (super_admin e admin_loja)
 */
const apenasAdmin = (req, res, next) => {
  if (req.role !== 'super_admin' && req.role !== 'admin_loja') {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }
  return next();
};

module.exports = apenasAdmin;
