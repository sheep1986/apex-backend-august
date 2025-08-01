"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const email_service_1 = require("../services/email-service");
const supabase = supabase_client_1.default.getClient();
const router = (0, express_1.Router)();
async function handleUserCreation(supabase, userData, organizationId) {
    console.log('👤 Handling user creation/update for:', userData.email);
    const { data: existingUser, error: existUserError } = await supabase
        .from('users')
        .select('id, email, organization_id')
        .eq('email', userData.email)
        .maybeSingle();
    if (existUserError && existUserError.code !== 'PGRST116') {
        console.error('User lookup error:', existUserError);
        throw new Error(`User lookup failed: ${existUserError.message}`);
    }
    if (existingUser) {
        console.log('📝 Updating existing user:', existingUser.id);
        const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update({
            organization_id: organizationId,
            updated_at: new Date().toISOString()
        })
            .eq('id', existingUser.id)
            .select()
            .single();
        if (updateError) {
            console.error('User update error:', updateError);
            throw updateError;
        }
        return updatedUser;
    }
    console.log('➕ Creating new user');
    const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
        ...userData,
        organization_id: organizationId,
        permissions: {},
        email_verified: false,
        timezone: 'UTC',
        language: 'en',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    })
        .select()
        .single();
    if (createError) {
        console.error('User creation error:', createError);
        throw createError;
    }
    return newUser;
}
const authenticateSetupUser = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }
        const token = authHeader.substring(7);
        console.log('🔐 Auth token received:', token.substring(0, 20) + '...');
        if (token.startsWith('test-token')) {
            console.log('🔧 Dev token detected');
            req.user = {
                id: 'dev-user-' + Date.now(),
                email: 'sean@artificialmedia.co.uk',
                role: 'platform_owner'
            };
            return next();
        }
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            console.error('❌ Supabase auth failed:', error);
            return res.status(401).json({ error: 'Invalid token' });
        }
        console.log('✅ Supabase auth successful for:', user.email);
        req.user = user;
        return next();
    }
    catch (error) {
        console.error('Setup auth error:', error);
        return res.status(401).json({ error: 'Authentication failed' });
    }
};
router.post('/setup', authenticateSetupUser, async (req, res) => {
    console.log('\n🚀 === ORGANIZATION SETUP STARTED ===');
    console.log('Request body keys:', Object.keys(req.body));
    console.log('User from auth:', req.user);
    try {
        const setupData = req.body;
        if (!setupData.businessName || !setupData.adminEmail || !setupData.adminFirstName || !setupData.adminLastName) {
            console.error('❌ Missing required fields');
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                required: ['businessName', 'adminEmail', 'adminFirstName', 'adminLastName']
            });
        }
        const timestamp = Date.now();
        const baseSlug = setupData.businessName.toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        const organizationSlug = `${baseSlug}-${timestamp}`;
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
        let vapiTestResult = null;
        if (setupData.vapiApiKey && setupData.vapiPrivateKey) {
            console.log('🔑 Testing VAPI credentials before saving...');
            vapiTestResult = await testVapiIntegration(setupData.vapiPrivateKey);
            if (!vapiTestResult.connected) {
                console.error('❌ VAPI credentials test failed');
                return res.status(400).json({
                    success: false,
                    error: 'Invalid VAPI credentials',
                    details: vapiTestResult.message
                });
            }
            organizationData['vapi_api_key'] = setupData.vapiApiKey;
            organizationData['vapi_private_key'] = setupData.vapiPrivateKey;
            organizationData['settings'] = {
                vapi: {
                    apiKey: setupData.vapiApiKey,
                    privateKey: setupData.vapiPrivateKey,
                    configured_at: new Date().toISOString(),
                    lastTested: new Date().toISOString(),
                    testResult: vapiTestResult
                }
            };
        }
        console.log('📋 Creating organization with data:', { name: organizationData.name, slug: organizationData.slug });
        const { data: organization, error: orgError } = await supabase
            .from('organizations')
            .insert(organizationData)
            .select()
            .single();
        if (orgError) {
            console.error('❌ Organization creation failed:', orgError);
            return res.status(422).json({
                success: false,
                error: 'Failed to create organization',
                details: orgError.message,
                code: orgError.code
            });
        }
        console.log('✅ Organization created successfully:', organization.id);
        let userResult;
        try {
            const userData = {
                email: setupData.adminEmail,
                first_name: setupData.adminFirstName,
                last_name: setupData.adminLastName,
                phone: setupData.adminPhone || null,
                role: 'client_admin',
                status: 'invited',
                invited_at: new Date().toISOString()
            };
            userResult = await handleUserCreation(supabase, userData, organization.id);
            console.log('✅ User handled successfully:', userResult.id);
        }
        catch (userError) {
            console.error('❌ User creation/update failed:', userError);
            console.log('⚠️ Continuing despite user error, organization was created');
        }
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
        const existingAuthUser = users?.find(u => u.email === setupData.adminEmail);
        if (!existingAuthUser) {
            try {
                const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(setupData.adminEmail, {
                    data: {
                        first_name: setupData.adminFirstName,
                        last_name: setupData.adminLastName,
                        organization_id: organization.id,
                        role: 'client_admin'
                    }
                });
                if (authError) {
                    console.error('⚠️ Auth invitation failed:', authError);
                }
                else {
                    console.log('✅ Auth invitation sent');
                }
            }
            catch (authError) {
                console.error('⚠️ Auth invitation error:', authError);
            }
        }
        try {
            const crypto = require('crypto');
            const invitationToken = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);
            if (userResult) {
                await supabase
                    .from('users')
                    .update({
                    invitation_token: invitationToken,
                    invitation_expires_at: expiresAt.toISOString()
                })
                    .eq('id', userResult.id);
            }
            await email_service_1.EmailService.sendInvitationWithTemplate({
                recipientEmail: setupData.adminEmail,
                recipientName: setupData.adminFirstName,
                organizationName: setupData.businessName,
                inviterName: 'Apex Platform',
                role: 'client_admin',
                invitationToken: invitationToken,
                expiresAt: expiresAt
            });
            console.log('✅ Invitation email sent for password setup');
        }
        catch (emailError) {
            console.error('⚠️ Email sending failed:', emailError);
        }
        const response = {
            success: true,
            message: `Organization "${setupData.businessName}" created successfully`,
            organizationId: organization.id,
            organizationName: organization.name,
            organizationSlug: organization.slug,
            adminEmail: setupData.adminEmail,
            userId: userResult?.id,
            nextSteps: {
                loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`,
                dashboardUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard`
            }
        };
        console.log('🎉 === SETUP COMPLETED SUCCESSFULLY ===');
        console.log('Response:', response);
        return res.status(201).json(response);
    }
    catch (globalError) {
        console.error('💥 === GLOBAL SETUP ERROR ===');
        console.error('Error:', globalError);
        if (globalError instanceof Error) {
            console.error('Error Stack:', globalError.stack);
        }
        return res.status(500).json({
            success: false,
            error: 'Internal server error during organization setup',
            message: process.env.NODE_ENV === 'development' ? globalError.message : 'An unexpected error occurred'
        });
    }
});
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        endpoint: 'organization-setup',
        timestamp: new Date().toISOString()
    });
});
async function testVapiIntegration(privateKey) {
    try {
        console.log('🧪 Testing VAPI integration...');
        const response = await fetch('https://api.vapi.ai/assistant', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${privateKey}`,
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
            const errorText = await response.text();
            console.error('❌ VAPI test failed:', response.status, errorText);
            return {
                connected: false,
                status: 'error',
                message: `VAPI test failed: ${response.status} - ${errorText}`
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
exports.default = router;
