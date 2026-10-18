const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const Inventory = require('../models/Inventory');
const AuditLog = require('../models/AuditLog');

// ito yung anu, pang compute ng Day 0, 3, 7, 14, 28 simula nung araw na pumunta yung walk in
const calculatePepSchedule = (day0WalkInDate, administerDay0Now = false) => {
  const baseDate = day0WalkInDate ? new Date(day0WalkInDate) : new Date();
  const regimenOffsets = [0, 3, 7, 14, 28];

  return regimenOffsets.map((offsetDays) => {
    const scheduledDate = new Date(baseDate);
    scheduledDate.setDate(baseDate.getDate() + offsetDays);
    const isDay0Fulfilled = offsetDays === 0 && administerDay0Now;

    return {
      doseDay: `Day ${offsetDays}`,
      dayOffset: offsetDays,
      scheduledDate: scheduledDate,
      status: isDay0Fulfilled ? 'Fulfilled' : 'Pending',
      doseAdministered: isDay0Fulfilled,
      vaccineTypeUsed: 'anti-rabies',
      dateProcessed: isDay0Fulfilled ? new Date() : null
    };
  });
};

// ito yung sa inventory, babawas ng 1 vial pag nag turok na, yung malapit ng mag expire uunahin
const deductInventoryVial = async (vaccineType, isMongoConnected) => {
  if (isMongoConnected) {
    const vialStock = await Inventory.findOne({
      vaccineType: vaccineType,
      currentStock: { $gt: 0 }
    }).sort({ expirationDate: 1 });

    if (!vialStock) {
      return null;
    }

    vialStock.currentStock -= 1;
    await vialStock.save();

    return {
      remainingStock: vialStock.currentStock,
      batchNumber: vialStock.batchNumber,
      lowStockThreshold: vialStock.lowStockThreshold || 10,
      isLowStock: vialStock.currentStock <= (vialStock.lowStockThreshold || 10)
    };
  } else {
    const vialStock = global.clinicMemoryStore.inventory.find(
      (item) => item.vaccineType === vaccineType && item.currentStock > 0
    );

    if (!vialStock) {
      return null;
    }

    vialStock.currentStock -= 1;

    return {
      remainingStock: vialStock.currentStock,
      batchNumber: vialStock.batchNumber,
      lowStockThreshold: vialStock.lowStockThreshold || 10,
      isLowStock: vialStock.currentStock <= (vialStock.lowStockThreshold || 10)
    };
  }
};

