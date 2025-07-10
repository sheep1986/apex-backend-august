import express from 'express';
import { Request, Response } from 'express';

const router = express.Router();

// Disable Stripe webhook for development
console.log('⚠️ Stripe webhook disabled for development');

// Placeholder route
router.post('/webhook', (req: Request, res: Response) => {
  console.log('Stripe webhook called but disabled in development');
  res.status(200).json({ 
    received: true, 
    message: 'Stripe webhook disabled in development mode' 
  });
});

export default router; 