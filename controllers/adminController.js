const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Inventory = require('../models/Inventory');
const AuditLog = require('../models/AuditLog');
const {
  getDefaultPySparkAnalytics,
  enrichForecastWithLiveInventory
} = require('./physicianController');

// ito yung pang gawa ng bagong staff, admin lang pwede dito
const createStaffUserAccount = async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;
    const normalizedEmail = email.toLowerCase().trim();
    const isMongoConnected = mongoose.connection.readyState === 1;

    if (isMongoConnected) {
      const existingUser = await User.findOne({ email: normalizedEmail });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: `An account with email ${normalizedEmail} already exists.`
        });
      }

      const createdUser = await User.create({
        fullName: fullName.trim(),
        email: normalizedEmail,
        passwordHash: password,
        role,
        isActive: true
      });

      await AuditLog.create({
        actorId: mongoose.Types.ObjectId.isValid(req.authenticatedUser.userId)
          ? req.authenticatedUser.userId
          : null,
        actorRole: req.authenticatedUser.role,
        actionType: 'STAFF_ONBOARDED',
        targetCollection: 'User',
        description: `Created ${role} account for ${createdUser.fullName} (${normalizedEmail}).`,
        ipAddress: req.ip || '127.0.0.1'
      });

      return res.status(201).json({
        success: true,
        message: `Staff account created for ${createdUser.fullName} (${role}).`,
        data: {
          staffMember: {
            userId: createdUser._id,
            fullName: createdUser.fullName,
            email: createdUser.email,
            role: createdUser.role
          }
        }
      });
    } else {
      const existingUser = global.clinicMemoryStore.users.find((u) => u.email === normalizedEmail);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: `An account with email ${normalizedEmail} already exists.`
        });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const newStaff = {
        _id: `usr-${Date.now()}`,
        fullName: fullName.trim(),
        email: normalizedEmail,
        passwordHash,
        role,
        isActive: true
      };

      global.clinicMemoryStore.users.push(newStaff);
      global.clinicMemoryStore.auditLogs.unshift({
        timestamp: new Date().toISOString(),
        actorRole: req.authenticatedUser.role,
        actionType: 'STAFF_ONBOARDED',
        description: `Created ${role} account for ${newStaff.fullName} (${normalizedEmail}).`
      });

      return res.status(201).json({
        success: true,
        message: `Staff account created for ${newStaff.fullName} (${role}).`,
        data: {
          staffMember: {
            userId: newStaff._id,
            fullName: newStaff.fullName,
            email: newStaff.email,
            role: newStaff.role
          }
        }
      });
    }
  } catch (error) {
    console.error('Create staff account error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to create staff account.'
    });
  }
};

const VALID_ROLES = ['SuperAdmin', 'Receptionist', 'Physician'];

