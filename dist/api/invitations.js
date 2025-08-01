"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const uuid_1 = require("uuid");
const crypto_1 = __importDefault(require("crypto"));
const email_service_1 = require("../services/email-service");
const clerk_service_1 = require("../services/clerk-service");
const router = (0, express_1.Router)();
function generateInvitationToken() {
    return crypto_1.default.randomBytes(32).toString('hex');
}
async function sendInvitationEmail(invitation, inviterName, organizationName) {
    try {
        await email_service_1.EmailService.sendInvitationWithTemplate({
            recipientEmail: invitation.email,
            recipientName: `${invitation.first_name} ${invitation.last_name}`,
            organizationName: organizationName,
            inviterName: inviterName,
            role: invitation.role,
            invitationToken: invitation.token,
            expiresAt: new Date(invitation.expires_at)
        });
        const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accept-invitation?token=${invitation.token}`;
        return { success: true, inviteLink };
    }
    catch (error) {
        console.error('Error sending invitation email:', error);
        throw error;
    }
}
router.post('/organizations/:orgId/invite', async (req, res) => {
    try {
        const { orgId } = req.params;
        const { email, firstName, lastName, role = 'client_user' } = req.body;
        console.log('📨 Creating invitation:', { orgId, email, firstName, lastName, role });
        if (!email || !firstName || !lastName) {
            return res.status(400).json({
                error: 'Email, first name, and last name are required'
            });
        }
        const { data: existingUser } = await supabase_client_1.default
            .from('users')
            .select('id')
            .eq('email', email)
            .eq('organization_id', orgId)
            .single();
        if (existingUser) {
            return res.status(400).json({
                error: 'User already exists in this organization'
            });
        }
        const { data: existingInvite } = await supabase_client_1.default
            .from('invitations')
            .select('id')
            .eq('email', email)
            .eq('organization_id', orgId)
            .eq('status', 'pending')
            .single();
        if (existingInvite) {
            return res.status(400).json({
                error: 'An invitation is already pending for this email'
            });
        }
        const invitation = {
            id: (0, uuid_1.v4)(),
            email,
            organization_id: orgId,
            role,
            token: generateInvitationToken(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'pending',
            first_name: firstName,
            last_name: lastName,
            metadata: {
                invited_by: req.body.invitedBy || 'system',
                invited_at: new Date().toISOString()
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        const { data, error } = await supabase_client_1.default
            .from('invitations')
            .insert(invitation)
            .select()
            .single();
        if (error) {
            console.error('Error creating invitation:', error);
            return res.status(500).json({
                error: 'Failed to create invitation',
                details: error.message
            });
        }
        const { data: organization } = await supabase_client_1.default
            .from('organizations')
            .select('name')
            .eq('id', orgId)
            .single();
        const organizationName = organization?.name || 'Apex AI';
        const inviterName = req.body.inviterName || 'The team';
        try {
            const emailResult = await sendInvitationEmail(data, inviterName, organizationName);
            console.log('✅ Invitation created and email sent');
            res.status(201).json({
                success: true,
                invitation: data,
                inviteLink: emailResult.inviteLink,
                message: `Invitation sent to ${email}`
            });
        }
        catch (emailError) {
            console.error('Email sending failed:', emailError);
            res.status(201).json({
                success: true,
                invitation: data,
                message: `Invitation created but email delivery failed. Share this link: ${process.env.FRONTEND_URL}/accept-invitation?token=${data.token}`,
                warning: 'Email delivery failed'
            });
        }
    }
    catch (error) {
        console.error('Error in invite endpoint:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/organizations/:orgId/invitations', async (req, res) => {
    try {
        const { orgId } = req.params;
        const { data: invitations, error } = await supabase_client_1.default
            .from('invitations')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false });
        if (error) {
            console.error('Error fetching invitations:', error);
            return res.status(500).json({
                error: 'Failed to fetch invitations',
                details: error.message
            });
        }
        res.json({ invitations: invitations || [] });
    }
    catch (error) {
        console.error('Error fetching invitations:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.post('/invitations/:id/resend', async (req, res) => {
    try {
        const { id } = req.params;
        const { data: invitation, error: fetchError } = await supabase_client_1.default
            .from('invitations')
            .select('*')
            .eq('id', id)
            .eq('status', 'pending')
            .single();
        if (fetchError || !invitation) {
            return res.status(404).json({
                error: 'Invitation not found or already accepted'
            });
        }
        const updates = {
            token: generateInvitationToken(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date().toISOString()
        };
        const { data: updatedInvitation, error: updateError } = await supabase_client_1.default
            .from('invitations')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (updateError) {
            console.error('Error updating invitation:', updateError);
            return res.status(500).json({
                error: 'Failed to resend invitation',
                details: updateError.message
            });
        }
        const { data: organization } = await supabase_client_1.default
            .from('organizations')
            .select('name')
            .eq('id', updatedInvitation.organization_id)
            .single();
        const organizationName = organization?.name || 'Apex AI';
        const inviterName = req.body.inviterName || 'The team';
        try {
            const emailResult = await sendInvitationEmail(updatedInvitation, inviterName, organizationName);
            res.json({
                success: true,
                invitation: updatedInvitation,
                inviteLink: emailResult.inviteLink,
                message: 'Invitation resent successfully'
            });
        }
        catch (emailError) {
            res.json({
                success: true,
                invitation: updatedInvitation,
                message: `Invitation updated. Share this link: ${process.env.FRONTEND_URL}/accept-invitation?token=${updatedInvitation.token}`,
                warning: 'Email delivery failed'
            });
        }
    }
    catch (error) {
        console.error('Error resending invitation:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.post('/users/:userId/resend-invitation', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log('🔄 Resending invitation for user:', userId);
        const { data: user, error: userError } = await supabase_client_1.default
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        if (userError || !user) {
            return res.status(404).json({
                error: 'User not found'
            });
        }
        if (user.last_login_at) {
            return res.status(400).json({
                error: 'User has already logged into their account'
            });
        }
        const invitationToken = generateInvitationToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const tokenData = {
            userId: userId,
            expires: expiresAt.getTime(),
            type: 'user_invitation'
        };
        const crypto = require('crypto');
        const secret = process.env.JWT_SECRET || 'default-secret-key';
        const encodedData = Buffer.from(JSON.stringify(tokenData)).toString('base64');
        const signature = crypto.createHmac('sha256', secret).update(encodedData).digest('hex');
        const finalToken = `${encodedData}.${signature}`;
        const { data: organization } = await supabase_client_1.default
            .from('organizations')
            .select('name')
            .eq('id', user.organization_id)
            .single();
        const organizationName = organization?.name || 'Apex AI';
        const inviterName = req.body.inviterName || 'The team';
        const invitationData = {
            id: userId,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role,
            token: finalToken,
            expires_at: expiresAt.toISOString(),
            organization_id: user.organization_id
        };
        try {
            const emailResult = await sendInvitationEmail(invitationData, inviterName, organizationName);
            console.log('✅ Invitation email sent to:', user.email);
            res.json({
                success: true,
                message: `Invitation resent to ${user.email}`,
                inviteLink: emailResult.inviteLink,
                expiresAt: expiresAt.toISOString()
            });
        }
        catch (emailError) {
            console.error('Email sending failed:', emailError);
            const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accept-invitation?token=${finalToken}`;
            res.json({
                success: true,
                message: `Invitation link generated. Check if RESEND_API_KEY is configured.`,
                inviteLink,
                warning: 'Email service requires RESEND_API_KEY in .env file',
                expiresAt: expiresAt.toISOString()
            });
        }
    }
    catch (error) {
        console.error('Error resending user invitation:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.delete('/invitations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase_client_1.default
            .from('invitations')
            .update({
            status: 'cancelled',
            updated_at: new Date().toISOString()
        })
            .eq('id', id)
            .eq('status', 'pending');
        if (error) {
            console.error('Error cancelling invitation:', error);
            return res.status(500).json({
                error: 'Failed to cancel invitation',
                details: error.message
            });
        }
        res.json({
            success: true,
            message: 'Invitation cancelled successfully'
        });
    }
    catch (error) {
        console.error('Error cancelling invitation:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.post('/invitations/accept-clerk', async (req, res) => {
    try {
        const { token, clerkUserId } = req.body;
        if (!token || !clerkUserId) {
            return res.status(400).json({
                error: 'Token and Clerk user ID are required'
            });
        }
        const { data: invitation, error: inviteError } = await supabase_client_1.default
            .from('invitations')
            .select('*')
            .eq('token', token)
            .eq('status', 'pending')
            .gt('expires_at', new Date().toISOString())
            .single();
        if (!invitation || inviteError) {
            return res.status(400).json({
                error: 'Invalid or expired invitation'
            });
        }
        const clerkUser = await clerk_service_1.ClerkService.getUserById(clerkUserId);
        if (!clerkUser) {
            return res.status(400).json({
                error: 'Clerk user not found'
            });
        }
        const userEmail = clerkUser.emailAddresses?.[0]?.emailAddress;
        if (userEmail !== invitation.email) {
            return res.status(400).json({
                error: 'Email address does not match invitation'
            });
        }
        const userId = (0, uuid_1.v4)();
        const { error: userError } = await supabase_client_1.default
            .from('users')
            .insert({
            id: userId,
            email: invitation.email,
            first_name: invitation.first_name,
            last_name: invitation.last_name,
            organization_id: invitation.organization_id,
            role: invitation.role,
            clerk_id: clerkUserId,
            status: 'active',
            invited_at: invitation.created_at,
            invitation_accepted_at: new Date().toISOString(),
            email_verified: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
        if (userError) {
            console.error('Error creating user record:', userError);
            return res.status(500).json({
                error: 'Failed to create user record',
                details: userError.message
            });
        }
        await supabase_client_1.default
            .from('invitations')
            .update({
            status: 'accepted',
            accepted_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
            .eq('id', invitation.id);
        const { data: organization } = await supabase_client_1.default
            .from('organizations')
            .select('name')
            .eq('id', invitation.organization_id)
            .single();
        try {
            await email_service_1.EmailService.sendWelcomeEmail({
                userEmail: invitation.email,
                userName: `${invitation.first_name} ${invitation.last_name}`,
                organizationName: organization?.name || 'Apex AI'
            });
        }
        catch (emailError) {
            console.error('Failed to send welcome email:', emailError);
        }
        res.json({
            success: true,
            message: 'Account linked successfully',
            user: {
                id: userId,
                email: invitation.email,
                firstName: invitation.first_name,
                lastName: invitation.last_name,
                organizationId: invitation.organization_id,
                role: invitation.role
            }
        });
    }
    catch (error) {
        console.error('Error accepting invitation with Clerk:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.post('/invitations/accept', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) {
            return res.status(400).json({
                error: 'Token and password are required'
            });
        }
        const { data: invitation, error: inviteError } = await supabase_client_1.default
            .from('invitations')
            .select('*')
            .eq('token', token)
            .eq('status', 'pending')
            .gt('expires_at', new Date().toISOString())
            .single();
        if (invitation && !inviteError) {
            return await handleNewUserInvitation(invitation, password, res);
        }
        try {
            const [encodedData, signature] = token.split('.');
            if (encodedData && signature) {
                const crypto = require('crypto');
                const secret = process.env.JWT_SECRET || 'default-secret-key';
                const expectedSignature = crypto.createHmac('sha256', secret).update(encodedData).digest('hex');
                if (signature === expectedSignature) {
                    const tokenData = JSON.parse(Buffer.from(encodedData, 'base64').toString());
                    if (tokenData.expires < Date.now()) {
                        return res.status(400).json({
                            error: 'Invitation token has expired'
                        });
                    }
                    if (tokenData.type === 'user_invitation') {
                        const { data: user, error: userError } = await supabase_client_1.default
                            .from('users')
                            .select('*')
                            .eq('id', tokenData.userId)
                            .single();
                        if (userError || !user) {
                            return res.status(400).json({
                                error: 'User not found'
                            });
                        }
                        return await handleExistingUserInvitation(user, password, res);
                    }
                }
            }
        }
        catch (tokenError) {
        }
        return res.status(400).json({
            error: 'Invalid or expired invitation'
        });
    }
    catch (error) {
        console.error('Error accepting invitation:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
async function handleNewUserInvitation(invitation, password, res) {
    try {
        const supabaseClient = supabase_client_1.default.getClient();
        const { data: authData, error: authError } = await supabaseClient.auth.admin.createUser({
            email: invitation.email,
            password,
            email_confirm: true,
            user_metadata: {
                first_name: invitation.first_name,
                last_name: invitation.last_name,
                organization_id: invitation.organization_id,
                role: invitation.role
            }
        });
        if (authError) {
            console.error('Error creating auth user:', authError);
            return res.status(500).json({
                error: 'Failed to create user account',
                details: authError.message
            });
        }
        const { error: userError } = await supabase_client_1.default
            .from('users')
            .insert({
            id: (0, uuid_1.v4)(),
            email: invitation.email,
            first_name: invitation.first_name,
            last_name: invitation.last_name,
            organization_id: invitation.organization_id,
            role: invitation.role,
            status: 'active',
            invited_at: invitation.created_at,
            invitation_accepted_at: new Date().toISOString(),
            email_verified: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
        if (userError) {
            console.error('Error creating user record:', userError);
        }
        await supabase_client_1.default
            .from('invitations')
            .update({
            status: 'accepted',
            accepted_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
            .eq('id', invitation.id);
        const { data: organization } = await supabase_client_1.default
            .from('organizations')
            .select('name')
            .eq('id', invitation.organization_id)
            .single();
        try {
            await email_service_1.EmailService.sendWelcomeEmail({
                userEmail: invitation.email,
                userName: `${invitation.first_name} ${invitation.last_name}`,
                organizationName: organization?.name || 'Apex AI'
            });
        }
        catch (emailError) {
            console.error('Failed to send welcome email:', emailError);
        }
        res.json({
            success: true,
            message: 'Account created successfully. You can now sign in.',
            user: {
                email: invitation.email,
                firstName: invitation.first_name,
                lastName: invitation.last_name
            }
        });
    }
    catch (error) {
        console.error('Error handling new user invitation:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
async function handleExistingUserInvitation(user, password, res) {
    try {
        const supabaseClient = supabase_client_1.default.getClient();
        const { data: authData, error: authError } = await supabaseClient.auth.admin.createUser({
            email: user.email,
            password,
            email_confirm: true,
            user_metadata: {
                first_name: user.first_name,
                last_name: user.last_name,
                organization_id: user.organization_id,
                role: user.role
            }
        });
        if (authError) {
            if (authError.message?.includes('already registered') || authError.status === 422) {
                console.log('Auth user already exists, this is expected for re-invitations');
            }
            else {
                console.error('Error creating auth user:', authError);
                return res.status(500).json({
                    error: 'Failed to create user account',
                    details: authError.message
                });
            }
        }
        const { error: updateUserError } = await supabase_client_1.default
            .from('users')
            .update({
            status: 'active',
            invitation_accepted_at: new Date().toISOString(),
            last_login_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
            .eq('id', user.id);
        if (updateUserError) {
            console.error('Error updating user record:', updateUserError);
        }
        const { data: organization } = await supabase_client_1.default
            .from('organizations')
            .select('name')
            .eq('id', user.organization_id)
            .single();
        try {
            await email_service_1.EmailService.sendWelcomeEmail({
                userEmail: user.email,
                userName: `${user.first_name} ${user.last_name}`,
                organizationName: organization?.name || 'Apex AI'
            });
        }
        catch (emailError) {
            console.error('Failed to send welcome email:', emailError);
        }
        res.json({
            success: true,
            message: 'Account activated successfully. You can now sign in.',
            user: {
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name
            }
        });
    }
    catch (error) {
        console.error('Error handling existing user invitation:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
router.post('/users/:userId/suspend', async (req, res) => {
    try {
        const { userId } = req.params;
        const { reason } = req.body;
        console.log('🚫 Suspending user:', userId);
        const { data: user, error } = await supabase_client_1.default
            .from('users')
            .update({
            status: 'suspended',
            suspended_at: new Date().toISOString(),
            suspension_reason: reason || 'Suspended by administrator',
            updated_at: new Date().toISOString()
        })
            .eq('id', userId)
            .select()
            .single();
        if (error || !user) {
            console.error('Error suspending user:', error);
            return res.status(500).json({
                error: 'Failed to suspend user',
                details: error?.message
            });
        }
        console.log('✅ User suspended successfully');
        res.json({
            success: true,
            message: 'User suspended successfully',
            user
        });
    }
    catch (error) {
        console.error('Error suspending user:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.post('/users/:userId/activate', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log('✅ Activating user:', userId);
        const { data: currentUser, error: fetchError } = await supabase_client_1.default
            .from('users')
            .select('status, invitation_accepted_at')
            .eq('id', userId)
            .single();
        if (fetchError || !currentUser) {
            return res.status(404).json({
                error: 'User not found'
            });
        }
        let newStatus = 'active';
        if (!currentUser.invitation_accepted_at) {
            newStatus = 'invited';
        }
        const updateData = {
            status: newStatus,
            updated_at: new Date().toISOString()
        };
        if (currentUser.status === 'suspended') {
            updateData.suspended_at = null;
            updateData.suspension_reason = null;
        }
        const { data: user, error } = await supabase_client_1.default
            .from('users')
            .update(updateData)
            .eq('id', userId)
            .select()
            .single();
        if (error || !user) {
            console.error('Error activating user:', error);
            return res.status(500).json({
                error: 'Failed to activate user',
                details: error?.message
            });
        }
        console.log('✅ User activated successfully');
        res.json({
            success: true,
            message: newStatus === 'invited'
                ? 'User set to invited status. They need to accept their invitation to become active.'
                : 'User activated successfully',
            user
        });
    }
    catch (error) {
        console.error('Error activating user:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/invitations/validate/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { data: invitation, error: inviteError } = await supabase_client_1.default
            .from('invitations')
            .select('*')
            .eq('token', token)
            .eq('status', 'pending')
            .gt('expires_at', new Date().toISOString())
            .single();
        if (invitation && !inviteError) {
            const { data: organization } = await supabase_client_1.default
                .from('organizations')
                .select('name, slug')
                .eq('id', invitation.organization_id)
                .single();
            return res.json({
                valid: true,
                invitation: {
                    email: invitation.email,
                    firstName: invitation.first_name,
                    lastName: invitation.last_name,
                    role: invitation.role,
                    organizationName: organization?.name || 'Unknown Organization',
                    expiresAt: invitation.expires_at
                }
            });
        }
        try {
            const [encodedData, signature] = token.split('.');
            if (encodedData && signature) {
                const crypto = require('crypto');
                const secret = process.env.JWT_SECRET || 'default-secret-key';
                const expectedSignature = crypto.createHmac('sha256', secret).update(encodedData).digest('hex');
                if (signature === expectedSignature) {
                    const tokenData = JSON.parse(Buffer.from(encodedData, 'base64').toString());
                    if (tokenData.expires < Date.now()) {
                        return res.status(400).json({
                            valid: false,
                            error: 'Invitation token has expired'
                        });
                    }
                    if (tokenData.type === 'user_invitation') {
                        const { data: user, error: userError } = await supabase_client_1.default
                            .from('users')
                            .select('*')
                            .eq('id', tokenData.userId)
                            .single();
                        if (userError || !user) {
                            return res.status(400).json({
                                valid: false,
                                error: 'User not found'
                            });
                        }
                        const { data: organization } = await supabase_client_1.default
                            .from('organizations')
                            .select('name, slug')
                            .eq('id', user.organization_id)
                            .single();
                        return res.json({
                            valid: true,
                            invitation: {
                                email: user.email,
                                firstName: user.first_name,
                                lastName: user.last_name,
                                role: user.role,
                                organizationName: organization?.name || 'Unknown Organization',
                                expiresAt: new Date(tokenData.expires).toISOString()
                            }
                        });
                    }
                }
            }
        }
        catch (tokenError) {
        }
        return res.status(400).json({
            valid: false,
            error: 'Invalid or expired invitation'
        });
    }
    catch (error) {
        console.error('Error validating invitation:', error);
        res.status(500).json({
            valid: false,
            error: 'Internal server error'
        });
    }
});
exports.default = router;
