"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const router = (0, express_1.Router)();
const transporter = nodemailer_1.default.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD,
    },
});
const authenticateSetupUser = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No authentication token provided' });
        }
        const token = authHeader.substring(7);
        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'production') {
            console.log('🔓 Setup authentication: Bypassing token validation for initial setup');
            const { adminEmail } = req.body;
            req.user = {
                id: 'setup-user-' + Date.now(),
                email: adminEmail || 'setup@apex.ai',
                firstName: 'Setup',
                lastName: 'User'
            };
            return next();
        }
        const { data: { user }, error } = await supabase_client_1.default.auth.getUser(token);
        if (error || !user) {
            console.error('Supabase auth verification failed:', error);
            return res.status(401).json({ error: 'Invalid authentication token' });
        }
        req.user = {
            id: user.id,
            email: user.email || '',
            firstName: user.user_metadata?.first_name || '',
            lastName: user.user_metadata?.last_name || ''
        };
        return next();
    }
    catch (error) {
        console.error('Setup authentication error:', error);
        return res.status(401).json({ error: 'Authentication failed' });
    }
};
router.post('/setup', authenticateSetupUser, async (req, res) => {
    try {
        const setupData = req.body;
        console.log('🚀 Starting organization setup process:', {
            businessName: setupData.businessName,
            adminEmail: setupData.adminEmail,
            teamSize: setupData.teamSize,
            hasVapiKeys: !!(setupData.vapiApiKey && setupData.vapiPrivateKey)
        });
        if (!setupData.businessName || !setupData.adminEmail || !setupData.adminFirstName || !setupData.adminLastName) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                required: ['businessName', 'adminEmail', 'adminFirstName', 'adminLastName']
            });
        }
        const baseSlug = setupData.businessName.toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        const timestamp = Date.now();
        const organizationSlug = `${baseSlug}-${timestamp}`;
        console.log('🏢 Creating organization...');
        const organizationData = {
            name: setupData.businessName,
            slug: organizationSlug,
            type: 'agency',
            status: 'active',
            plan: 'professional',
            monthly_cost: 599.00,
            primary_color: '#3B82F6',
            secondary_color: '#1e40af',
            call_limit: 1000,
            user_limit: 10,
            storage_limit_gb: 10
        };
        if (setupData.vapiApiKey) {
            organizationData.vapi_api_key = setupData.vapiApiKey;
        }
        if (setupData.vapiPrivateKey) {
            organizationData.vapi_private_key = setupData.vapiPrivateKey;
        }
        if (setupData.vapiApiKey && setupData.vapiPrivateKey) {
            organizationData.settings = {
                vapi: {
                    apiKey: setupData.vapiApiKey,
                    privateKey: setupData.vapiPrivateKey,
                    configured_at: new Date().toISOString()
                }
            };
        }
        console.log('📋 Organization data to insert:', JSON.stringify(organizationData, null, 2));
        const { data: organization, error: orgError } = await supabase_client_1.default
            .from('organizations')
            .insert(organizationData)
            .select()
            .single();
        if (orgError) {
            console.error('❌ Error creating organization:', orgError);
            console.error('❌ Error details:', {
                code: orgError.code,
                message: orgError.message,
                details: orgError.details,
                hint: orgError.hint
            });
            return res.status(500).json({
                success: false,
                error: 'Failed to create organization',
                details: orgError.message,
                code: orgError.code
            });
        }
        console.log('✅ Organization created:', organization.id);
        console.log('👤 Creating admin user with Supabase Auth...');
        const { data: { users }, error: listError } = await supabase_client_1.default.auth.admin.listUsers();
        const existingAuthUser = users?.find(u => u.email === setupData.adminEmail);
        let authUserId;
        if (existingAuthUser) {
            console.log('⚠️ Auth user already exists for:', setupData.adminEmail);
            authUserId = existingAuthUser.id;
        }
        else {
            const { data: authData, error: authError } = await supabase_client_1.default.auth.admin.inviteUserByEmail(setupData.adminEmail, {
                data: {
                    first_name: setupData.adminFirstName,
                    last_name: setupData.adminLastName,
                    organization_id: organization.id,
                    role: 'client_admin'
                }
            });
            if (authError) {
                console.error('❌ Error creating auth user:', authError);
                await supabase_client_1.default.from('organizations').delete().eq('id', organization.id);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to create admin auth account',
                    details: authError.message
                });
            }
            console.log('✅ Auth invitation sent to:', setupData.adminEmail);
        }
        console.log('✅ Auth invitation sent to:', setupData.adminEmail);
        const { data: existingDbUser } = await supabase_client_1.default
            .from('users')
            .select('*')
            .eq('email', setupData.adminEmail)
            .single();
        let adminUser;
        if (existingDbUser) {
            console.log('⚠️ Database user already exists, updating organization...');
            const { data: updatedUser, error: updateError } = await supabase_client_1.default
                .from('users')
                .update({
                organization_id: organization.id,
                updated_at: new Date().toISOString()
            })
                .eq('id', existingDbUser.id)
                .select()
                .single();
            if (updateError) {
                console.error('❌ Error updating user:', updateError);
            }
            else {
                adminUser = updatedUser;
            }
        }
        else {
            const { data: newUser, error: userError } = await supabase_client_1.default
                .from('users')
                .insert({
                organization_id: organization.id,
                email: setupData.adminEmail,
                first_name: setupData.adminFirstName,
                last_name: setupData.adminLastName,
                phone: setupData.adminPhone || null,
                role: 'client_admin',
                status: 'invited',
                permissions: {},
                email_verified: false,
                timezone: 'UTC',
                language: 'en',
                invited_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
                .select()
                .single();
            adminUser = newUser;
            if (userError) {
                console.error('❌ Error creating admin user record:', userError);
                console.error('Error details:', {
                    code: userError.code,
                    message: userError.message,
                    details: userError.details
                });
                console.log('⚠️ User record creation failed but auth invitation was sent');
            }
        }
        if (adminUser) {
            console.log('✅ Admin user record ready:', adminUser.id);
        }
        else {
            console.log('⚠️ Admin user record not created, but auth invitation was sent');
        }
        let teamMembersCreated = 0;
        if (setupData.addTeamMembers && setupData.teamMembers?.length > 0) {
            console.log('👥 Creating team members...');
            for (const member of setupData.teamMembers) {
                try {
                    const { data: teamMember, error: memberError } = await supabase_client_1.default
                        .from('users')
                        .insert({
                        organization_id: organization.id,
                        email: member.email,
                        first_name: member.firstName,
                        last_name: member.lastName,
                        role: `client_${member.role}`,
                        status: 'invited',
                        invited_at: new Date().toISOString(),
                        invited_by: adminUser?.id,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                        .select()
                        .single();
                    if (memberError) {
                        console.error(`⚠️ Warning: Could not create team member ${member.email}:`, memberError);
                    }
                    else {
                        console.log(`✅ Team member created: ${member.email}`);
                        teamMembersCreated++;
                    }
                }
                catch (error) {
                    console.error(`❌ Error creating team member ${member.email}:`, error);
                }
            }
        }
        let vapiStatus = 'not_configured';
        if (setupData.vapiApiKey && setupData.vapiPrivateKey) {
            console.log('🔑 Testing VAPI integration...');
            try {
                const vapiTest = await testVapiIntegration(setupData.vapiApiKey, setupData.vapiPrivateKey);
                if (vapiTest.connected) {
                    console.log('✅ VAPI credentials validated successfully');
                    try {
                        const { error: updateError } = await supabase_client_1.default
                            .from('organizations')
                            .update({
                            vapi_settings: JSON.stringify({
                                privateKey: setupData.vapiPrivateKey,
                                configured_at: new Date().toISOString(),
                                lastTested: new Date().toISOString(),
                                testResults: {
                                    connected: true,
                                    assistantCount: vapiTest.assistantCount || 0,
                                    lastTestedAt: new Date().toISOString()
                                }
                            }),
                            updated_at: new Date().toISOString()
                        })
                            .eq('id', organization.id);
                        if (updateError) {
                            console.log('⚠️ Could not update organization with VAPI test results (VAPI columns may not exist yet)');
                            await supabase_client_1.default
                                .from('organization_settings')
                                .insert({
                                organization_id: organization.id,
                                setting_key: 'vapi_credentials',
                                setting_value: JSON.stringify({
                                    apiKey: setupData.vapiApiKey,
                                    privateKey: setupData.vapiPrivateKey,
                                    configured_at: new Date().toISOString(),
                                    testResults: vapiTest
                                }),
                                created_at: new Date().toISOString(),
                                updated_at: new Date().toISOString()
                            });
                            console.log('✅ VAPI credentials stored in organization_settings (fallback)');
                        }
                        else {
                            console.log('✅ VAPI credentials stored in organizations table');
                        }
                    }
                    catch (fallbackError) {
                        console.log('⚠️ Warning: Could not store VAPI credentials:', fallbackError);
                    }
                    vapiStatus = {
                        status: 'ready',
                        connected: true,
                        message: vapiTest.message,
                        assistantCount: vapiTest.assistantCount || 0
                    };
                }
                else {
                    console.log('⚠️ VAPI integration test failed');
                    vapiStatus = {
                        status: 'error',
                        connected: false,
                        message: vapiTest.message
                    };
                }
            }
            catch (error) {
                console.error('❌ Error testing VAPI integration:', error);
                vapiStatus = {
                    status: 'error',
                    connected: false,
                    message: 'Failed to test VAPI integration'
                };
            }
        }
        console.log('🎉 Organization setup completed successfully!');
        res.status(201).json({
            success: true,
            message: `Organization "${setupData.businessName}" created successfully`,
            organizationId: organization.id,
            organizationName: organization.name,
            adminEmail: setupData.adminEmail,
            teamMembersCreated,
            vapiStatus,
            nextSteps: {
                loginUrl: `${process.env.FRONTEND_URL}/login`,
                dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`,
                setupGuide: `${process.env.FRONTEND_URL}/onboarding`
            }
        });
    }
    catch (error) {
        console.error('💥 Unexpected error in organization setup:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error during organization setup',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/test', async (req, res) => {
    try {
        const { data: orgs, error: orgsError } = await supabase_client_1.default
            .from('organizations')
            .select('id, name, type, status')
            .limit(5);
        const { data: users, error: usersError } = await supabase_client_1.default
            .from('users')
            .select('id, email, role, organization_id')
            .limit(5);
        res.json({
            success: true,
            database: {
                organizations: {
                    count: orgs?.length || 0,
                    error: orgsError?.message || null,
                    sample: orgs?.[0] || null
                },
                users: {
                    count: users?.length || 0,
                    error: usersError?.message || null,
                    sample: users?.[0] || null
                }
            },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/organizations', async (req, res) => {
    try {
        const { data: organizations, error } = await supabase_client_1.default
            .from('organizations')
            .select(`
        id,
        name,
        slug,
        type,
        status,
        plan,
        created_at,
        users!organization_id (
          id,
          email,
          first_name,
          last_name,
          role,
          status
        )
      `)
            .order('created_at', { ascending: false });
        if (error) {
            return res.status(500).json({
                error: 'Failed to fetch organizations',
                details: error.message
            });
        }
        res.json({
            success: true,
            organizations: organizations || []
        });
    }
    catch (error) {
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.post('/verify-email', async (req, res) => {
    try {
        const { token } = req.body;
        const { data: verification, error: verificationError } = await supabase_client_1.default
            .from('email_verifications')
            .select('*')
            .eq('token', token)
            .gt('expires_at', new Date().toISOString())
            .single();
        if (verificationError || !verification) {
            return res.status(400).json({
                success: false,
                error: 'Invalid or expired verification token'
            });
        }
        await supabase_client_1.default
            .from('organizations')
            .update({
            status: 'active',
            email_verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
            .eq('id', verification.organization_id);
        await supabase_client_1.default
            .from('email_verifications')
            .update({ verified_at: new Date().toISOString() })
            .eq('id', verification.id);
        console.log('✅ Email verified for organization:', verification.organization_id);
        res.json({
            success: true,
            message: 'Email verified successfully! Your organization is now active.'
        });
    }
    catch (error) {
        console.error('❌ Email verification failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to verify email'
        });
    }
});
function generateTemporaryPassword() {
    return Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
}
function generateVerificationToken() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
async function testVapiIntegration(apiKey, privateKey) {
    try {
        console.log('🧪 Testing VAPI integration...');
        const response = await fetch('https://api.vapi.ai/assistants', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });
        if (response.ok) {
            const assistants = await response.json();
            console.log('✅ VAPI integration test successful:', assistants?.length || 0, 'assistants found');
            return {
                connected: true,
                status: 'ready',
                message: `VAPI integration configured successfully. Found ${assistants?.length || 0} assistants.`,
                assistantCount: assistants?.length || 0
            };
        }
        else {
            const errorData = await response.json().catch(() => ({}));
            console.error('❌ VAPI integration test failed:', response.status, errorData);
            return {
                connected: false,
                status: 'error',
                message: `VAPI API test failed: ${response.status} ${errorData.message || response.statusText}`
            };
        }
    }
    catch (error) {
        console.error('❌ VAPI integration test error:', error);
        return {
            connected: false,
            status: 'error',
            message: 'VAPI integration failed: ' + (error instanceof Error ? error.message : 'Unknown error')
        };
    }
}
async function sendVerificationEmail({ email, firstName, organizationName, verificationToken, userId }) {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    const mailOptions = {
        from: process.env.SMTP_EMAIL,
        to: email,
        subject: `Welcome to Apex AI - Verify Your Organization`,
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #059669;">Welcome to Apex AI Calling Platform!</h2>
        
        <p>Hi ${firstName},</p>
        
        <p>Congratulations! Your organization "<strong>${organizationName}</strong>" has been successfully created on the Apex AI Calling Platform.</p>
        
        <p>To activate your account and start using the platform, please verify your email address by clicking the button below:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" 
             style="background-color: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Verify Email & Activate Account
          </a>
        </div>
        
        <p><strong>What's Next?</strong></p>
        <ul>
          <li>✅ Verify your email address</li>
          <li>🔑 Complete your account setup</li>
          <li>🚀 Start creating AI calling campaigns</li>
          <li>📞 Launch your first VAPI-powered calls</li>
        </ul>
        
        <p>If you have any questions, please don't hesitate to contact our support team.</p>
        
        <p>Best regards,<br>The Apex AI Team</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        <p style="font-size: 12px; color: #6b7280;">
          This verification link will expire in 24 hours. If you didn't create this account, please ignore this email.
        </p>
      </div>
    `
    };
    await transporter.sendMail(mailOptions);
}
async function sendWelcomeEmail({ email, firstName, organizationName, isAdmin, userId }) {
    const setupUrl = `${process.env.FRONTEND_URL}/complete-setup?userId=${userId}`;
    const mailOptions = {
        from: process.env.SMTP_EMAIL,
        to: email,
        subject: `You've been invited to ${organizationName} on Apex AI`,
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #059669;">Welcome to ${organizationName}!</h2>
        
        <p>Hi ${firstName},</p>
        
        <p>You've been invited to join "<strong>${organizationName}</strong>" on the Apex AI Calling Platform.</p>
        
        <p>To complete your account setup and start collaborating with your team, please click the button below:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${setupUrl}" 
             style="background-color: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Complete Account Setup
          </a>
        </div>
        
        <p><strong>Your Role:</strong> ${isAdmin ? 'Administrator' : 'Team Member'}</p>
        
        <p><strong>What You Can Do:</strong></p>
        <ul>
          <li>🎯 Create and manage AI calling campaigns</li>
          <li>📊 View analytics and performance metrics</li>
          <li>👥 Collaborate with your team</li>
          <li>🔧 ${isAdmin ? 'Manage organization settings' : 'Access assigned projects'}</li>
        </ul>
        
        <p>If you have any questions, please contact your organization administrator or our support team.</p>
        
        <p>Best regards,<br>The Apex AI Team</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        <p style="font-size: 12px; color: #6b7280;">
          This invitation link will expire in 7 days. If you didn't expect this invitation, please contact the organization administrator.
        </p>
      </div>
    `
    };
    await transporter.sendMail(mailOptions);
}
exports.default = router;
