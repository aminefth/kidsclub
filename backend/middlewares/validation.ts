import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import ErrorHandler from '../utils/ErrorHandler';

export const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => error.msg);
    return next(new ErrorHandler(errorMessages.join(', '), 400));
  }
  
  next();
};
