import { createClerkClient } from '@clerk/backend';

// Initialize Clerk client
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

export interface CreateClerkUserData {
  email: string;
  firstName: string;
  lastName: string;
  password?: string;
}

export class ClerkService {
  /**
   * Create a new user in Clerk when manually adding users through the platform
   */
  static async createUser(userData: CreateClerkUserData) {
    try {
      // Check if we have Clerk configured
      if (!process.env.CLERK_SECRET_KEY) {
        throw new Error('Clerk is not configured - missing CLERK_SECRET_KEY');
      }

      // Check if user already exists
      const existingUsers = await clerk.users.getUserList({
        emailAddress: [userData.email],
      });

      if (existingUsers.data.length > 0) {
        console.log('User already exists in Clerk:', userData.email);
        return existingUsers.data[0];
      }

      // Create user with temporary password if not provided
      const tempPassword = userData.password || 'TempPass123!' + Math.random().toString(36).substring(2, 8);
      
      const user = await clerk.users.createUser({
        emailAddress: [userData.email],
        firstName: userData.firstName,
        lastName: userData.lastName,
        password: tempPassword,
        skipPasswordChecks: false,
        skipPasswordRequirement: false,
      });

      console.log('✅ Created Clerk user:', user.id);

      // Send invitation email
      try {
        await clerk.invitations.createInvitation({
          emailAddress: userData.email,
          redirectUrl: `${process.env.FRONTEND_URL}/verify-invitation`,
          publicMetadata: {
            type: 'new_user',
            createdAt: new Date().toISOString(),
          },
        });
        console.log('✅ Sent invitation email to:', userData.email);
      } catch (inviteError) {
        console.warn('⚠️  Failed to send invitation email:', inviteError);
        // Don't throw here - user creation succeeded
      }

      return user;
    } catch (error: any) {
      console.error('❌ Error creating Clerk user:', error);
      throw new Error(error.message || 'Failed to create user in Clerk');
    }
  }

  /**
   * Update user in Clerk
   */
  static async updateUser(clerkUserId: string, updates: Partial<CreateClerkUserData>) {
    try {
      if (!process.env.CLERK_SECRET_KEY) {
        throw new Error('Clerk is not configured - missing CLERK_SECRET_KEY');
      }

      const user = await clerk.users.updateUser(clerkUserId, {
        firstName: updates.firstName,
        lastName: updates.lastName,
      });

      console.log('✅ Updated Clerk user:', user.id);
      return user;
    } catch (error: any) {
      console.error('❌ Error updating Clerk user:', error);
      throw new Error(error.message || 'Failed to update user in Clerk');
    }
  }

  /**
   * Delete user from Clerk
   */
  static async deleteUser(clerkUserId: string) {
    try {
      if (!process.env.CLERK_SECRET_KEY) {
        throw new Error('Clerk is not configured - missing CLERK_SECRET_KEY');
      }

      await clerk.users.deleteUser(clerkUserId);
      console.log('✅ Deleted Clerk user:', clerkUserId);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Error deleting Clerk user:', error);
      throw new Error(error.message || 'Failed to delete user from Clerk');
    }
  }

  /**
   * Send password reset email
   */
  static async sendPasswordReset(email: string) {
    try {
      if (!process.env.CLERK_SECRET_KEY) {
        throw new Error('Clerk is not configured - missing CLERK_SECRET_KEY');
      }

      // Find user by email
      const users = await clerk.users.getUserList({
        emailAddress: [email],
      });

      if (users.data.length === 0) {
        throw new Error('User not found');
      }

      const user = users.data[0];

      // Create a password reset invitation
      await clerk.invitations.createInvitation({
        emailAddress: email,
        redirectUrl: `${process.env.FRONTEND_URL}/reset-password`,
        publicMetadata: {
          type: 'password_reset',
          requestedAt: new Date().toISOString(),
        },
      });

      console.log('✅ Sent password reset to:', email);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Error sending password reset:', error);
      throw new Error(error.message || 'Failed to send password reset');
    }
  }

  /**
   * Get Clerk user by email
   */
  static async getUserByEmail(email: string) {
    try {
      if (!process.env.CLERK_SECRET_KEY) {
        return null;
      }

      const users = await clerk.users.getUserList({
        emailAddress: [email],
      });

      return users.data.length > 0 ? users.data[0] : null;
    } catch (error: any) {
      console.error('❌ Error getting Clerk user:', error);
      return null;
    }
  }

  /**
   * Get Clerk user by ID
   */
  static async getUserById(clerkUserId: string) {
    try {
      if (!process.env.CLERK_SECRET_KEY) {
        return null;
      }

      const user = await clerk.users.getUser(clerkUserId);
      return user;
    } catch (error: any) {
      console.error('❌ Error getting Clerk user by ID:', error);
      return null;
    }
  }

  /**
   * List all Clerk users
   */
  static async listUsers(limit: number = 100, offset: number = 0) {
    try {
      if (!process.env.CLERK_SECRET_KEY) {
        return { data: [], totalCount: 0 };
      }

      const users = await clerk.users.getUserList({
        limit,
        offset,
      });

      return users;
    } catch (error: any) {
      console.error('❌ Error listing Clerk users:', error);
      return { data: [], totalCount: 0 };
    }
  }

  /**
   * Verify if Clerk is properly configured
   */
  static isConfigured(): boolean {
    return !!process.env.CLERK_SECRET_KEY;
  }
}

// Export clerk client for direct use
export { clerk }; 