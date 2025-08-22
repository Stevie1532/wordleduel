const { body, validationResult } = require('express-validator');
const config = require('../config');

// Validation rules for different endpoints
const validationRules = {
  createRoom: [
    body('username')
      .trim()
      .isLength({ min: config.MIN_USERNAME_LENGTH, max: config.MAX_USERNAME_LENGTH })
      .withMessage(`Username must be between ${config.MIN_USERNAME_LENGTH} and ${config.MAX_USERNAME_LENGTH} characters`)
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
    body('mode')
      .optional()
      .isIn(['duel', 'battleRoyale'])
      .withMessage('Mode must be either "duel" or "battleRoyale"')
  ],
  
  joinRoom: [
    body('code')
      .trim()
      .isLength({ min: 6, max: 6 })
      .withMessage('Room code must be exactly 6 characters')
      .matches(/^[A-Z0-9]+$/)
      .withMessage('Room code can only contain uppercase letters and numbers'),
    body('username')
      .trim()
      .isLength({ min: config.MIN_USERNAME_LENGTH, max: config.MAX_USERNAME_LENGTH })
      .withMessage(`Username must be between ${config.MIN_USERNAME_LENGTH} and ${config.MAX_USERNAME_LENGTH} characters`)
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Username can only contain letters, numbers, underscores, and hyphens')
  ],
  
  validateWord: [
    body('word')
      .trim()
      .isLength({ min: config.WORD_LENGTH, max: config.WORD_LENGTH })
      .withMessage(`Word must be exactly ${config.WORD_LENGTH} characters`)
      .matches(/^[a-zA-Z]+$/)
      .withMessage('Word can only contain letters')
  ],
  
  startGame: [
    body('roomCode')
      .trim()
      .isLength({ min: 6, max: 6 })
      .withMessage('Room code must be exactly 6 characters'),
    body('customWord')
      .optional()
      .trim()
      .isLength({ min: config.WORD_LENGTH, max: config.WORD_LENGTH })
      .withMessage(`Custom word must be exactly ${config.WORD_LENGTH} characters`)
      .matches(/^[a-zA-Z]+$/)
      .withMessage('Custom word can only contain letters')
  ]
};

// Middleware to check validation results
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

module.exports = {
  validationRules,
  handleValidationErrors
};
