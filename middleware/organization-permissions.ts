import { Request, Response, NextFunction } from 'express';

// Extended request interface to include organization context
export interface OrganizationRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
    organization_id: string;
    organization_role?: string;
  };
  organization?: {
    id: string;
    name: string;
    settings: Record<string, any>;
  };
}

// Organization permission levels
export const ORG_PERMISSIONS = {
  // Settings management
  MANAGE_ORGANIZATION_SETTINGS: 'manage_organization_settings',
  VIEW_ORGANIZATION_SETTINGS: 'view_organization_settings',
  
  // VAPI integration
  MANAGE_VAPI_SETTINGS: 'manage_vapi_settings',
  VIEW_VAPI_SETTINGS: 'view_vapi_settings',
  
  // User management
  MANAGE_ORGANIZATION_USERS: 'manage_organization_users',
  INVITE_USERS: 'invite_users',
  SUSPEND_USERS: 'suspend_users',
  
  // Campaign management
  CREATE_CAMPAIGNS: 'create_campaigns',
  MANAGE_ALL_CAMPAIGNS: 'manage_all_campaigns',
  VIEW_ALL_CAMPAIGNS: 'view_all_campaigns',
  
  // Billing and subscription
  MANAGE_BILLING: 'manage_billing',
  VIEW_BILLING: 'view_billing',
} as const;

// Role-based permission mapping
const ROLE_PERMISSIONS: Record<string, string[]> = {
  platform_owner: Object.values(ORG_PERMISSIONS), // All permissions
  
  client_admin: [
    ORG_PERMISSIONS.MANAGE_ORGANIZATION_SETTINGS,
    ORG_PERMISSIONS.VIEW_ORGANIZATION_SETTINGS,
    ORG_PERMISSIONS.MANAGE_VAPI_SETTINGS,
    ORG_PERMISSIONS.VIEW_VAPI_SETTINGS,
    ORG_PERMISSIONS.MANAGE_ORGANIZATION_USERS,
    ORG_PERMISSIONS.INVITE_USERS,
    ORG_PERMISSIONS.SUSPEND_USERS,
    ORG_PERMISSIONS.CREATE_CAMPAIGNS,
    ORG_PERMISSIONS.MANAGE_ALL_CAMPAIGNS,
    ORG_PERMISSIONS.VIEW_ALL_CAMPAIGNS,
    ORG_PERMISSIONS.MANAGE_BILLING,
    ORG_PERMISSIONS.VIEW_BILLING,
  ],
  
  client_user: [
    ORG_PERMISSIONS.VIEW_ORGANIZATION_SETTINGS,
    ORG_PERMISSIONS.VIEW_VAPI_SETTINGS,
    ORG_PERMISSIONS.CREATE_CAMPAIGNS,
    ORG_PERMISSIONS.VIEW_ALL_CAMPAIGNS,
  ],
  
  client_viewer: [
    ORG_PERMISSIONS.VIEW_ORGANIZATION_SETTINGS,
    ORG_PERMISSIONS.VIEW_ALL_CAMPAIGNS,
  ],
};

// Check if user has specific permission
export function hasPermission(userRole: string, permission: string): boolean {
  const userPermissions = ROLE_PERMISSIONS[userRole] || [];
  return userPermissions.includes(permission);
}

// Middleware to check organization permission
export function requireOrgPermission(permission: string) {
  return (req: OrganizationRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!user.organization_id) {
      return res.status(403).json({ error: 'User not associated with organization' });
    }
    
    if (!hasPermission(user.role, permission)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: permission,
        userRole: user.role
      });
    }
    
    next();
  };
}

// Middleware to check if user is organization admin
export function requireOrgAdmin(req: OrganizationRequest, res: Response, next: NextFunction) {
  const user = req.user;
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (!user.organization_id) {
    return res.status(403).json({ error: 'User not associated with organization' });
  }
  
  const isAdmin = user.role === 'client_admin' || user.role === 'platform_owner';
  
  if (!isAdmin) {
    return res.status(403).json({ 
      error: 'Organization administrator privileges required',
      userRole: user.role
    });
  }
  
  next();
}

// Middleware to load organization context
export async function loadOrganizationContext(req: OrganizationRequest, res: Response, next: NextFunction) {
  const user = req.user;
  
  if (!user?.organization_id) {
    return next(); // Continue without org context if not available
  }
  
  try {
    // This would typically fetch from database
    // For now, we'll just set basic organization info
    req.organization = {
      id: user.organization_id,
      name: 'Organization', // Would be fetched from DB
      settings: {} // Would be fetched from organization_settings table
    };
    
    next();
  } catch (error) {
    console.error('Error loading organization context:', error);
    next(); // Continue even if org context fails to load
  }
}

// Helper function to check multiple permissions (OR logic)
export function hasAnyPermission(userRole: string, permissions: string[]): boolean {
  return permissions.some(permission => hasPermission(userRole, permission));
}

// Helper function to check multiple permissions (AND logic)
export function hasAllPermissions(userRole: string, permissions: string[]): boolean {
  return permissions.every(permission => hasPermission(userRole, permission));
}

// Middleware factory for checking multiple permissions
export function requireAnyPermission(permissions: string[]) {
  return (req: OrganizationRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!hasAnyPermission(user.role, permissions)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: permissions,
        userRole: user.role
      });
    }
    
    next();
  };
}

// Get user's permissions list
export function getUserPermissions(userRole: string): string[] {
  return ROLE_PERMISSIONS[userRole] || [];
}

// Check if user can manage specific resource
export function canManageResource(userRole: string, resourceType: string, resourceOwnerId?: string, userId?: string): boolean {
  // Platform owners can manage everything
  if (userRole === 'platform_owner') {
    return true;
  }
  
  // Organization admins can manage most resources within their org
  if (userRole === 'client_admin') {
    switch (resourceType) {
      case 'campaign':
        return hasPermission(userRole, ORG_PERMISSIONS.MANAGE_ALL_CAMPAIGNS);
      case 'user':
        return hasPermission(userRole, ORG_PERMISSIONS.MANAGE_ORGANIZATION_USERS);
      case 'settings':
        return hasPermission(userRole, ORG_PERMISSIONS.MANAGE_ORGANIZATION_SETTINGS);
      default:
        return false;
    }
  }
  
  // Regular users can only manage their own resources
  if (resourceOwnerId && userId) {
    return resourceOwnerId === userId;
  }
  
  return false;
}

export default {
  requireOrgPermission,
  requireOrgAdmin,
  loadOrganizationContext,
  requireAnyPermission,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getUserPermissions,
  canManageResource,
  ORG_PERMISSIONS,
  ROLE_PERMISSIONS
};