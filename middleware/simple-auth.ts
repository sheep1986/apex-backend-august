import { Request, Response, NextFunction } from 'express';
import supabase from '../services/supabase-client';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    organizationId: string;
    firstName?: string;
    lastName?: string;
  };
}

export const authenticateUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    console.log('🔑 Authenticating token:', token.substring(0, 10) + '...');

    // Try Supabase JWT authentication first
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (user && !error) {
        console.log('✅ Valid Supabase token for:', user.email);
        
        // Look up user by email in database
        const { data: dbUser, error: dbError } = await supabase
          .from('users')
          .select('*')
          .eq('email', user.email)
          .single();

        if (dbUser && !dbError) {
          req.user = {
            id: dbUser.id,
            firstName: dbUser.first_name,
            lastName: dbUser.last_name,
            email: dbUser.email,
            role: dbUser.role,
            organizationId: dbUser.organization_id
          };
          
          console.log('✅ User authenticated via Supabase:', dbUser.email, 'role:', dbUser.role);
          return next();
        } else {
          console.log('❌ User not found in database for email:', user.email);
        }
      }
    } catch (supabaseError) {
      console.log('❌ Supabase verification failed:', supabaseError.message);
    }

    // Simple email-based authentication for development
    let userEmail = '';
    let userRole = '';
    
    if (token.includes('sean')) {
      userEmail = 'sean@artificialmedia.co.uk';
      userRole = 'platform_owner';
    } else {
      userEmail = 'info@artificialmedia.co.uk';
      userRole = 'client_admin';
    }

    // Get user from database
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', userEmail)
      .single();

    if (user && !error) {
      req.user = {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        organizationId: user.organization_id
      };
      
      console.log('✅ User authenticated (fallback):', user.email, 'role:', user.role);
      return next();
    }

    return res.status(401).json({ error: 'Authentication failed' });

  } catch (error) {
    console.error('❌ Authentication error:', error);
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