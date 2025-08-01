"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppointmentService = void 0;
const supabase_client_1 = __importDefault(require("./supabase-client"));
const email_service_1 = __importDefault(require("./email-service"));
const notification_service_1 = __importDefault(require("./notification-service"));
class AppointmentService {
    constructor() {
        this.emailService = new email_service_1.default();
        this.notificationService = new notification_service_1.default();
    }
    async bookAppointment(data) {
        try {
            console.log('📅 Booking appointment:', data);
            const hasConflict = await this.checkTimeConflict(data.scheduled_at, data.duration_minutes || 30, data.assigned_to);
            if (hasConflict) {
                console.warn('⚠️ Time conflict detected');
                return this.createTentativeAppointment(data);
            }
            const { data: appointment, error } = await supabase_client_1.default
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
            if (error)
                throw error;
            await this.sendConfirmations(appointment);
            await this.createCalendarEvent(appointment);
            await this.scheduleReminders(appointment);
            console.log('✅ Appointment booked successfully:', appointment.id);
            return appointment;
        }
        catch (error) {
            console.error('❌ Error booking appointment:', error);
            throw error;
        }
    }
    async checkTimeConflict(scheduledAt, durationMinutes, assignedTo) {
        const endTime = new Date(scheduledAt);
        endTime.setMinutes(endTime.getMinutes() + durationMinutes);
        let query = supabase_client_1.default
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
    async createTentativeAppointment(data) {
        const availableSlot = await this.findNextAvailableSlot(data.scheduled_at, data.duration_minutes || 30, data.assigned_to);
        const { data: appointment, error } = await supabase_client_1.default
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
        if (error)
            throw error;
        await this.createReviewTask(appointment);
        return appointment;
    }
    async findNextAvailableSlot(preferredTime, durationMinutes, assignedTo) {
        const nextSlot = new Date(preferredTime);
        nextSlot.setHours(nextSlot.getHours() + 1);
        if (nextSlot.getHours() >= 17) {
            nextSlot.setDate(nextSlot.getDate() + 1);
            nextSlot.setHours(9, 0, 0, 0);
        }
        if (nextSlot.getDay() === 0)
            nextSlot.setDate(nextSlot.getDate() + 1);
        if (nextSlot.getDay() === 6)
            nextSlot.setDate(nextSlot.getDate() + 2);
        return nextSlot;
    }
    async sendConfirmations(appointment) {
        try {
            if (appointment.attendee_email) {
                await this.emailService.sendEmail({
                    to: appointment.attendee_email,
                    subject: 'Appointment Confirmation',
                    html: this.generateConfirmationEmail(appointment)
                });
            }
            if (appointment.attendee_phone) {
            }
            await this.notificationService.create({
                organization_id: appointment.organization_id,
                type: 'appointment_scheduled',
                title: 'New Appointment Booked',
                message: `Appointment with ${appointment.attendee_name} on ${new Date(appointment.scheduled_at).toLocaleString()}`,
                data: { appointment_id: appointment.id }
            });
        }
        catch (error) {
            console.error('❌ Error sending confirmations:', error);
        }
    }
    async createCalendarEvent(appointment) {
        console.log('📅 Calendar integration not yet implemented');
    }
    async scheduleReminders(appointment) {
        const reminder24h = new Date(appointment.scheduled_at);
        reminder24h.setHours(reminder24h.getHours() - 24);
        const reminder1h = new Date(appointment.scheduled_at);
        reminder1h.setHours(reminder1h.getHours() - 1);
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
        await supabase_client_1.default.from('tasks').insert(reminders);
    }
    async createReviewTask(appointment) {
        await supabase_client_1.default
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
    generateConfirmationEmail(appointment) {
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
    async rescheduleAppointment(appointmentId, newScheduledAt, reason) {
        const { data: appointment, error } = await supabase_client_1.default
            .from('appointments')
            .update({
            scheduled_at: newScheduledAt.toISOString(),
            updated_at: new Date().toISOString(),
            metadata: supabase_client_1.default.sql `metadata || jsonb_build_object('rescheduled', true, 'reschedule_reason', ${reason || 'Customer request'})`
        })
            .eq('id', appointmentId)
            .select()
            .single();
        if (error)
            throw error;
        await this.sendConfirmations(appointment);
        return appointment;
    }
    async cancelAppointment(appointmentId, reason) {
        const { data: appointment, error } = await supabase_client_1.default
            .from('appointments')
            .update({
            status: 'cancelled',
            updated_at: new Date().toISOString(),
            metadata: supabase_client_1.default.sql `metadata || jsonb_build_object('cancelled', true, 'cancel_reason', ${reason || 'Unknown'})`
        })
            .eq('id', appointmentId)
            .select()
            .single();
        if (error)
            throw error;
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
exports.AppointmentService = AppointmentService;
exports.default = AppointmentService;
