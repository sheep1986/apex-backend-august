"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleTeamService = void 0;
const supabase_client_1 = __importDefault(require("./supabase-client"));
const backend_1 = require("@clerk/backend");
const crypto = __importStar(require("crypto"));
const clerk = (0, backend_1.createClerkClient)({
    secretKey: process.env.CLERK_SECRET_KEY || '',
});
class SimpleTeamService {
    static async addTeamMember(data) {
        try {
            const username = data.email.split('@')[0] + crypto.randomBytes(3).toString('hex');
            const tempPassword = 'Welcome2024!' + crypto.randomBytes(4).toString('hex');
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
            }
            catch (error) {
                if (error.errors?.[0]?.code === 'form_identifier_exists') {
                    const users = await clerk.users.getUserList({
                        emailAddress: [data.email]
                    });
                    if (users.data.length > 0) {
                        clerkUser = users.data[0];
                        console.log(`ℹ️ User already exists in Clerk: ${clerkUser.id}`);
                    }
                    else {
                        throw new Error('Could not find existing user');
                    }
                }
                else {
                    throw error;
                }
            }
            const { data: dbUser, error } = await supabase_client_1.default
                .from('users')
                .upsert({
                email: data.email,
                first_name: data.firstName,
                last_name: data.lastName,
                role: data.role,
                organization_id: '550e8400-e29b-41d4-a716-446655440000',
                clerk_user_id: clerkUser.id,
                permissions: data.permissions,
                is_active: true,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'email'
            })
                .select()
                .single();
            if (error)
                throw error;
            return {
                ...dbUser,
                tempCredentials: {
                    username,
                    password: tempPassword,
                    message: 'Please share these credentials securely with the team member'
                }
            };
        }
        catch (error) {
            console.error('Error in SimpleTeamService:', error);
            throw error;
        }
    }
    static async sendCredentialsEmail(email, credentials) {
        console.log(`📮 Would send email to ${email} with login credentials`);
    }
}
exports.SimpleTeamService = SimpleTeamService;
