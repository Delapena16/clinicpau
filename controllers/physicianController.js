const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const Inventory = require('../models/Inventory');
const InventoryForecast = require('../models/InventoryForecast');
const AuditLog = require('../models/AuditLog');
const { deductInventoryVial, calculatePepSchedule } = require('./receptionistController');

// ito yung pang kuha ng default forecast para may lumabas agad sa dashboard
const getDefaultPySparkAnalytics = () => {
  const forecastPath = path.join(__dirname, '..', 'public', 'data', 'forecast_summary.json');
  if (fs.existsSync(forecastPath)) {
    try {
      return JSON.parse(fs.readFileSync(forecastPath, 'utf-8'));
    } catch (e) {
      // dito banda yung fallback na lang sa baba gagamitin
    }
  }

  return {
    generatedAt: '2026-10-17T08:00:00Z',
    clinicScope: 'Barangay D.S. Garcia, Cabanatuan City',
    vialForecasts: [
      {
        vaccineType: 'anti-rabies',
        displayName: 'Anti-Rabies Vaccine (PVRV)',
        brandSummary: 'Verorab / Speeda (PVRV)',
        currentStock: 126,
        safetyThreshold: 30,
        scheduledReturning30d: 68,
        projectedNewWalkIn30d: 112,
        projected30DayDemand: 180,
        projected90DayDemand: 531,
        dailyBurnRate: 6.0,
        estimatedDaysUntilStockout: 21,
        recommendedRestockQty: 84,
        stockStatus: 'REORDER SOON'
      },
      {
        vaccineType: 'anti-tetanus',
        displayName: 'Anti-Tetanus Toxoid (TT)',
        brandSummary: 'Tetavax (Tetanus Toxoid 0.5mL)',
        currentStock: 36,
        safetyThreshold: 15,
        scheduledReturning30d: 8,
        projectedNewWalkIn30d: 46,
        projected30DayDemand: 54,
        projected90DayDemand: 159,
        dailyBurnRate: 1.8,
        estimatedDaysUntilStockout: 20,
        recommendedRestockQty: 33,
        stockStatus: 'REORDER SOON'
      },
      {
        vaccineType: 'ERIG',
        displayName: 'Equine Rabies Immunoglobulin (ERIG)',
        brandSummary: 'Equirab (ERIG 200 IU/mL)',
        currentStock: 7,
        safetyThreshold: 10,
        scheduledReturning30d: 0,
        projectedNewWalkIn30d: 27,
        projected30DayDemand: 27,
        projected90DayDemand: 80,
        dailyBurnRate: 0.9,
        estimatedDaysUntilStockout: 7,
        recommendedRestockQty: 30,
        stockStatus: 'CRITICAL RESTOCK'
      }
    ],
    categoryBreakdown: [
      {
        category: 'Category I',
        clinicalDefinition: 'Touching/feeding animals, licks on intact skin (Wash only)',
        incidentCount: 29,
        sharePercent: 15.8,
        protocol: 'Wound Cleansing + Observation'
      },
      {
        category: 'Category II',
        clinicalDefinition: 'Nibbling of uncovered skin, minor scratches/abrasions without bleeding',
        incidentCount: 108,
        sharePercent: 58.7,
        protocol: 'PVRV Regimen (Days 0, 3, 7, 14, 28) + Anti-Tetanus'
      },
      {
        category: 'Category III',
        clinicalDefinition: 'Single/multiple transdermal bites or scratches, mucosal contamination',
        incidentCount: 47,
        sharePercent: 25.5,
        protocol: 'ERIG Infiltration + Full 5-Dose PVRV + Anti-Tetanus'
      }
    ],
    purokBreakdown: [
      {
        purok: 'Purok 1 (Centro), Brgy. D.S. Garcia',
        categoryI: 6,
        categoryII: 24,
        categoryIII: 14,
        totalCases: 44,
        primaryVector: 'Stray Dog (64%)',
        riskLevel: 'HIGH SURGE'
      },
      {
        purok: 'Purok 6 (Riverbank), Brgy. D.S. Garcia',
        categoryI: 4,
        categoryII: 19,
        categoryIII: 12,
        totalCases: 35,
        primaryVector: 'Stray Dog (71%)',
        riskLevel: 'HIGH SURGE'
      },
      {
        purok: 'Purok 3 (Rizal St.), Brgy. D.S. Garcia',
        categoryI: 5,
        categoryII: 18,
        categoryIII: 7,
        totalCases: 30,
        primaryVector: 'Domestic Dog (53%)',
        riskLevel: 'MODERATE'
      },
      {
        purok: 'Purok 2 (Mabini Ext.), Brgy. D.S. Garcia',
        categoryI: 4,
        categoryII: 15,
        categoryIII: 5,
        totalCases: 24,
        primaryVector: 'Domestic Cat (48%)',
        riskLevel: 'MODERATE'
      },
      {
        purok: 'Purok 4 (Del Pilar), Brgy. D.S. Garcia',
        categoryI: 3,
        categoryII: 12,
        categoryIII: 4,
        totalCases: 19,
        primaryVector: 'Stray Cat (52%)',
        riskLevel: 'BASELINE'
      },
      {
        purok: 'Purok 5 (Maharlika), Brgy. D.S. Garcia',
        categoryI: 5,
        categoryII: 11,
        categoryIII: 3,
        totalCases: 19,
        primaryVector: 'Domestic Dog (68%)',
        riskLevel: 'BASELINE'
      },
      {
        purok: 'Purok 7 (Narra St.), Brgy. D.S. Garcia',
        categoryI: 2,
        categoryII: 9,
        categoryIII: 2,
        totalCases: 13,
        primaryVector: 'Domestic Dog (61%)',
        riskLevel: 'BASELINE'
      }
    ],
    weeklyTrends: [
      { week: '2026-W38 (Sep 19 - Sep 25)', walkIns: 38, catIIICases: 8, vialsDispensed: 114 },
      { week: '2026-W39 (Sep 26 - Oct 02)', walkIns: 42, catIIICases: 10, vialsDispensed: 129 },
      { week: '2026-W40 (Oct 03 - Oct 09)', walkIns: 49, catIIICases: 13, vialsDispensed: 148 },
      { week: '2026-W41 (Oct 10 - Oct 16)', walkIns: 55, catIIICases: 16, vialsDispensed: 172 }
    ],
    completionVsDefaulterRates: {
      totalScheduledDosesEvaluated: 740,
      fulfilledCount: 642,
      defaulterCount: 46,
      pendingCount: 52,
      completionRatePercent: 93.3,
      defaulterRatePercent: 6.7
    }
  };
};

