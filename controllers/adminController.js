const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Inventory = require('../models/Inventory');
const AuditLog = require('../models/AuditLog');
const { logActivity, AUDIT_EVENTS } = require('../utils/logger');
const {
  getDefaultPySparkAnalytics,
  enrichForecastWithLiveInventory
} = require('./physicianController');

// ito yung pang gawa ng bagong staff, admin lang pwede dito
const createStaffUserAccount = async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

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
    const actorId = String(req.authenticatedUser.userId);

    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid staff role.' });
    }
    if (password && password.length < 8) {
      return res
        .status(400)
        .json({ success: false, message: 'Password must be at least 8 characters long.' });
    }

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
  } catch (error) {
    console.error('Update staff account error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update staff account.' });
  }
};

// ito yung pang delete ng staff, bawal burahin sarili tsaka yung nag iisang admin
const deleteStaffUserAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const actorId = String(req.authenticatedUser.userId);

    if (id === actorId) {
      return res
        .status(400)
        .json({ success: false, message: 'You cannot delete your own account.' });
    }

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
  } catch (error) {
    console.error('Delete staff account error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete staff account.' });
  }
};

// ito yung pang toggle ng isActive status ng staff (deactivate / reactivate)
const toggleStaffAccountStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const actorId = String(req.authenticatedUser ? req.authenticatedUser.userId : '');

    if (id === actorId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account.'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, message: 'Staff account not found.' });
    }
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Staff account not found.' });
    }

    if (user.role === 'SuperAdmin' && user.isActive) {
      const activeAdminCount = await User.countDocuments({
        role: 'SuperAdmin',
        isActive: true,
        _id: { $ne: user._id }
      });
      if (activeAdminCount < 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot deactivate the only active SuperAdmin.'
        });
      }
    }

    user.isActive = !user.isActive;
    await user.save();

    const action = user.isActive ? 'ACTIVATED' : 'DEACTIVATED';
    await AuditLog.create({
      actorId: mongoose.Types.ObjectId.isValid(actorId) ? actorId : null,
      actorRole: req.authenticatedUser.role,
      actionType: `STAFF_${action}`,
      targetCollection: 'User',
      description: `${action} account for ${user.fullName} (${user.email}).`,
      ipAddress: req.ip || '127.0.0.1'
    });

    return res.status(200).json({
      success: true,
      message: `Staff account for ${user.fullName} has been ${user.isActive ? 'reactivated' : 'deactivated'}.`,
      data: {
        isActive: user.isActive,
        staffMember: {
          userId: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          isActive: user.isActive
        }
      }
    });
  } catch (error) {
    console.error('Toggle staff account error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update staff account status.' });
  }
};