// ito yung pang edit ng staff, name email role password, pag walang bagong password di niya gagalaw yung luma
const updateStaffUserAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, email, password, role } = req.body;
    const normalizedEmail = email ? email.toLowerCase().trim() : undefined;
    const isMongoConnected = mongoose.connection.readyState === 1;
    const actorId = String(req.authenticatedUser.userId);

    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid staff role.' });
    }
    if (password && password.length < 8) {
      return res
        .status(400)
        .json({ success: false, message: 'Password must be at least 8 characters long.' });
    }

    if (isMongoConnected) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(404).json({ success: false, message: 'Staff account not found.' });
      }
      const user = await User.findById(id).select('+passwordHash');
      if (!user) {
        return res.status(404).json({ success: false, message: 'Staff account not found.' });
      }

      if (role && role !== user.role && user.role === 'SuperAdmin') {
        const adminCount = await User.countDocuments({ role: 'SuperAdmin', isActive: true });
        if (adminCount <= 1) {
          return res.status(400).json({
            success: false,
            message: 'Cannot change the role of the only SuperAdmin.'
          });
        }
      }

      if (normalizedEmail && normalizedEmail !== user.email) {
        const taken = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
        if (taken) {
          return res.status(409).json({
            success: false,
            message: `An account with email ${normalizedEmail} already exists.`
          });
        }
        user.email = normalizedEmail;
      }
      if (fullName) user.fullName = fullName.trim();
      if (role) user.role = role;
      if (password) user.passwordHash = password;
      await user.save();

      await AuditLog.create({
        actorId: mongoose.Types.ObjectId.isValid(actorId) ? actorId : null,
        actorRole: req.authenticatedUser.role,
        actionType: 'STAFF_UPDATED',
        targetCollection: 'User',
        description: `Updated account for ${user.fullName} (${user.email}).`,
        ipAddress: req.ip || '127.0.0.1'
      });

      return res.status(200).json({
        success: true,
        message: 'Staff account updated.',
        data: {
          staffMember: {
            userId: user._id,
            fullName: user.fullName,
            email: user.email,
            role: user.role
          }
        }
      });
    }

    const users = global.clinicMemoryStore.users;
    const user = users.find((u) => String(u._id) === id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Staff account not found.' });
    }

    if (role && role !== user.role && user.role === 'SuperAdmin') {
      const adminCount = users.filter((u) => u.role === 'SuperAdmin' && u.isActive !== false).length;
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot change the role of the only SuperAdmin.'
        });
      }
    }

    if (normalizedEmail && normalizedEmail !== user.email) {
      if (users.some((u) => u.email === normalizedEmail && String(u._id) !== id)) {
        return res.status(409).json({
          success: false,
          message: `An account with email ${normalizedEmail} already exists.`
        });
      }
      user.email = normalizedEmail;
    }
    if (fullName) user.fullName = fullName.trim();
    if (role) user.role = role;
    if (password) user.passwordHash = await bcrypt.hash(password, 12);

    global.clinicMemoryStore.auditLogs.unshift({
      timestamp: new Date().toISOString(),
      actorRole: req.authenticatedUser.role,
      actionType: 'STAFF_UPDATED',
      description: `Updated account for ${user.fullName} (${user.email}).`
    });

    return res.status(200).json({
      success: true,
      message: 'Staff account updated.',
      data: {
        staffMember: {
          userId: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('Update staff account error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update staff account.' });
  }
};

// ito yung pang delete ng staff, bawal burahin sarili tsaka yung nag iisang admin
const deleteStaffUserAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const isMongoConnected = mongoose.connection.readyState === 1;
    const actorId = String(req.authenticatedUser.userId);

    if (id === actorId) {
      return res
        .status(400)
        .json({ success: false, message: 'You cannot delete your own account.' });
    }

    if (isMongoConnected) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(404).json({ success: false, message: 'Staff account not found.' });
      }
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'Staff account not found.' });
      }
      if (user.role === 'SuperAdmin') {
        const adminCount = await User.countDocuments({ role: 'SuperAdmin', isActive: true });
        if (adminCount <= 1) {
          return res
            .status(400)
            .json({ success: false, message: 'Cannot delete the only SuperAdmin.' });
        }
      }
      await User.deleteOne({ _id: user._id });

      await AuditLog.create({
        actorId: mongoose.Types.ObjectId.isValid(actorId) ? actorId : null,
        actorRole: req.authenticatedUser.role,
        actionType: 'STAFF_REMOVED',
        targetCollection: 'User',
        description: `Removed account for ${user.fullName} (${user.email}).`,
        ipAddress: req.ip || '127.0.0.1'
      });

      return res.status(200).json({
        success: true,
        message: `Removed ${user.fullName}.`
      });
    }

    const users = global.clinicMemoryStore.users;
    const idx = users.findIndex((u) => String(u._id) === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Staff account not found.' });
    }
    const user = users[idx];
    if (
      user.role === 'SuperAdmin' &&
      users.filter((u) => u.role === 'SuperAdmin' && u.isActive !== false).length <= 1
    ) {
      return res.status(400).json({ success: false, message: 'Cannot delete the only SuperAdmin.' });
    }
    users.splice(idx, 1);

    global.clinicMemoryStore.auditLogs.unshift({
      timestamp: new Date().toISOString(),
      actorRole: req.authenticatedUser.role,
      actionType: 'STAFF_REMOVED',
      description: `Removed account for ${user.fullName} (${user.email}).`
    });

    return res.status(200).json({ success: true, message: `Removed ${user.fullName}.` });
  } catch (error) {
    console.error('Delete staff account error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete staff account.' });
  }
};

// ito yung kukuha ng lahat ng staff para sa table
const getAllStaffUsers = async (req, res) => {
  try {
    const isMongoConnected = mongoose.connection.readyState === 1;

    if (isMongoConnected) {
      const staffAccounts = await User.find()
        .select('_id fullName email role isActive lastLoginAt createdAt')
        .sort({ role: 1, fullName: 1 });

      return res.status(200).json({
        success: true,
        message: 'Staff accounts retrieved.',
        data: {
          staffAccounts
        }
      });
    } else {
      const staffAccounts = global.clinicMemoryStore.users.map((u) => ({
        _id: u._id,
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        isActive: u.isActive
      }));

      return res.status(200).json({
        success: true,
        message: 'Staff accounts retrieved.',
        data: {
          staffAccounts
        }
      });
    }
  } catch (error) {
    console.error('Get staff accounts error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve staff accounts.'
    });
  }
};

