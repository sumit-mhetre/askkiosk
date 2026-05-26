// Claim-code generation and verification.
// The raw code is shown to the customer once. Only a hash is stored.

const crypto = require("crypto");

// Generate a numeric code of the given length.
function generateCode(digits = 6) {
  let code = "";
  for (let i = 0; i < digits; i++) {
    code += crypto.randomInt(0, 10).toString();
  }
  return code;
}

// Hash a code with a server secret so a DB leak does not expose live codes.
function hashCode(code) {
  const secret = process.env.CODE_SECRET || "dev-code-secret-change-me";
  return crypto.createHmac("sha256", secret).update(code).digest("hex");
}

function isExpired(expiresAt) {
  if (!expiresAt) return true;
  return new Date() > new Date(expiresAt);
}

module.exports = { generateCode, hashCode, isExpired };
