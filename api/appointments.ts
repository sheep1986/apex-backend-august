import { Router, Request, Response } from 'express';
import { authenticateUser, AuthenticatedRequest } from '../middleware/auth';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const router = Router();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

// Validation schemas
const createAppointmentSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  scheduled_at: z.string(),
  duration_minutes: z.number().default(30),
  location: z.string().optional(),
  lead_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  lead_name: z.string().optional(),
  lead_email: z.string().email().optional(),
  lead_phone: z.string().optional(),
  lead_company: z.string().optional(),
  source: z.string().default('manual'),
});

const updateAppointmentSchema = z.object({
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  scheduled_at: z.string().optional(),
  duration_minutes: z.number().optional(),
  location: z.string().optional(),
  internal_notes: z.string().optional(),
  meeting_notes: z.string().optional(),
  outcome: z.string().optional(),
  next_steps: z.string().optional(),
});

// GET /api/appointments
router.get('/', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const { lead_id, contact_id, limit, status, date_from, date_to } = req.query;

    let query = supabase
      .from('appointments')
      .select(`
        *,
        leads!appointments_lead_id_fkey(first_name, last_name, company),
        campaigns!appointments_campaign_id_fkey(name),
        users!appointments_assigned_to_user_id_fkey(full_name)
      `)
      .eq('organization_id', organizationId)
      .order('scheduled_at', { ascending: true });

    // Apply filters
    if (lead_id) {
      query = query.eq('lead_id', lead_id);
    }
    if (contact_id) {
      query = query.eq('contact_id', contact_id);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (date_from) {
      query = query.gte('scheduled_at', date_from);
    }
    if (date_to) {
      query = query.lte('scheduled_at', date_to);
    }
    if (limit) {
      query = query.limit(parseInt(limit as string));
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching appointments:', error);
      return res.status(500).json({ error: 'Failed to fetch appointments' });
    }

    // Transform data to match frontend expectations
    const appointments = data?.map(apt => ({
      id: apt.id,
      title: apt.title,
      description: apt.description,
      scheduled_at: apt.scheduled_at,
      duration_minutes: apt.duration_minutes,
      location: apt.location,
      status: apt.status,
      lead_name: apt.lead_name || (apt.leads ? `${apt.leads.first_name} ${apt.leads.last_name}` : null),
      lead_email: apt.lead_email,
      lead_phone: apt.lead_phone,
      lead_company: apt.lead_company || apt.leads?.company,
      assigned_to_name: apt.users?.full_name,
      ai_confidence_score: apt.ai_confidence_score,
      ai_extracted_datetime: apt.ai_extracted_datetime,
      ai_meeting_purpose: apt.ai_meeting_purpose,
      source: apt.source,
      campaign_name: apt.campaigns?.name,
    })) || [];

    res.json(appointments);
  } catch (error) {
    console.error('Error in appointments API:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/appointments/:id
router.get('/:id', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        leads!appointments_lead_id_fkey(first_name, last_name, company, email, phone),
        campaigns!appointments_campaign_id_fkey(name),
        users!appointments_assigned_to_user_id_fkey(full_name, email)
      `)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching appointment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/appointments
router.post('/', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { organizationId, id: userId } = req.user!;
    
    // Validate request body
    const validatedData = createAppointmentSchema.parse(req.body);

    // Create appointment
    const { data, error } = await supabase
      .from('appointments')
      .insert({
        ...validatedData,
        organization_id: organizationId,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating appointment:', error);
      return res.status(500).json({ error: 'Failed to create appointment' });
    }

    // If appointment is from a qualified lead, update lead status
    if (validatedData.lead_id && validatedData.source === 'ai_call') {
      await supabase
        .from('leads')
        .update({ 
          status: 'appointment_scheduled',
          updated_at: new Date().toISOString() 
        })
        .eq('id', validatedData.lead_id);
    }

    res.status(201).json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    console.error('Error creating appointment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/appointments/:id
router.patch('/:id', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { organizationId, id: userId } = req.user!;
    const { id } = req.params;

    // Validate request body
    const validatedData = updateAppointmentSchema.parse(req.body);

    // Add status change timestamps
    const updateData: any = {
      ...validatedData,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };

    // Add timestamp fields based on status change
    if (validatedData.status) {
      switch (validatedData.status) {
        case 'confirmed':
          updateData.confirmed_at = new Date().toISOString();
          break;
        case 'completed':
          updateData.completed_at = new Date().toISOString();
          break;
        case 'cancelled':
          updateData.cancelled_at = new Date().toISOString();
          break;
      }
    }

    const { data, error } = await supabase
      .from('appointments')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    console.error('Error updating appointment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/appointments/:id
router.delete('/:id', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const { id } = req.params;

    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting appointment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/appointments/create-from-qualification
router.post('/create-from-qualification', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const { lead_id, call_id, campaign_id, ai_extracted_data } = req.body;

    if (!lead_id) {
      return res.status(400).json({ error: 'lead_id is required' });
    }

    // Call the database function to create appointment
    const { data, error } = await supabase
      .rpc('create_appointment_from_qualification', {
        p_lead_id: lead_id,
        p_call_id: call_id,
        p_campaign_id: campaign_id,
        p_organization_id: organizationId,
        p_ai_extracted_data: ai_extracted_data || {},
      });

    if (error) {
      console.error('Error creating appointment from qualification:', error);
      return res.status(500).json({ error: 'Failed to create appointment' });
    }

    res.status(201).json({ appointment_id: data });
  } catch (error) {
    console.error('Error in create-from-qualification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;