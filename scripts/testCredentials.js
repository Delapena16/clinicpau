const envNames = {
  admin: 'ADMIN_TEST_PASSWORD',
  physician: 'PHYSICIAN_TEST_PASSWORD',
  receptionist: 'RECEPTIONIST_TEST_PASSWORD'
};

const missing = Object.values(envNames).filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Set required test credentials in the environment: ${missing.join(', ')}`);
}

module.exports = {
  admin: process.env[envNames.admin],
  physician: process.env[envNames.physician],
  receptionist: process.env[envNames.receptionist]
};
