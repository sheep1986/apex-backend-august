"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrganizationService = void 0;
const backend_1 = require("@clerk/backend");
const supabase_client_1 = __importDefault(require("./supabase-client"));
const email_service_1 = require("./email-service");
const clerk = (0, backend_1.createClerkClient)({
    secretKey: process.env.CLERK_SECRET_KEY || '',
});
class OrganizationService {
    static async createOrganization(data) {
        try {
            const clerkOrg = await clerk.organizations.createOrganization({
                name: data.name,
                publicMetadata: {
                    type: data.type,
                    createdAt: new Date().toISOString()
                },
                privateMetadata: {
                    ownerId: data.ownerId,
                    settings: data.settings || {}
                }
            });
            const { data: dbOrg, error } = await supabase_client_1.default
                .from('organizations')
                .insert({
                id: clerkOrg.id,
                name: data.name,
                type: data.type,
                owner_id: data.ownerId,
                settings: data.settings || {},
                is_active: true,
                created_at: new Date().toISOString()
            })
                .select()
                .single();
            if (error)
                throw error;
            return {
                ...dbOrg,
                clerkOrganizationId: clerkOrg.id
            };
        }
        catch (error) {
            console.error('Error creating organization:', error);
            throw error;
        }
    }
    static async addTeamMember(data) {
        try {
            let clerkUserId = null;
            if (process.env.CLERK_SECRET_KEY) {
                let clerkUser;
                try {
                    const existingUsers = await clerk.users.getUserList({
                        emailAddress: [data.email]
                    });
                    if (existingUsers.data.length > 0) {
                        clerkUser = existingUsers.data[0];
                    }
                    else {
                        const username = data.email.split('@')[0] + Math.random().toString(36).substring(2, 8);
                        const tempPassword = 'TempPass123!' + Math.random().toString(36).substring(2, 8);
                        clerkUser = await clerk.users.createUser({
                            emailAddress: [data.email],
                            firstName: data.firstName,
                            lastName: data.lastName,
                            username: username,
                            password: tempPassword,
                            skipPasswordChecks: false,
                            skipPasswordRequirement: false
                        });
                        await clerk.invitations.createInvitation({
                            emailAddress: data.email,
                            redirectUrl: `${process.env.FRONTEND_URL}/verify-invitation`,
                            publicMetadata: {
                                role: data.role,
                                organizationId: data.organizationId,
                                invitationType: 'team_member'
                            }
                        });
                    }
                    await clerk.organizations.createOrganizationMembership({
                        organizationId: data.organizationId,
                        userId: clerkUser.id,
                        role: data.role.includes('admin') ? 'admin' : 'member'
                    });
                    clerkUserId = clerkUser.id;
                }
                catch (error) {
                    console.error('Error creating Clerk user:', error);
                    throw error;
                }
            }
            else {
                clerkUserId = 'dev_' + Date.now();
                console.log('📧 Dev mode: Would create Clerk user for', data.email);
            }
            const { data: dbUser, error } = await supabase_client_1.default
                .from('users')
                .insert({
                email: data.email,
                first_name: data.firstName,
                last_name: data.lastName,
                role: data.role,
                organization_id: data.organizationId,
                clerk_user_id: clerkUserId,
                permissions: data.permissions,
                is_active: false,
                verification_required: true,
                created_at: new Date().toISOString()
            })
                .select()
                .single();
            if (error)
                throw error;
            if (process.env.ENABLE_MOCK_DATA !== 'true') {
                const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/invite?token=${clerkUserId}`;
                await email_service_1.EmailService.sendInvitation(data.email, data.firstName, inviteLink);
            }
            return {
                ...dbUser,
                invitationSent: true,
                requiresVerification: true
            };
        }
        catch (error) {
            console.error('Error adding team member:', error);
            throw error;
        }
    }
    static async getClientOrganizations(userId) {
        try {
            const { data: user } = await supabase_client_1.default
                .from('users')
                .select('role, permissions')
                .eq('id', userId)
                .single();
            if (!user?.permissions?.canAccessAllOrganizations) {
                throw new Error('Unauthorized to view all organizations');
            }
            const { data: organizations, error } = await supabase_client_1.default
                .from('organizations')
                .select(`
          *,
          users!organization_id (
            id,
            email,
            first_name,
            last_name,
            role,
            is_active,
            last_login
          )
        `)
                .eq('type', 'client')
                .order('created_at', { ascending: false });
            if (error)
                throw error;
            return organizations;
        }
        catch (error) {
            console.error('Error fetching client organizations:', error);
            throw error;
        }
    }
    static async switchToOrganization(userId, targetOrgId) {
        try {
            const { data: user } = await supabase_client_1.default
                .from('users')
                .select('role, permissions')
                .eq('id', userId)
                .single();
            if (!user?.permissions?.canAccessAllOrganizations) {
                throw new Error('Unauthorized to switch organizations');
            }
            await supabase_client_1.default
                .from('audit_logs')
                .insert({
                user_id: userId,
                action: 'organization_switch',
                target_id: targetOrgId,
                metadata: {
                    from_role: user.role,
                    timestamp: new Date().toISOString()
                }
            });
            const { data: organization } = await supabase_client_1.default
                .from('organizations')
                .select('*')
                .eq('id', targetOrgId)
                .single();
            return {
                organization,
                switchedAt: new Date().toISOString(),
                switchedBy: userId
            };
        }
        catch (error) {
            console.error('Error switching organization:', error);
            throw error;
        }
    }
    static async sendVerificationCode(userId, method = 'email') {
        try {
            const { data: user, error } = await supabase_client_1.default
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();
            if (error || !user)
                throw new Error('User not found');
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            const { error: codeError } = await supabase_client_1.default
                .from('verification_codes')
                .insert({
                user_id: userId,
                code,
                type: method,
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
            });
            if (codeError)
                throw codeError;
            if (method === 'email' && process.env.ENABLE_MOCK_DATA !== 'true') {
                await email_service_1.EmailService.sendVerificationCode(user.email, code);
            }
            return {
                success: true,
                message: `Verification code sent via ${method}`,
                expiresIn: '10 minutes'
            };
        }
        catch (error) {
            console.error('Error sending verification code:', error);
            throw error;
        }
    }
    static async verifyCode(userId, code) {
        try {
            const { data: validCode, error } = await supabase_client_1.default
                .from('verification_codes')
                .select('*')
                .eq('user_id', userId)
                .eq('code', code)
                .eq('used', false)
                .gte('expires_at', new Date().toISOString())
                .single();
            if (error || !validCode) {
                throw new Error('Invalid or expired verification code');
            }
            await supabase_client_1.default
                .from('verification_codes')
                .update({ used: true })
                .eq('id', validCode.id);
            await supabase_client_1.default
                .from('users')
                .update({
                is_active: true,
                verification_required: false,
                verified_at: new Date().toISOString()
            })
                .eq('id', userId);
            return { verified: true };
        }
        catch (error) {
            console.error('Error verifying code:', error);
            throw error;
        }
    }
}
exports.OrganizationService = OrganizationService;