// Dynamic Mongoose query for all staff accounts
const getAllStaffUsers = async (req, res) => {
  try {
    const staffAccounts = await User.find({})
      .select('_id fullName email role isActive lastLoginAt createdAt')
      .sort({ role: 1, fullName: 1 });

    return res.status(200).json({
      success: true,
      message: 'Staff accounts retrieved.',
      data: {
        staffAccounts
      }
    });
  } catch (error) {
    console.error('Get staff accounts error:', error.message);
    // Fallback: return demo staff accounts if MongoDB is unreachable
    return res.status(200).json({
      success: true,
      message: 'Staff accounts retrieved (offline mode).',
      data: {
        staffAccounts: [
          { _id: 'admin@drpauclinic.ph', fullName: 'Dr. Edgar Rivera', email: 'admin@drpauclinic.ph', role: 'SuperAdmin', isActive: true },
          { _id: 'receptionist@drpauclinic.ph', fullName: 'Amen Leaderr', email: 'receptionist@drpauclinic.ph', role: 'Receptionist', isActive: true },
          { _id: 'physician@drpauclinic.ph', fullName: 'Dr. Jose Rizalino Cruz', email: 'physician@drpauclinic.ph', role: 'Physician', isActive: true }
        ]
      }
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

    // Universal audit trail: inventory restock
    await logActivity(
      req.authenticatedUser.role,
      AUDIT_EVENTS.VIAL_RESTOCKED,
      `Restocked +${addedCount} vial(s) of ${vaccineType} (${brandName}, Lot ${cleanBatch}). Current stock: ${vialRecord.currentStock}.`,
      {
        actorId: req.authenticatedUser.userId,
        ipAddress: req.ip || '127.0.0.1',
        targetCollection: 'Inventory',
        metadata: { vaccineType, brandName, batchNumber: cleanBatch, vialsAdded: addedCount }
      }
    );

    return res.status(201).json({
      success: true,
      message: `Restocked +${addedCount} vial(s) of ${vaccineType} (Lot ${cleanBatch}). Current stock: ${vialRecord.currentStock} vials.`,
      data: {
        vialRecord
      }
    });
  } catch (error) {
    console.error('Restock vaccine batch error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to restock vaccine vials.'
    });
  }
};

// Dynamic Mongoose query for inventory status and alerts
const getInventoryStatusAndAlerts = async (req, res) => {
  try {
    const inventoryList = await Inventory.find({}).sort({ expirationDate: 1 });

    return res.status(200).json({
      success: true,
      message: 'Vaccine vial inventory retrieved.',
      data: {
        inventory: inventoryList
      }
    });
  } catch (error) {
    console.error('Get inventory error:', error.message);
    // Fallback: return demo inventory if MongoDB is unreachable
    return res.status(200).json({
      success: true,
      message: 'Vaccine vial inventory retrieved (offline mode).',
      data: {
        inventory: [
          { _id: '1', vaccineType: 'anti-rabies', brandName: 'Verorab (Purified Vero Cell Rabies Vaccine)', batchNumber: 'VRB-2026-A104', currentStock: 84, lowStockThreshold: 15, expirationDate: '2027-06-30' },
          { _id: '2', vaccineType: 'anti-rabies', brandName: 'Speeda (Purified Vero Cell Vaccine)', batchNumber: 'SPD-2026-C219', currentStock: 42, lowStockThreshold: 15, expirationDate: '2027-08-15' },
          { _id: '3', vaccineType: 'anti-tetanus', brandName: 'Tetavax (Adsorbed Tetanus Toxoid 0.5mL)', batchNumber: 'TTX-2026-B204', currentStock: 36, lowStockThreshold: 10, expirationDate: '2027-03-20' },
          { _id: '4', vaccineType: 'ERIG', brandName: 'Equirab (Equine Rabies Immunoglobulin 200 IU/mL)', batchNumber: 'EQB-2026-R309', currentStock: 7, lowStockThreshold: 10, expirationDate: '2027-05-10' }
        ]
      }
    });
  }
};

// ito yung pang void o write-off ng nasirang vial o typo sa clerical record nang hindi sinisira yung audit ledger
const logInventorySpoilageOrVoid = async (req, res) => {
  try {
    const { batchLotId, batchNumber, id, vialsToDeduct, reason } = req.body;
    const batchIdentifier = String(batchLotId || batchNumber || id || '').trim();

    if (!batchIdentifier) {
      return res.status(400).json({
        success: false,
        message: 'Batch Lot ID or inventory ID is required.'
      });
    }

    const deductCount = parseInt(vialsToDeduct, 10);
    if (isNaN(deductCount) || deductCount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Number of vials to deduct must be a positive integer greater than zero.'
      });
    }

    const cleanReason = (reason && typeof reason === 'string' && reason.trim())
      ? reason.trim()
      : 'Clerical Error / Spoilage Write-Off';

    const actorRole = req.authenticatedUser?.role || 'SuperAdmin';
    const actorId = req.authenticatedUser?.userId || null;

    const isObjectId = mongoose.Types.ObjectId.isValid(batchIdentifier);
    const query = isObjectId
      ? { $or: [{ _id: batchIdentifier }, { batchNumber: batchIdentifier.toUpperCase() }] }
      : { batchNumber: batchIdentifier.toUpperCase() };

    const vialRecord = await Inventory.findOne(query);

    if (!vialRecord) {
      return res.status(404).json({
        success: false,
        message: `Vaccine batch "${batchIdentifier}" not found in inventory.`
      });
    }

    if (deductCount > vialRecord.currentStock) {
      return res.status(400).json({
        success: false,
        message: `Cannot void ${deductCount} vials: only ${vialRecord.currentStock} vials available in Lot ${vialRecord.batchNumber}.`
      });
    }

    vialRecord.currentStock -= deductCount;
    if (mongoose.Types.ObjectId.isValid(actorId)) {
      vialRecord.lastUpdatedBy = actorId;
    }
    if (!Array.isArray(vialRecord.events)) {
      vialRecord.events = [];
    }
    vialRecord.events.push({
      eventType: 'SPOILAGE_WRITE_OFF',
      vialsDeducted: deductCount,
      reason: cleanReason,
      timestamp: new Date(),
      performedBy: mongoose.Types.ObjectId.isValid(actorId) ? actorId : null,
      actorRole
    });

    await vialRecord.save();

    await AuditLog.create({
      actorId: mongoose.Types.ObjectId.isValid(actorId) ? actorId : null,
      actorRole,
      actionType: 'INVENTORY_SPOILAGE_VOID',
      targetCollection: 'Inventory',
      description: `Voided/Logged spoilage of ${deductCount} vial(s) from Lot ${vialRecord.batchNumber} (${vialRecord.vaccineType}). Reason: ${cleanReason}. Remaining stock: ${vialRecord.currentStock}.`,
      ipAddress: req.ip || '127.0.0.1'
    });

    // Universal audit trail: stock write-off
    await logActivity(
      actorRole,
      AUDIT_EVENTS.STOCK_WRITTEN_OFF,
      `Wrote off ${deductCount} vial(s) from Lot ${vialRecord.batchNumber} (${vialRecord.vaccineType}). Reason: ${cleanReason}. Remaining stock: ${vialRecord.currentStock}.`,
      {
        actorId,
        ipAddress: req.ip || '127.0.0.1',
        targetCollection: 'Inventory',
        metadata: {
          batchNumber: vialRecord.batchNumber,
          vaccineType: vialRecord.vaccineType,
          vialsDeducted: deductCount,
          reason: cleanReason
        }
      }
    );

    return res.status(200).json({
      success: true,
      message: `Successfully voided ${deductCount} vial(s) from Lot ${vialRecord.batchNumber}. Remaining stock: ${vialRecord.currentStock}.`,
      data: {
        batchLotId: vialRecord.batchNumber,
        vialsDeducted: deductCount,
        remainingStock: vialRecord.currentStock,
        reason: cleanReason,
        vialRecord
      }
    });
  } catch (error) {
    console.error('Inventory spoilage void error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to process inventory spoilage write-off.'
    });
  }
};

