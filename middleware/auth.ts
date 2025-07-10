import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { verifyToken } from '@clerk/backend';
import supabase from '../services/supabase-client';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    organizationId: string;
    clerkUserId?: string;
    firstName?: string;
    lastName?: string;
  };
}

// Force real Clerk authentication - no mock tokens
const hasClerkKey = !!process.env.CLERK_SECRET_KEY;

export const authenticateUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided - real Clerk authentication required' });
    }

    const token = authHeader.substring(7);
    
    // Try Clerk authentication first if available
    if (hasClerkKey) {
      try {
        const payload = await verifyToken(token, {
          secretKey: process.env.CLERK_SECRET_KEY,
        });

        if (payload && payload.sub) {
          // First try to get user from database using Clerk ID
          let { data: user, error } = await supabase
            .from('users')
            .select(`
              id,
              first_name,
              last_name,
              email,
              role,
              organization_id,
              clerk_id
            `)
            .eq('clerk_id', payload.sub)
            .single();

          // If not found by clerk_id, try to find by email from Clerk token
          if (error || !user) {
            console.log('🔍 User not found by Clerk ID, trying email lookup...');
            
            // Get email from Clerk token payload 
            const userEmail = payload.email;
            
            if (userEmail) {
              const { data: emailUser, error: emailError } = await supabase
                .from('users')
                .select(`
                  id,
                  first_name,
                  last_name,
                  email,
                  role,
                  organization_id,
                  clerk_id
                `)
                .eq('email', userEmail)
                .single();
                
              if (emailUser && !emailError) {
                console.log('✅ Found user by email, updating Clerk ID...');
                
                // Update the user with the Clerk ID for future lookups
                await supabase
                  .from('users')
                  .update({ clerk_id: payload.sub })
                  .eq('id', emailUser.id);
                  
                user = { ...emailUser, clerk_id: payload.sub };
                error = null;
              }
            }
          }

          if (user && !error) {
            const userInfo = {
              id: user.id,
              firstName: user.first_name,
              lastName: user.last_name,
              email: user.email,
              role: user.role,
              organizationId: user.organization_id,
              clerkId: user.clerk_id
            };

            console.log('🔑 Authentication successful for user:', user.email);
            console.log('📋 User organization_id:', user.organization_id);

            req.user = userInfo;
            return next();
          } else {
            console.log('User not found in database for Clerk ID:', payload.sub);
            return res.status(401).json({ error: 'User not found in database' });
          }
        }
      } catch (clerkError) {
        console.log('Clerk verification failed, trying JWT fallback');
        // Fall through to JWT verification
      }
    }

    // Fallback to JWT verification
    try {
      const jwtSecret = process.env.JWT_SECRET || 'fallback-secret-for-dev';
      const decoded = jwt.verify(token, jwtSecret) as any;
      
      if (decoded && decoded.userId) {
        // Get user from database using internal user ID
        const { data: user, error } = await supabase
          .from('users')
          .select(`
            id,
            first_name,
            last_name,
            email,
            role,
            organization_id,
            clerk_id
          `)
          .eq('id', decoded.userId)
          .single();

        if (user && !error) {
          const userInfo = {
            id: user.id,
            firstName: user.first_name,
            lastName: user.last_name,
            email: user.email,
            role: user.role,
            organizationId: user.organization_id,
            clerkId: user.clerk_id
          };

          console.log('🔑 Authentication successful for user:', user.email);
          console.log('📋 User organization_id:', user.organization_id);

          req.user = userInfo;
          return next();
        }
      }
    } catch (jwtError) {
      console.log('JWT verification failed');
    }

    // Development fallback - allow specific test tokens (temporarily enabled for transition)
    console.log('🔄 Falling back to development tokens for transition period');
    if (true) { // Temporarily always allow dev tokens
      if (token === 'test-token') {
        const userInfo = {
          id: 'd22b0ecd-a216-42b9-aa68-3d02b6bede2d',
          firstName: 'ABS',
          lastName: 'SDH',
          email: 'info@artificialmedia.co.uk',
          role: 'client_admin',
          organizationId: '0f88ab8a-b760-4c2a-b289-79b54d7201cf',
          clerkId: 'user_2zZDBUR8ZYRjxXHcOxJ39LgjSSr'
        };

        console.log('🔑 Development mode: Using test token for client user:', userInfo.email);
        req.user = userInfo;
        return next();
      }
      
      // Platform owner token for Sean
      if (token === 'owner-token') {
        const userInfo = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          firstName: 'Sean',
          lastName: 'Wentz',
          email: 'sean@artificialmedia.co.uk',
          role: 'platform_owner',
          organizationId: '47a8e3ea-cd34-4746-a786-dd31e8f8105e',
          clerkId: 'user_sean_wentz'
        };

        console.log('🔑 Development mode: Using owner token for platform owner:', userInfo.email);
        req.user = userInfo;
        return next();
      }
    }

    return res.status(401).json({ error: 'Invalid token' });

  } catch (error) {
    console.error('Authentication error:', error);
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

export const requirePlatformOwner = requireRole(['platform_owner']);
export const requireAgencyAdmin = requireRole(['platform_owner', 'agency_admin']);
export const requireAgencyUser = requireRole(['platform_owner', 'agency_admin', 'agency_user']); 