"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ORG_PERMISSIONS = void 0;
exports.hasPermission = hasPermission;
exports.requireOrgPermission = requireOrgPermission;
exports.requireOrgAdmin = requireOrgAdmin;
exports.loadOrganizationContext = loadOrganizationContext;
exports.hasAnyPermission = hasAnyPermission;
exports.hasAllPermissions = hasAllPermissions;
exports.requireAnyPermission = requireAnyPermission;
exports.getUserPermissions = getUserPermissions;
exports.canManageResource = canManageResource;
exports.ORG_PERMISSIONS = {
    MANAGE_ORGANIZATION_SETTINGS: 'manage_organization_settings',
    VIEW_ORGANIZATION_SETTINGS: 'view_organization_settings',
    MANAGE_VAPI_SETTINGS: 'manage_vapi_settings',
    VIEW_VAPI_SETTINGS: 'view_vapi_settings',
    MANAGE_ORGANIZATION_USERS: 'manage_organization_users',
    INVITE_USERS: 'invite_users',
    SUSPEND_USERS: 'suspend_users',
    CREATE_CAMPAIGNS: 'create_campaigns',
    MANAGE_ALL_CAMPAIGNS: 'manage_all_campaigns',
    VIEW_ALL_CAMPAIGNS: 'view_all_campaigns',
    MANAGE_BILLING: 'manage_billing',
    VIEW_BILLING: 'view_billing',
};
const ROLE_PERMISSIONS = {
    platform_owner: Object.values(exports.ORG_PERMISSIONS),
    client_admin: [
        exports.ORG_PERMISSIONS.MANAGE_ORGANIZATION_SETTINGS,
        exports.ORG_PERMISSIONS.VIEW_ORGANIZATION_SETTINGS,
        exports.ORG_PERMISSIONS.MANAGE_VAPI_SETTINGS,
        exports.ORG_PERMISSIONS.VIEW_VAPI_SETTINGS,
        exports.ORG_PERMISSIONS.MANAGE_ORGANIZATION_USERS,
        exports.ORG_PERMISSIONS.INVITE_USERS,
        exports.ORG_PERMISSIONS.SUSPEND_USERS,
        exports.ORG_PERMISSIONS.CREATE_CAMPAIGNS,
        exports.ORG_PERMISSIONS.MANAGE_ALL_CAMPAIGNS,
        exports.ORG_PERMISSIONS.VIEW_ALL_CAMPAIGNS,
        exports.ORG_PERMISSIONS.MANAGE_BILLING,
        exports.ORG_PERMISSIONS.VIEW_BILLING,
    ],
    client_user: [
        exports.ORG_PERMISSIONS.VIEW_ORGANIZATION_SETTINGS,
        exports.ORG_PERMISSIONS.VIEW_VAPI_SETTINGS,
        exports.ORG_PERMISSIONS.CREATE_CAMPAIGNS,
        exports.ORG_PERMISSIONS.VIEW_ALL_CAMPAIGNS,
    ],
    client_viewer: [
        exports.ORG_PERMISSIONS.VIEW_ORGANIZATION_SETTINGS,
        exports.ORG_PERMISSIONS.VIEW_ALL_CAMPAIGNS,
    ],
};
function hasPermission(userRole, permission) {
    const userPermissions = ROLE_PERMISSIONS[userRole] || [];
    return userPermissions.includes(permission);
}
function requireOrgPermission(permission) {
    return (req, res, next) => {
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
function requireOrgAdmin(req, res, next) {
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
async function loadOrganizationContext(req, res, next) {
    const user = req.user;
    if (!user?.organization_id) {
        return next();
    }
    try {
        req.organization = {
            id: user.organization_id,
            name: 'Organization',
            settings: {}
        };
        next();
    }
    catch (error) {
        console.error('Error loading organization context:', error);
        next();
    }
}
function hasAnyPermission(userRole, permissions) {
    return permissions.some(permission => hasPermission(userRole, permission));
}
function hasAllPermissions(userRole, permissions) {
    return permissions.every(permission => hasPermission(userRole, permission));
}
function requireAnyPermission(permissions) {
    return (req, res, next) => {
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
function getUserPermissions(userRole) {
    return ROLE_PERMISSIONS[userRole] || [];
}
function canManageResource(userRole, resourceType, resourceOwnerId, userId) {
    if (userRole === 'platform_owner') {
        return true;
    }
    if (userRole === 'client_admin') {
        switch (resourceType) {
            case 'campaign':
                return hasPermission(userRole, exports.ORG_PERMISSIONS.MANAGE_ALL_CAMPAIGNS);
            case 'user':
                return hasPermission(userRole, exports.ORG_PERMISSIONS.MANAGE_ORGANIZATION_USERS);
            case 'settings':
                return hasPermission(userRole, exports.ORG_PERMISSIONS.MANAGE_ORGANIZATION_SETTINGS);
            default:
                return false;
        }
    }
    if (resourceOwnerId && userId) {
        return resourceOwnerId === userId;
    }
    return false;
}
exports.default = {
    requireOrgPermission,
    requireOrgAdmin,
    loadOrganizationContext,
    requireAnyPermission,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    getUserPermissions,
    canManageResource,
    ORG_PERMISSIONS: exports.ORG_PERMISSIONS,
    ROLE_PERMISSIONS
};