// Dynamic Mongoose queries for system audit logs and analytics summary
const getSystemAuditLogsAndAnalyticsSummary = async (req, res) => {
  try {
    const baseAnalytics = getDefaultPySparkAnalytics();

    const [totalPatients, recentAuditLogs, inventory] = await Promise.all([
      Patient.countDocuments(),
      AuditLog.find({}).sort({ timestamp: -1 }).limit(50),
      Inventory.find({}).sort({ expirationDate: 1 })
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
  } catch (error) {
    console.error('Get overview summary error:', error.message);
    // Fallback: return demo data if MongoDB is unreachable
    const { getDefaultPySparkAnalytics, enrichForecastWithLiveInventory } = require('./physicianController');
    const baseAnalytics = getDefaultPySparkAnalytics();
    const inventory = [
      { _id: '1', vaccineType: 'anti-rabies', brandName: 'Verorab (Purified Vero Cell Rabies Vaccine)', batchNumber: 'VRB-2026-A104', currentStock: 84, lowStockThreshold: 15, expirationDate: '2027-06-30' },
      { _id: '2', vaccineType: 'anti-rabies', brandName: 'Speeda (Purified Vero Cell Vaccine)', batchNumber: 'SPD-2026-C219', currentStock: 42, lowStockThreshold: 15, expirationDate: '2027-08-15' },
      { _id: '3', vaccineType: 'anti-tetanus', brandName: 'Tetavax (Adsorbed Tetanus Toxoid 0.5mL)', batchNumber: 'TTX-2026-B204', currentStock: 36, lowStockThreshold: 10, expirationDate: '2027-03-20' },
      { _id: '4', vaccineType: 'ERIG', brandName: 'Equirab (Equine Rabies Immunoglobulin 200 IU/mL)', batchNumber: 'EQB-2026-R309', currentStock: 7, lowStockThreshold: 10, expirationDate: '2027-05-10' }
    ];
    const pySparkAnalytics = enrichForecastWithLiveInventory(baseAnalytics, inventory);
    return res.status(200).json({
      success: true,
      message: 'Clinic overview data retrieved (offline mode).',
      data: {
        totalPatients: 0,
        inventory,
        recentAuditLogs: [],
        pySparkAnalytics
      }
    });
  }
};

// ito yung pang edit ng demographic lang ng pasyente, bawal galawin yung mga turok at category
const updatePatientDemographics = async (req, res) => {
  try {
    const { id } = req.params;
    // CRITICAL SECURITY: Strictly extract ONLY demographic data.
    // Medical category, dose statuses, and clinical notes are completely ignored.
    const { fullName, contactNumber, purok } = req.body;
    const actorRole = req.authenticatedUser?.role || 'SuperAdmin';
    const actorId = req.authenticatedUser?.userId || null;

    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Patient full name is required.'
      });
    }

    const cleanPhone = String(contactNumber || '').replace(/\D/g, '');
    if (!/^09\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 11-digit mobile number starting with 09 (e.g., 09171234567).'
      });
    }

    const cleanPurok = (purok && typeof purok === 'string' && purok.trim())
      ? purok.trim()
      : 'Purok 1, Kapitan Pepe';

    const patient = await Patient.findOne({
      $or: [
        { patientId: id },
        ...(mongoose.Types.ObjectId.isValid(id) ? [{ _id: id }] : [])
      ]
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient record not found.'
      });
    }

    // Explicitly update ONLY demographic fields
    patient.fullName = fullName.trim();
    patient.contactNumber = cleanPhone;
    patient.purok = cleanPurok;
    patient.barangay = cleanPurok;

    await patient.save();

    await AuditLog.create({
      actorId: mongoose.Types.ObjectId.isValid(actorId) ? actorId : null,
      actorRole,
      actionType: 'PATIENT_DEMOGRAPHICS_UPDATED',
      targetCollection: 'Patient',
      description: `Updated demographics for ${patient.fullName} (${patient.patientId}): Purok: ${cleanPurok}, Phone: ${cleanPhone}. Medical data locked.`,
      ipAddress: req.ip || '127.0.0.1'
    });

    return res.status(200).json({
      success: true,
      message: `Demographics updated for ${patient.fullName}.`,
      data: {
        patient: {
          _id: patient._id,
          patientId: patient.patientId,
          fullName: patient.fullName,
          contactNumber: patient.contactNumber,
          purok: patient.purok,
          barangay: patient.barangay,
          age: patient.age,
          sex: patient.sex,
          woundCategory: patient.woundCategory,
          clinicalStatus: patient.clinicalStatus,
          pepSchedule: patient.pepSchedule
        }
      }
    });
  } catch (error) {
    console.error('Update patient demographics error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update patient demographics.'
    });
  }
};

