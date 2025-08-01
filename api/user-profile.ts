import express from 'express';
import { AuthenticatedRequest, authenticateUser } from '../middleware/clerk-auth';
import supabase from '../services/supabase-client';

const router = express.Router();

// Get current user profile
router.get('/', authenticateUser, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    console.log('🔍 Fetching user profile for User ID:', userId);

    // If we already have user data from middleware, use it
    if (req.user && req.user.role && req.user.email) {
      console.log('✅ User profile from middleware:', req.user);
      
      const userProfile = {
        id: req.user.id,
        email: req.user.email,
        first_name: req.user.firstName || '',
        last_name: req.user.lastName || '',
        role: req.user.role,
        status: 'active',
        organization_id: req.user.organizationId,
        organization_name: 'User Organization'
      };

      return res.json(userProfile);
    }

    // Fetch user data from database as fallback
    const { data: user, error } = await supabase
      .from('users')
      .select(`
        id,
        email,
        first_name,
        last_name,
        role,
        status,
        organization_id,
        organizations!inner(name)
      `)
      .eq('id', userId)
      .single();

    if (error || !user) {
      console.error('❌ User not found in database:', error);
      return res.status(404).json({ 
        error: 'User not found',
        message: 'Please contact support if this issue persists'
      });
    }

    console.log('✅ User profile found:', user);

    // Format response
    const userProfile = {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      status: user.status,
      organization_id: user.organization_id,
      organization_name: user.organizations?.name || ''
    };

    res.json(userProfile);

  } catch (error) {
    console.error('❌ Error fetching user profile:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to fetch user profile'
    });
  }
});

export default router; 