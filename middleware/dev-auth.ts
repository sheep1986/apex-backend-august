import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    organizationId: string;
    clerkUserId: string;
  };
}

// Simple development authentication that accepts any token
export const authenticateDevUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  // In development, accept any token and use it to identify the user
  const token = authHeader.substring(7);
  
  // Mock user for development
  req.user = {
    id: 'dev-user-1',
    email: 'dev@apex.ai',
    role: 'platform_owner',
    organizationId: '550e8400-e29b-41d4-a716-446655440000', // Artificial Media org ID
    clerkUserId: 'dev-clerk-id'
  };

  console.log('🔐 Dev auth: Authenticated as', req.user.email);
  next();
}; 