import { Router, Request, Response } from 'express';
import supabase from '../services/supabase-client';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { EmailService } from '../services/email-service';
import { ClerkService } from '../services/clerk-service';

const router = Router();

// Generate secure invitation token
function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Send invitation email using the new template system
async function sendInvitationEmail(invitation: any, inviterName: string, organizationName: string) {
  try {
    // Use the new email service with templates
    await EmailService.sendInvitationWithTemplate({
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
  } catch (error) {
    console.error('Error sending invitation email:', error);
    throw error;
  }
}

// POST /api/organizations/:orgId/invite
router.post('/organizations/:orgId/invite', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { email, firstName, lastName, role = 'client_user' } = req.body;

    console.log('📨 Creating invitation:', { orgId, email, firstName, lastName, role });

    // Validate input
    if (!email || !firstName || !lastName) {
      return res.status(400).json({
        error: 'Email, first name, and last name are required'
      });
    }

    // Check if user already exists in this organization
    const { data: existingUser } = await supabase
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

    // Check for existing pending invitation
    const { data: existingInvite } = await supabase
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

    // Create invitation record
    const invitation = {
      id: uuidv4(),
      email,
      organization_id: orgId,
      role,
      token: generateInvitationToken(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
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

    const { data, error } = await supabase
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

    // Get organization details for the email
    const { data: organization } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single();

    const organizationName = organization?.name || 'Apex AI';
    const inviterName = req.body.inviterName || 'The team';

    // Send invitation email
    try {
      const emailResult = await sendInvitationEmail(data, inviterName, organizationName);
      console.log('✅ Invitation created and email sent');
      
      res.status(201).json({
        success: true,
        invitation: data,
        inviteLink: emailResult.inviteLink,
        message: `Invitation sent to ${email}`
      });
    } catch (emailError) {
      // Even if email fails, the invitation was created
      console.error('Email sending failed:', emailError);
      res.status(201).json({
        success: true,
        invitation: data,
        message: `Invitation created but email delivery failed. Share this link: ${process.env.FRONTEND_URL}/accept-invitation?token=${data.token}`,
        warning: 'Email delivery failed'
      });
    }

  } catch (error) {
    console.error('Error in invite endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/organizations/:orgId/invitations
router.get('/organizations/:orgId/invitations', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;

    const { data: invitations, error } = await supabase
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

  } catch (error) {
    console.error('Error fetching invitations:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/invitations/:id/resend
router.post('/invitations/:id/resend', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get invitation
    const { data: invitation, error: fetchError } = await supabase
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

    // Generate new token and extend expiration
    const updates = {
      token: generateInvitationToken(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: updatedInvitation, error: updateError } = await supabase
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

    // Get organization details for the email
    const { data: organization } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', updatedInvitation.organization_id)
      .single();

    const organizationName = organization?.name || 'Apex AI';
    const inviterName = req.body.inviterName || 'The team';

    // Resend email
    try {
      const emailResult = await sendInvitationEmail(updatedInvitation, inviterName, organizationName);
      res.json({
        success: true,
        invitation: updatedInvitation,
        inviteLink: emailResult.inviteLink,
        message: 'Invitation resent successfully'
      });
    } catch (emailError) {
      res.json({
        success: true,
        invitation: updatedInvitation,
        message: `Invitation updated. Share this link: ${process.env.FRONTEND_URL}/accept-invitation?token=${updatedInvitation.token}`,
        warning: 'Email delivery failed'
      });
    }

  } catch (error) {
    console.error('Error resending invitation:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/users/:userId/resend-invitation
// Resend invitation for an existing user who hasn't activated their account
router.post('/users/:userId/resend-invitation', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    console.log('🔄 Resending invitation for user:', userId);

    // Get user details
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Check if user has already activated their account (by actually logging in)
    if (user.last_login_at) {
      return res.status(400).json({
        error: 'User has already logged into their account'
      });
    }

    // Generate a simple invitation token - use a simpler approach without database storage
    const invitationToken = generateInvitationToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // For now, we'll encode the user ID and expiration in the token itself
    // This way we don't need to add new database columns
    const tokenData = {
      userId: userId,
      expires: expiresAt.getTime(),
      type: 'user_invitation'
    };
    
    // Create a signed token that includes the user ID and expiration
    const crypto = require('crypto');
    const secret = process.env.JWT_SECRET || 'default-secret-key';
    const encodedData = Buffer.from(JSON.stringify(tokenData)).toString('base64');
    const signature = crypto.createHmac('sha256', secret).update(encodedData).digest('hex');
    const finalToken = `${encodedData}.${signature}`;

    // Get organization details
    const { data: organization } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', user.organization_id)
      .single();

    const organizationName = organization?.name || 'Apex AI';
    const inviterName = req.body.inviterName || 'The team';

    // Create invitation data for email
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

    // Send invitation email using the existing email service
    try {
      // Use the same email service that's used for password reset
      const emailResult = await sendInvitationEmail(invitationData, inviterName, organizationName);
      console.log('✅ Invitation email sent to:', user.email);
      
      res.json({
        success: true,
        message: `Invitation resent to ${user.email}`,
        inviteLink: emailResult.inviteLink,
        expiresAt: expiresAt.toISOString()
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      
      // Even if email fails, provide the invitation link
      const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accept-invitation?token=${finalToken}`;
      
      res.json({
        success: true,
        message: `Invitation link generated. Check if RESEND_API_KEY is configured.`,
        inviteLink,
        warning: 'Email service requires RESEND_API_KEY in .env file',
        expiresAt: expiresAt.toISOString()
      });
    }

  } catch (error) {
    console.error('Error resending user invitation:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/invitations/:id
router.delete('/invitations/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
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

  } catch (error) {
    console.error('Error cancelling invitation:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/invitations/accept-clerk
// New endpoint for accepting invitations with Clerk integration
router.post('/invitations/accept-clerk', async (req: Request, res: Response) => {
  try {
    const { token, clerkUserId } = req.body;

    if (!token || !clerkUserId) {
      return res.status(400).json({
        error: 'Token and Clerk user ID are required'
      });
    }

    // Find the invitation by token
    const { data: invitation, error: inviteError } = await supabase
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

    // Get Clerk user details
    const clerkUser = await ClerkService.getUserById(clerkUserId);
    if (!clerkUser) {
      return res.status(400).json({
        error: 'Clerk user not found'
      });
    }

    const userEmail = clerkUser.emailAddresses?.[0]?.emailAddress;

    // Verify email matches invitation
    if (userEmail !== invitation.email) {
      return res.status(400).json({
        error: 'Email address does not match invitation'
      });
    }

    // Create user record in database linked to Clerk
    const userId = uuidv4();
    const { error: userError } = await supabase
      .from('users')
      .insert({
        id: userId,
        email: invitation.email,
        first_name: invitation.first_name,
        last_name: invitation.last_name,
        organization_id: invitation.organization_id,
        role: invitation.role,
        clerk_id: clerkUserId, // Link to Clerk user
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

    // Update invitation status
    await supabase
      .from('invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', invitation.id);

    // Get organization name for welcome email
    const { data: organization } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', invitation.organization_id)
      .single();

    // Send welcome email
    try {
      await EmailService.sendWelcomeEmail({
        userEmail: invitation.email,
        userName: `${invitation.first_name} ${invitation.last_name}`,
        organizationName: organization?.name || 'Apex AI'
      });
    } catch (emailError) {
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

  } catch (error) {
    console.error('Error accepting invitation with Clerk:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/invitations/accept
router.post('/invitations/accept', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        error: 'Token and password are required'
      });
    }

    // First, try to find the token in the invitations table (for new user invitations)
    const { data: invitation, error: inviteError } = await supabase
      .from('invitations')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .single();

    if (invitation && !inviteError) {
      // Handle new user invitation from invitations table
      return await handleNewUserInvitation(invitation, password, res);
    }

    // If not found in invitations table, try to decode token for user invitations
    try {
      const [encodedData, signature] = token.split('.');
      if (encodedData && signature) {
        const crypto = require('crypto');
        const secret = process.env.JWT_SECRET || 'default-secret-key';
        const expectedSignature = crypto.createHmac('sha256', secret).update(encodedData).digest('hex');
        
        if (signature === expectedSignature) {
          const tokenData = JSON.parse(Buffer.from(encodedData, 'base64').toString());
          
          // Check if token is expired
          if (tokenData.expires < Date.now()) {
            return res.status(400).json({
              error: 'Invitation token has expired'
            });
          }
          
          // Check if it's a user invitation type
          if (tokenData.type === 'user_invitation') {
            // Get user details
            const { data: user, error: userError } = await supabase
              .from('users')
              .select('*')
              .eq('id', tokenData.userId)
              .single();

            if (userError || !user) {
              return res.status(400).json({
                error: 'User not found'
              });
            }

            // Handle existing user invitation
            return await handleExistingUserInvitation(user, password, res);
          }
        }
      }
    } catch (tokenError) {
      // Token parsing failed, continue to error
    }

    return res.status(400).json({
      error: 'Invalid or expired invitation'
    });

  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Helper function to handle new user invitations (from invitations table)
async function handleNewUserInvitation(invitation: any, password: string, res: Response) {
  try {
    // Create Supabase auth user
    const supabaseClient = supabase.getClient();
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

    // Create user record in database
    const { error: userError } = await supabase
      .from('users')
      .insert({
        id: uuidv4(),
        email: invitation.email,
        first_name: invitation.first_name,
        last_name: invitation.last_name,
        organization_id: invitation.organization_id,
        role: invitation.role,
        status: 'active', // Set to active after accepting invitation
        invited_at: invitation.created_at,
        invitation_accepted_at: new Date().toISOString(),
        email_verified: true, // Email is verified through invitation process
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (userError) {
      console.error('Error creating user record:', userError);
      // Don't fail the whole process if user record fails
      // The auth user can still sign in
    }

    // Update invitation status
    await supabase
      .from('invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', invitation.id);

    // Get organization name for welcome email
    const { data: organization } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', invitation.organization_id)
      .single();

    // Send welcome email
    try {
      await EmailService.sendWelcomeEmail({
        userEmail: invitation.email,
        userName: `${invitation.first_name} ${invitation.last_name}`,
        organizationName: organization?.name || 'Apex AI'
      });
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail the request if email fails
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

  } catch (error) {
    console.error('Error handling new user invitation:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Helper function to handle existing user invitations (from users table)
async function handleExistingUserInvitation(user: any, password: string, res: Response) {
  try {
    // For invited users, they typically don't have auth accounts yet
    // So we'll create a new auth user (this will fail gracefully if one already exists)
    const supabaseClient = supabase.getClient();
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
      // If user already exists, that's usually a 422 error - handle it gracefully
      if (authError.message?.includes('already registered') || authError.status === 422) {
        console.log('Auth user already exists, this is expected for re-invitations');
        // User already exists, we'll just continue to update their database record
      } else {
        console.error('Error creating auth user:', authError);
        return res.status(500).json({
          error: 'Failed to create user account',
          details: authError.message
        });
      }
    }

    // Update user record to mark invitation as accepted
    const { error: updateUserError } = await supabase
      .from('users')
      .update({
        status: 'active',
        invitation_accepted_at: new Date().toISOString(),
        last_login_at: new Date().toISOString(), // Mark first login
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateUserError) {
      console.error('Error updating user record:', updateUserError);
      // Continue anyway, auth user was created
    }

    // Get organization name for welcome email
    const { data: organization } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', user.organization_id)
      .single();

    // Send welcome email
    try {
      await EmailService.sendWelcomeEmail({
        userEmail: user.email,
        userName: `${user.first_name} ${user.last_name}`,
        organizationName: organization?.name || 'Apex AI'
      });
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail the request if email fails
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

  } catch (error) {
    console.error('Error handling existing user invitation:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// POST /api/users/:userId/suspend
// Suspend a user's account
router.post('/users/:userId/suspend', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    console.log('🚫 Suspending user:', userId);

    // Update user status to suspended
    const { data: user, error } = await supabase
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

  } catch (error) {
    console.error('Error suspending user:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/users/:userId/activate
// Activate a suspended or inactive user's account
router.post('/users/:userId/activate', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    console.log('✅ Activating user:', userId);

    // Get current user to check their status
    const { data: currentUser, error: fetchError } = await supabase
      .from('users')
      .select('status, invitation_accepted_at')
      .eq('id', userId)
      .single();

    if (fetchError || !currentUser) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Determine the appropriate status
    let newStatus = 'active';
    
    // If user hasn't accepted invitation yet, set them back to invited
    if (!currentUser.invitation_accepted_at) {
      newStatus = 'invited';
    }

    // Update user status
    const updateData: any = {
      status: newStatus,
      updated_at: new Date().toISOString()
    };

    // Clear suspension-related fields if they exist
    if (currentUser.status === 'suspended') {
      updateData.suspended_at = null;
      updateData.suspension_reason = null;
    }

    const { data: user, error } = await supabase
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

  } catch (error) {
    console.error('Error activating user:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/invitations/validate/:token
router.get('/invitations/validate/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    // First, try to find the token in the invitations table (for new user invitations)
    const { data: invitation, error: inviteError } = await supabase
      .from('invitations')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .single();

    if (invitation && !inviteError) {
      // Found in invitations table
      const { data: organization } = await supabase
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

    // If not found in invitations table, try to decode token for user invitations
    try {
      const [encodedData, signature] = token.split('.');
      if (encodedData && signature) {
        const crypto = require('crypto');
        const secret = process.env.JWT_SECRET || 'default-secret-key';
        const expectedSignature = crypto.createHmac('sha256', secret).update(encodedData).digest('hex');
        
        if (signature === expectedSignature) {
          const tokenData = JSON.parse(Buffer.from(encodedData, 'base64').toString());
          
          // Check if token is expired
          if (tokenData.expires < Date.now()) {
            return res.status(400).json({
              valid: false,
              error: 'Invitation token has expired'
            });
          }
          
          // Check if it's a user invitation type
          if (tokenData.type === 'user_invitation') {
            // Get user details
            const { data: user, error: userError } = await supabase
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

            // Get organization details
            const { data: organization } = await supabase
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
    } catch (tokenError) {
      // Token parsing failed, continue to error
    }

    return res.status(400).json({
      valid: false,
      error: 'Invalid or expired invitation'
    });

  } catch (error) {
    console.error('Error validating invitation:', error);
    res.status(500).json({
      valid: false,
      error: 'Internal server error'
    });
  }
});

export default router;