// ito yung pang register ng walk in sa front desk, save ng info tapos lagay sa pila ni doc
const registerWalkInPatient = async (req, res) => {
  try {
    const {
      fullName,
      age,
      sex,
      contactNumber,
      purok,
      barangay,
      consentGiven,
      day0WalkInDate,
      animalType,
      biteSite,
      biteStatus
    } = req.body;

    if (consentGiven !== true && consentGiven !== 'true') {
      return res.status(400).json({
        success: false,
        message: 'Patient consent must be confirmed before check-in.'
      });
    }

    const numericAge = Number(age);
    if (Number.isNaN(numericAge) || numericAge < 0 || numericAge > 120) {
      return res.status(400).json({
        success: false,
        message: 'Patient age must be a valid number between 0 and 120.'
      });
    }

    const normalizedPhone = String(contactNumber || '').replace(/\D/g, '');
    if (!/^09\d{9}$/.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 11-digit mobile number starting with 09 (e.g., 09171234567).'
      });
    }

    const resolvedAddress = (purok || barangay || 'Purok 1 (Centro), Brgy. D.S. Garcia').trim();
    const resolvedBiteStatus = (biteStatus || 'Bite - Unprovoked').trim();
    const walkInDateObj = day0WalkInDate ? new Date(day0WalkInDate) : new Date();

    const scheduledDates = calculatePepSchedule(walkInDateObj, false);
    const isMongoConnected = mongoose.connection.readyState === 1;
    const actorUser = req.user || req.authenticatedUser || { role: 'Receptionist', userId: null };

    let patientId = `PEP-2026-${String(Math.floor(100 + Math.random() * 900)).padStart(3, '0')}`;
    let patientRecord = null;

    if (isMongoConnected) {
      const count = await Patient.countDocuments();
      patientId = `PEP-2026-${String(count + 1).padStart(3, '0')}`;
      const exists = await Patient.findOne({ patientId });
      if (exists) {
        patientId = `PEP-2026-${String(count + 101).padStart(3, '0')}`;
      }

      patientRecord = await Patient.create({
        patientId,
        fullName: fullName.trim(),
        age: numericAge,
        sex,
        contactNumber: normalizedPhone,
        purok: resolvedAddress,
        barangay: resolvedAddress,
        consentGiven: true,
        day0WalkInDate: walkInDateObj,
        animalType: animalType || 'Dog',
        biteSite: biteSite.trim(),
        biteStatus: resolvedBiteStatus,
        woundCategory: 'Pending',
        clinicalStatus: 'Waiting for Doctor',
        checkedInForTriage: true,
        allergyNotes: 'Pending Physician Assessment',
        clinicalNotes: '',
        pepSchedule: scheduledDates
      });

      await AuditLog.create({
        actorId: mongoose.Types.ObjectId.isValid(actorUser.userId) ? actorUser.userId : null,
        actorRole: actorUser.role,
        actionType: 'WALKIN_SENT_TO_DOCTOR_QUEUE',
        targetCollection: 'Patient',
        description: `Checked in walk-in ${patientRecord.fullName} (${patientId}) from ${resolvedAddress} and sent to Doctor's Queue.`,
        ipAddress: req.ip || '127.0.0.1'
      });
    } else {
      const count = global.clinicMemoryStore.patients.length;
      patientId = `PEP-2026-${String(count + 1).padStart(3, '0')}`;

      patientRecord = {
        _id: `pat-${Date.now()}`,
        patientId,
        fullName: fullName.trim(),
        age: numericAge,
        sex,
        contactNumber: normalizedPhone,
        purok: resolvedAddress,
        barangay: resolvedAddress,
        consentGiven: true,
        day0WalkInDate: walkInDateObj.toISOString().split('T')[0],
        animalType: animalType || 'Dog',
        biteSite: biteSite.trim(),
        biteStatus: resolvedBiteStatus,
        woundCategory: 'Pending',
        clinicalStatus: 'Waiting for Doctor',
        checkedInForTriage: true,
        allergyNotes: 'Pending Physician Assessment',
        clinicalNotes: '',
        pepSchedule: scheduledDates.map((d) => ({
          ...d,
          scheduledDate: d.scheduledDate.toISOString().split('T')[0]
        }))
      };

      global.clinicMemoryStore.patients.unshift(patientRecord);
      global.clinicMemoryStore.auditLogs.unshift({
        timestamp: new Date().toISOString(),
        actorRole: actorUser.role,
        actionType: 'WALKIN_SENT_TO_DOCTOR_QUEUE',
        description: `Checked in walk-in ${patientRecord.fullName} (${patientId}) from ${resolvedAddress} and sent to Doctor's Queue.`
      });
    }

    return res.status(200).json({
      success: true,
      message: `Added ${patientRecord.fullName} to Doctor's Queue`,
      data: {
        patientRecord
      }
    });
  } catch (error) {
    console.error('Register walk-in patient error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to check in walk-in patient.'
    });
  }
};

