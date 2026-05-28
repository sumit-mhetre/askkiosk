// Auth for ASK Kiosk admin and operators.
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-change-me";
const TOKEN_TTL = "7d";

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function checkPassword(plain, hash) {
  try {
    return bcrypt.compareSync(plain, hash);
  } catch (e) {
    return false;
  }
}

// role: "admin" | "operator"
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

// Express middleware: requires a valid token with the given role.
function requireRole(role) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Not authenticated." });
    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: "Invalid or expired token." });
    if (role && decoded.role !== role) {
      return res.status(403).json({ error: "Not authorized." });
    }
    req.auth = decoded;
    next();
  };
}

module.exports = {
  hashPassword,
  checkPassword,
  signToken,
  verifyToken,
  requireRole,
};
