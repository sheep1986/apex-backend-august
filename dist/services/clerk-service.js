"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clerk = exports.ClerkService = void 0;
const backend_1 = require("@clerk/backend");
const clerk = (0, backend_1.createClerkClient)({
    secretKey: process.env.CLERK_SECRET_KEY,
});
exports.clerk = clerk;
class ClerkService {
    static async createUser(userData) {
        try {
            if (!process.env.CLERK_SECRET_KEY) {
                throw new Error('Clerk is not configured - missing CLERK_SECRET_KEY');
            }
            const existingUsers = await clerk.users.getUserList({
                emailAddress: [userData.email],
            });
            if (existingUsers.data.length > 0) {
                console.log('User already exists in Clerk:', userData.email);
                return existingUsers.data[0];
            }
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
            }
            catch (inviteError) {
                console.warn('⚠️  Failed to send invitation email:', inviteError);
            }
            return user;
        }
        catch (error) {
            console.error('❌ Error creating Clerk user:', error);
            throw new Error(error.message || 'Failed to create user in Clerk');
        }
    }
    static async updateUser(clerkUserId, updates) {
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
        }
        catch (error) {
            console.error('❌ Error updating Clerk user:', error);
            throw new Error(error.message || 'Failed to update user in Clerk');
        }
    }
    static async deleteUser(clerkUserId) {
        try {
            if (!process.env.CLERK_SECRET_KEY) {
                throw new Error('Clerk is not configured - missing CLERK_SECRET_KEY');
            }
            await clerk.users.deleteUser(clerkUserId);
            console.log('✅ Deleted Clerk user:', clerkUserId);
            return { success: true };
        }
        catch (error) {
            console.error('❌ Error deleting Clerk user:', error);
            throw new Error(error.message || 'Failed to delete user from Clerk');
        }
    }
    static async sendPasswordReset(email) {
        try {
            if (!process.env.CLERK_SECRET_KEY) {
                throw new Error('Clerk is not configured - missing CLERK_SECRET_KEY');
            }
            const users = await clerk.users.getUserList({
                emailAddress: [email],
            });
            if (users.data.length === 0) {
                throw new Error('User not found');
            }
            const user = users.data[0];
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
        }
        catch (error) {
            console.error('❌ Error sending password reset:', error);
            throw new Error(error.message || 'Failed to send password reset');
        }
    }
    static async getUserByEmail(email) {
        try {
            if (!process.env.CLERK_SECRET_KEY) {
                return null;
            }
            const users = await clerk.users.getUserList({
                emailAddress: [email],
            });
            return users.data.length > 0 ? users.data[0] : null;
        }
        catch (error) {
            console.error('❌ Error getting Clerk user:', error);
            return null;
        }
    }
    static async getUserById(clerkUserId) {
        try {
            if (!process.env.CLERK_SECRET_KEY) {
                return null;
            }
            const user = await clerk.users.getUser(clerkUserId);
            return user;
        }
        catch (error) {
            console.error('❌ Error getting Clerk user by ID:', error);
            return null;
        }
    }
    static async listUsers(limit = 100, offset = 0) {
        try {
            if (!process.env.CLERK_SECRET_KEY) {
                return { data: [], totalCount: 0 };
            }
            const users = await clerk.users.getUserList({
                limit,
                offset,
            });
            return users;
        }
        catch (error) {
            console.error('❌ Error listing Clerk users:', error);
            return { data: [], totalCount: 0 };
        }
    }
    static isConfigured() {
        return !!process.env.CLERK_SECRET_KEY;
    }
}
exports.ClerkService = ClerkService;
