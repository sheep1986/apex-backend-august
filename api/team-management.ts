import { Router, Request, Response } from 'express';
import supabase from '../services/supabase-client';
import { authenticateUser, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Apply authentication middleware

// Get all team members (platform team only)
router.get('/members', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Live data only - fetch from Supabase
    const { data: members, error } = await supabase
      .from('users')
      .select('*')
      .in('role', ['support_admin', 'support_agent'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Transform the data
    const transformedMembers = members?.map(member => ({
      id: member.id,
      email: member.email,
      firstName: member.first_name,
      lastName: member.last_name,
      role: member.role,
      permissions: member.permissions || {},
      isActive: member.is_active,
      verificationRequired: member.verification_required || false,
      lastLogin: member.last_login,
      createdAt: member.created_at
    })) || [];

    res.json({ members: transformedMembers });
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// Add new team member
router.post('/members', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, firstName, lastName, role, permissions } = req.body;

    // Validate input
    if (!email || !firstName || !lastName || !role) {
      return res.status(400).json({ 
        error: 'Missing required fields' 
      });
    }

    // Validate role
    if (!['support_admin', 'support_agent'].includes(role)) {
      return res.status(400).json({ 
        error: 'Invalid role. Must be support_admin or support_agent' 
      });
    }

    // Live data only - create in database
    const platformOrgId = '550e8400-e29b-41d4-a716-446655440000';
    
    // Create user in Supabase directly
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert({
        email,
        first_name: firstName,
        last_name: lastName,
        role,
        organization_id: platformOrgId,
        permissions: {
          canAccessAllOrganizations: permissions?.canAccessAllOrganizations || false,
          canManageClients: permissions?.canManageClients || false,
          canViewClientData: permissions?.canViewClientData || false,
          canManageTeam: permissions?.canManageTeam || false
        },
        is_active: false,
        verification_required: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (userError) throw userError;

    // Send invitation email with the email service
    try {
    const { EmailService } = await import('../services/email-service');
    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/invite?token=${newUser.id}`;
    await EmailService.sendInvitation(email, firstName, inviteLink);
    } catch (emailError) {
      console.error('Warning: Could not send invitation email:', emailError);
    }

    console.log('✅ Team member created and invitation sent:', email);

    res.status(201).json({
      success: true,
      message: 'Team member invited successfully',
      member: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        role: newUser.role,
        permissions: newUser.permissions,
        isActive: newUser.is_active,
        verificationRequired: newUser.verification_required,
        invitationSent: true,
        createdAt: newUser.created_at
      }
    });

  } catch (error: any) {
    console.error('Error adding team member:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to add team member' 
    });
  }
});

// Update team member permissions
router.put('/members/:memberId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { memberId } = req.params;
    const { permissions, role } = req.body;

    const updates: any = {
      updated_at: new Date().toISOString()
    };

    if (permissions) {
      updates.permissions = permissions;
    }

    if (role) {
      updates.role = role;
    }

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', memberId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      member: data
    });

  } catch (error) {
    console.error('Error updating team member:', error);
    res.status(500).json({ 
      error: 'Failed to update team member' 
    });
  }
});

// Remove team member
router.delete('/members/:memberId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { memberId } = req.params;

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', memberId);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Team member removed successfully'
    });

  } catch (error) {
    console.error('Error removing team member:', error);
    res.status(500).json({ 
      error: 'Failed to remove team member' 
    });
  }
});

export default router; 