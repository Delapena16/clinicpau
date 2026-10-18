const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');

// dito ichecheck kung tama yung role ng naka login bago makapasok
const authorizeRoles = (...allowedRoles) => {
  return async (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: 'Please sign in first.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      if (mongoose.connection.readyState === 1) {
        try {
          await AuditLog.create({
            actorId: mongoose.Types.ObjectId.isValid(req.user.userId) ? req.user.userId : null,
            actorRole: req.user.role,
            actionType: 'ROLE_ACCESS_DENIED',
            targetCollection: 'AuthSession',
            description: `Blocked ${req.user.role} from accessing ${req.method} ${req.originalUrl}`,
            ipAddress: req.ip || '127.0.0.1'
          });
        } catch (err) {
          // dito banda ignore lang pag nag error sa audit log, wag harangin yung request
        }
      } else if (global.clinicMemoryStore) {
        global.clinicMemoryStore.auditLogs.unshift({
          timestamp: new Date().toISOString(),
          actorRole: req.user.role,
          actionType: 'ROLE_ACCESS_DENIED',
          description: `Blocked ${req.user.role} from accessing ${req.method} ${req.originalUrl}`
        });
      }

      return res.status(403).json({
        success: false,
        message: 'Access denied for your role.'
      });
    }

    next();
  };
};

module.exports = {
  authorizeRoles
};