// Actionable KPI metrics for the Clinic Overview (Dual-Path: MongoDB aggregations with seamless In-Memory fallback).
const getDashboardSummary = async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAhead = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgoStart = new Date(sevenDaysAgo);
    sevenDaysAgoStart.setUTCHours(0, 0, 0, 0);

    const isConnected = mongoose.connection && mongoose.connection.readyState === 1;

    // ------------------------------------------------------------------------
    // PATH A: MongoDB Live Database Available
    // ------------------------------------------------------------------------
    if (isConnected) {
      try {
        const [
          activePatientsCount,
          dueTodayAgg,
          triageDocs,
          overdueDocs,
          doseCompletionAgg,
          inventoryDocs,
          consumptionAgg,
          purokAgg,
          woundCatAgg,
          vectorAgg,
          peakTrafficAgg,
          newPatientsAgg,
          returningAgg
        ] = await Promise.all([
          // 1. Active PEP Patients (undergoing treatment: not Cat I and not completed/cleansing)
          Patient.countDocuments({
            woundCategory: { $ne: 'Category I' },
            clinicalStatus: { $nin: ['Completed', 'Wound Cleansing Only'] }
          }),

          // 2. Booster Doses Due Today Breakdown
          Patient.aggregate([
            { $unwind: '$pepSchedule' },
            {
              $match: {
                'pepSchedule.status': 'Pending',
                'pepSchedule.scheduledDate': { $gte: todayStart, $lt: todayEnd }
              }
            },
            {
              $group: {
                _id: '$pepSchedule.doseDay',
                patients: { $addToSet: '$_id' }
              }
            },
            {
              $project: {
                doseDay: '$_id',
                count: { $size: '$patients' }
              }
            }
          ]),

          // 3. Triage Queue (Waiting for Doctor, FIFO)
          Patient.find({
            $or: [
              { woundCategory: 'Pending' },
              { clinicalStatus: { $in: ['Waiting for Doctor', 'Needs Triage'] } }
            ]
          })
            .sort({ createdAt: 1, day0WalkInDate: 1 })
            .select('patientId fullName animalType purok barangay createdAt day0WalkInDate')
            .lean(),

          // 4. Defaulters / Overdue Patients
          Patient.find({
            $or: [
              { clinicalStatus: 'Missed Dose' },
              { 'pepSchedule.status': 'Defaulter' },
              {
                pepSchedule: {
                  $elemMatch: {
                    status: 'Pending',
                    scheduledDate: { $lt: todayStart }
                  }
                }
              }
            ]
          })
            .select('patientId fullName contactNumber pepSchedule clinicalStatus')
            .lean(),

          // 5. Dose Completion Funnel
          Patient.aggregate([
            { $unwind: '$pepSchedule' },
            {
              $match: {
                'pepSchedule.status': 'Fulfilled',
                'pepSchedule.doseDay': { $in: ['Day 0', 'Day 3', 'Day 7', 'Day 14', 'Day 28'] }
              }
            },
            {
              $group: {
                _id: '$pepSchedule.doseDay',
                distinctPatients: { $addToSet: '$_id' }
              }
            },
            {
              $project: {
                doseDay: '$_id',
                count: { $size: '$distinctPatients' }
              }
            }
          ]),

          // 6. Vaccine Inventory Batches
          Inventory.find({}).sort({ expirationDate: 1 }).lean(),

          // 7. Trailing 30-Day Vaccine Consumption across all biologics
          Patient.aggregate([
            { $unwind: '$pepSchedule' },
            {
              $match: {
                'pepSchedule.status': 'Fulfilled',
                $expr: {
                  $gte: [
                    { $ifNull: ['$pepSchedule.dateProcessed', '$pepSchedule.scheduledDate'] },
                    thirtyDaysAgo
                  ]
                }
              }
            },
            {
              $group: {
                _id: {
                  $switch: {
                    branches: [
                      { case: { $eq: ['$pepSchedule.vaccineTypeUsed', 'anti-tetanus'] }, then: 'anti-tetanus' },
                      { case: { $eq: ['$pepSchedule.vaccineTypeUsed', 'ERIG'] }, then: 'ERIG' }
                    ],
                    default: 'anti-rabies'
                  }
                },
                consumedCount: { $sum: 1 }
              }
            }
          ]),

          // 8. Purok Outbreak Aggregation
          Patient.aggregate([
            { $group: { _id: '$purok', count: { $sum: 1 } } }
          ]),

          // 9. WHO Wound Category Distribution
          Patient.aggregate([
            { $group: { _id: '$woundCategory', count: { $sum: 1 } } }
          ]),

          // 10. Animal Vector Distribution
          Patient.aggregate([
            { $group: { _id: '$animalType', count: { $sum: 1 } } }
          ]),

          // 11. Peak Traffic by Day of Week
          Patient.aggregate([
            { $group: { _id: { $dayOfWeek: '$day0WalkInDate' }, count: { $sum: 1 } } }
          ]),

          // 12. New Patients Last 7 Days
          Patient.aggregate([
            { $match: { day0WalkInDate: { $gte: sevenDaysAgoStart } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$day0WalkInDate' } }, count: { $sum: 1 } } }
          ]),

          // 13. Returning Patients Last 7 Days
          Patient.aggregate([
            { $unwind: '$pepSchedule' },
            {
              $match: {
                'pepSchedule.status': 'Fulfilled',
                'pepSchedule.doseDay': { $ne: 'Day 0' },
                'pepSchedule.dateProcessed': { $gte: sevenDaysAgoStart }
              }
            },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$pepSchedule.dateProcessed' } }, count: { $sum: 1 } } }
          ])
        ]);

        // --- Format Due Today Breakdown ---
        const dueTodayBreakdown = { day0: 0, day3: 0, day7: 0, day14: 0, day28: 0 };
        const DOSE_MAP = { 'Day 0': 'day0', 'Day 3': 'day3', 'Day 7': 'day7', 'Day 14': 'day14', 'Day 28': 'day28' };
        for (const item of dueTodayAgg || []) {
          const key = DOSE_MAP[item.doseDay];
          if (key && dueTodayBreakdown[key] !== undefined) {
            dueTodayBreakdown[key] = Number(item.count || 0);
          }
        }
        const patientsDueToday = Object.values(dueTodayBreakdown).reduce((a, b) => a + b, 0);

        // --- Format Triage Queue ---
        const triageQueue = (triageDocs || []).map((p) => ({
          id: p.patientId,
          name: p.fullName,
          animalType: p.animalType || 'Domestic Dog',
          purok: p.purok || p.barangay || 'Purok 1, Kapitan Pepe',
          arrivalTime: p.createdAt
            ? new Date(p.createdAt).toISOString()
            : (p.day0WalkInDate ? new Date(p.day0WalkInDate).toISOString() : new Date().toISOString())
        }));

        // --- Format Defaulters List ---
        const defaulters = [];
        for (const p of overdueDocs || []) {
          const missedList = (p.pepSchedule || []).filter((d) => {
            if (d.status === 'Defaulter') return true;
            if (d.status === 'Pending') {
              const dDate = new Date(d.scheduledDate);
              return dDate < todayStart;
            }
            return false;
          });

          if (missedList.length > 0) {
            missedList.sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
            const targetDose = missedList[0];
            const doseDate = new Date(targetDose.scheduledDate);
            const dueDate = doseDate.toISOString().split('T')[0];
            const diffTime = todayStart.getTime() - doseDate.getTime();
            const daysOverdue = Math.max(1, Math.floor(diffTime / (24 * 60 * 60 * 1000)));

            defaulters.push({
              id: p.patientId,
              name: p.fullName,
              phone: p.contactNumber || 'N/A',
              missedDose: targetDose.doseDay,
              dueDate,
              daysOverdue
            });
          } else if (p.clinicalStatus === 'Missed Dose') {
            defaulters.push({
              id: p.patientId,
              name: p.fullName,
              phone: p.contactNumber || 'N/A',
              missedDose: 'Booster Dose',
              dueDate: todayStart.toISOString().split('T')[0],
              daysOverdue: 1
            });
          }
        }
        defaulters.sort((a, b) => b.daysOverdue - a.daysOverdue);
        const missedDoses = defaulters.length;

        // --- Format Dose Completion Funnel ---
        const doseCompletionMap = {};
        for (const d of doseCompletionAgg || []) {
          doseCompletionMap[d.doseDay] = Number(d.count || 0);
        }
        const doseCompletion = ['Day 0', 'Day 3', 'Day 7', 'Day 14', 'Day 28'].map(
          (day) => doseCompletionMap[day] || 0
        );

        // --- Format Inventory Health & Multi-Vaccine Runway ---
        const stockByType = { 'anti-rabies': 0, 'anti-tetanus': 0, ERIG: 0 };
        const expiringBatches = [];

        for (const item of inventoryDocs || []) {
          if (stockByType[item.vaccineType] !== undefined) {
            stockByType[item.vaccineType] += Number(item.currentStock || 0);
          }
          if (item.currentStock > 0 && item.expirationDate) {
            const expDate = new Date(item.expirationDate);
            if (expDate <= sixtyDaysAhead) {
              const daysUntilExpiry = Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
              expiringBatches.push({
                vaccineType: item.vaccineType === 'anti-rabies' ? 'PVRV' : item.vaccineType,
                batchNumber: item.batchNumber,
                expirationDate: expDate.toISOString().split('T')[0],
                daysUntilExpiry
              });
            }
          }
        }
        expiringBatches.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

        const consumptionMap = {};
        for (const c of consumptionAgg || []) {
          consumptionMap[c._id] = Number(c.consumedCount || 0);
        }

        const buildVialHealth = (vType, safetyThreshold, fallbackDailyRate) => {
          const stock = stockByType[vType] || 0;
          const consumed30 = consumptionMap[vType] || 0;
          const liveDaily = consumed30 > 0 ? consumed30 / 30 : fallbackDailyRate;
          const dailyConsumption = Number(liveDaily.toFixed(1));
          const runwayDays = dailyConsumption > 0 ? Math.max(0, Math.floor(stock / dailyConsumption)) : 999;
          const lotsOfType = (inventoryDocs || []).filter((l) => l.vaccineType === vType);
          const hasCriticalBatch = lotsOfType.some(
            (l) => Number(l.currentStock || 0) <= Number(l.lowStockThreshold || safetyThreshold)
          );
          let status = 'Optimal';
          if (stock <= 0 || stock <= safetyThreshold || runwayDays <= 10 || hasCriticalBatch) {
            status = 'Critical Restock';
          } else if (runwayDays <= 21 || stock <= safetyThreshold * 1.5) {
            status = 'Reorder Soon';
          }
          return {
            stock,
            dailyConsumption,
            runwayDays,
            safetyThreshold,
            status,
            isCriticalRestock: status === 'Critical Restock'
          };
        };

        const inventoryHealth = {
          pvrv: buildVialHealth('anti-rabies', 30, 4.2),
          antiTetanus: buildVialHealth('anti-tetanus', 15, 1.5),
          erig: buildVialHealth('ERIG', 10, 0.8)
        };

        // --- Format Surveillance Maps ---
        const purokOutbreaks = {};
        const purokCounts = [];
        for (const p of purokAgg || []) {
          if (p._id) {
            purokOutbreaks[p._id] = Number(p.count || 0);
            purokCounts.push(Number(p.count || 0));
          }
        }
        const meanPurok = purokCounts.length ? purokCounts.reduce((a, b) => a + b, 0) / purokCounts.length : 0;
        const highSurgePuroks = purokCounts.filter((c) => c > meanPurok).length;

        const woundCategories = { 'Category I': 0, 'Category II': 0, 'Category III': 0, Pending: 0 };
        for (const w of woundCatAgg || []) {
          if (w._id && woundCategories[w._id] !== undefined) {
            woundCategories[w._id] = Number(w.count || 0);
          }
        }

        const vectorDistribution = { 'Domestic Dog': 0, 'Stray Dog': 0, 'Domestic Cat': 0, 'Stray Cat': 0 };
        for (const v of vectorAgg || []) {
          let vec = v._id;
          if (vec === 'Dog') vec = 'Domestic Dog';
          if (vec === 'Cat') vec = 'Domestic Cat';
          if (vec && vectorDistribution[vec] !== undefined) {
            vectorDistribution[vec] += Number(v.count || 0);
          }
        }

        // --- Format Traffic & Mix ---
        const peakTrafficByDay = [0, 0, 0, 0, 0, 0, 0];
        for (const r of peakTrafficAgg || []) {
          const idx = Number(r._id) - 1;
          if (idx >= 0 && idx < 7) peakTrafficByDay[idx] = Number(r.count || 0);
        }

        const newMap = {};
        for (const r of newPatientsAgg || []) newMap[r._id] = Number(r.count || 0);
        const returningMap = {};
        for (const r of returningAgg || []) returningMap[r._id] = Number(r.count || 0);

        const mixLabels = [];
        const mixNew = [];
        const mixReturning = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
          const dateStr = d.toISOString().split('T')[0];
          const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
          mixLabels.push(dayName);
          mixNew.push(newMap[dateStr] || 0);
          mixReturning.push(returningMap[dateStr] || 0);
        }
        const patientMix = { labels: mixLabels, new: mixNew, returning: mixReturning };

        return res.status(200).json({
          success: true,
          message: 'Dashboard summary retrieved.',
          data: {
            activePatients: activePatientsCount,
            patientsDueToday,
            dueTodayBreakdown,
            missedDoses,
            defaulters,
            triageQueue,
            inventory: inventoryHealth,
            expiringBatches,
            doseCompletion,
            purokOutbreaks,
            woundCategories,
            vectorDistribution,

            // Backwards-compatible legacy keys
            missedOverdueDoses: missedDoses,
            pvrvStock: inventoryHealth.pvrv.stock,
            pvrvStockRunwayDays: inventoryHealth.pvrv.runwayDays,
            highSurgePuroks,
            peakTrafficByDay,
            patientMix,
            erigStock: inventoryHealth.erig.stock,
            activeStaff: null,
            generatedAt: new Date().toISOString()
          }
        });
      } catch (mongoQueryErr) {
        console.warn('MongoDB query failed, falling back to in-memory store:', mongoQueryErr.message);
      }
    }

    // ------------------------------------------------------------------------
    // PATH B: Resilient In-Memory Fallback (Offline Mode or DB Query Error)
    // ------------------------------------------------------------------------
    const { inMemoryStore } = require('../config/inMemoryStore');
    const patients = inMemoryStore.patients || [];
    const inventory = inMemoryStore.inventory || [];
    const todayIso = todayStart.toISOString().split('T')[0];

    // 1. Active PEP Patients (undergoing treatment)
    const activePatientsCount = patients.filter(
      (p) => p.woundCategory !== 'Category I' && !['Completed', 'Wound Cleansing Only'].includes(p.clinicalStatus)
    ).length;

    // 2. Booster Doses Due Today Breakdown
    const dueTodayBreakdown = { day0: 0, day3: 0, day7: 0, day14: 0, day28: 0 };
    const DOSE_MAP = { 'Day 0': 'day0', 'Day 3': 'day3', 'Day 7': 'day7', 'Day 14': 'day14', 'Day 28': 'day28' };
    const distinctDueSet = new Set();
    patients.forEach((p) => {
      (p.pepSchedule || []).forEach((d) => {
        if (d.status === 'Pending') {
          const dIso = d.scheduledDate instanceof Date ? d.scheduledDate.toISOString().split('T')[0] : String(d.scheduledDate).split('T')[0];
          if (dIso === todayIso) {
            const k = DOSE_MAP[d.doseDay];
            if (k && dueTodayBreakdown[k] !== undefined) {
              dueTodayBreakdown[k] += 1;
              distinctDueSet.add(p.patientId || String(p._id));
            }
          }
        }
      });
    });
    const patientsDueToday = distinctDueSet.size;

    // 3. Triage Queue (Waiting for Doctor, FIFO)
    const triageQueue = patients
      .filter((p) => p.woundCategory === 'Pending' || ['Waiting for Doctor', 'Needs Triage'].includes(p.clinicalStatus))
      .sort((a, b) => new Date(a.createdAt || a.day0WalkInDate || Date.now()) - new Date(b.createdAt || b.day0WalkInDate || Date.now()))
      .map((p) => ({
        id: p.patientId,
        name: p.fullName,
        animalType: p.animalType || 'Domestic Dog',
        purok: p.purok || p.barangay || 'Purok 1, Kapitan Pepe',
        arrivalTime: (p.createdAt ? new Date(p.createdAt) : new Date(p.day0WalkInDate || Date.now())).toISOString()
      }));

    // 4. Defaulters / Overdue Patients (sorted by daysOverdue descending)
    const defaulters = [];
    patients.forEach((p) => {
      const missedList = (p.pepSchedule || []).filter((d) => {
        if (d.status === 'Defaulter') return true;
        if (d.status === 'Pending') {
          const dDate = new Date(d.scheduledDate);
          return dDate < todayStart;
        }
        return false;
      });

      if (missedList.length > 0) {
        missedList.sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
        const target = missedList[0];
        const doseDate = new Date(target.scheduledDate);
        const daysOverdue = Math.max(1, Math.floor((todayStart.getTime() - doseDate.getTime()) / (24 * 60 * 60 * 1000)));
        defaulters.push({
          id: p.patientId,
          name: p.fullName,
          phone: p.contactNumber || 'N/A',
          missedDose: target.doseDay,
          dueDate: doseDate.toISOString().split('T')[0],
          daysOverdue
        });
      } else if (p.clinicalStatus === 'Missed Dose') {
        defaulters.push({
          id: p.patientId,
          name: p.fullName,
          phone: p.contactNumber || 'N/A',
          missedDose: 'Booster Dose',
          dueDate: todayIso,
          daysOverdue: 1
        });
      }
    });
    defaulters.sort((a, b) => b.daysOverdue - a.daysOverdue);
    const missedDoses = defaulters.length;

    // 5. Dose Completion Funnel
    const patientDoseSets = { 'Day 0': new Set(), 'Day 3': new Set(), 'Day 7': new Set(), 'Day 14': new Set(), 'Day 28': new Set() };
    patients.forEach((p) => {
      (p.pepSchedule || []).forEach((d) => {
        if (d.status === 'Fulfilled' && patientDoseSets[d.doseDay]) {
          patientDoseSets[d.doseDay].add(p.patientId || String(p._id));
        }
      });
    });
    const doseCompletion = ['Day 0', 'Day 3', 'Day 7', 'Day 14', 'Day 28'].map((day) => patientDoseSets[day].size);

    // 6. Inventory & FEFO Expiring Batches
    const stockByType = { 'anti-rabies': 0, 'anti-tetanus': 0, ERIG: 0 };
    const expiringBatches = [];
    inventory.forEach((item) => {
      if (stockByType[item.vaccineType] !== undefined) {
        stockByType[item.vaccineType] += Number(item.currentStock || 0);
      }
      if (item.currentStock > 0 && item.expirationDate) {
        const expDate = new Date(item.expirationDate);
        if (expDate <= sixtyDaysAhead) {
          const daysUntilExpiry = Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
          expiringBatches.push({
            vaccineType: item.vaccineType === 'anti-rabies' ? 'PVRV' : item.vaccineType,
            batchNumber: item.batchNumber,
            expirationDate: expDate.toISOString().split('T')[0],
            daysUntilExpiry
          });
        }
      }
    });
    expiringBatches.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

    // 7. 30-Day Live Consumption
    const consumptionCounts = { 'anti-rabies': 0, 'anti-tetanus': 0, ERIG: 0 };
    patients.forEach((p) => {
      (p.pepSchedule || []).forEach((d) => {
        if (d.status === 'Fulfilled') {
          const pDate = new Date(d.dateProcessed || d.scheduledDate);
          if (pDate >= thirtyDaysAgo) {
            let vType = d.vaccineTypeUsed || 'anti-rabies';
            if (vType === 'PVRV') vType = 'anti-rabies';
            if (consumptionCounts[vType] !== undefined) {
              consumptionCounts[vType] += 1;
            } else {
              consumptionCounts['anti-rabies'] += 1;
            }
          }
        }
      });
    });

    const buildVialHealth = (vType, safetyThreshold, fallbackDailyRate) => {
      const stock = stockByType[vType] || 0;
      const consumed30 = consumptionCounts[vType] || 0;
      const liveDaily = consumed30 > 0 ? consumed30 / 30 : fallbackDailyRate;
      const dailyConsumption = Number(liveDaily.toFixed(1));
      const runwayDays = dailyConsumption > 0 ? Math.max(0, Math.floor(stock / dailyConsumption)) : 999;
      const lotsOfType = inventory.filter((l) => l.vaccineType === vType);
      const hasCriticalBatch = lotsOfType.some(
        (l) => Number(l.currentStock || 0) <= Number(l.lowStockThreshold || safetyThreshold)
      );
      let status = 'Optimal';
      if (stock <= 0 || stock <= safetyThreshold || runwayDays <= 10 || hasCriticalBatch) {
        status = 'Critical Restock';
      } else if (runwayDays <= 21 || stock <= safetyThreshold * 1.5) {
        status = 'Reorder Soon';
      }
      return {
        stock,
        dailyConsumption,
        runwayDays,
        safetyThreshold,
        status,
        isCriticalRestock: status === 'Critical Restock'
      };
    };

    const inventoryHealth = {
      pvrv: buildVialHealth('anti-rabies', 30, 4.2),
      antiTetanus: buildVialHealth('anti-tetanus', 15, 1.5),
      erig: buildVialHealth('ERIG', 10, 0.8)
    };

    // 8. Surveillance Maps
    const purokOutbreaks = {};
    patients.forEach((p) => {
      const pk = p.purok || p.barangay || 'Purok 1, Kapitan Pepe';
      purokOutbreaks[pk] = (purokOutbreaks[pk] || 0) + 1;
    });
    const pCounts = Object.values(purokOutbreaks);
    const meanPurok = pCounts.length ? pCounts.reduce((a, b) => a + b, 0) / pCounts.length : 0;
    const highSurgePuroks = pCounts.filter((c) => c > meanPurok).length;

    const woundCategories = { 'Category I': 0, 'Category II': 0, 'Category III': 0, Pending: 0 };
    patients.forEach((p) => {
      const wc = p.woundCategory || 'Pending';
      if (woundCategories[wc] !== undefined) {
        woundCategories[wc] += 1;
      }
    });

    const vectorDistribution = { 'Domestic Dog': 0, 'Stray Dog': 0, 'Domestic Cat': 0, 'Stray Cat': 0 };
    patients.forEach((p) => {
      let vec = p.animalType || 'Domestic Dog';
      if (vec === 'Dog') vec = 'Domestic Dog';
      if (vec === 'Cat') vec = 'Domestic Cat';
      if (vectorDistribution[vec] !== undefined) {
        vectorDistribution[vec] += 1;
      }
    });

    // 9. Peak Traffic & Patient Mix
    const peakTrafficByDay = [0, 0, 0, 0, 0, 0, 0];
    patients.forEach((p) => {
      if (p.day0WalkInDate) {
        const d = new Date(p.day0WalkInDate);
        const dayOfWeek = d.getUTCDay();
        if (dayOfWeek >= 0 && dayOfWeek < 7) {
          peakTrafficByDay[dayOfWeek] += 1;
        }
      }
    });

    const mixLabels = [];
    const mixNew = [];
    const mixReturning = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      mixLabels.push(dayName);

      const newCount = patients.filter((p) => {
        if (!p.day0WalkInDate) return false;
        const walkIso = p.day0WalkInDate instanceof Date ? p.day0WalkInDate.toISOString().split('T')[0] : String(p.day0WalkInDate).split('T')[0];
        return walkIso === dateStr;
      }).length;
      mixNew.push(newCount);

      let retCount = 0;
      patients.forEach((p) => {
        (p.pepSchedule || []).forEach((dose) => {
          if (dose.status === 'Fulfilled' && dose.doseDay !== 'Day 0') {
            const procIso = dose.dateProcessed
              ? (dose.dateProcessed instanceof Date ? dose.dateProcessed.toISOString().split('T')[0] : String(dose.dateProcessed).split('T')[0])
              : null;
            if (procIso === dateStr) retCount += 1;
          }
        });
      });
      mixReturning.push(retCount);
    }
    const patientMix = { labels: mixLabels, new: mixNew, returning: mixReturning };

    return res.status(200).json({
      success: true,
      message: 'Dashboard summary retrieved (in-memory store fallback).',
      data: {
        activePatients: activePatientsCount,
        patientsDueToday,
        dueTodayBreakdown,
        missedDoses,
        defaulters,
        triageQueue,
        inventory: inventoryHealth,
        expiringBatches,
        doseCompletion,
        purokOutbreaks,
        woundCategories,
        vectorDistribution,

        // Backwards-compatible legacy keys
        missedOverdueDoses: missedDoses,
        pvrvStock: inventoryHealth.pvrv.stock,
        pvrvStockRunwayDays: inventoryHealth.pvrv.runwayDays,
        highSurgePuroks,
        peakTrafficByDay,
        patientMix,
        erigStock: inventoryHealth.erig.stock,
        activeStaff: null,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Get dashboard summary error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to load dashboard summary.'
    });
  }
};