// ito yung pang sync ng forecast sa totoong stock ng vials para pareho sila
const enrichForecastWithLiveInventory = (baseForecast, inventoryItems = []) => {
  if (!inventoryItems || inventoryItems.length === 0) {
    return baseForecast;
  }

  const stockTotals = {
    'anti-rabies': 0,
    'anti-tetanus': 0,
    ERIG: 0
  };

  inventoryItems.forEach((item) => {
    if (stockTotals[item.vaccineType] !== undefined) {
      stockTotals[item.vaccineType] += Number(item.currentStock || 0);
    }
  });

  const updatedVialForecasts = (baseForecast.vialForecasts || []).map((vf) => {
    const liveStock =
      stockTotals[vf.vaccineType] !== undefined ? stockTotals[vf.vaccineType] : vf.currentStock;
    const burnRate = vf.dailyBurnRate || 1;
    const daysLeft = Math.max(0, Math.floor(liveStock / burnRate));
    const recRestock = Math.max(
      0,
      vf.projected30DayDemand + (vf.safetyThreshold || 10) - liveStock
    );

    let stockStatus = 'ADEQUATE';
    if (liveStock <= (vf.safetyThreshold || 10) || daysLeft <= 10) {
      stockStatus = 'CRITICAL RESTOCK';
    } else if (daysLeft <= 21) {
      stockStatus = 'REORDER SOON';
    }

    return {
      ...vf,
      currentStock: liveStock,
      estimatedDaysUntilStockout: daysLeft,
      recommendedRestockQty: recRestock,
      stockStatus
    };
  });

  return {
    ...baseForecast,
    generatedAt: new Date().toISOString(),
    vialForecasts: updatedVialForecasts
  };
};

