// Admin controller. Super admin logs in, manages operators and kiosks.
const { prisma } = require("../services/settingsService");
const auth = require("../services/authService");

// POST /api/admin/login  { email, password }
async function adminLogin(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password required." });
    const admin = await prisma.superAdmin.findUnique({ where: { email } });
    if (!admin || !auth.checkPassword(password, admin.passwordHash)) {
      return res.status(401).json({ error: "Invalid credentials." });
    }
    const token = auth.signToken({ role: "admin", id: admin.id, email });
    return res.json({ token, name: admin.name || "Admin" });
  } catch (e) {
    console.error("adminLogin error:", e);
    return res.status(500).json({ error: "Login failed." });
  }
}

// POST /api/admin/operators  { name, email, password, phone }
async function createOperator(req, res) {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: "Name, email, password required." });
    const exists = await prisma.operator.findUnique({ where: { email } });
    if (exists) return res.status(400).json({ error: "Email already used." });
    const op = await prisma.operator.create({
      data: {
        name,
        email,
        phone: phone || null,
        passwordHash: auth.hashPassword(password),
      },
    });
    return res.json({ id: op.id, name: op.name, email: op.email });
  } catch (e) {
    console.error("createOperator error:", e);
    return res.status(500).json({ error: "Could not create operator." });
  }
}

// GET /api/admin/operators
async function listOperators(req, res) {
  const ops = await prisma.operator.findMany({
    orderBy: { createdAt: "desc" },
    include: { kiosks: true },
  });
  return res.json(
    ops.map((o) => ({
      id: o.id,
      name: o.name,
      email: o.email,
      phone: o.phone,
      isActive: o.isActive,
      kioskCount: o.kiosks.length,
    }))
  );
}

// POST /api/admin/kiosks  { operatorId, name, location }
async function createKiosk(req, res) {
  try {
    const { operatorId, name, location } = req.body;
    if (!operatorId || !name)
      return res.status(400).json({ error: "operatorId and name required." });
    const op = await prisma.operator.findUnique({ where: { id: operatorId } });
    if (!op) return res.status(404).json({ error: "Operator not found." });
    const kiosk = await prisma.kiosk.create({
      data: { name, location: location || null, operatorId },
    });
    return res.json({ id: kiosk.id, name: kiosk.name, operatorId });
  } catch (e) {
    console.error("createKiosk error:", e);
    return res.status(500).json({ error: "Could not create kiosk." });
  }
}

// GET /api/admin/kiosks?operatorId=...
async function listKiosks(req, res) {
  const where = req.query.operatorId ? { operatorId: req.query.operatorId } : {};
  const kiosks = await prisma.kiosk.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { operator: true },
  });
  return res.json(
    kiosks.map((k) => ({
      id: k.id,
      name: k.name,
      location: k.location,
      isActive: k.isActive,
      operatorId: k.operatorId,
      operatorName: k.operator ? k.operator.name : null,
    }))
  );
}

module.exports = {
  adminLogin,
  createOperator,
  listOperators,
  createKiosk,
  listKiosks,
};
