const dns = require('dns');
const mongoose = require('mongoose');

// ito yung pang ano ng DNS para gumana yung mongo atlas sa router natin, wag galawin
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (dnsErr) {
  // dito banda ignore lang pag di pinayagan ng windows
}

const connectToDatabase = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/dr_pau_pep_db';
    mongoose.set('strictQuery', true);

    await mongoose.connect(mongoUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      autoIndex: true
    });

    console.log('Connected to Dr. Pau MongoDB database');
  } catch (error) {
    console.warn('MongoDB connection warning: ' + error.message);
    console.warn('Running with in-memory clinic store until MongoDB is reachable.');
  }
};

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed');
  process.exit(0);
});

module.exports = connectToDatabase;