// ito yung pang check in ng bumalik na pasyente para sa Day 3, 7, 14 o 28
const checkInReturningPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const isMongoConnected = mongoose.connection.readyState === 1;
    const actorUser = req.user || req.authenticatedUser || { role: 'Receptionist', userId: null };

    let patientRecord = null;
    if (isMongoConnected) {
      patientRecord = await Patient.findOne({
        $or: [
          { patientId: patientId },
          ...(mongoose.Types.ObjectId.isValid(patientId) ? [{ _id: patientId }] : [])
        ]
      });

      if (!patientRecord) {
        return res.status(404).json({
          success: false,
          message: 'Patient record not found.'
        });
      }

      patientRecord.checkedInForTriage = true;
      patientRecord.clinicalStatus = 'Due Today';
      await patientRecord.save();

      await AuditLog.create({
        actorId: mongoose.Types.ObjectId.isValid(actorUser.userId) ? actorUser.userId : null,
        actorRole: actorUser.role,
        actionType: 'FOLLOWUP_PATIENT_CHECKED_IN',
        targetCollection: 'Patient',
        description: `Checked in returning patient ${patientRecord.fullName} (${patientRecord.patientId}) for booster dose.`,
        ipAddress: req.ip || '127.0.0.1'
      });
    } else {
      patientRecord = global.clinicMemoryStore.patients.find(
        (p) => p.patientId === patientId || p._id === patientId
      );

      if (!patientRecord) {
        return res.status(404).json({
          success: false,
          message: 'Patient record not found.'
        });
      }

      patientRecord.checkedInForTriage = true;
      patientRecord.clinicalStatus = 'Due Today';
      global.clinicMemoryStore.auditLogs.unshift({
        timestamp: new Date().toISOString(),
        actorRole: actorUser.role,
        actionType: 'FOLLOWUP_PATIENT_CHECKED_IN',
        description: `Checked in returning patient ${patientRecord.fullName} (${patientRecord.patientId}) for booster dose.`
      });
    }

    return res.status(200).json({
      success: true,
      message: `Patient ${patientRecord.fullName} checked in and sent to Doctor's Queue`,
      data: {
        patientRecord
      }
    });
  } catch (error) {
    console.error('Check-in returning patient error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to check in returning patient.'
    });
  }
};

// ito yung pang log ng turok o pang mark na hindi sumipot, doc lang pwede dito
const processScheduledDose = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { doseDay, doseAdministered, vaccineType = 'anti-rabies' } = req.body;

    const isShotGiven = doseAdministered === true || doseAdministered === 'true';
    const isMongoConnected = mongoose.connection.readyState === 1;
    const actorUser = req.user || req.authenticatedUser || { role: 'Physician', userId: null };

    let patientRecord = null;
    if (isMongoConnected) {
      patientRecord = await Patient.findOne({
        $or: [
          { patientId: patientId },
          ...(mongoose.Types.ObjectId.isValid(patientId) ? [{ _id: patientId }] : [])
        ]
      });
    } else {
      patientRecord = global.clinicMemoryStore.patients.find(
        (p) => p.patientId === patientId || p._id === patientId
      );
    }

    if (!patientRecord) {
      return res.status(404).json({
        success: false,
        message: 'Patient record not found.'
      });
    }

    const targetDose = patientRecord.pepSchedule.find((d) => d.doseDay === doseDay);
    if (!targetDose) {
      return res.status(404).json({
        success: false,
        message: `Scheduled ${doseDay} dose not found for this patient.`
      });
    }

    if (targetDose.status === 'Fulfilled') {
      return res.status(400).json({
        success: false,
        message: `Cannot log dose: ${doseDay} has already been completed and cannot be deducted twice.`
      });
    }

    let vialsDeducted = 0;
    let deductionDetails = null;

    if (isShotGiven) {
      deductionDetails = await deductInventoryVial(vaccineType, isMongoConnected);

      if (deductionDetails === null) {
        return res.status(400).json({
          success: false,
          message: 'Cannot log dose: Selected vaccine batch is out of stock. Please notify Admin.'
        });
      }

      targetDose.status = 'Fulfilled';
      targetDose.doseAdministered = true;
      targetDose.vaccineTypeUsed = vaccineType;
      targetDose.dateProcessed = new Date();
      const allDone = (patientRecord.pepSchedule || []).every((d) => d.status === 'Fulfilled');
      patientRecord.clinicalStatus = allDone ? 'Completed' : 'Under Treatment';
      patientRecord.checkedInForTriage = false;
      vialsDeducted = 1;
    } else {
      targetDose.status = 'Defaulter';
      targetDose.doseAdministered = false;
      targetDose.dateProcessed = new Date();
      patientRecord.clinicalStatus = 'Missed Dose';
      vialsDeducted = 0;
    }

    if (isMongoConnected && typeof patientRecord.save === 'function') {
      await patientRecord.save();
      await AuditLog.create({
        actorId: mongoose.Types.ObjectId.isValid(actorUser.userId) ? actorUser.userId : null,
        actorRole: actorUser.role,
        actionType: isShotGiven ? 'DOSE_FULFILLED_VIAL_DEDUCTED' : 'DOSE_FLAGGED_DEFAULTER',
        targetCollection: 'Patient',
        description: `${patientRecord.patientId} (${doseDay}) marked ${targetDose.status}. Vials deducted: ${vialsDeducted} (${vaccineType}).`,
        ipAddress: req.ip || '127.0.0.1'
      });
    } else {
      global.clinicMemoryStore.auditLogs.unshift({
        timestamp: new Date().toISOString(),
        actorRole: actorUser.role,
        actionType: isShotGiven ? 'DOSE_FULFILLED_VIAL_DEDUCTED' : 'DOSE_FLAGGED_DEFAULTER',
        description: `${patientRecord.patientId} (${doseDay}) marked ${targetDose.status}. Vials deducted: ${vialsDeducted} (${vaccineType}).`
      });
    }

    return res.status(200).json({
      success: true,
      message: isShotGiven
        ? `${doseDay} dose logged. 1 ${vaccineType} vial deducted from Lot ${deductionDetails.batchNumber}.`
        : `${doseDay} marked as missed visit (0 vials deducted).`,
      data: {
        patientRecord,
        processedDose: targetDose,
        vialsDeducted,
        batchNumber: deductionDetails ? deductionDetails.batchNumber : null,
        remainingStock: deductionDetails ? deductionDetails.remainingStock : null,
        isLowStock: deductionDetails ? deductionDetails.isLowStock : false
      }
    });
  } catch (error) {
    console.error('Process scheduled dose error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to process scheduled dose.'
    });
  }
};

