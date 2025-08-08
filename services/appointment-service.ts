import supabase from './supabase-client';
import EmailService from './email-service';
import NotificationService from './notification-service';

interface AppointmentData {
  lead_id: string;
  call_id?: string;
  organization_id: string;
  scheduled_at: Date;
  duration_minutes?: number;
  type?: string;
  title?: string;
  description?: string;
  location?: string;
  attendee_name?: string;
  attendee_email?: string;
  attendee_phone?: string;
  assigned_to?: string;
}

export class AppointmentService {
  private emailService: EmailService;
  private notificationService: NotificationService;
  
  constructor() {
    this.emailService = new EmailService();
    this.notificationService = new NotificationService();
  }
  
  /**
   * Book an appointment
   */
  async bookAppointment(data: AppointmentData) {
    try {
      console.log('📅 Booking appointment:', data);
      
      // Check for conflicts
      const hasConflict = await this.checkTimeConflict(
        data.scheduled_at,
        data.duration_minutes || 30,
        data.assigned_to
      );
      
      if (hasConflict) {
        console.warn('⚠️ Time conflict detected');
        // Create as tentative or find alternative slot
        return this.createTentativeAppointment(data);
      }
      
      // Create appointment
      const { data: appointment, error } = await supabase
        .from('appointments')
        .insert({
          ...data,
          scheduled_at: data.scheduled_at.toISOString(),
          status: 'scheduled',
          created_by: 'ai_system',
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Send confirmations
      await this.sendConfirmations(appointment);
      
      // Create calendar event (if integrated)
      await this.createCalendarEvent(appointment);
      
      // Schedule reminders
      await this.scheduleReminders(appointment);
      
      console.log('✅ Appointment booked successfully:', appointment.id);
      return appointment;
      
    } catch (error) {
      console.error('❌ Error booking appointment:', error);
      throw error;
    }
  }
  
  /**
   * Check for time conflicts
   */
  private async checkTimeConflict(
    scheduledAt: Date,
    durationMinutes: number,
    assignedTo?: string
  ): Promise<boolean> {
    const endTime = new Date(scheduledAt);
    endTime.setMinutes(endTime.getMinutes() + durationMinutes);
    
    let query = supabase
      .from('appointments')
      .select('id')
      .in('status', ['scheduled', 'confirmed'])
      .gte('scheduled_at', scheduledAt.toISOString())
      .lt('scheduled_at', endTime.toISOString());
    
    if (assignedTo) {
      query = query.eq('assigned_to', assignedTo);
    }
    
    const { data: conflicts } = await query;
    
    return (conflicts && conflicts.length > 0) || false;
  }
  
  /**
   * Create tentative appointment when there's a conflict
   */
  private async createTentativeAppointment(data: AppointmentData) {
    // Find next available slot
    const availableSlot = await this.findNextAvailableSlot(
      data.scheduled_at,
      data.duration_minutes || 30,
      data.assigned_to
    );
    
    const { data: appointment, error } = await supabase
      .from('appointments')
      .insert({
        ...data,
        scheduled_at: availableSlot.toISOString(),
        status: 'tentative',
        notes: `Original request: ${data.scheduled_at.toISOString()}. Moved due to conflict.`,
        metadata: {
          original_request: data.scheduled_at.toISOString(),
          conflict_detected: true
        }
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Create task for manual review
    await this.createReviewTask(appointment);
    
    return appointment;
  }
  
  /**
   * Find next available time slot
   */
  private async findNextAvailableSlot(
    preferredTime: Date,
    durationMinutes: number,
    assignedTo?: string
  ): Promise<Date> {
    // Simple implementation - just add 1 hour
    // In production, this would check calendar availability
    const nextSlot = new Date(preferredTime);
    nextSlot.setHours(nextSlot.getHours() + 1);
    
    // Ensure it's within business hours (9 AM - 5 PM)
    if (nextSlot.getHours() >= 17) {
      nextSlot.setDate(nextSlot.getDate() + 1);
      nextSlot.setHours(9, 0, 0, 0);
    }
    
    // Skip weekends
    if (nextSlot.getDay() === 0) nextSlot.setDate(nextSlot.getDate() + 1);
    if (nextSlot.getDay() === 6) nextSlot.setDate(nextSlot.getDate() + 2);
    
    return nextSlot;
  }
  
  /**
   * Send appointment confirmations
   */
  private async sendConfirmations(appointment: any) {
    try {
      // Email confirmation
      if (appointment.attendee_email) {
        await this.emailService.sendEmail({
          to: appointment.attendee_email,
          subject: 'Appointment Confirmation',
          html: this.generateConfirmationEmail(appointment)
        });
      }
      
      // SMS confirmation (if phone provided)
      if (appointment.attendee_phone) {
        // TODO: Implement SMS via Twilio
      }
      
      // Internal notification
      await this.notificationService.create({
        organization_id: appointment.organization_id,
        type: 'appointment_scheduled',
        title: 'New Appointment Booked',
        message: `Appointment with ${appointment.attendee_name} on ${new Date(appointment.scheduled_at).toLocaleString()}`,
        data: { appointment_id: appointment.id }
      });
      
    } catch (error) {
      console.error('❌ Error sending confirmations:', error);
    }
  }
  
  /**
   * Create calendar event (Google Calendar, Outlook, etc.)
   */
  private async createCalendarEvent(appointment: any) {
    // TODO: Implement calendar integration
    // This would use Google Calendar API, Microsoft Graph API, etc.
    console.log('📅 Calendar integration not yet implemented');
  }
  
  /**
   * Schedule appointment reminders
   */
  private async scheduleReminders(appointment: any) {
    // Schedule reminder 24 hours before
    const reminder24h = new Date(appointment.scheduled_at);
    reminder24h.setHours(reminder24h.getHours() - 24);
    
    // Schedule reminder 1 hour before
    const reminder1h = new Date(appointment.scheduled_at);
    reminder1h.setHours(reminder1h.getHours() - 1);
    
    // Create reminder tasks
    const reminders = [
      {
        organization_id: appointment.organization_id,
        type: 'appointment_reminder',
        title: `Reminder: Appointment in 24 hours`,
        due_date: reminder24h.toISOString(),
        metadata: { appointment_id: appointment.id, reminder_type: '24h' }
      },
      {
        organization_id: appointment.organization_id,
        type: 'appointment_reminder',
        title: `Reminder: Appointment in 1 hour`,
        due_date: reminder1h.toISOString(),
        metadata: { appointment_id: appointment.id, reminder_type: '1h' }
      }
    ];
    
    await supabase.from('tasks').insert(reminders);
  }
  
  /**
   * Create review task for tentative appointments
   */
  private async createReviewTask(appointment: any) {
    await supabase
      .from('tasks')
      .insert({
        organization_id: appointment.organization_id,
        type: 'review_appointment',
        title: `Review: Tentative appointment for ${appointment.attendee_name}`,
        description: `Time conflict detected. Please review and confirm the rescheduled time.`,
        priority: 'high',
        status: 'pending',
        metadata: { appointment_id: appointment.id }
      });
  }
  
  /**
   * Generate confirmation email HTML
   */
  private generateConfirmationEmail(appointment: any): string {
    const appointmentDate = new Date(appointment.scheduled_at);
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10b981;">Appointment Confirmed!</h2>
        
        <p>Dear ${appointment.attendee_name || 'Valued Customer'},</p>
        
        <p>Your appointment has been confirmed. Here are the details:</p>
        
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Date:</strong> ${appointmentDate.toLocaleDateString()}</p>
          <p><strong>Time:</strong> ${appointmentDate.toLocaleTimeString()}</p>
          <p><strong>Duration:</strong> ${appointment.duration_minutes || 30} minutes</p>
          ${appointment.location ? `<p><strong>Location:</strong> ${appointment.location}</p>` : ''}
          ${appointment.meeting_link ? `<p><strong>Meeting Link:</strong> <a href="${appointment.meeting_link}">${appointment.meeting_link}</a></p>` : ''}
        </div>
        
        <p>We'll send you a reminder 24 hours before your appointment.</p>
        
        <p>Need to reschedule? <a href="#">Click here</a> or reply to this email.</p>
        
        <p>We look forward to speaking with you!</p>
        
        <p>Best regards,<br>The Team</p>
      </div>
    `;
  }
  
  /**
   * Reschedule an appointment
   */
  async rescheduleAppointment(
    appointmentId: string,
    newScheduledAt: Date,
    reason?: string
  ) {
    const { data: appointment, error } = await supabase
      .from('appointments')
      .update({
        scheduled_at: newScheduledAt.toISOString(),
        updated_at: new Date().toISOString(),
        metadata: supabase.sql`metadata || jsonb_build_object('rescheduled', true, 'reschedule_reason', ${reason || 'Customer request'})`
      })
      .eq('id', appointmentId)
      .select()
      .single();
    
    if (error) throw error;
    
    // Send updated confirmations
    await this.sendConfirmations(appointment);
    
    return appointment;
  }
  
  /**
   * Cancel an appointment
   */
  async cancelAppointment(appointmentId: string, reason?: string) {
    const { data: appointment, error } = await supabase
      .from('appointments')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
        metadata: supabase.sql`metadata || jsonb_build_object('cancelled', true, 'cancel_reason', ${reason || 'Unknown'})`
      })
      .eq('id', appointmentId)
      .select()
      .single();
    
    if (error) throw error;
    
    // Send cancellation notifications
    if (appointment.attendee_email) {
      await this.emailService.sendEmail({
        to: appointment.attendee_email,
        subject: 'Appointment Cancelled',
        html: `<p>Your appointment scheduled for ${new Date(appointment.scheduled_at).toLocaleString()} has been cancelled.</p>`
      });
    }
    
    return appointment;
  }
}

export default AppointmentService;