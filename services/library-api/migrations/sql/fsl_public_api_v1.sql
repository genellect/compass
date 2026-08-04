CREATE SCHEMA IF NOT EXISTS fsl_public_api AUTHORIZATION fsl_migration;
CREATE SCHEMA IF NOT EXISTS fsl_private AUTHORIZATION fsl_migration;

REVOKE ALL ON SCHEMA fsl_public_api FROM PUBLIC;
REVOKE ALL ON SCHEMA fsl_private FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA fsl_public_api
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA fsl_private
    REVOKE ALL ON TABLES FROM PUBLIC;

CREATE TABLE fsl_private.public_registration_rpc_keys (
    key_version text PRIMARY KEY,
    token_sha256 bytea NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
    retired_at timestamptz,
    CONSTRAINT ck_public_registration_rpc_key_version
        CHECK (key_version ~ '^v[1-9][0-9]*$'),
    CONSTRAINT ck_public_registration_rpc_key_digest
        CHECK (pg_catalog.octet_length(token_sha256) = 32),
    CONSTRAINT ck_public_registration_rpc_key_retirement
        CHECK (active OR retired_at IS NOT NULL)
);
REVOKE ALL ON TABLE fsl_private.public_registration_rpc_keys FROM PUBLIC;

CREATE OR REPLACE FUNCTION fsl_public_api.submit_registration_v1(
    p_request jsonb,
    p_rpc_token text
)
RETURNS TABLE (
    eligibility_status text,
    reason_codes jsonb,
    persisted boolean,
    replayed boolean,
    application_id uuid,
    identity_linked boolean,
    drive_access_status text,
    drive_notification_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fsl_submit_registration_v1$
DECLARE
    v_idempotency_digest text;
    v_rpc_key_version text;
    v_expected_token_hash bytea;
    v_actual_token_hash bytea;
    v_rpc_token_valid boolean := false;
    v_request_fingerprint text;
    v_subject_hash text;
    v_email text;
    v_student_number text;
    v_full_name text;
    v_academic_role text;
    v_faculty_code text;
    v_grade text;
    v_question text;
    v_base_status text;
    v_base_reasons jsonb;
    v_terms_version text;
    v_terms_accepted boolean;
    v_privacy_version text;
    v_privacy_accepted boolean;
    v_google_sub text;
    v_identity_email text;
    v_hosted_domain text;
    v_email_verified boolean;
    v_issuer text;
    v_audience text;
    v_occurred_at_epoch bigint;
    v_occurred_at timestamptz;
    v_candidate_member_id uuid;
    v_candidate_identity_id uuid;
    v_candidate_application_id uuid;
    v_candidate_grant_id uuid;
    v_candidate_operation_id uuid;
    v_attestation_version text;
    v_attestation_issued_at bigint;
    v_attestation_nonce text;
    v_attestation_signature text;
    v_email_member_id uuid;
    v_student_member_id uuid;
    v_member_id uuid;
    v_linked_identity_id uuid;
    v_linked_identity_member_id uuid;
    v_linked_identity_unlinked_at timestamptz;
    v_identity_conflict boolean := false;
    v_identity_binding_conflict boolean := false;
    v_member_matches boolean := false;
    v_member_was_missing boolean := false;
    v_final_status text;
    v_final_reasons jsonb;
    v_application_id uuid;
    v_application_member_id uuid;
    v_application_subject_hash text;
    v_application_fingerprint text;
    v_application_status text;
    v_application_reasons jsonb;
    v_application_admin_decision text;
    v_identity_linked boolean := false;
    v_drive_status text := 'not_enqueued';
    v_notification_status text := 'not_applicable';
    v_grant_id uuid;
    v_operation_key text;
BEGIN
    IF p_request IS NULL
       OR pg_catalog.jsonb_typeof(p_request) <> 'object'
       OR NOT p_request ?& ARRAY[
           'contract_version',
           'rpc_key_version',
           'idempotency_digest',
           'request_fingerprint',
           'authentication_subject_hash',
           'normalized_email',
           'normalized_student_number',
           'full_name',
           'academic_role',
           'faculty_code',
           'grade',
           'question',
           'base_eligibility_status',
           'base_reason_codes',
           'requires_student_details',
           'terms_version',
           'terms_accepted',
           'privacy_version',
           'privacy_accepted',
           'google_sub',
           'identity_email',
           'hosted_domain',
           'email_verified',
           'issuer',
           'audience',
           'occurred_at_epoch',
           'candidate_member_id',
           'candidate_identity_id',
           'candidate_application_id',
           'candidate_grant_id',
           'candidate_operation_id',
           'attestation_version',
           'attestation_issued_at',
           'attestation_nonce',
           'attestation_signature'
       ]
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.jsonb_object_keys(p_request) AS supplied(key)
           WHERE supplied.key <> ALL (ARRAY[
               'contract_version',
               'rpc_key_version',
               'idempotency_digest',
               'request_fingerprint',
               'authentication_subject_hash',
               'normalized_email',
               'normalized_student_number',
               'full_name',
               'academic_role',
               'faculty_code',
               'grade',
               'question',
               'base_eligibility_status',
               'base_reason_codes',
               'requires_student_details',
               'terms_version',
               'terms_accepted',
               'privacy_version',
               'privacy_accepted',
               'google_sub',
               'identity_email',
               'hosted_domain',
               'email_verified',
               'issuer',
               'audience',
               'occurred_at_epoch',
               'candidate_member_id',
               'candidate_identity_id',
               'candidate_application_id',
               'candidate_grant_id',
               'candidate_operation_id',
               'attestation_version',
               'attestation_issued_at',
               'attestation_nonce',
               'attestation_signature'
           ])
       ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'invalid_public_registration_request';
    END IF;

    IF p_request->>'contract_version' <> 'v1'
       OR pg_catalog.jsonb_typeof(p_request->'rpc_key_version') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'idempotency_digest') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'request_fingerprint') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'authentication_subject_hash') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'normalized_email') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'normalized_student_number') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'full_name') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'academic_role') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'faculty_code') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'grade') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'question') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'base_eligibility_status') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'base_reason_codes') <> 'array'
       OR pg_catalog.jsonb_typeof(p_request->'requires_student_details') <> 'boolean'
       OR pg_catalog.jsonb_typeof(p_request->'terms_accepted') <> 'boolean'
       OR pg_catalog.jsonb_typeof(p_request->'privacy_accepted') <> 'boolean'
       OR pg_catalog.jsonb_typeof(p_request->'google_sub') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'identity_email') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'hosted_domain') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'email_verified') <> 'boolean'
       OR pg_catalog.jsonb_typeof(p_request->'issuer') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'audience') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'occurred_at_epoch') <> 'number'
       OR pg_catalog.jsonb_typeof(p_request->'candidate_member_id') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'candidate_identity_id') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'candidate_application_id') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'candidate_grant_id') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'candidate_operation_id') <> 'string'
       OR pg_catalog.jsonb_typeof(p_request->'terms_version') NOT IN ('string', 'null')
       OR pg_catalog.jsonb_typeof(p_request->'privacy_version') NOT IN ('string', 'null')
       OR pg_catalog.jsonb_typeof(p_request->'attestation_version') NOT IN ('string', 'null')
       OR pg_catalog.jsonb_typeof(p_request->'attestation_issued_at') NOT IN ('number', 'null')
       OR pg_catalog.jsonb_typeof(p_request->'attestation_nonce') NOT IN ('string', 'null')
       OR pg_catalog.jsonb_typeof(p_request->'attestation_signature') NOT IN ('string', 'null') THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'invalid_public_registration_request';
    END IF;

    v_rpc_key_version := p_request->>'rpc_key_version';
    v_idempotency_digest := p_request->>'idempotency_digest';
    v_request_fingerprint := p_request->>'request_fingerprint';
    v_subject_hash := p_request->>'authentication_subject_hash';
    v_email := p_request->>'normalized_email';
    v_student_number := p_request->>'normalized_student_number';
    v_full_name := p_request->>'full_name';
    v_academic_role := p_request->>'academic_role';
    v_faculty_code := p_request->>'faculty_code';
    v_grade := p_request->>'grade';
    v_question := p_request->>'question';
    v_base_status := p_request->>'base_eligibility_status';
    v_base_reasons := p_request->'base_reason_codes';
    v_terms_version := p_request->>'terms_version';
    v_terms_accepted := (p_request->>'terms_accepted')::boolean;
    v_privacy_version := p_request->>'privacy_version';
    v_privacy_accepted := (p_request->>'privacy_accepted')::boolean;
    v_google_sub := p_request->>'google_sub';
    v_identity_email := p_request->>'identity_email';
    v_hosted_domain := p_request->>'hosted_domain';
    v_email_verified := (p_request->>'email_verified')::boolean;
    v_issuer := p_request->>'issuer';
    v_audience := p_request->>'audience';
    v_occurred_at_epoch := (p_request->>'occurred_at_epoch')::bigint;
    v_occurred_at := pg_catalog.to_timestamp(v_occurred_at_epoch);
    v_candidate_member_id := (p_request->>'candidate_member_id')::uuid;
    v_candidate_identity_id := (p_request->>'candidate_identity_id')::uuid;
    v_candidate_application_id := (p_request->>'candidate_application_id')::uuid;
    v_candidate_grant_id := (p_request->>'candidate_grant_id')::uuid;
    v_candidate_operation_id := (p_request->>'candidate_operation_id')::uuid;
    v_attestation_version := p_request->>'attestation_version';
    v_attestation_issued_at := (p_request->>'attestation_issued_at')::bigint;
    v_attestation_nonce := p_request->>'attestation_nonce';
    v_attestation_signature := p_request->>'attestation_signature';

    IF v_rpc_key_version !~ '^v[1-9][0-9]*$'
       OR v_idempotency_digest !~ '^[0-9a-f]{64}$'
       OR v_request_fingerprint !~ '^[0-9a-f]{64}$'
       OR v_subject_hash !~ '^[0-9a-f]{64}$'
       OR pg_catalog.char_length(v_email) NOT BETWEEN 3 AND 320
       OR v_email <> pg_catalog.lower(pg_catalog.btrim(v_email))
       OR v_email !~ '^[^@[:space:]]+@([a-z0-9-]+[.])*kitasato-u[.]ac[.]jp$'
       OR pg_catalog.char_length(v_student_number) > 16
       OR v_student_number <> pg_catalog.upper(pg_catalog.btrim(v_student_number))
       OR pg_catalog.char_length(pg_catalog.btrim(v_full_name)) NOT BETWEEN 1 AND 200
       OR v_full_name <> pg_catalog.btrim(v_full_name)
       OR v_academic_role NOT IN ('undergraduate', 'master', 'doctoral', 'staff')
       OR v_faculty_code NOT IN ('pharmacy', 'other')
       OR pg_catalog.char_length(v_grade) > 16
       OR pg_catalog.char_length(v_question) > 1000
       OR v_base_status NOT IN ('approved', 'manual_review', 'ineligible')
       OR pg_catalog.jsonb_array_length(v_base_reasons) NOT BETWEEN 1 AND 16
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.jsonb_array_elements(v_base_reasons) AS reason(value)
           WHERE pg_catalog.jsonb_typeof(reason.value) <> 'string'
              OR reason.value #>> '{}' NOT IN (
                  'grade_invalid',
                  'student_number_invalid',
                  'existing_registration_found',
                  'existing_registration_conflict',
                  'role_requires_manual_review',
                  'faculty_requires_manual_review',
                  'non_student_email_requires_manual_review',
                  'eligible'
              )
       )
       OR ((p_request->>'requires_student_details')::boolean)
          IS DISTINCT FROM (v_academic_role IN ('undergraduate', 'master'))
       OR pg_catalog.char_length(COALESCE(v_terms_version, '')) > 64
       OR pg_catalog.char_length(COALESCE(v_privacy_version, '')) > 64
       OR NOT v_privacy_accepted
       OR v_privacy_version IS NULL
       OR (v_terms_accepted AND v_terms_version IS NULL)
       OR pg_catalog.char_length(v_google_sub) NOT BETWEEN 1 AND 255
       OR v_identity_email <> v_email
       OR v_hosted_domain <> 'st.kitasato-u.ac.jp'
       OR NOT v_email_verified
       OR v_issuer NOT IN ('accounts.google.com', 'https://accounts.google.com')
       OR pg_catalog.char_length(v_audience) NOT BETWEEN 1 AND 255
       OR pg_catalog.abs(EXTRACT(epoch FROM pg_catalog.clock_timestamp())::bigint - v_occurred_at_epoch) > 300
       OR (
           v_base_status = 'approved'
           AND (
               v_attestation_version <> 'v1'
               OR v_attestation_issued_at <> v_occurred_at_epoch
               OR v_attestation_nonce !~ '^[0-9a-f]{64}$'
               OR v_attestation_signature !~ '^[0-9a-f]{64}$'
           )
       )
       OR (
           v_base_status <> 'approved'
           AND (
               v_attestation_version IS NOT NULL
               OR v_attestation_issued_at IS NOT NULL
               OR v_attestation_nonce IS NOT NULL
               OR v_attestation_signature IS NOT NULL
           )
       ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'invalid_public_registration_request';
    END IF;

    SELECT key.token_sha256
    INTO v_expected_token_hash
    FROM fsl_private.public_registration_rpc_keys AS key
    WHERE key.key_version = v_rpc_key_version
      AND key.active;
    IF p_rpc_token IS NOT NULL
       AND pg_catalog.octet_length(pg_catalog.convert_to(p_rpc_token, 'UTF8'))
           BETWEEN 32 AND 512
       AND v_expected_token_hash IS NOT NULL THEN
        v_actual_token_hash := pg_catalog.sha256(
            pg_catalog.convert_to(p_rpc_token, 'UTF8')
        );
        SELECT pg_catalog.bool_and(
            pg_catalog.get_byte(v_expected_token_hash, byte_index.value)
            = pg_catalog.get_byte(v_actual_token_hash, byte_index.value)
        )
        INTO v_rpc_token_valid
        FROM pg_catalog.generate_series(0, 31) AS byte_index(value);
    END IF;
    IF NOT COALESCE(v_rpc_token_valid, false) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'invalid_public_rpc_capability';
    END IF;

    -- Every caller uses the same fixed lock order. This keeps replay and
    -- identity/member decisions deterministic across two concurrent sessions.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('idem:' || v_idempotency_digest, 0)
    );
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('sub:' || v_google_sub, 0)
    );
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('email:' || v_email, 0)
    );
    IF v_student_number <> '' THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended('student:' || v_student_number, 0)
        );
    END IF;

    SELECT
        a.id,
        a.member_id,
        a.authentication_subject_hash,
        a.request_fingerprint,
        a.eligibility_status,
        a.reason_codes::jsonb,
        a.admin_decision
    INTO
        v_application_id,
        v_application_member_id,
        v_application_subject_hash,
        v_application_fingerprint,
        v_application_status,
        v_application_reasons,
        v_application_admin_decision
    FROM public.library_applications AS a
    WHERE a.idempotency_key = v_idempotency_digest;

    IF FOUND THEN
        IF v_application_subject_hash IS DISTINCT FROM v_subject_hash
           OR v_application_fingerprint IS DISTINCT FROM v_request_fingerprint THEN
            RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'registration_conflict';
        END IF;

        SELECT EXISTS(
            SELECT 1
            FROM public.library_identities AS i
            WHERE i.google_sub = v_google_sub
              AND i.member_id = v_application_member_id
              AND i.unlinked_at IS NULL
        ) INTO v_identity_linked;

        IF v_application_member_id IS NOT NULL
           AND (
               v_application_status = 'approved'
               OR v_application_admin_decision = 'approved'
           ) THEN
            SELECT g.status, g.notification_status
            INTO v_drive_status, v_notification_status
            FROM public.library_access_grants AS g
            WHERE g.member_id = v_application_member_id
              AND g.target_alias = 'future-strategy-library-primary-v1';
            IF NOT FOUND THEN
                v_drive_status := 'not_enqueued';
                v_notification_status := 'not_applicable';
            END IF;
        END IF;

        RETURN QUERY SELECT
            v_application_status,
            v_application_reasons,
            true,
            true,
            v_application_id,
            v_identity_linked,
            v_drive_status,
            v_notification_status;
        RETURN;
    END IF;

    SELECT m.id INTO v_email_member_id
    FROM public.library_members AS m
    WHERE m.normalized_email = v_email;

    IF v_student_number <> '' THEN
        SELECT m.id INTO v_student_member_id
        FROM public.library_members AS m
        WHERE m.normalized_student_number = v_student_number;
    END IF;

    IF v_email_member_id IS NOT NULL
       AND v_student_member_id IS NOT NULL
       AND v_email_member_id <> v_student_member_id THEN
        v_identity_conflict := true;
        v_member_id := NULL;
    ELSE
        v_member_id := COALESCE(
            v_email_member_id,
            v_student_member_id
        );
    END IF;

    SELECT i.id, i.member_id, i.unlinked_at
    INTO
        v_linked_identity_id,
        v_linked_identity_member_id,
        v_linked_identity_unlinked_at
    FROM public.library_identities AS i
    WHERE i.google_sub = v_google_sub;

    IF FOUND THEN
        IF v_linked_identity_unlinked_at IS NOT NULL
           OR NOT EXISTS(
               SELECT 1
               FROM public.library_members AS m
               WHERE m.id = v_linked_identity_member_id
           ) THEN
            v_identity_binding_conflict := true;
        ELSIF v_member_id IS NOT NULL
              AND v_member_id <> v_linked_identity_member_id THEN
            v_identity_binding_conflict := true;
            v_member_id := v_linked_identity_member_id;
        ELSE
            v_member_id := v_linked_identity_member_id;
        END IF;
    ELSIF v_member_id IS NOT NULL
          AND EXISTS(
              SELECT 1
              FROM public.library_identities AS i
              WHERE i.member_id = v_member_id
                AND i.unlinked_at IS NULL
          ) THEN
        v_identity_binding_conflict := true;
    END IF;

    v_identity_conflict := v_identity_conflict OR v_identity_binding_conflict;

    IF v_member_id IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1
            FROM public.library_members AS m
            WHERE m.id = v_member_id
              AND m.normalized_email = v_email
              AND m.normalized_student_number IS NOT DISTINCT FROM
                  NULLIF(v_student_number, '')
              AND pg_catalog.btrim(m.full_name) = v_full_name
              AND m.academic_role = v_academic_role
              AND m.faculty_code = v_faculty_code
              AND COALESCE(m.grade, '') = v_grade
        ) INTO v_member_matches;
    END IF;

    v_member_was_missing := v_member_id IS NULL;
    IF v_base_status = 'ineligible' THEN
        v_final_status := v_base_status;
        v_final_reasons := v_base_reasons;
    ELSIF v_identity_conflict THEN
        v_final_status := 'manual_review';
        v_final_reasons := '["existing_registration_conflict"]'::jsonb;
    ELSIF v_member_id IS NULL THEN
        v_final_status := v_base_status;
        v_final_reasons := v_base_reasons;
    ELSIF v_member_matches THEN
        v_final_status := 'already_registered';
        v_final_reasons := '["existing_registration_found"]'::jsonb;
    ELSE
        v_final_status := 'manual_review';
        v_final_reasons := '["existing_registration_conflict"]'::jsonb;
    END IF;

    IF v_member_id IS NULL
       AND NOT v_identity_conflict
       AND v_final_status IN ('approved', 'manual_review') THEN
        v_member_id := v_candidate_member_id;
        INSERT INTO public.library_members (
            id,
            normalized_email,
            normalized_student_number,
            full_name,
            academic_role,
            faculty_code,
            grade,
            registered_at,
            member_status,
            record_version
        ) VALUES (
            v_member_id,
            v_email,
            NULLIF(v_student_number, ''),
            v_full_name,
            v_academic_role,
            v_faculty_code,
            NULLIF(v_grade, ''),
            v_occurred_at,
            CASE WHEN v_final_status = 'approved' THEN 'active'
                 ELSE 'pending_review' END,
            1
        );
    END IF;

    v_application_id := v_candidate_application_id;
    INSERT INTO public.library_applications (
        id,
        member_id,
        idempotency_key,
        authentication_subject_hash,
        request_fingerprint,
        normalized_email,
        normalized_student_number,
        full_name,
        academic_role,
        faculty_code,
        grade,
        question,
        eligibility_status,
        reason_codes,
        terms_version,
        terms_accepted_at,
        privacy_version,
        privacy_accepted_at,
        source,
        retention_until,
        admin_decision,
        record_version
    ) VALUES (
        v_application_id,
        v_member_id,
        v_idempotency_digest,
        v_subject_hash,
        v_request_fingerprint,
        v_email,
        NULLIF(v_student_number, ''),
        v_full_name,
        v_academic_role,
        v_faculty_code,
        NULLIF(v_grade, ''),
        NULLIF(pg_catalog.btrim(v_question), ''),
        v_final_status,
        v_final_reasons::json,
        CASE WHEN v_terms_accepted THEN v_terms_version ELSE NULL END,
        CASE WHEN v_terms_accepted THEN v_occurred_at ELSE NULL END,
        CASE WHEN v_privacy_accepted THEN v_privacy_version ELSE NULL END,
        CASE WHEN v_privacy_accepted THEN v_occurred_at ELSE NULL END,
        'phase6_authenticated',
        CASE WHEN v_final_status = 'ineligible'
             THEN v_occurred_at + pg_catalog.make_interval(days => 90)
             ELSE NULL END,
        CASE WHEN v_final_status = 'manual_review' THEN 'pending'
             ELSE 'not_required' END,
        1
    );

    IF v_linked_identity_id IS NOT NULL AND v_member_id IS NOT NULL THEN
        IF v_linked_identity_unlinked_at IS NULL
           AND v_linked_identity_member_id = v_member_id THEN
            UPDATE public.library_identities AS i
            SET verified_email = v_identity_email,
                hosted_domain = v_hosted_domain,
                email_verified = v_email_verified,
                issuer = v_issuer,
                audience = v_audience,
                last_verified_at = v_occurred_at
            WHERE i.id = v_linked_identity_id;
            v_identity_linked := true;
        END IF;
    ELSIF v_member_id IS NOT NULL
          AND NOT v_identity_binding_conflict
          AND (v_member_was_missing OR v_member_matches) THEN
        INSERT INTO public.library_identities (
            id,
            member_id,
            google_sub,
            verified_email,
            hosted_domain,
            email_verified,
            issuer,
            audience,
            linked_at,
            last_verified_at
        ) VALUES (
            v_candidate_identity_id,
            v_member_id,
            v_google_sub,
            v_identity_email,
            v_hosted_domain,
            v_email_verified,
            v_issuer,
            v_audience,
            v_occurred_at,
            v_occurred_at
        );
        v_identity_linked := true;
    END IF;

    IF v_member_id IS NOT NULL AND v_final_status = 'approved' THEN
        SELECT g.id, g.status, g.notification_status
        INTO v_grant_id, v_drive_status, v_notification_status
        FROM public.library_access_grants AS g
        WHERE g.member_id = v_member_id
          AND g.target_alias = 'future-strategy-library-primary-v1';

        IF NOT FOUND THEN
            v_grant_id := v_candidate_grant_id;
            v_drive_status := 'pending';
            v_notification_status := 'pending';
            INSERT INTO public.library_access_grants (
                id,
                member_id,
                resource_id,
                target_alias,
                role,
                status,
                managed_by_system,
                notification_status
            ) VALUES (
                v_grant_id,
                v_member_id,
                'future-strategy-library-primary-v1',
                'future-strategy-library-primary-v1',
                'reader',
                'pending',
                false,
                'pending'
            );
        END IF;

        v_operation_key := 'drive_grant:' || v_member_id::text
            || ':future-strategy-library-primary-v1';
        IF NOT EXISTS(
            SELECT 1
            FROM public.library_operations AS o
            WHERE o.operation_key = v_operation_key
        ) THEN
            IF NOT v_identity_linked
               OR v_attestation_version IS NULL
               OR v_attestation_nonce IS NULL
               OR v_attestation_signature IS NULL THEN
                RAISE EXCEPTION USING
                    ERRCODE = '22023',
                    MESSAGE = 'invalid_public_registration_request';
            END IF;
            INSERT INTO public.library_operations (
                id,
                member_id,
                application_id,
                operation_key,
                operation_type,
                resource_id,
                target_alias,
                attestation_version,
                attestation_issued_at,
                attestation_nonce,
                attestation_signature,
                status,
                attempt_count,
                max_attempts,
                record_version
            ) VALUES (
                v_candidate_operation_id,
                v_member_id,
                v_application_id,
                v_operation_key,
                'drive_grant',
                NULL,
                'future-strategy-library-primary-v1',
                v_attestation_version,
                v_attestation_issued_at,
                v_attestation_nonce,
                v_attestation_signature,
                'pending',
                0,
                3,
                1
            );
        END IF;
    END IF;

    RETURN QUERY SELECT
        v_final_status,
        v_final_reasons,
        true,
        false,
        v_application_id,
        v_identity_linked,
        v_drive_status,
        v_notification_status;
