const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  // Aceita tanto formato 'Bearer <token>' quanto '<token>' direto
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.slice(7).trim() 
    : authHeader.trim();

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Extrai dados do usuário e tenant do payload
    req.userId = decoded.id || decoded.user?.id;
    req.lojaId = decoded.loja_id || decoded.user?.loja_id;
    req.role = decoded.role || decoded.user?.role;
    req.estoquista = decoded.estoquista ?? decoded.user?.estoquista ?? false;
    req.user = decoded.user || {
      id: req.userId,
      loja_id: req.lojaId,
      role: req.role,
      estoquista: req.estoquista,
      username: decoded.username || decoded.user?.username
    };
    if (req.user && req.user.estoquista === undefined) {
      req.user.estoquista = req.estoquista;
    }

    return next();
  });
};

module.exports = authMiddleware;