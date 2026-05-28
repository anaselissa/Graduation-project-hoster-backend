import { body, validationResult } from 'express-validator';

export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

export const validateUserRegistration = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('first_name').trim().notEmpty(),
  body('last_name').trim().notEmpty(),
  body('user_type').isIn(['family', 'volunteer']).withMessage('user_type must be family or volunteer'),
  body('phone').optional(),
];

export const validateUserLogin = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

export const validateServiceRequest = [
  body('description').optional().trim(),
  body('title').optional().trim(),
  body('urgency').optional().isIn(['low', 'normal', 'high', 'urgent']),
  body('location_latitude').optional().isFloat(),
  body('location_longitude').optional().isFloat(),
  body('service_type_id').optional().isUUID(),
];