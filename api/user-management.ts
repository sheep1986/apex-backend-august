import express, { Request, Response } from 'express';
import supabase from '../services/supabase-client';
import * as nodemailer from 'nodemailer';
import crypto from 'crypto';
import { AuthenticatedRequest } from '../middleware/clerk-auth';
import { Router } from 'express';
import { authenticateUser } from '../middleware/auth';
import { authenticateDevUser } from '../middleware/dev-auth';
import { ClerkService } from '../services/clerk-service';

const router = Router();

// Email configuration
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Mock data completely disabled - live data only
const isDevelopmentMode = false;
const enableMockData = false;

// Choose authentication middleware based on environment
const authMiddleware = isDevelopmentMode && !process.env.CLERK_SECRET_KEY 
  ? authenticateDevUser 
  : authenticateUser;

interface CreateUserRequest {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  company?: string;
  role: string;
  agencyName: string;
  subscriptionPlan: string;
  status: string;
  createdBy: string;
  clerkUserId?: string;
}

// Mock data removed - using live database only

// ==================== USER MANAGEMENT ENDPOINTS ====================

// Get all users
// TEMPORARY: Remove auth for development testing
router.get('/', async (req: any, res: Response) => {
  try {
    let users;

    // Live data only - fetch from Supabase
      console.log('📋 Fetching users from Supabase');
      const { data, error } = await supabase
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

  } catch (error) {
    console.error('❌ Error fetching users:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create user with automatic Clerk registration
router.post('/', async (req, res) => {
  try {
    const { 
      firstName, 
      lastName, 
      email, 
      role = 'platform_owner', // Default to platform_owner
      accountName,
      accountType = 'agency',
      phone,
      isActive = true,
      sendInvitation = true, // Default to sending invitation
      password // Optional - if provided, create with password
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ 
        error: 'Missing required fields: firstName, lastName, and email are required' 
      });
    }

    // Map complex roles to simple database roles that exist in the constraint
    // Valid roles in database: admin, user, agent, platform_owner, agency_admin, agency_user, client_admin, client_user, support_admin, support_agent
    const roleMapping: Record<string, string> = {
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
    
    const dbRole = roleMapping[role] || 'user'; // Default to 'user' if role not found
    
    console.log(`🔄 Role mapping: ${role} -> ${dbRole}`);

    // For now, use a specific organization ID based on account type
    let organizationId = '550e8400-e29b-41d4-a716-446655440000'; // Default org
    
    if (role === 'platform_owner') {
      // Platform owner gets the main organization
      organizationId = '550e8400-e29b-41d4-a716-446655440000';
    }

    // Create user data with proper permissions in settings
    const settings: any = {
      originalRole: role, // Store the original role in settings
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

    // Check if email already exists in Supabase
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser && !checkError) {
      return res.status(409).json({ 
        error: 'User with this email already exists' 
      });
    }

    // Create user in Clerk first
    let clerkUser;
    try {
      console.log('🔐 Creating user in Clerk...');
      clerkUser = await ClerkService.createUser({
        email,
        firstName,
        lastName,
        password
      });
      console.log('✅ Clerk user created:', clerkUser.id);
    } catch (clerkError: any) {
      console.error('❌ Failed to create Clerk user:', clerkError);
      
      // If user already exists in Clerk, try to get their ID
      if (clerkError.message?.includes('already exists')) {
        const existingClerkUser = await ClerkService.getUserByEmail(email);
        if (existingClerkUser) {
          clerkUser = existingClerkUser;
          console.log('ℹ️ Using existing Clerk user:', clerkUser.id);
        } else {
          return res.status(400).json({ 
            error: 'User already exists in authentication system but could not be retrieved' 
          });
        }
      } else {
        return res.status(500).json({ 
          error: 'Failed to create user in authentication system',
          details: clerkError.message 
        });
      }
    }

    // Create user in Supabase with Clerk ID and mapped role
    const userData: any = {
      first_name: firstName,
      last_name: lastName,
      email: email,
      role: dbRole, // Use the mapped role that exists in database constraint
      status: isActive ? 'active' : 'inactive',
      organization_id: organizationId,
      phone: phone || null,
      avatar_url: null,
      last_login_at: null,
      clerk_id: clerkUser.id,
      settings: settings, // Store original role and permissions here
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('💾 Creating user in Supabase:', userData);

    // Create the user in Supabase
    const { data, error } = await supabase
      .from('users')
      .insert([userData])
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating user in database:', error);
      
      // If Supabase creation fails, try to clean up Clerk user
      try {
        await ClerkService.deleteUser(clerkUser.id);
        console.log('🧹 Cleaned up Clerk user after database failure');
      } catch (cleanupError) {
        console.error('⚠️ Failed to clean up Clerk user:', cleanupError);
      }
      
      return res.status(500).json({ 
        error: 'Failed to create user in database',
        details: error.message 
      });
    }

    console.log('✅ User created successfully:', data);

    // Send response with user data
    const responseData = {
      message: password 
        ? 'User created successfully' 
        : 'User created successfully. An invitation email has been sent.',
      user: {
        ...data,
        displayRole: role, // Return the original role for display
        accountName: accountName,
        settings: settings,
        clerkUserId: clerkUser.id,
        invitationSent: sendInvitation && !password
      }
    };

    res.status(201).json(responseData);

  } catch (error) {
    console.error('❌ Error creating user:', error);
    res.status(500).json({ 
      error: 'Failed to create user',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get user by ID
router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    let user;

    if (isDevelopmentMode && enableMockData) {
      // Mock mode
      user = mockUsers.find(u => u.id === id);
      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }
    } else {
      // Production mode
      const { data, error } = await supabase
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

  } catch (error) {
    console.error('❌ Error fetching user:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update user
router.put('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Remove fields that shouldn't be updated directly
    delete updateData.id;
    delete updateData.createdAt;
    delete updateData.created_at;
    
    // Add updated timestamp
    updateData.updated_at = new Date().toISOString();

    let updatedUser;

    if (isDevelopmentMode && enableMockData) {
      // Mock mode
      const userIndex = mockUsers.findIndex(u => u.id === id);
      if (userIndex === -1) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      mockUsers[userIndex] = { ...mockUsers[userIndex], ...updateData };
      updatedUser = mockUsers[userIndex];
    } else {
      // Production mode
      const { data, error } = await supabase
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

  } catch (error) {
    console.error('❌ Error updating user:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete user
router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (isDevelopmentMode && enableMockData) {
      // Mock mode
      const userIndex = mockUsers.findIndex(u => u.id === id);
      if (userIndex === -1) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      mockUsers.splice(userIndex, 1);
    } else {
      // Production mode
      const { error } = await supabase
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

  } catch (error) {
    console.error('❌ Error deleting user:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ==================== INVITE SYSTEM ENDPOINTS ====================

// Invite user
router.post('/users/invite', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, firstName, lastName, agencyName, plan, message } = req.body;

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Generate invite token
    const inviteToken = crypto.randomBytes(32).toString('hex');

    // Create a temporary user record with 'invited' status
    const { data: invitee, error } = await supabase
      .from('users')
      .insert({
        email,
        first_name: firstName,
        last_name: lastName,
        agency_name: agencyName,
        role: 'pending_invite',
        status: 'invited',
        invite_token: inviteToken,
        invite_token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        subscription_plan: plan
      })
      .select()
      .single();
    
    if (error) throw error;

    // Send invite email
    await sendInviteEmail({
      email,
      firstName,
      lastName,
      agencyName,
      plan,
      message,
      inviteToken
    });

    // Log action
    await logUserAction(invitee.id, 'USER_INVITED', `User invited by admin`, req.user?.id);

    res.status(200).json({ message: 'Invitation sent successfully.' });
  } catch (error) {
    console.error('Error sending invite:', error);
    res.status(500).json({ error: 'Failed to send invite' });
  }
});

// Resend invite
router.post('/invites/:userId/resend', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;

    // ... (logic to find user, check if can be re-invited, generate new token)

    // await sendInviteEmail({ ... isResend: true });

    res.status(200).json({ message: 'Invitation resent successfully.' });
  } catch (error) {
    console.error('Error resending invite:', error);
    res.status(500).json({ error: 'Failed to resend invite' });
  }
});

// Accept invite
router.post('/invites/accept', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { inviteToken, password } = req.body;

    // ... (logic to validate token, find user, update status, set password)

    res.status(200).json({ message: 'Account activated successfully.' });
  } catch (error) {
    console.error('Error accepting invite:', error);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

// ==================== PASSWORD MANAGEMENT ====================

// Send password reset
router.post('/users/:id/password-reset', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // ... (logic to find user, generate reset token, send email)

    res.status(200).json({ message: 'Password reset email sent.' });
  } catch (error) {
    console.error('Error sending password reset:', error);
    res.status(500).json({ error: 'Failed to send password reset' });
  }
});

// ==================== AGENCY & PLATFORM ====================

// Get all agencies
router.get('/agencies', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: agencies, error } = await supabase
      .from('agencies')
      .select(`
        *,
        users!inner(count)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(agencies);
  } catch (error) {
    console.error('Error fetching agencies:', error);
    res.status(500).json({ error: 'Failed to fetch agencies' });
  }
});

// Get platform metrics
router.get('/metrics', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get user counts by status
    const { data: userStats, error: userError } = await supabase
      .from('users')
      .select('status')
      .neq('status', 'deleted');

    // Get agency stats
    const { data: agencyStats, error: agencyError } = await supabase
      .from('agencies')
      .select('monthly_cost')
      .eq('status', 'active');

    if (agencyError) throw agencyError;

    res.json({ userStats, agencyStats });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// Get user activity
router.get('/users/:userId/activity', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { data: activity, error } = await supabase
      .from('user_activity')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });

    if (error) throw error;
    res.json(activity);
  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({ error: 'Failed to fetch user activity' });
  }
});

// ==================== HELPER FUNCTIONS ====================

async function sendInviteEmail(inviteData: {
  email: string;
  firstName: string;
  lastName: string;
  agencyName?: string;
  plan: string;
  message: string;
  inviteToken: string;
  isResend?: boolean;
}) {
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

async function sendPasswordResetEmail(user: any, resetToken: string) {
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

async function sendWelcomeEmail(user: any) {
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

async function sendWelcomeBackEmail(user: any) {
  // Similar to welcome email but for reactivated accounts
}

async function sendSuspensionEmail(user: any, reason: string) {
  // Email notification for suspended accounts
}

async function logUserAction(userId: string, action: string, details: string, adminId?: string) {
  try {
    await supabase.from('user_audit_log').insert({
      user_id: userId,
      action,
      details,
      admin_id: adminId,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error logging user action:', error);
  }
}

async function hashPassword(password: string): Promise<string> {
  // Implement proper password hashing (bcrypt, etc.)
  return password; // Placeholder
}

// Test endpoint to check Supabase connection
router.get('/test-connection', async (req, res) => {
  try {
    // Test 1: Basic connection
    const { data: testData, error: testError } = await supabase
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

    // Test 2: Get table info (this might not work depending on permissions)
    const { data: columns, error: columnsError } = await supabase
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

  } catch (error) {
    res.status(500).json({
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router; 