// GET /api/audit-logs -> the 50 most recent audit entries, newest first.
const getRecentAuditLogs = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const logs = await AuditLog.find({}).sort({ timestamp: -1 }).limit(limit);

    return res.status(200).json({
      success: true,
      message: 'Recent audit trail retrieved.',
      data: { auditLogs: logs, count: logs.length }
    });
  } catch (error) {
    console.error('Get recent audit logs error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to load the audit trail.'
    });
  }
};

// Records a data-privacy event when a CSV export is generated.
const logDataExport = async (req, res) => {
  try {
    const { format } = req.body || {};
    const actorUser = req.authenticatedUser || req.user || { role: 'SuperAdmin', userId: null };
    const exportType = String(format || '').toLowerCase();

    if (!['masked', 'unmasked'].includes(exportType)) {
      return res.status(400).json({
        success: false,
        message: 'Export format must be "masked" or "unmasked".'
      });
    }

    const isUnmasked = exportType === 'unmasked';

    await logActivity(
      actorUser.role,
      isUnmasked ? AUDIT_EVENTS.EXPORT_UNMASKED : AUDIT_EVENTS.EXPORT_MASKED,
      isUnmasked
        ? 'Authorized download of raw clinical data via SuperAdmin password verification'
        : 'Downloaded sanitized RA-10173 analytics report',
      {
        actorId: actorUser.userId,
        ipAddress: req.ip || '127.0.0.1',
        targetCollection: 'Export',
        metadata: { exportFormat: exportType, authorized: isUnmasked }
      }
    );

    return res.status(200).json({
      success: true,
      message: isUnmasked
        ? 'Unmasked export recorded in the audit trail.'
        : 'Masked export recorded in the audit trail.'
    });
  } catch (error) {
    console.error('Log data export error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to record the export activity.'
    });
  }
};

module.exports = {
  createStaffUserAccount,
  updateStaffUserAccount,
  deleteStaffUserAccount,
  toggleStaffAccountStatus,
  getAllStaffUsers,
  addOrRestockVaccineBatch,
  getInventoryStatusAndAlerts,
  logInventorySpoilageOrVoid,
  getSystemAuditLogsAndAnalyticsSummary,
  updatePatientDemographics,
  getDashboardSummary,
  getRecentAuditLogs,
  logDataExport
};

//Si alonto to po gumawa nito 
//Manual coding nya ginawa
//ash sa database shcem 
//merc full stack 
//vincent qa and leader  
