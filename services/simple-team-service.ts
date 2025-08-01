import supabase from './supabase-client';
import { createClerkClient } from '@clerk/backend';
import * as crypto from 'crypto';

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY || '',
});

export interface SimpleTeamMemberData {
  email: string;
  firstName: string;
  lastName: string;
  role: 'support_admin' | 'support_agent';
  permissions: any;
}

export class SimpleTeamService {
  /**
   * Add team member with temporary password approach
   */
  static async addTeamMember(data: SimpleTeamMemberData) {
    try {
      // Generate temporary credentials
      const username = data.email.split('@')[0] + crypto.randomBytes(3).toString('hex');
      const tempPassword = 'Welcome2024!' + crypto.randomBytes(4).toString('hex');
      
      // Create user in Clerk with password
      let clerkUser;
      try {
        clerkUser = await clerk.users.createUser({
          emailAddress: [data.email],
          firstName: data.firstName,
          lastName: data.lastName,
          username: username,
          password: tempPassword,
        });
        
        console.log(`✅ Created Clerk user: ${clerkUser.id}`);
        console.log(`📧 Temporary credentials for ${data.email}:`);
        console.log(`   Username: ${username}`);
        console.log(`   Password: ${tempPassword}`);
        
      } catch (error: any) {
        if (error.errors?.[0]?.code === 'form_identifier_exists') {
          // User already exists, get their ID
          const users = await clerk.users.getUserList({
            emailAddress: [data.email]
          });
          if (users.data.length > 0) {
            clerkUser = users.data[0];
            console.log(`ℹ️ User already exists in Clerk: ${clerkUser.id}`);
          } else {
            throw new Error('Could not find existing user');
          }
        } else {
          throw error;
        }
      }
      
      // Create/update user in Supabase
      const { data: dbUser, error } = await supabase
        .from('users')
        .upsert({
          email: data.email,
          first_name: data.firstName,
          last_name: data.lastName,
          role: data.role,
          organization_id: '550e8400-e29b-41d4-a716-446655440000', // Platform org
          clerk_user_id: clerkUser.id,
          permissions: data.permissions,
          is_active: true,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'email'
        })
        .select()
        .single();
        
      if (error) throw error;
      
      return {
        ...dbUser,
        tempCredentials: {
          username,
          password: tempPassword,
          message: 'Please share these credentials securely with the team member'
        }
      };
      
    } catch (error) {
      console.error('Error in SimpleTeamService:', error);
      throw error;
    }
  }
  
  /**
   * Send credentials via email (implement with your email service)
   */
  static async sendCredentialsEmail(email: string, credentials: any) {
    // TODO: Implement with SendGrid, Postmark, etc.
    console.log(`📮 Would send email to ${email} with login credentials`);
  }
} 