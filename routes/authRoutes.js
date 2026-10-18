const express = require('express');
const { body, validationResult } = require('express-validator');
const {
  initiateLoginStepOne,
  verifyMfaOtpStepTwo,
  logoutCurrentSession,
  getCurrentUserProfile
} = require('../controllers/authController');
const { verifyAuthenticationToken } = require('../middleware/authMiddleware');

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

const verifyOtpValidators = [
  body('email').isEmail().withMessage('Valid clinic email is required.'),
  body('otpCode')
    .trim()
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('Invalid verification code. Please try again.'),
  handleValidationErrors
];

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Please enter a valid clinic email address.'),
    body('password').notEmpty().withMessage('Password is required.'),
    handleValidationErrors
  ],
  initiateLoginStepOne
);

router.post('/verify-mfa', verifyOtpValidators, verifyMfaOtpStepTwo);
router.post('/verify-otp', verifyOtpValidators, verifyMfaOtpStepTwo);

router.post('/logout', logoutCurrentSession);
router.get('/me', verifyAuthenticationToken, getCurrentUserProfile);

module.exports = router;