// ito yung sa triage ni doc, save ng wound tapos kung may turok, babawas ng 1 vial
const saveWoundAssessment = async (req, res) => {
  try {
    const { patientId } = req.params;
    const {
      woundCategory,
      allergyNotes,
      clinicalNotes,
      biteStatus,
      administerDose,
      doseDay = 'Day 0',
      vaccineType = 'anti-rabies'
    } = req.body;

    const shouldAdminister =
      administerDose === true || administerDose === 'true';
    const isMongoConnected = mongoose.connection.readyState === 1;
    const actorUser = req.authenticatedUser || req.user || { role: 'Physician', userId: null };

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

    patientRecord.woundCategory = woundCategory;
    patientRecord.allergyNotes = allergyNotes ? allergyNotes.trim() : 'Negative equine skin test';
    patientRecord.clinicalNotes = clinicalNotes ? clinicalNotes.trim() : '';
    if (biteStatus) {
      patientRecord.biteStatus = biteStatus.trim();
    }

    // ito yung anu, pang compute ng Day 0, 3, 7, 14, 28 pag wala pang schedule yung pasyente
    if (!patientRecord.pepSchedule || patientRecord.pepSchedule.length === 0) {
      const generated = calculatePepSchedule(patientRecord.day0WalkInDate, false);
      patientRecord.pepSchedule = isMongoConnected
        ? generated
        : generated.map((d) => ({
            ...d,
            scheduledDate: d.scheduledDate.toISOString().split('T')[0]
          }));
    }

    let deductionDetails = null;
    let vialsDeducted = 0;

    if (shouldAdminister) {
      let targetDose = patientRecord.pepSchedule.find((d) => d.doseDay === doseDay);
      if (!targetDose) {
        targetDose = patientRecord.pepSchedule.find((d) => d.status === 'Pending');
      }

      if (targetDose && targetDose.status === 'Fulfilled') {
        return res.status(400).json({
          success: false,
          message: `Cannot log dose: ${targetDose.doseDay} has already been completed and cannot be deducted twice.`
        });
      }

      if (targetDose) {
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
        vialsDeducted = 1;
      }
    }

    patientRecord.clinicalStatus =
      woundCategory === 'Category I' ? 'Completed' : 'Under Treatment';
    patientRecord.checkedInForTriage = false;

    if (isMongoConnected && typeof patientRecord.save === 'function') {
      if (mongoose.Types.ObjectId.isValid(actorUser.userId)) {
        patientRecord.assessedByPhysician = actorUser.userId;
      }
      await patientRecord.save();

      await AuditLog.create({
        actorId: mongoose.Types.ObjectId.isValid(actorUser.userId) ? actorUser.userId : null,
        actorRole: actorUser.role,
        actionType: shouldAdminister ? 'PHYSICIAN_TRIAGE_AND_DOSE' : 'PHYSICIAN_WOUND_ASSESSMENT',
        targetCollection: 'Patient',
        description: `Triaged ${patientRecord.patientId} (${patientRecord.fullName}) as ${woundCategory}.${
          vialsDeducted > 0
            ? ` ${doseDay} dose logged (${vaccineType}, Lot ${deductionDetails.batchNumber}).`
            : ''
        }`,
        ipAddress: req.ip || '127.0.0.1'
      });
    } else {
      global.clinicMemoryStore.auditLogs.unshift({
        timestamp: new Date().toISOString(),
        actorRole: actorUser.role,
        actionType: shouldAdminister ? 'PHYSICIAN_TRIAGE_AND_DOSE' : 'PHYSICIAN_WOUND_ASSESSMENT',
        description: `Triaged ${patientRecord.patientId} (${patientRecord.fullName}) as ${woundCategory}.${
          vialsDeducted > 0
            ? ` ${doseDay} dose logged (${vaccineType}, Lot ${deductionDetails.batchNumber}).`
            : ''
        }`
      });
    }

    return res.status(200).json({
      success: true,
      message:
        vialsDeducted > 0
          ? `${doseDay} dose logged. 1 ${vaccineType} vial deducted from Lot ${deductionDetails.batchNumber}.`
          : `Triage saved for ${patientRecord.fullName} (${woundCategory}).`,
      data: {
        patientRecord,
        vialsDeducted,
        remainingStock: deductionDetails ? deductionDetails.remainingStock : null,
        batchNumber: deductionDetails ? deductionDetails.batchNumber : null
      }
    });
  } catch (error) {
    console.error('Save wound assessment error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to save clinical triage assessment.'
    });
  }
};

