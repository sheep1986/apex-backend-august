import { createClerkClient } from '@clerk/backend';
import supabase from './supabase-client';
import { EmailService } from './email-service';

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY || '',
});

export interface CreateOrganizationData {
  name: string;
  type: 'platform' | 'client';
  ownerId?: string;
  settings?: any;
}

export interface AddTeamMemberData {
  email: string;
  firstName: string;
  lastName: string;
  role: 'support_admin' | 'support_agent' | 'client_admin' | 'client_user';
  organizationId: string;
  permissions: {
    canAccessAllOrganizations?: boolean;
    canManageClients?: boolean;
    canViewClientData?: boolean;
    canManageLeads?: boolean;
    canMakeVapiCalls?: boolean;
  };
}

export class OrganizationService {
  /**
   * Create a new organization (either platform team or client)
   */
  static async createOrganization(data: CreateOrganizationData) {
    try {
      // Create organization in Clerk
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

      // Create organization in Supabase
      const { data: dbOrg, error } = await supabase
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

      if (error) throw error;

      return {
        ...dbOrg,
        clerkOrganizationId: clerkOrg.id
      };
    } catch (error) {
      console.error('Error creating organization:', error);
      throw error;
    }
  }

  /**
   * Add team member to organization with specific permissions
   */
  static async addTeamMember(data: AddTeamMemberData) {
    try {
      let clerkUserId: string | null = null;
      
      // Check if Clerk is configured
      if (process.env.CLERK_SECRET_KEY) {
        // Production mode with Clerk
        let clerkUser;
        try {
          const existingUsers = await clerk.users.getUserList({
            emailAddress: [data.email]
          });

          if (existingUsers.data.length > 0) {
            clerkUser = existingUsers.data[0];
          } else {
            // Create user with username (using email prefix) and temporary password
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

            // Send invitation email with verification code
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
          
          // Add user to organization in Clerk
          await clerk.organizations.createOrganizationMembership({
            organizationId: data.organizationId,
            userId: clerkUser.id,
            role: data.role.includes('admin') ? 'admin' : 'member'
          });
          
          clerkUserId = clerkUser.id;
        } catch (error) {
          console.error('Error creating Clerk user:', error);
          throw error;
        }
      } else {
        // Development mode - skip Clerk
        clerkUserId = 'dev_' + Date.now();
        console.log('📧 Dev mode: Would create Clerk user for', data.email);
      }

      // Create user in Supabase with permissions
      const { data: dbUser, error } = await supabase
        .from('users')
        .insert({
          email: data.email,
          first_name: data.firstName,
          last_name: data.lastName,
          role: data.role,
          organization_id: data.organizationId,
          clerk_user_id: clerkUserId,
          permissions: data.permissions,
          is_active: false, // Will be activated after verification
          verification_required: true,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      // Send invitation email
      if (process.env.ENABLE_MOCK_DATA !== 'true') {
        const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/invite?token=${clerkUserId}`;
        await EmailService.sendInvitation(data.email, data.firstName, inviteLink);
      }

      return {
        ...dbUser,
        invitationSent: true,
        requiresVerification: true
      };
    } catch (error) {
      console.error('Error adding team member:', error);
      throw error;
    }
  }

  /**
   * Get all client organizations (for platform team)
   */
  static async getClientOrganizations(userId: string) {
    try {
      // Check if user has permission to view all organizations
      const { data: user } = await supabase
        .from('users')
        .select('role, permissions')
        .eq('id', userId)
        .single();

      if (!user?.permissions?.canAccessAllOrganizations) {
        throw new Error('Unauthorized to view all organizations');
      }

      // Get all client organizations
      const { data: organizations, error } = await supabase
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

      if (error) throw error;

      return organizations;
    } catch (error) {
      console.error('Error fetching client organizations:', error);
      throw error;
    }
  }

  /**
   * Switch to client organization context (for support)
   */
  static async switchToOrganization(userId: string, targetOrgId: string) {
    try {
      // Verify user has permission to access other organizations
      const { data: user } = await supabase
        .from('users')
        .select('role, permissions')
        .eq('id', userId)
        .single();

      if (!user?.permissions?.canAccessAllOrganizations) {
        throw new Error('Unauthorized to switch organizations');
      }

      // Log the organization switch for audit
      await supabase
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

      // Return organization details
      const { data: organization } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', targetOrgId)
        .single();

      return {
        organization,
        switchedAt: new Date().toISOString(),
        switchedBy: userId
      };
    } catch (error) {
      console.error('Error switching organization:', error);
      throw error;
    }
  }

  /**
   * Send verification code via email/SMS
   */
  static async sendVerificationCode(userId: string, method: 'email' | 'sms' = 'email') {
    try {
      // Get user details
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !user) throw new Error('User not found');

      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Store verification code
      const { error: codeError } = await supabase
        .from('verification_codes')
        .insert({
          user_id: userId,
          code,
          type: method,
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
        });

      if (codeError) throw codeError;

      // Send code via email
      if (method === 'email' && process.env.ENABLE_MOCK_DATA !== 'true') {
        await EmailService.sendVerificationCode(user.email, code);
      }

      return {
        success: true,
        message: `Verification code sent via ${method}`,
        expiresIn: '10 minutes'
      };
    } catch (error) {
      console.error('Error sending verification code:', error);
      throw error;
    }
  }

  /**
   * Verify code and activate user
   */
  static async verifyCode(userId: string, code: string) {
    try {
      const { data: validCode, error } = await supabase
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

      // Mark code as used
      await supabase
        .from('verification_codes')
        .update({ used: true })
        .eq('id', validCode.id);

      // Activate user
      await supabase
        .from('users')
        .update({
          is_active: true,
          verification_required: false,
          verified_at: new Date().toISOString()
        })
        .eq('id', userId);

      return { verified: true };
    } catch (error) {
      console.error('Error verifying code:', error);
      throw error;
    }
  }
} 