END;
$fsl_submit_registration_v1$;

CREATE OR REPLACE FUNCTION fsl_public_api.registration_status_v1(
    p_application_id uuid,
    p_authentication_subject_hash text,
    p_rpc_key_version text,
    p_rpc_token text
)
RETURNS TABLE (
    application_id uuid,
    drive_access_status text,
    drive_notification_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fsl_registration_status_v1$
DECLARE
    v_expected_token_hash bytea;
    v_actual_token_hash bytea;
    v_rpc_token_valid boolean := false;
BEGIN
    SELECT key.token_sha256
    INTO v_expected_token_hash
    FROM fsl_private.public_registration_rpc_keys AS key
    WHERE key.key_version = p_rpc_key_version
      AND key.active;
    IF p_rpc_token IS NOT NULL
       AND pg_catalog.octet_length(pg_catalog.convert_to(p_rpc_token, 'UTF8'))
           BETWEEN 32 AND 512
       AND v_expected_token_hash IS NOT NULL THEN
        v_actual_token_hash := pg_catalog.sha256(
            pg_catalog.convert_to(p_rpc_token, 'UTF8')
        );
        SELECT pg_catalog.bool_and(
            pg_catalog.get_byte(v_expected_token_hash, byte_index.value)
            = pg_catalog.get_byte(v_actual_token_hash, byte_index.value)
        )
        INTO v_rpc_token_valid
        FROM pg_catalog.generate_series(0, 31) AS byte_index(value);
    END IF;
    IF NOT COALESCE(v_rpc_token_valid, false) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'invalid_public_rpc_capability';
    END IF;

    RETURN QUERY SELECT
        a.id,
        (
            CASE
                WHEN (
                    a.eligibility_status = 'approved'
                    OR a.admin_decision = 'approved'
                ) AND g.id IS NOT NULL THEN g.status
                ELSE 'not_enqueued'
            END
        )::text,
        (
            CASE
                WHEN (
                    a.eligibility_status = 'approved'
                    OR a.admin_decision = 'approved'
                ) AND g.id IS NOT NULL THEN g.notification_status
                ELSE 'not_applicable'
            END
        )::text
    FROM public.library_applications AS a
    LEFT JOIN public.library_access_grants AS g
      ON g.member_id = a.member_id
     AND g.target_alias = 'future-strategy-library-primary-v1'
    WHERE p_rpc_key_version ~ '^v[1-9][0-9]*$'
      AND p_authentication_subject_hash ~ '^[0-9a-f]{64}$'
      AND a.id = p_application_id
      AND a.authentication_subject_hash = p_authentication_subject_hash;
END;
$fsl_registration_status_v1$;

REVOKE ALL ON FUNCTION fsl_public_api.submit_registration_v1(jsonb, text)
    FROM PUBLIC;
REVOKE ALL ON FUNCTION fsl_public_api.registration_status_v1(
    uuid,
    text,
    text,
    text
)
    FROM PUBLIC;