// ito yung sa inventory, dito nag dadagdag ng bagong batch o restock ng vials
const addOrRestockVaccineBatch = async (req, res) => {
  try {
    const {
      vaccineType,
      brandName,
      batchNumber,
      vialsAdded,
      lowStockThreshold = 10,
      expirationDate
    } = req.body;

    const cleanBatch = batchNumber.toUpperCase().trim();
    const addedCount = Number(vialsAdded);
    const isMongoConnected = mongoose.connection.readyState === 1;

    if (isMongoConnected) {
      let vialRecord = await Inventory.findOne({ batchNumber: cleanBatch });

      if (vialRecord) {
        vialRecord.currentStock += addedCount;
        await vialRecord.save();
      } else {
        vialRecord = await Inventory.create({
          vaccineType,
          brandName: brandName.trim(),
          batchNumber: cleanBatch,
          currentStock: addedCount,
          lowStockThreshold: Number(lowStockThreshold),
          expirationDate: new Date(expirationDate)
        });
      }

      await AuditLog.create({
        actorId: mongoose.Types.ObjectId.isValid(req.authenticatedUser.userId)
          ? req.authenticatedUser.userId
          : null,
        actorRole: req.authenticatedUser.role,
        actionType: 'INVENTORY_VIALS_RESTOCKED',
        targetCollection: 'Inventory',
        description: `Restocked +${addedCount} vial(s) of ${vaccineType} (${brandName}, Lot ${cleanBatch}). Current stock: ${vialRecord.currentStock}.`,
        ipAddress: req.ip || '127.0.0.1'
      });

      return res.status(201).json({
        success: true,
        message: `Restocked +${addedCount} vial(s) of ${vaccineType} (Lot ${cleanBatch}). Current stock: ${vialRecord.currentStock} vials.`,
        data: {
          vialRecord
        }
      });
    } else {
      let vialRecord = global.clinicMemoryStore.inventory.find((i) => i.batchNumber === cleanBatch);

      if (vialRecord) {
        vialRecord.currentStock += addedCount;
      } else {
        vialRecord = {
          _id: `inv-${Date.now()}`,
          vaccineType,
          brandName: brandName.trim(),
          batchNumber: cleanBatch,
          currentStock: addedCount,
          lowStockThreshold: Number(lowStockThreshold),
          expirationDate
        };
        global.clinicMemoryStore.inventory.push(vialRecord);
      }

      global.clinicMemoryStore.auditLogs.unshift({
        timestamp: new Date().toISOString(),
        actorRole: req.authenticatedUser.role,
        actionType: 'INVENTORY_VIALS_RESTOCKED',
        description: `Restocked +${addedCount} vial(s) of ${vaccineType} (${brandName}, Lot ${cleanBatch}). Current stock: ${vialRecord.currentStock}.`
      });

      return res.status(201).json({
        success: true,
        message: `Restocked +${addedCount} vial(s) of ${vaccineType} (Lot ${cleanBatch}). Current stock: ${vialRecord.currentStock} vials.`,
        data: {
          vialRecord
        }
      });
    }
  } catch (error) {
    console.error('Restock vaccine batch error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to restock vaccine vials.'
    });
  }
};

// ito yung kukuha ng bilang ng vials ngayon para sa stock table tsaka alert pag konti na
const getInventoryStatusAndAlerts = async (req, res) => {
  try {
    const isMongoConnected = mongoose.connection.readyState === 1;
    let inventoryList = [];

    if (isMongoConnected) {
      inventoryList = await Inventory.find().sort({ expirationDate: 1 });
    } else {
      inventoryList = global.clinicMemoryStore.inventory;
    }

    return res.status(200).json({
      success: true,
      message: 'Vaccine vial inventory retrieved.',
      data: {
        inventory: inventoryList
      }
    });
  } catch (error) {
    console.error('Get inventory error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to load vaccine inventory.'
    });
  }
};

// ito yung kukuha ng logs tsaka forecast para sa overview ni admin
const getSystemAuditLogsAndAnalyticsSummary = async (req, res) => {
  try {
    const isMongoConnected = mongoose.connection.readyState === 1;
    const baseAnalytics = getDefaultPySparkAnalytics();

    if (isMongoConnected) {
      const [totalPatients, recentAuditLogs, inventory] = await Promise.all([
        Patient.countDocuments(),
        AuditLog.find().sort({ timestamp: -1 }).limit(30),
        Inventory.find().sort({ expirationDate: 1 })
      ]);

      const pySparkAnalytics = enrichForecastWithLiveInventory(baseAnalytics, inventory);

      return res.status(200).json({
        success: true,
        message: 'Clinic overview data retrieved.',
        data: {
          totalPatients,
          inventory,
          recentAuditLogs,
          pySparkAnalytics
        }
      });
    } else {
      const inventory = global.clinicMemoryStore.inventory;
      const pySparkAnalytics = enrichForecastWithLiveInventory(baseAnalytics, inventory);

      return res.status(200).json({
        success: true,
        message: 'Clinic overview data retrieved.',
        data: {
          totalPatients: global.clinicMemoryStore.patients.length,
          inventory,
          recentAuditLogs: global.clinicMemoryStore.auditLogs.slice(0, 30),
          pySparkAnalytics
        }
      });
    }
  } catch (error) {
    console.error('Get overview summary error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to load clinic overview data.'
    });
  }
};

module.exports = {
  createStaffUserAccount,
  updateStaffUserAccount,
  deleteStaffUserAccount,
  getAllStaffUsers,
  addOrRestockVaccineBatch,
  getInventoryStatusAndAlerts,
  getSystemAuditLogsAndAnalyticsSummary
};
