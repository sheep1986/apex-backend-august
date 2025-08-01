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
const express_1 = require("express");
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const router = (0, express_1.Router)();
router.get('/members', async (req, res) => {
    try {
        const { data: members, error } = await supabase_client_1.default
            .from('users')
            .select('*')
            .in('role', ['support_admin', 'support_agent'])
            .order('created_at', { ascending: false });
        if (error)
            throw error;
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
    }
    catch (error) {
        console.error('Error fetching team members:', error);
        res.status(500).json({ error: 'Failed to fetch team members' });
    }
});
router.post('/members', async (req, res) => {
    try {
        const { email, firstName, lastName, role, permissions } = req.body;
        if (!email || !firstName || !lastName || !role) {
            return res.status(400).json({
                error: 'Missing required fields'
            });
        }
        if (!['support_admin', 'support_agent'].includes(role)) {
            return res.status(400).json({
                error: 'Invalid role. Must be support_admin or support_agent'
            });
        }
        const platformOrgId = '550e8400-e29b-41d4-a716-446655440000';
        const { data: newUser, error: userError } = await supabase_client_1.default
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
        if (userError)
            throw userError;
        try {
            const { EmailService } = await Promise.resolve().then(() => __importStar(require('../services/email-service')));
            const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/invite?token=${newUser.id}`;
            await EmailService.sendInvitation(email, firstName, inviteLink);
        }
        catch (emailError) {
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
    }
    catch (error) {
        console.error('Error adding team member:', error);
        res.status(500).json({
            error: error.message || 'Failed to add team member'
        });
    }
});
router.put('/members/:memberId', async (req, res) => {
    try {
        const { memberId } = req.params;
        const { permissions, role } = req.body;
        const updates = {
            updated_at: new Date().toISOString()
        };
        if (permissions) {
            updates.permissions = permissions;
        }
        if (role) {
            updates.role = role;
        }
        const { data, error } = await supabase_client_1.default
            .from('users')
            .update(updates)
            .eq('id', memberId)
            .select()
            .single();
        if (error)
            throw error;
        res.json({
            success: true,
            member: data
        });
    }
    catch (error) {
        console.error('Error updating team member:', error);
        res.status(500).json({
            error: 'Failed to update team member'
        });
    }
});
router.delete('/members/:memberId', async (req, res) => {
    try {
        const { memberId } = req.params;
        const { error } = await supabase_client_1.default
            .from('users')
            .delete()
            .eq('id', memberId);
        if (error)
            throw error;
        res.json({
            success: true,
            message: 'Team member removed successfully'
        });
    }
    catch (error) {
        console.error('Error removing team member:', error);
        res.status(500).json({
            error: 'Failed to remove team member'
        });
    }
});
exports.default = router;
