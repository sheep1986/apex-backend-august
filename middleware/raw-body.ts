import { Request, Response, NextFunction } from 'express';
import express from 'express';

// Extended Request type to include rawBody
export interface RequestWithRawBody extends Request {
  rawBody?: string;
}

/**
 * Middleware to capture raw body for webhook signature verification
 * MUST be used before any other body parsing middleware
 */
export const rawBodyMiddleware = express.json({
  verify: (req: RequestWithRawBody, res: Response, buf: Buffer, encoding: string) => {
    // Store raw body as string for signature verification
    req.rawBody = buf.toString('utf8');
    
    // Also store as buffer if needed
    (req as any).rawBodyBuffer = buf;
    
    console.log('📦 Raw body captured:', {
      size: buf.length,
      hasBody: !!req.rawBody,
      url: req.url
    });
  }
});

/**
 * Middleware specifically for webhook endpoints that need raw body
 * Use this for specific routes that need signature verification
 */
export const webhookRawBodyMiddleware = express.raw({
  type: 'application/json',
  verify: (req: RequestWithRawBody, res: Response, buf: Buffer) => {
    req.rawBody = buf.toString('utf8');
    (req as any).rawBodyBuffer = buf;
  }
});