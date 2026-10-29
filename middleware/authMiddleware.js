const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

// dito banda ichecheck yung token sa cookie o header bago makapasok sa routes
const verifyAuthenticationToken = async (req, res, next) => {
  try {
    let token = req.cookies ? req.cookies.pep_auth_token : null;

    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Please sign in to access the clinic workspace.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.mfaVerified) {
      return res.status(401).json({
        success: false,
        message: 'Please enter your 6-digit verification code first.'
      });
    }

    if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(decoded.userId)) {
      const staffUser = await User.findById(decoded.userId).select('_id fullName email role isActive');

      if (!staffUser || !staffUser.isActive) {
        return res.status(401).json({
          success: false,
          message: 'This staff account is no longer active.'
        });
      }

      req.user = {
        userId: staffUser._id,
        fullName: staffUser.fullName,
        email: staffUser.email,
        role: staffUser.role
      };
    } else {
      req.user = {
        userId: decoded.userId,
        fullName: decoded.fullName || 'Clinic Staff',
        email: decoded.email,
        role: decoded.role
      };
    }

    req.authenticatedUser = req.user;
    next();
  } catch (error) {
    const message =
      error.name === 'TokenExpiredError'
        ? 'Your session has expired. Please sign in again.'
        : 'Invalid session token. Please sign in again.';

    return res.status(401).json({
      success: false,
      message: message
    });
  }
};

module.exports = {
  verifyAuthenticationToken
};
