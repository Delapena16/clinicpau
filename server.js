require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const connectToDatabase = require('./config/db');
const User = require('./models/User');
const Patient = require('./models/Patient');
const Inventory = require('./models/Inventory');
const InventoryForecast = require('./models/InventoryForecast');

const { getInitialTenDsGarciaPatients } = require('./controllers/authController');
const { getDefaultPySparkAnalytics } = require('./controllers/physicianController');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const receptionistRoutes = require('./routes/receptionistRoutes');
const physicianRoutes = require('./routes/physicianRoutes');

const app = express();

// ito yung pang security ng server, pati yung CSP, wag galawin kundi mawawala yung font
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5000',
    credentials: true
  })
);

app.use(express.json({ limit: '15kb' }));
app.use(express.urlencoded({ extended: true, limit: '15kb' }));
app.use(cookieParser());

// ito yung anu pang linis ng input na pumapasok para walang bastos na data
app.use(
  mongoSanitize({
    replaceWith: '_'
  })
);

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please wait a few minutes and try again.'
  }
});

const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please wait a moment and try again.'
  }
});

app.use('/api/auth', authRateLimiter);
app.use('/api', apiRateLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/receptionist', receptionistRoutes);
app.use('/api/physician', physicianRoutes);

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Dr. Pau Animal Bite Center PEP System API is online.',
    data: {
      databaseConnected: mongoose.connection.readyState === 1
    }
  });
});

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: 'Something went wrong on the server. Please check your input and try again.'
  });
});

// ito yung pang lagay ng unang data, accounts, vials, 10 pasyente, forecast, para may laman agad pag first run
const seedInitialClinicData = async () => {
  if (mongoose.connection.readyState !== 1) {
    return;
  }

  try {
    const existingUsers = await User.countDocuments();
    if (existingUsers === 0) {
      await User.create([
        {
          fullName: 'Dr. Pauline Santos',
          email: 'admin@drpauclinic.ph',
          passwordHash: 'Admin@12345',
          role: 'SuperAdmin'
        },
        {
          fullName: 'Maria Clara Reyes',
          email: 'receptionist@drpauclinic.ph',
          passwordHash: 'Reception@12345',
          role: 'Receptionist'
        },
        {
          fullName: 'Dr. Jose Rizalino Cruz',
          email: 'physician@drpauclinic.ph',
          passwordHash: 'Physician@12345',
          role: 'Physician'
        }
      ]);
      console.log('Seeded default clinic staff accounts');
    }

    const existingVials = await Inventory.countDocuments();
    if (existingVials < 3) {
      await Inventory.deleteMany({});
      await Inventory.create([
        {
          vaccineType: 'anti-rabies',
          brandName: 'Verorab (Purified Vero Cell Rabies Vaccine)',
          batchNumber: 'VRB-2026-A104',
          currentStock: 84,
          lowStockThreshold: 15,
          expirationDate: new Date('2027-06-30')
        },
        {
          vaccineType: 'anti-rabies',
          brandName: 'Speeda (Purified Vero Cell Vaccine)',
          batchNumber: 'SPD-2026-C219',
          currentStock: 42,
          lowStockThreshold: 15,
          expirationDate: new Date('2027-08-15')
        },
        {
          vaccineType: 'anti-tetanus',
          brandName: 'Tetavax (Adsorbed Tetanus Toxoid 0.5mL)',
          batchNumber: 'TTX-2026-B204',
          currentStock: 36,
          lowStockThreshold: 10,
          expirationDate: new Date('2027-03-20')
        },
        {
          vaccineType: 'ERIG',
          brandName: 'Equirab (Equine Rabies Immunoglobulin 200 IU/mL)',
          batchNumber: 'EQB-2026-R309',
          currentStock: 7,
          lowStockThreshold: 10,
          expirationDate: new Date('2027-05-10')
        }
      ]);
      console.log('Seeded starter vaccine inventory batches');
    }

    const seedDocs = getInitialTenDsGarciaPatients().map(({ _id, ...rest }) => rest);
    const dsGarciaCount = await Patient.countDocuments({ barangay: /D\.S\. Garcia/i });
    if (dsGarciaCount < 10) {
      await Patient.deleteMany({});
      await Patient.insertMany(seedDocs);
      console.log('Seeded 10 Barangay D.S. Garcia patient records');
    } else {
      const clarissaSeed = seedDocs.find((p) => p.patientId === 'PEP-2026-002');
      if (clarissaSeed) {
        await Patient.findOneAndUpdate(
          { patientId: 'PEP-2026-002' },
          { $set: clarissaSeed },
          { upsert: true }
        );
      }
    }

    const forecastCount = await InventoryForecast.countDocuments();
    if (forecastCount === 0) {
      const defaultForecast = getDefaultPySparkAnalytics();
      await InventoryForecast.create(defaultForecast);
      console.log('Seeded initial monthly stock forecast');
    }
  } catch (error) {
    console.warn('Seed warning:', error.message);
  }
};

const PORT = process.env.PORT || 5000;

const listenWithPortRecovery = (retried = false) => {
  const server = app.listen(PORT, () => {
    console.log(`Dr. Pau PEP System server running on http://localhost:${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && !retried) {
      try {
        const { execSync } = require('child_process');
        if (process.platform === 'win32') {
          execSync(
            `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${PORT} -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -ne ${process.pid} -and $_.OwningProcess -ne 0 } | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
            { stdio: 'ignore' }
          );
        }
        setTimeout(() => listenWithPortRecovery(true), 600);
        return;
      } catch (cleanupErr) {
        // dito banda wala lang, tuloy lang sa baba
      }
    }
    console.error(`Port ${PORT} error:`, err.message);
    process.exit(1);
  });
};

const startServer = async () => {
  await connectToDatabase();
  await seedInitialClinicData();
  listenWithPortRecovery();
};

if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.seedInitialClinicData = seedInitialClinicData;
