import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@clerk/backend';

// Development mode check
const isDevelopmentMode = process.env.NODE_ENV === 'development' || process.env.ENABLE_MOCK_DATA === 'false';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    organizationId: string;
    clerkUserId: string;
  };
}

export const authenticateClerkUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // In development mode, always use mock user to avoid authentication issues
    if (isDevelopmentMode) {
      req.user = {
        id: 'dev-user-1',
        email: 'dev@example.com',
        role: 'platform_owner',
        organizationId: '550e8400-e29b-41d4-a716-446655440000',
        clerkUserId: 'user_dev123'
      };
      return next();
    }

    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // In development, provide mock user even without token
      if (isDevelopmentMode) {
        req.user = {
          id: 'dev-user-1',
          email: 'dev@example.com',
          role: 'platform_owner',
          organizationId: '550e8400-e29b-41d4-a716-446655440000',
          clerkUserId: 'user_dev123'
        };
        return next();
      }
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    
    // Skip Clerk verification in development
    if (isDevelopmentMode) {
      req.user = {
        id: 'dev-user-1',
        email: 'dev@example.com',
        role: 'platform_owner',
        organizationId: '550e8400-e29b-41d4-a716-446655440000',
        clerkUserId: 'user_dev123'
      };
      return next();
    }
    
    try {
      // Verify the Clerk session token
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });

      if (!payload || !payload.sub) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Extract user information from Clerk token
      const clerkUserId = payload.sub;
      const email = (payload as any).email || '';

      // TODO: In a real implementation, you'd look up the user in your database
      // and get their role and organization from your users table
      
      // For now, we'll use mock data or extract from token claims
      req.user = {
        id: clerkUserId,
        email: email,
        role: 'platform_owner', // This should come from your database
        organizationId: '550e8400-e29b-41d4-a716-446655440000', // This should come from your database
        clerkUserId: clerkUserId
      };

      next();
    } catch (clerkError) {
      console.error('Clerk token verification failed:', clerkError);
      
      // In development, fall back to mock user
      if (isDevelopmentMode) {
        req.user = {
          id: 'dev-user-1',
          email: 'dev@example.com',
          role: 'platform_owner',
          organizationId: '550e8400-e29b-41d4-a716-446655440000',
          clerkUserId: 'user_dev123'
        };
        return next();
      }
      
      return res.status(401).json({ error: 'Invalid token' });
    }

  } catch (error) {
    console.error('Authentication error:', error);
    
    // In development, always be lenient
    if (isDevelopmentMode) {
      req.user = {
        id: 'dev-user-1',
        email: 'dev@example.com',
        role: 'platform_owner',
        organizationId: '550e8400-e29b-41d4-a716-446655440000',
        clerkUserId: 'user_dev123'
      };
      return next();
    }
    
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

export const requireOrganization = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user?.organizationId) {
    return res.status(403).json({ error: 'Organization access required' });
  }

  next();
};

// Optional: Helper function to get user from Supabase by Clerk ID
export const getUserFromDatabase = async (clerkUserId: string) => {
  // This would connect to your Supabase database and fetch user details
  // based on the clerk_user_id field
  
  // Placeholder implementation
  return {
    id: clerkUserId,
    email: 'user@example.com',
    role: 'platform_owner',
    organizationId: '550e8400-e29b-41d4-a716-446655440000'
  };
}; 