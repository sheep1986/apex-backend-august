import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@clerk/backend';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Development mode check
const isDevelopmentMode = process.env.NODE_ENV === 'development' || process.env.ENABLE_MOCK_DATA === 'true';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    organizationId: string;
    firstName?: string;
    lastName?: string;
    clerkId?: string;
  };
}

export const authenticateUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  return authenticateClerkUser(req, res, next);
};

export const authenticateClerkUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  // Skip authentication for OPTIONS preflight requests
  if (req.method === 'OPTIONS') {
    return next();
  }
  
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    
    // Development mode - check for dev tokens
    if (isDevelopmentMode) {
      console.log('🔄 Development mode is ENABLED');
      console.log('🔄 Received token:', token);
      
      // Handle role-specific dev tokens from frontend dev-auth service
      if (token.startsWith('test-token-') || token.startsWith('dev-token-')) {
        const role = token.replace('test-token-', '').replace('dev-token-', '');
        console.log('🔄 Detected dev token for role:', role);
        
        // Map roles to user data
        const roleUserMap: { [key: string]: any } = {
          'platform_owner': {
            id: '358b6fd9-ec05-4d95-b00d-2666041473bd',
            firstName: 'Sean',
            lastName: 'Wentz',
            email: 'sean@artificialmedia.co.uk',
            role: 'platform_owner',
            organizationId: '2566d8c5-2245-4a3c-b539-4cea21a07d9b',
            clerkId: 'user_platform_owner'
          },
          'agency_owner': {
            id: '550e8400-e29b-41d4-a716-446655440001',
            firstName: 'Agency',
            lastName: 'Owner',
            email: 'agency@artificialmedia.co.uk',
            role: 'agency_owner',
            organizationId: '47a8e3ea-cd34-4746-a786-dd31e8f8105e',
            clerkId: 'user_agency_owner'
          },
          'agency_admin': {
            id: '550e8400-e29b-41d4-a716-446655440002',
            firstName: 'Agency',
            lastName: 'Admin',
            email: 'admin@artificialmedia.co.uk',
            role: 'agency_admin',
            organizationId: '47a8e3ea-cd34-4746-a786-dd31e8f8105e',
            clerkId: 'user_agency_admin'
          },
          'client_admin': {
            id: 'd22b0ecd-a216-42b9-aa68-3d02b6bede2d',
            firstName: 'Client',
            lastName: 'Admin',
            email: 'clientadmin@testcorp.com',
            role: 'client_admin',
            organizationId: '2566d8c5-2245-4a3c-b539-4cea21a07d9b',
            clerkId: 'user_client_admin'
          },
          'client_user': {
            id: '550e8400-e29b-41d4-a716-446655440003',
            firstName: 'Client',
            lastName: 'User',
            email: 'user@testcorp.com',
            role: 'client_user',
            organizationId: '2566d8c5-2245-4a3c-b539-4cea21a07d9b',
            clerkId: 'user_client_user'
          }
        };

        const userInfo = roleUserMap[role];
        if (userInfo) {
          console.log(`🔑 Development mode: Using ${role} token for user:`, userInfo.email);
          req.user = userInfo;
          return next();
        }
      }
    }
    
    // Try Clerk authentication if configured
    if (process.env.CLERK_SECRET_KEY && process.env.CLERK_SECRET_KEY !== 'YOUR_CLERK_SECRET_KEY_HERE') {
      try {
        console.log('🔐 Attempting Clerk authentication...');
        
        // Verify the Clerk session token
        const payload = await verifyToken(token, {
          secretKey: process.env.CLERK_SECRET_KEY,
        });

        if (!payload || !payload.sub) {
          return res.status(401).json({ error: 'Invalid Clerk token' });
        }

        // Extract user information from Clerk token
        const clerkUserId = payload.sub;
        const clerkEmail = (payload as any).email || (payload as any).primaryEmailAddress || '';

        // Find the user in our database by Clerk ID
        const { data: dbUser, error: dbError } = await supabase
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
          .eq('clerk_id', clerkUserId)
          .single();

        if (!dbUser || dbError) {
          // If user not found by clerk_id, try by email as fallback
          if (clerkEmail) {
            const { data: dbUserByEmail, error: emailError } = await supabase
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
              .eq('email', clerkEmail)
              .single();

            if (dbUserByEmail && !emailError) {
              // Update the user record with their Clerk ID
              await supabase
                .from('users')
                .update({ clerk_id: clerkUserId })
                .eq('id', dbUserByEmail.id);

              const userInfo = {
                id: dbUserByEmail.id,
                firstName: dbUserByEmail.first_name,
                lastName: dbUserByEmail.last_name,
                email: dbUserByEmail.email,
                role: dbUserByEmail.role,
                organizationId: dbUserByEmail.organization_id,
                clerkId: clerkUserId
              };

              console.log('🔑 Clerk authentication successful for user:', dbUserByEmail.email);
              console.log('📋 User organization_id:', dbUserByEmail.organization_id);

              req.user = userInfo;
              return next();
            }
          }
          
          console.log('User not found in database for Clerk ID:', clerkUserId);
          return res.status(401).json({ error: 'User not found in database' });
        }

        const userInfo = {
          id: dbUser.id,
          firstName: dbUser.first_name,
          lastName: dbUser.last_name,
          email: dbUser.email,
          role: dbUser.role,
          organizationId: dbUser.organization_id,
          clerkId: clerkUserId
        };

        console.log('🔑 Clerk authentication successful for user:', dbUser.email);
        console.log('📋 User organization_id:', dbUser.organization_id);

        req.user = userInfo;
        return next();
      } catch (clerkError) {
        console.error('Clerk token verification failed:', clerkError);
        return res.status(401).json({ error: 'Invalid Clerk token' });
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

export const requireOrganization = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user?.organizationId) {
    return res.status(403).json({ error: 'Organization access required' });
  }

  next();
};

export const requirePlatformOwner = requireRole(['platform_owner']);
export const requireAgencyAdmin = requireRole(['platform_owner', 'agency_admin']);
export const requireAgencyUser = requireRole(['platform_owner', 'agency_admin', 'agency_user']);

// Export as authenticateUser for backward compatibility
export const authenticateUser = authenticateClerkUser; 