// ito yung kukuha ng mga pasyente tsaka ng mga naka pila
const getPatientsAndDailyQueue = async (req, res) => {
  try {
    const queryText = (req.query.query || '').trim();
    const isMongoConnected = mongoose.connection.readyState === 1;

    if (isMongoConnected) {
      let filter = {};
      if (queryText.length > 0) {
        const safeText = queryText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(safeText, 'i');
        filter = {
          $or: [
            { patientId: regex },
            { fullName: regex },
            { purok: regex },
            { barangay: regex },
            { contactNumber: regex }
          ]
        };
      }

      const patients = await Patient.find(filter).sort({ patientId: 1 }).limit(100);

      return res.status(200).json({
        success: true,
        message: 'Patient queue retrieved.',
        data: {
          count: patients.length,
          patients
        }
      });
    } else {
      const lowerQuery = queryText.toLowerCase();
      const patients = global.clinicMemoryStore.patients.filter((p) => {
        if (!lowerQuery) return true;
        return (
          p.patientId.toLowerCase().includes(lowerQuery) ||
          p.fullName.toLowerCase().includes(lowerQuery) ||
          (p.purok || '').toLowerCase().includes(lowerQuery) ||
          (p.barangay || '').toLowerCase().includes(lowerQuery)
        );
      });

      return res.status(200).json({
        success: true,
        message: 'Patient queue retrieved.',
        data: {
          count: patients.length,
          patients
        }
      });
    }
  } catch (error) {
    console.error('Get patients queue error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to load patient queue.'
    });
  }
};

module.exports = {
  calculatePepSchedule,
  calculatePepScheduleDates: calculatePepSchedule,
  deductInventoryVial,
  registerWalkInPatient,
  checkInReturningPatient,
  processScheduledDose,
  getPatientsAndDailyQueue
};
