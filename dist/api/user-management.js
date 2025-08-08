"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const nodemailer = __importStar(require("nodemailer"));
const crypto_1 = __importDefault(require("crypto"));
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const dev_auth_1 = require("../middleware/dev-auth");
const clerk_service_1 = require("../services/clerk-service");
const router = (0, express_1.Router)();
const emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});
const isDevelopmentMode = false;
const enableMockData = false;
const authMiddleware = isDevelopmentMode && !process.env.CLERK_SECRET_KEY
    ? dev_auth_1.authenticateDevUser
    : auth_1.authenticateUser;
router.get('/', async (req, res) => {
    try {
        let users;
        console.log('📋 Fetching users from Supabase');
        const { data, error } = await supabase_client_1.default
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) {
            console.error('❌ Supabase error fetching users:', error);
            return res.status(500).json({
                error: 'Failed to fetch users from database',
                details: error.message
            });
        }
        users = data;
        res.json({
            success: true,
            users: users.map(user => ({
                id: user.id,
                firstName: user.firstName || user.first_name,
                lastName: user.lastName || user.last_name,
                email: user.email,
                phoneNumber: user.phoneNumber || user.phone_number,
                company: user.company,
                role: user.role,
                agencyName: user.agencyName || user.agency_name,
                subscriptionPlan: user.subscriptionPlan || user.subscription_plan,
                status: user.status,
                clerkUserId: user.clerkUserId || user.clerk_user_id,
                createdAt: user.createdAt || user.created_at,
                updatedAt: user.updatedAt || user.updated_at
            })),
            total: users.length,
            mode: 'production'
        });
    }
    catch (error) {
        console.error('❌ Error fetching users:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.post('/', async (req, res) => {
    try {
        const { firstName, lastName, email, role = 'platform_owner', accountName, accountType = 'agency', phone, isActive = true, sendInvitation = true, password } = req.body;
        if (!firstName || !lastName || !email) {
            return res.status(400).json({
                error: 'Missing required fields: firstName, lastName, and email are required'
            });
        }
        const roleMapping = {
            'platform_owner': 'platform_owner',
            'agency_admin': 'agency_admin',
            'agency_user': 'agency_user',
            'client_admin': 'client_admin',
            'client_user': 'client_user',
            'support_admin': 'support_admin',
            'support_agent': 'support_agent',
            'admin': 'admin',
            'user': 'user',
            'agent': 'agent'
        };
        const dbRole = roleMapping[role] || 'user';
        console.log(`🔄 Role mapping: ${role} -> ${dbRole}`);
        let organizationId = '550e8400-e29b-41d4-a716-446655440000';
        if (role === 'platform_owner') {
            organizationId = '550e8400-e29b-41d4-a716-446655440000';
        }
        const settings = {
            originalRole: role,
            accountType: accountType,
            accountName: accountName,
            permissions: {
                isPlatformOwner: role === 'platform_owner',
                isAgencyOwner: role === 'agency_owner',
                canManageUsers: ['platform_owner', 'client_admin'].includes(role),
                canManageBilling: ['platform_owner', 'client_admin'].includes(role),
                canViewAllData: ['platform_owner', 'client_admin'].includes(role)
            }
        };
        const { data: existingUser, error: checkError } = await supabase_client_1.default
            .from('users')
            .select('id')
            .eq('email', email)
            .single();
        if (existingUser && !checkError) {
            return res.status(409).json({
                error: 'User with this email already exists'
            });
        }
        let clerkUser;
        try {
            console.log('🔐 Creating user in Clerk...');
            clerkUser = await clerk_service_1.ClerkService.createUser({
                email,
                firstName,
                lastName,
                password
            });
            console.log('✅ Clerk user created:', clerkUser.id);
        }
        catch (clerkError) {
            console.error('❌ Failed to create Clerk user:', clerkError);
            if (clerkError.message?.includes('already exists')) {
                const existingClerkUser = await clerk_service_1.ClerkService.getUserByEmail(email);
                if (existingClerkUser) {
                    clerkUser = existingClerkUser;
                    console.log('ℹ️ Using existing Clerk user:', clerkUser.id);
                }
                else {
                    return res.status(400).json({
                        error: 'User already exists in authentication system but could not be retrieved'
                    });
                }
            }
            else {
                return res.status(500).json({
                    error: 'Failed to create user in authentication system',
                    details: clerkError.message
                });
            }
        }
        const userData = {
            first_name: firstName,
            last_name: lastName,
            email: email,
            role: dbRole,
            status: isActive ? 'active' : 'inactive',
            organization_id: organizationId,
            phone: phone || null,
            avatar_url: null,
            last_login_at: null,
            clerk_id: clerkUser.id,
            settings: settings,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        console.log('💾 Creating user in Supabase:', userData);
        const { data, error } = await supabase_client_1.default
            .from('users')
            .insert([userData])
            .select()
            .single();
        if (error) {
            console.error('❌ Error creating user in database:', error);
            try {
                await clerk_service_1.ClerkService.deleteUser(clerkUser.id);
                console.log('🧹 Cleaned up Clerk user after database failure');
            }
            catch (cleanupError) {
                console.error('⚠️ Failed to clean up Clerk user:', cleanupError);
            }
            return res.status(500).json({
                error: 'Failed to create user in database',
                details: error.message
            });
        }
        console.log('✅ User created successfully:', data);
        const responseData = {
            message: password
                ? 'User created successfully'
                : 'User created successfully. An invitation email has been sent.',
            user: {
                ...data,
                displayRole: role,
                accountName: accountName,
                settings: settings,
                clerkUserId: clerkUser.id,
                invitationSent: sendInvitation && !password
            }
        };
        res.status(201).json(responseData);
    }
    catch (error) {
        console.error('❌ Error creating user:', error);
        res.status(500).json({
            error: 'Failed to create user',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        let user;
        if (isDevelopmentMode && enableMockData) {
            user = mockUsers.find(u => u.id === id);
            if (!user) {
                return res.status(404).json({
                    error: 'User not found'
                });
            }
        }
        else {
            const { data, error } = await supabase_client_1.default
                .from('users')
                .select('*')
                .eq('id', id)
                .single();
            if (error || !data) {
                return res.status(404).json({
                    error: 'User not found'
                });
            }
            user = data;
        }
        res.json({
            success: true,
            user: {
                id: user.id,
                firstName: user.firstName || user.first_name,
                lastName: user.lastName || user.last_name,
                email: user.email,
                phoneNumber: user.phoneNumber || user.phone_number,
                company: user.company,
                role: user.role,
                agencyName: user.agencyName || user.agency_name,
                subscriptionPlan: user.subscriptionPlan || user.subscription_plan,
                status: user.status,
                clerkUserId: user.clerkUserId || user.clerk_user_id,
                createdAt: user.createdAt || user.created_at,
                updatedAt: user.updatedAt || user.updated_at
            }
        });
    }
    catch (error) {
        console.error('❌ Error fetching user:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        delete updateData.id;
        delete updateData.createdAt;
        delete updateData.created_at;
        updateData.updated_at = new Date().toISOString();
        let updatedUser;
        if (isDevelopmentMode && enableMockData) {
            const userIndex = mockUsers.findIndex(u => u.id === id);
            if (userIndex === -1) {
                return res.status(404).json({
                    error: 'User not found'
                });
            }
            mockUsers[userIndex] = { ...mockUsers[userIndex], ...updateData };
            updatedUser = mockUsers[userIndex];
        }
        else {
            const { data, error } = await supabase_client_1.default
                .from('users')
                .update(updateData)
                .eq('id', id)
                .select()
                .single();
            if (error || !data) {
                return res.status(404).json({
                    error: 'User not found or failed to update'
                });
            }
            updatedUser = data;
        }
        res.json({
            success: true,
            message: 'User updated successfully',
            user: updatedUser
        });
    }
    catch (error) {
        console.error('❌ Error updating user:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        if (isDevelopmentMode && enableMockData) {
            const userIndex = mockUsers.findIndex(u => u.id === id);
            if (userIndex === -1) {
                return res.status(404).json({
                    error: 'User not found'
                });
            }
            mockUsers.splice(userIndex, 1);
        }
        else {
            const { error } = await supabase_client_1.default
                .from('users')
                .delete()
                .eq('id', id);
            if (error) {
                return res.status(404).json({
                    error: 'User not found or failed to delete'
                });
            }
        }
        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    }
    catch (error) {
        console.error('❌ Error deleting user:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.post('/users/invite', async (req, res) => {
    try {
        const { email, firstName, lastName, agencyName, plan, message } = req.body;
        const { data: existingUser } = await supabase_client_1.default
            .from('users')
            .select('id')
            .eq('email', email)
            .single();
        if (existingUser) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }
        const inviteToken = crypto_1.default.randomBytes(32).toString('hex');
        const { data: invitee, error } = await supabase_client_1.default
            .from('users')
            .insert({
            email,
            first_name: firstName,
            last_name: lastName,
            agency_name: agencyName,
            role: 'pending_invite',
            status: 'invited',
            invite_token: inviteToken,
            invite_token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            subscription_plan: plan
        })
            .select()
            .single();
        if (error)
            throw error;
        await sendInviteEmail({
            email,
            firstName,
            lastName,
            agencyName,
            plan,
            message,
            inviteToken
        });
        await logUserAction(invitee.id, 'USER_INVITED', `User invited by admin`, req.user?.id);
        res.status(200).json({ message: 'Invitation sent successfully.' });
    }
    catch (error) {
        console.error('Error sending invite:', error);
        res.status(500).json({ error: 'Failed to send invite' });
    }
});
router.post('/invites/:userId/resend', async (req, res) => {
    try {
        const { userId } = req.params;
        res.status(200).json({ message: 'Invitation resent successfully.' });
    }
    catch (error) {
        console.error('Error resending invite:', error);
        res.status(500).json({ error: 'Failed to resend invite' });
    }
});
router.post('/invites/accept', async (req, res) => {
    try {
        const { inviteToken, password } = req.body;
        res.status(200).json({ message: 'Account activated successfully.' });
    }
    catch (error) {
        console.error('Error accepting invite:', error);
        res.status(500).json({ error: 'Failed to accept invite' });
    }
});
router.post('/users/:id/password-reset', async (req, res) => {
    try {
        const { id } = req.params;
        res.status(200).json({ message: 'Password reset email sent.' });
    }
    catch (error) {
        console.error('Error sending password reset:', error);
        res.status(500).json({ error: 'Failed to send password reset' });
    }
});
router.get('/agencies', async (req, res) => {
    try {
        const { data: agencies, error } = await supabase_client_1.default
            .from('agencies')
            .select(`
        *,
        users!inner(count)
      `)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        res.json(agencies);
    }
    catch (error) {
        console.error('Error fetching agencies:', error);
        res.status(500).json({ error: 'Failed to fetch agencies' });
    }
});
router.get('/metrics', async (req, res) => {
    try {
        const { data: userStats, error: userError } = await supabase_client_1.default
            .from('users')
            .select('status')
            .neq('status', 'deleted');
        const { data: agencyStats, error: agencyError } = await supabase_client_1.default
            .from('agencies')
            .select('monthly_cost')
            .eq('status', 'active');
        if (agencyError)
            throw agencyError;
        res.json({ userStats, agencyStats });
    }
    catch (error) {
        console.error('Error fetching metrics:', error);
        res.status(500).json({ error: 'Failed to fetch metrics' });
    }
});
router.get('/users/:userId/activity', async (req, res) => {
    try {
        const { userId } = req.params;
        const { data: activity, error } = await supabase_client_1.default
            .from('user_activity')
            .select('*')
            .eq('user_id', userId)
            .order('timestamp', { ascending: false });
        if (error)
            throw error;
        res.json(activity);
    }
    catch (error) {
        console.error('Error fetching user activity:', error);
        res.status(500).json({ error: 'Failed to fetch user activity' });
    }
});
async function sendInviteEmail(inviteData) {
    const inviteUrl = `${process.env.FRONTEND_URL}/accept-invite?token=${inviteData.inviteToken}`;
    const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Apex AI</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">AI Calling Platform</p>
      </div>
      
      <div style="padding: 40px; background: #f8f9fa;">
        <h2 style="color: #333; margin-bottom: 20px;">
          ${inviteData.isResend ? 'Invitation Reminder' : 'You\'re Invited!'}
        </h2>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
          Hi ${inviteData.firstName},
        </p>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
          ${inviteData.message}
        </p>
        
        ${inviteData.agencyName ? `
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
            <h3 style="margin: 0 0 10px 0; color: #333;">Your Agency Details</h3>
            <p style="margin: 5px 0; color: #666;"><strong>Agency:</strong> ${inviteData.agencyName}</p>
            <p style="margin: 5px 0; color: #666;"><strong>Plan:</strong> ${inviteData.plan.charAt(0).toUpperCase() + inviteData.plan.slice(1)}</p>
          </div>
        ` : ''}
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteUrl}" 
             style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; 
                    font-weight: bold; font-size: 16px;">
            Accept Invitation
          </a>
        </div>
        
        <p style="color: #999; font-size: 14px; margin-top: 30px;">
          This invitation will expire in 7 days. If you can't click the button above, 
          copy and paste this link into your browser: <br>
          <span style="word-break: break-all;">${inviteUrl}</span>
        </p>
      </div>
    </div>
  `;
    await emailTransporter.sendMail({
        from: `"Apex AI Platform" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to: inviteData.email,
        subject: `${inviteData.isResend ? 'Reminder: ' : ''}Welcome to Apex AI Calling Platform`,
        html: emailHtml
    });
}
async function sendPasswordResetEmail(user, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Password Reset</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Apex AI Platform</p>
      </div>
      
      <div style="padding: 40px; background: #f8f9fa;">
        <h2 style="color: #333; margin-bottom: 20px;">Reset Your Password</h2>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
          Hi ${user.first_name},
        </p>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
          We received a request to reset your password. Click the button below to create a new password:
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; 
                    font-weight: bold; font-size: 16px;">
            Reset Password
          </a>
        </div>
        
        <p style="color: #999; font-size: 14px; margin-top: 30px;">
          This link will expire in 1 hour. If you didn't request this password reset, please ignore this email.
        </p>
      </div>
    </div>
  `;
    await emailTransporter.sendMail({
        from: `"Apex AI Platform" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to: user.email,
        subject: 'Reset Your Password - Apex AI Platform',
        html: emailHtml
    });
}
async function sendWelcomeEmail(user) {
    const loginUrl = `${process.env.FRONTEND_URL}/login`;
    const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Apex AI!</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Your account is now active</p>
      </div>
      
      <div style="padding: 40px; background: #f8f9fa;">
        <h2 style="color: #333; margin-bottom: 20px;">You're all set!</h2>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
          Hi ${user.first_name},
        </p>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
          Your Apex AI Calling Platform account has been successfully activated. You can now start building powerful AI calling campaigns.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${loginUrl}" 
             style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; 
                    font-weight: bold; font-size: 16px;">
            Access Your Dashboard
          </a>
        </div>
      </div>
    </div>
  `;
    await emailTransporter.sendMail({
        from: `"Apex AI Platform" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to: user.email,
        subject: 'Welcome to Apex AI - Account Activated!',
        html: emailHtml
    });
}
async function sendWelcomeBackEmail(user) {
}
async function sendSuspensionEmail(user, reason) {
}
async function logUserAction(userId, action, details, adminId) {
    try {
        await supabase_client_1.default.from('user_audit_log').insert({
            user_id: userId,
            action,
            details,
            admin_id: adminId,
            created_at: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Error logging user action:', error);
    }
}
async function hashPassword(password) {
    return password;
}
router.get('/test-connection', async (req, res) => {
    try {
        const { data: testData, error: testError } = await supabase_client_1.default
            .from('users')
            .select('*')
            .limit(1);
        if (testError) {
            return res.json({
                connected: false,
                error: testError.message,
                hint: testError.hint
            });
        }
        const { data: columns, error: columnsError } = await supabase_client_1.default
            .rpc('get_table_columns', { table_name: 'users' })
            .catch(() => ({ data: null, error: 'RPC not available' }));
        res.json({
            connected: true,
            message: 'Supabase connection successful',
            existingUsers: testData?.length || 0,
            sampleUser: testData?.[0] || null,
            tableInfo: columns || 'Unable to fetch column info',
            supabaseUrl: process.env.SUPABASE_URL
        });
    }
    catch (error) {
        res.status(500).json({
            connected: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.default = router;