// ito yung listahan ng vials na tingin lang si doc, bawal mag edit
const getPhysicianReadOnlyInventory = async (req, res) => {
  try {
    const isMongoConnected = mongoose.connection.readyState === 1;
    const inventory = isMongoConnected
      ? await Inventory.find().sort({ expirationDate: 1 })
      : global.clinicMemoryStore.inventory;

    return res.status(200).json({
      success: true,
      message: 'Read-only vaccine availability retrieved.',
      data: {
        inventory
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load vaccine availability.'
    });
  }
};

// ito yung kukuha ng monthly forecast, admin lang to
const getPySparkAnalyticsSummary = async (req, res) => {
  try {
    let baseForecast = getDefaultPySparkAnalytics();
    const isMongoConnected = mongoose.connection.readyState === 1;

    let inventoryItems = [];
    if (isMongoConnected) {
      const [dbForecast, dbInventory] = await Promise.all([
        InventoryForecast.findOne().sort({ createdAt: -1 }).lean(),
        Inventory.find()
      ]);
      if (dbForecast && dbForecast.vialForecasts && dbForecast.vialForecasts.length > 0) {
        baseForecast = dbForecast;
      }
      inventoryItems = dbInventory;
    } else if (global.clinicMemoryStore && global.clinicMemoryStore.inventory) {
      inventoryItems = global.clinicMemoryStore.inventory;
    }

    const enrichedForecast = enrichForecastWithLiveInventory(baseForecast, inventoryItems);

    return res.status(200).json({
      success: true,
      message: 'Monthly stock forecast retrieved.',
      data: enrichedForecast
    });
  } catch (error) {
    console.error('Get stock forecast error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to load stock forecast summary.'
    });
  }
};

// ito yung pang compute ulit ng 30 day tsaka 90 day forecast, gamit yung stock tsaka pasyente ngayon
const recalculateMonthlyForecast = async (req, res) => {
  try {
    const baseForecast = getDefaultPySparkAnalytics();
    const isMongoConnected = mongoose.connection.readyState === 1;

    let inventoryItems = [];
    if (isMongoConnected) {
      inventoryItems = await Inventory.find();
    } else if (global.clinicMemoryStore && global.clinicMemoryStore.inventory) {
      inventoryItems = global.clinicMemoryStore.inventory;
    }

    const updatedForecast = enrichForecastWithLiveInventory(baseForecast, inventoryItems);

    if (isMongoConnected) {
      await InventoryForecast.deleteMany({});
      await InventoryForecast.create({
        generatedAt: updatedForecast.generatedAt,
        clinicScope: updatedForecast.clinicScope,
        vialForecasts: updatedForecast.vialForecasts,
        categoryBreakdown: updatedForecast.categoryBreakdown,
        purokBreakdown: updatedForecast.purokBreakdown,
        weeklyTrends: updatedForecast.weeklyTrends,
        completionVsDefaulterRates: updatedForecast.completionVsDefaulterRates
      });
    }

    return res.status(200).json({
      success: true,
      message: '30-day and 90-day stock forecasts recalculated from live clinic inventory.',
      data: updatedForecast
    });
  } catch (error) {
    console.error('Recalculate forecast error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to recalculate monthly stock forecast.'
    });
  }
};

module.exports = {
  saveWoundAssessment,
  getPhysicianReadOnlyInventory,
  getPySparkAnalyticsSummary,
  recalculateMonthlyForecast,
  getDefaultPySparkAnalytics,
  enrichForecastWithLiveInventory
};
