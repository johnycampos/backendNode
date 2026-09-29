/**
 * Middleware para restringir acesso a estoquistas ou administradores (super_admin, admin_loja ou estoquista = true)
 */
const apenasEstoquista = (req, res, next) => {
  if (req.role === 'super_admin' || req.role === 'admin_loja' || req.estoquista === true) {
    return next();
  }
  return res.status(403).json({ error: 'Acesso restrito a estoquistas ou administradores' });
};

module.exports = apenasEstoquista;
