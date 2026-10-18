const express = require('express');
const { body, validationResult } = require('express-validator');
const {
  saveWoundAssessment,
  getPhysicianReadOnlyInventory,
  getPySparkAnalyticsSummary
} = require('../controllers/physicianController');
const {
  getPatientsAndDailyQueue,
  processScheduledDose
} = require('../controllers/receptionistController');
const { verifyAuthenticationToken } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

const router = express.Router();

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg
    });
  }
  next();
};

const triageValidators = [
  body('woundCategory')
    .isIn(['Category I', 'Category II', 'Category III'])
    .withMessage('Wound category must be Category I, Category II, or Category III.'),
  handleValidationErrors
];

const logDoseHandler = (req, res, next) => {
  req.body.doseDay = req.body.doseDay || 'Day 0';
  if (req.body.doseAdministered === undefined) {
    req.body.doseAdministered = true;
  }
  return processScheduledDose(req, res, next);
};

const logDoseValidators = [
  body('doseDay')
    .optional()
    .isIn(['Day 0', 'Day 3', 'Day 7', 'Day 14', 'Day 28'])
    .withMessage('doseDay must be Day 0, Day 3, Day 7, Day 14, or Day 28.'),
  handleValidationErrors
];

router.use(verifyAuthenticationToken);

router.get('/patients', authorizeRoles('Physician', 'SuperAdmin'), getPatientsAndDailyQueue);
router.get('/queue', authorizeRoles('Physician', 'SuperAdmin'), getPatientsAndDailyQueue);

router.get('/inventory', authorizeRoles('Physician', 'SuperAdmin'), getPhysicianReadOnlyInventory);
router.get('/batches', authorizeRoles('Physician', 'SuperAdmin'), getPhysicianReadOnlyInventory);

router.post('/patients/:patientId/assess', authorizeRoles('Physician'), triageValidators, saveWoundAssessment);
router.post('/triage/:patientId', authorizeRoles('Physician'), triageValidators, saveWoundAssessment);

router.post('/patients/:patientId/administer', authorizeRoles('Physician'), logDoseValidators, logDoseHandler);
router.post('/log-dose/:patientId', authorizeRoles('Physician'), logDoseValidators, logDoseHandler);

router.patch(
  '/patients/:patientId/schedule',
  authorizeRoles('Physician'),
  [
    body('doseDay')
      .isIn(['Day 0', 'Day 3', 'Day 7', 'Day 14', 'Day 28'])
      .withMessage('doseDay must be Day 0, Day 3, Day 7, Day 14, or Day 28.'),
    body('doseAdministered')
      .isBoolean()
      .withMessage('doseAdministered must be true or false.'),
    handleValidationErrors
  ],
  processScheduledDose
);

router.get('/analytics', authorizeRoles('SuperAdmin'), getPySparkAnalyticsSummary);

module.exports = router;
