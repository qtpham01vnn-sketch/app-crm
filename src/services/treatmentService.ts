import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type {
  TreatmentPhoto,
  CustomerTreatmentHistory
} from '../types';

export const treatmentService = {
  /**
   * Fetch full treatment history for a customer
   */
  async getCustomerTreatmentHistory(orgId: string, customerId: string): Promise<CustomerTreatmentHistory> {
    if (!isSupabaseConfigured || !supabase) {
      return {
        customerId,
        treatmentPlans: [],
        treatmentSessions: [],
        treatmentPhotos: [],
        treatmentConsents: []
      };
    }

    const client = supabase;

    try {
      const { data, error } = await client.rpc('rpc_get_customer_treatment_history', {
        p_org_id: orgId,
        p_customer_id: customerId
      });

      if (error) {
        console.error('Error fetching treatment history:', error);
        throw error;
      }

      const res = data || {};
      const photos: TreatmentPhoto[] = (res.treatment_photos || []).map((ph: any) => ({
        id: ph.id,
        orgId,
        branchId: ph.branch_id || '',
        customerId,
        sessionId: ph.session_id,
        photoType: ph.photo_type,
        treatmentArea: ph.treatment_area,
        angle: ph.angle || 'front',
        storagePath: ph.storage_path,
        thumbnailPath: ph.thumbnail_path,
        fileName: ph.file_name,
        fileSize: Number(ph.file_size) || 0,
        mimeType: ph.mime_type || 'image/jpeg',
        watermarkApplied: Boolean(ph.watermark_applied),
        capturedAt: ph.captured_at,
        uploadedBy: ph.uploaded_by || '',
        uploadedByName: ph.uploaded_by_name,
        notes: ph.notes,
        isConsentMarketing: Boolean(ph.is_consent_marketing)
      }));

      // Generate signed URLs for private photos (1 hour expiry)
      await Promise.all(
        photos.map(async (ph) => {
          if (ph.storagePath) {
            const { data: signedData } = await client.storage
              .from('treatment-photos')
              .createSignedUrl(ph.storagePath, 3600);
            if (signedData?.signedUrl) {
              ph.signedUrl = signedData.signedUrl;
            }
          }
        })
      );

      return {
        customerId,
        treatmentPlans: (res.treatment_plans || []).map((p: any) => ({
          id: p.id,
          orgId,
          branchId: p.branch_id || '',
          customerId,
          planCode: p.plan_code,
          title: p.title,
          diagnosisNotes: p.diagnosis_notes,
          targetOutcome: p.target_outcome,
          totalSessionsPlanned: Number(p.total_sessions_planned) || 1,
          leadDoctorId: p.lead_doctor_id,
          leadDoctorName: p.lead_doctor_name,
          status: p.status || 'active',
          startDate: p.start_date,
          expectedEndDate: p.expected_end_date,
          branchName: p.branch_name,
          createdAt: p.created_at
        })),
        treatmentSessions: (res.treatment_sessions || []).map((s: any) => ({
          id: s.id,
          orgId,
          branchId: s.branch_id || '',
          customerId,
          treatmentPlanId: s.treatment_plan_id,
          sessionCode: s.session_code,
          sessionNumber: Number(s.session_number) || 1,
          performedBy: s.performed_by_id || '',
          performedByName: s.performed_by_name,
          assistantName: s.assistant_name,
          performedAt: s.performed_at,
          treatmentArea: s.treatment_area || 'Toàn mặt',
          preTreatmentNotes: s.pre_treatment_notes,
          protocolPerformed: s.protocol_performed || '',
          postTreatmentNotes: s.post_treatment_notes,
          clinicalReactions: s.clinical_reactions || 'Bình thường',
          homecareInstructions: s.homecare_instructions,
          nextAppointmentDate: s.next_appointment_date,
          status: s.status || 'draft',
          confirmedByName: s.confirmed_by_name,
          confirmedAt: s.confirmed_at,
          branchName: s.branch_name
        })),
        treatmentPhotos: photos,
        treatmentConsents: (res.treatment_consents || []).map((c: any) => ({
          id: c.id,
          orgId,
          customerId,
          templateCode: c.template_code,
          templateVersion: c.template_version,
          consentTitle: c.consent_title,
          consentContentSnapshot: '',
          agreeTreatment: Boolean(c.agree_treatment),
          agreePhotoRecords: Boolean(c.agree_photo_records),
          agreeMarketingUsage: Boolean(c.agree_marketing_usage),
          signedAt: c.signed_at,
          witnessStaffId: '',
          witnessStaffName: c.witness_staff_name,
          signerName: c.signer_name,
          status: c.status || 'signed'
        }))
      };
    } catch (err) {
      console.error('Lỗi khi lấy hồ sơ điều trị:', err);
      throw err;
    }
  },

  /**
   * Create a new treatment plan
   */
  async createTreatmentPlan(plan: {
    orgId: string;
    branchId: string;
    customerId: string;
    title: string;
    diagnosisNotes?: string;
    targetOutcome?: string;
    totalSessionsPlanned: number;
    leadDoctorId?: string;
    startDate: string;
    expectedEndDate?: string;
    courseId?: string;
  }): Promise<string> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase chưa cấu hình');

    const planCode = `PHACDO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const { data, error } = await supabase
      .from('treatment_plans')
      .insert({
        organization_id: plan.orgId,
        branch_id: plan.branchId,
        customer_id: plan.customerId,
        plan_code: planCode,
        title: plan.title,
        diagnosis_notes: plan.diagnosisNotes,
        target_outcome: plan.targetOutcome,
        total_sessions_planned: plan.totalSessionsPlanned,
        lead_doctor_id: plan.leadDoctorId || null,
        start_date: plan.startDate,
        expected_end_date: plan.expectedEndDate || null,
        course_id: plan.courseId || null,
        status: 'active'
      })
      .select('id')
      .single();

    if (error) {
      console.error('Lỗi tạo phác đồ điều trị:', error);
      throw error;
    }

    return data.id;
  },

  /**
   * Create a new treatment session via RPC
   */
  async createTreatmentSession(session: {
    orgId: string;
    branchId: string;
    customerId: string;
    performedBy: string;
    protocolPerformed: string;
    treatmentPlanId?: string;
    appointmentId?: string;
    courseUsageId?: string;
    sessionNumber?: number;
    treatmentArea?: string;
    preTreatmentNotes?: string;
    postTreatmentNotes?: string;
    clinicalReactions?: string;
    homecareInstructions?: string;
    nextAppointmentDate?: string;
    assistantId?: string;
  }): Promise<{ sessionId: string; sessionCode: string }> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase chưa cấu hình');

    const { data, error } = await supabase.rpc('rpc_create_treatment_session', {
      p_org_id: session.orgId,
      p_branch_id: session.branchId,
      p_customer_id: session.customerId,
      p_performed_by: session.performedBy,
      p_protocol_performed: session.protocolPerformed,
      p_treatment_plan_id: session.treatmentPlanId || null,
      p_appointment_id: session.appointmentId || null,
      p_course_usage_id: session.courseUsageId || null,
      p_session_number: session.sessionNumber || 1,
      p_treatment_area: session.treatmentArea || 'Toàn mặt',
      p_pre_treatment_notes: session.preTreatmentNotes || null,
      p_post_treatment_notes: session.postTreatmentNotes || null,
      p_clinical_reactions: session.clinicalReactions || 'Bình thường',
      p_homecare_instructions: session.homecareInstructions || null,
      p_next_appointment_date: session.nextAppointmentDate || null,
      p_assistant_id: session.assistantId || null
    });

    if (error || !data?.success) {
      console.error('Lỗi tạo buổi điều trị:', error || data);
      throw new Error(data?.error || error?.message || 'Không thể tạo buổi điều trị');
    }

    return {
      sessionId: data.session_id,
      sessionCode: data.session_code
    };
  },

  /**
   * Update treatment session with audit log
   */
  async updateTreatmentSession(params: {
    sessionId: string;
    modifiedBy: string;
    reasonForChange: string;
    protocolPerformed: string;
    treatmentArea?: string;
    preTreatmentNotes?: string;
    postTreatmentNotes?: string;
    clinicalReactions?: string;
    homecareInstructions?: string;
    nextAppointmentDate?: string;
  }): Promise<void> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase chưa cấu hình');

    const { data, error } = await supabase.rpc('rpc_update_treatment_session', {
      p_session_id: params.sessionId,
      p_modified_by: params.modifiedBy,
      p_reason_for_change: params.reasonForChange,
      p_protocol_performed: params.protocolPerformed,
      p_treatment_area: params.treatmentArea || 'Toàn mặt',
      p_pre_treatment_notes: params.preTreatmentNotes || null,
      p_post_treatment_notes: params.postTreatmentNotes || null,
      p_clinical_reactions: params.clinicalReactions || 'Bình thường',
      p_homecare_instructions: params.homecareInstructions || null,
      p_next_appointment_date: params.nextAppointmentDate || null
    });

    if (error || !data?.success) {
      console.error('Lỗi cập nhật buổi điều trị:', error || data);
      throw new Error(data?.error || error?.message || 'Không thể cập nhật buổi điều trị');
    }
  },

  /**
   * Lock & Confirm treatment session
   */
  async confirmTreatmentSession(sessionId: string, confirmedBy: string): Promise<void> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase chưa cấu hình');

    const { data, error } = await supabase.rpc('rpc_confirm_treatment_session', {
      p_session_id: sessionId,
      p_confirmed_by: confirmedBy
    });

    if (error || !data?.success) {
      console.error('Lỗi xác nhận buổi điều trị:', error || data);
      throw new Error(data?.error || error?.message || 'Không thể xác nhận buổi điều trị');
    }
  },

  /**
   * Upload private treatment photo to Supabase Storage
   */
  async uploadTreatmentPhoto(params: {
    orgId: string;
    branchId: string;
    customerId: string;
    sessionId?: string;
    photoType: 'before' | 'after' | 'follow_up' | 'progress';
    treatmentArea: string;
    angle: 'front' | 'left_45' | 'right_45' | 'left_90' | 'right_90' | 'close_up';
    file: File;
    uploadedBy: string;
    notes?: string;
    isConsentMarketing?: boolean;
  }): Promise<TreatmentPhoto> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase chưa cấu hình');

    const cleanFileName = params.file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${params.orgId}/${params.customerId}/${params.photoType}_${Date.now()}_${cleanFileName}`;

    // 1. Upload to private Storage bucket
    const { error: uploadErr } = await supabase.storage
      .from('treatment-photos')
      .upload(storagePath, params.file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadErr) {
      console.error('Lỗi tải ảnh lên Storage:', uploadErr);
      throw new Error(`Tải ảnh thất bại: ${uploadErr.message}`);
    }

    // 2. Insert record into treatment_photos
    const { data: photoRec, error: dbErr } = await supabase
      .from('treatment_photos')
      .insert({
        organization_id: params.orgId,
        branch_id: params.branchId,
        customer_id: params.customerId,
        session_id: params.sessionId || null,
        photo_type: params.photoType,
        treatment_area: params.treatmentArea,
        angle: params.angle,
        storage_path: storagePath,
        file_name: cleanFileName,
        file_size: params.file.size,
        mime_type: params.file.type || 'image/jpeg',
        watermark_applied: false,
        captured_at: new Date().toISOString(),
        uploaded_by: params.uploadedBy,
        notes: params.notes || null,
        is_consent_marketing: Boolean(params.isConsentMarketing)
      })
      .select()
      .single();

    if (dbErr) {
      console.error('Lỗi lưu bản ghi ảnh vào DB:', dbErr);
      // Clean up orphaned storage file
      await supabase.storage.from('treatment-photos').remove([storagePath]);
      throw dbErr;
    }

    // 3. Create signed URL for instant rendering
    const { data: signedData } = await supabase.storage
      .from('treatment-photos')
      .createSignedUrl(storagePath, 3600);

    return {
      id: photoRec.id,
      orgId: params.orgId,
      branchId: params.branchId,
      customerId: params.customerId,
      sessionId: photoRec.session_id,
      photoType: photoRec.photo_type,
      treatmentArea: photoRec.treatment_area,
      angle: photoRec.angle,
      storagePath: photoRec.storage_path,
      fileName: photoRec.file_name,
      fileSize: photoRec.file_size,
      mimeType: photoRec.mime_type,
      watermarkApplied: photoRec.watermark_applied,
      capturedAt: photoRec.captured_at,
      uploadedBy: photoRec.uploaded_by,
      notes: photoRec.notes,
      isConsentMarketing: photoRec.is_consent_marketing,
      signedUrl: signedData?.signedUrl
    };
  },

  /**
   * Save Treatment Consent and Signature
   */
  async saveTreatmentConsent(params: {
    orgId: string;
    customerId: string;
    treatmentPlanId?: string;
    sessionId?: string;
    consentTitle: string;
    consentContentSnapshot: string;
    agreeTreatment: boolean;
    agreePhotoRecords: boolean;
    agreeMarketingUsage: boolean;
    signatureSvg: string;
    witnessStaffId: string;
    signerName: string;
    signerPhone?: string;
  }): Promise<string> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase chưa cấu hình');

    const { data, error } = await supabase
      .from('treatment_consents')
      .insert({
        organization_id: params.orgId,
        customer_id: params.customerId,
        treatment_plan_id: params.treatmentPlanId || null,
        session_id: params.sessionId || null,
        template_code: 'CONSENT_STANDARD_V1',
        template_version: 'v1.0',
        consent_title: params.consentTitle,
        consent_content_snapshot: params.consentContentSnapshot,
        agree_treatment: params.agreeTreatment,
        agree_photo_records: params.agreePhotoRecords,
        agree_marketing_usage: params.agreeMarketingUsage,
        signature_svg: params.signatureSvg,
        witness_staff_id: params.witnessStaffId,
        signer_name: params.signerName,
        signer_phone: params.signerPhone || null,
        status: 'signed'
      })
      .select('id')
      .single();

    if (error) {
      console.error('Lỗi lưu cam kết điều trị:', error);
      throw error;
    }

    return data.id;
  }
};
