# Database Schema Snapshot
Generated: 2025-10-15T02:50:14.851Z

## auth.audit_log_entries

- Columns:
  - `instance_id`: uuid, nullable
  - `id`: uuid, not null
  - `payload`: json, nullable
  - `created_at`: timestamp with time zone, nullable
  - `ip_address`: character varying, not null, default: ''::character varying, len: 64
- Primary key: (id)
- Indexes:
  - audit_log_entries_pkey: CREATE UNIQUE INDEX audit_log_entries_pkey ON auth.audit_log_entries USING btree (id)
  - audit_logs_instance_id_idx: CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id)

## auth.flow_state

- Columns:
  - `id`: uuid, not null
  - `user_id`: uuid, nullable
  - `auth_code`: text, not null
  - `code_challenge_method`: USER-DEFINED, not null
  - `code_challenge`: text, not null
  - `provider_type`: text, not null
  - `provider_access_token`: text, nullable
  - `provider_refresh_token`: text, nullable
  - `created_at`: timestamp with time zone, nullable
  - `updated_at`: timestamp with time zone, nullable
  - `authentication_method`: text, not null
  - `auth_code_issued_at`: timestamp with time zone, nullable
- Primary key: (id)
- Indexes:
  - flow_state_created_at_idx: CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC)
  - flow_state_pkey: CREATE UNIQUE INDEX flow_state_pkey ON auth.flow_state USING btree (id)
  - idx_auth_code: CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code)
  - idx_user_id_auth_method: CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method)

## auth.identities

- Columns:
  - `provider_id`: text, not null
  - `user_id`: uuid, not null
  - `identity_data`: jsonb, not null
  - `provider`: text, not null
  - `last_sign_in_at`: timestamp with time zone, nullable
  - `created_at`: timestamp with time zone, nullable
  - `updated_at`: timestamp with time zone, nullable
  - `email`: text, nullable
  - `id`: uuid, not null, default: gen_random_uuid()
- Primary key: (id)
- Indexes:
  - identities_email_idx: CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops)
  - identities_pkey: CREATE UNIQUE INDEX identities_pkey ON auth.identities USING btree (id)
  - identities_provider_id_provider_unique: CREATE UNIQUE INDEX identities_provider_id_provider_unique ON auth.identities USING btree (provider_id, provider)
  - identities_user_id_idx: CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id)

## auth.instances

- Columns:
  - `id`: uuid, not null
  - `uuid`: uuid, nullable
  - `raw_base_config`: text, nullable
  - `created_at`: timestamp with time zone, nullable
  - `updated_at`: timestamp with time zone, nullable
- Primary key: (id)
- Indexes:
  - instances_pkey: CREATE UNIQUE INDEX instances_pkey ON auth.instances USING btree (id)

## auth.mfa_amr_claims

- Columns:
  - `session_id`: uuid, not null
  - `created_at`: timestamp with time zone, not null
  - `updated_at`: timestamp with time zone, not null
  - `authentication_method`: text, not null
  - `id`: uuid, not null
- Primary key: (id)
- Indexes:
  - amr_id_pk: CREATE UNIQUE INDEX amr_id_pk ON auth.mfa_amr_claims USING btree (id)
  - mfa_amr_claims_session_id_authentication_method_pkey: CREATE UNIQUE INDEX mfa_amr_claims_session_id_authentication_method_pkey ON auth.mfa_amr_claims USING btree (session_id, authentication_method)

## auth.mfa_challenges

- Columns:
  - `id`: uuid, not null
  - `factor_id`: uuid, not null
  - `created_at`: timestamp with time zone, not null
  - `verified_at`: timestamp with time zone, nullable
  - `ip_address`: inet, not null
  - `otp_code`: text, nullable
  - `web_authn_session_data`: jsonb, nullable
- Primary key: (id)
- Indexes:
  - mfa_challenge_created_at_idx: CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC)
  - mfa_challenges_pkey: CREATE UNIQUE INDEX mfa_challenges_pkey ON auth.mfa_challenges USING btree (id)

## auth.mfa_factors

- Columns:
  - `id`: uuid, not null
  - `user_id`: uuid, not null
  - `friendly_name`: text, nullable
  - `factor_type`: USER-DEFINED, not null
  - `status`: USER-DEFINED, not null
  - `created_at`: timestamp with time zone, not null
  - `updated_at`: timestamp with time zone, not null
  - `secret`: text, nullable
  - `phone`: text, nullable
  - `last_challenged_at`: timestamp with time zone, nullable
  - `web_authn_credential`: jsonb, nullable
  - `web_authn_aaguid`: uuid, nullable
- Primary key: (id)
- Indexes:
  - factor_id_created_at_idx: CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at)
  - mfa_factors_last_challenged_at_key: CREATE UNIQUE INDEX mfa_factors_last_challenged_at_key ON auth.mfa_factors USING btree (last_challenged_at)
  - mfa_factors_pkey: CREATE UNIQUE INDEX mfa_factors_pkey ON auth.mfa_factors USING btree (id)
  - mfa_factors_user_friendly_name_unique: CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text)
  - mfa_factors_user_id_idx: CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id)
  - unique_phone_factor_per_user: CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone)

## auth.oauth_authorizations

- Columns:
  - `id`: uuid, not null
  - `authorization_id`: text, not null
  - `client_id`: uuid, not null
  - `user_id`: uuid, nullable
  - `redirect_uri`: text, not null
  - `scope`: text, not null
  - `state`: text, nullable
  - `resource`: text, nullable
  - `code_challenge`: text, nullable
  - `code_challenge_method`: USER-DEFINED, nullable
  - `response_type`: USER-DEFINED, not null, default: 'code'::auth.oauth_response_type
  - `status`: USER-DEFINED, not null, default: 'pending'::auth.oauth_authorization_status
  - `authorization_code`: text, nullable
  - `created_at`: timestamp with time zone, not null, default: now()
  - `expires_at`: timestamp with time zone, not null, default: (now() + '00:03:00'::interval)
  - `approved_at`: timestamp with time zone, nullable
- Primary key: (id)
- Indexes:
  - oauth_auth_pending_exp_idx: CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status)
  - oauth_authorizations_authorization_code_key: CREATE UNIQUE INDEX oauth_authorizations_authorization_code_key ON auth.oauth_authorizations USING btree (authorization_code)
  - oauth_authorizations_authorization_id_key: CREATE UNIQUE INDEX oauth_authorizations_authorization_id_key ON auth.oauth_authorizations USING btree (authorization_id)
  - oauth_authorizations_pkey: CREATE UNIQUE INDEX oauth_authorizations_pkey ON auth.oauth_authorizations USING btree (id)

## auth.oauth_clients

- Columns:
  - `id`: uuid, not null
  - `client_secret_hash`: text, nullable
  - `registration_type`: USER-DEFINED, not null
  - `redirect_uris`: text, not null
  - `grant_types`: text, not null
  - `client_name`: text, nullable
  - `client_uri`: text, nullable
  - `logo_uri`: text, nullable
  - `created_at`: timestamp with time zone, not null, default: now()
  - `updated_at`: timestamp with time zone, not null, default: now()
  - `deleted_at`: timestamp with time zone, nullable
  - `client_type`: USER-DEFINED, not null, default: 'confidential'::auth.oauth_client_type
- Primary key: (id)
- Indexes:
  - oauth_clients_deleted_at_idx: CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at)
  - oauth_clients_pkey: CREATE UNIQUE INDEX oauth_clients_pkey ON auth.oauth_clients USING btree (id)

## auth.oauth_consents

- Columns:
  - `id`: uuid, not null
  - `user_id`: uuid, not null
  - `client_id`: uuid, not null
  - `scopes`: text, not null
  - `granted_at`: timestamp with time zone, not null, default: now()
  - `revoked_at`: timestamp with time zone, nullable
- Primary key: (id)
- Indexes:
  - oauth_consents_active_client_idx: CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL)
  - oauth_consents_active_user_client_idx: CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL)
  - oauth_consents_pkey: CREATE UNIQUE INDEX oauth_consents_pkey ON auth.oauth_consents USING btree (id)
  - oauth_consents_user_client_unique: CREATE UNIQUE INDEX oauth_consents_user_client_unique ON auth.oauth_consents USING btree (user_id, client_id)
  - oauth_consents_user_order_idx: CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC)

## auth.one_time_tokens

- Columns:
  - `id`: uuid, not null
  - `user_id`: uuid, not null
  - `token_type`: USER-DEFINED, not null
  - `token_hash`: text, not null
  - `relates_to`: text, not null
  - `created_at`: timestamp without time zone, not null, default: now()
  - `updated_at`: timestamp without time zone, not null, default: now()
- Primary key: (id)
- Indexes:
  - one_time_tokens_pkey: CREATE UNIQUE INDEX one_time_tokens_pkey ON auth.one_time_tokens USING btree (id)
  - one_time_tokens_relates_to_hash_idx: CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to)
  - one_time_tokens_token_hash_hash_idx: CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash)
  - one_time_tokens_user_id_token_type_key: CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type)

## auth.refresh_tokens

- Columns:
  - `instance_id`: uuid, nullable
  - `id`: bigint, not null, default: nextval('auth.refresh_tokens_id_seq'::regclass), prec: 64, scale: 0
  - `token`: character varying, nullable, len: 255
  - `user_id`: character varying, nullable, len: 255
  - `revoked`: boolean, nullable
  - `created_at`: timestamp with time zone, nullable
  - `updated_at`: timestamp with time zone, nullable
  - `parent`: character varying, nullable, len: 255
  - `session_id`: uuid, nullable
- Primary key: (id)
- Indexes:
  - refresh_tokens_instance_id_idx: CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id)
  - refresh_tokens_instance_id_user_id_idx: CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id)
  - refresh_tokens_parent_idx: CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent)
  - refresh_tokens_pkey: CREATE UNIQUE INDEX refresh_tokens_pkey ON auth.refresh_tokens USING btree (id)
  - refresh_tokens_session_id_revoked_idx: CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked)
  - refresh_tokens_token_unique: CREATE UNIQUE INDEX refresh_tokens_token_unique ON auth.refresh_tokens USING btree (token)
  - refresh_tokens_updated_at_idx: CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC)

## auth.saml_providers

- Columns:
  - `id`: uuid, not null
  - `sso_provider_id`: uuid, not null
  - `entity_id`: text, not null
  - `metadata_xml`: text, not null
  - `metadata_url`: text, nullable
  - `attribute_mapping`: jsonb, nullable
  - `created_at`: timestamp with time zone, nullable
  - `updated_at`: timestamp with time zone, nullable
  - `name_id_format`: text, nullable
- Primary key: (id)
- Indexes:
  - saml_providers_entity_id_key: CREATE UNIQUE INDEX saml_providers_entity_id_key ON auth.saml_providers USING btree (entity_id)
  - saml_providers_pkey: CREATE UNIQUE INDEX saml_providers_pkey ON auth.saml_providers USING btree (id)
  - saml_providers_sso_provider_id_idx: CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id)

## auth.saml_relay_states

- Columns:
  - `id`: uuid, not null
  - `sso_provider_id`: uuid, not null
  - `request_id`: text, not null
  - `for_email`: text, nullable
  - `redirect_to`: text, nullable
  - `created_at`: timestamp with time zone, nullable
  - `updated_at`: timestamp with time zone, nullable
  - `flow_state_id`: uuid, nullable
- Primary key: (id)
- Indexes:
  - saml_relay_states_created_at_idx: CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC)
  - saml_relay_states_for_email_idx: CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email)
  - saml_relay_states_pkey: CREATE UNIQUE INDEX saml_relay_states_pkey ON auth.saml_relay_states USING btree (id)
  - saml_relay_states_sso_provider_id_idx: CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id)

## auth.schema_migrations

- Columns:
  - `version`: character varying, not null, len: 255
- Indexes:
  - schema_migrations_pkey: CREATE UNIQUE INDEX schema_migrations_pkey ON auth.schema_migrations USING btree (version)

## auth.sessions

- Columns:
  - `id`: uuid, not null
  - `user_id`: uuid, not null
  - `created_at`: timestamp with time zone, nullable
  - `updated_at`: timestamp with time zone, nullable
  - `factor_id`: uuid, nullable
  - `aal`: USER-DEFINED, nullable
  - `not_after`: timestamp with time zone, nullable
  - `refreshed_at`: timestamp without time zone, nullable
  - `user_agent`: text, nullable
  - `ip`: inet, nullable
  - `tag`: text, nullable
  - `oauth_client_id`: uuid, nullable
- Primary key: (id)
- Indexes:
  - sessions_not_after_idx: CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC)
  - sessions_oauth_client_id_idx: CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id)
  - sessions_pkey: CREATE UNIQUE INDEX sessions_pkey ON auth.sessions USING btree (id)
  - sessions_user_id_idx: CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id)
  - user_id_created_at_idx: CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at)

## auth.sso_domains

- Columns:
  - `id`: uuid, not null
  - `sso_provider_id`: uuid, not null
  - `domain`: text, not null
  - `created_at`: timestamp with time zone, nullable
  - `updated_at`: timestamp with time zone, nullable
- Primary key: (id)
- Indexes:
  - sso_domains_domain_idx: CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain))
  - sso_domains_pkey: CREATE UNIQUE INDEX sso_domains_pkey ON auth.sso_domains USING btree (id)
  - sso_domains_sso_provider_id_idx: CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id)

## auth.sso_providers

- Columns:
  - `id`: uuid, not null
  - `resource_id`: text, nullable
  - `created_at`: timestamp with time zone, nullable
  - `updated_at`: timestamp with time zone, nullable
  - `disabled`: boolean, nullable
- Primary key: (id)
- Indexes:
  - sso_providers_pkey: CREATE UNIQUE INDEX sso_providers_pkey ON auth.sso_providers USING btree (id)
  - sso_providers_resource_id_idx: CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id))
  - sso_providers_resource_id_pattern_idx: CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops)

## auth.users

- Columns:
  - `instance_id`: uuid, nullable
  - `id`: uuid, not null
  - `aud`: character varying, nullable, len: 255
  - `role`: character varying, nullable, len: 255
  - `email`: character varying, nullable, len: 255
  - `encrypted_password`: character varying, nullable, len: 255
  - `email_confirmed_at`: timestamp with time zone, nullable
  - `invited_at`: timestamp with time zone, nullable
  - `confirmation_token`: character varying, nullable, len: 255
  - `confirmation_sent_at`: timestamp with time zone, nullable
  - `recovery_token`: character varying, nullable, len: 255
  - `recovery_sent_at`: timestamp with time zone, nullable
  - `email_change_token_new`: character varying, nullable, len: 255
  - `email_change`: character varying, nullable, len: 255
  - `email_change_sent_at`: timestamp with time zone, nullable
  - `last_sign_in_at`: timestamp with time zone, nullable
  - `raw_app_meta_data`: jsonb, nullable
  - `raw_user_meta_data`: jsonb, nullable
  - `is_super_admin`: boolean, nullable
  - `created_at`: timestamp with time zone, nullable
  - `updated_at`: timestamp with time zone, nullable
  - `phone`: text, nullable, default: NULL::character varying
  - `phone_confirmed_at`: timestamp with time zone, nullable
  - `phone_change`: text, nullable, default: ''::character varying
  - `phone_change_token`: character varying, nullable, default: ''::character varying, len: 255
  - `phone_change_sent_at`: timestamp with time zone, nullable
  - `confirmed_at`: timestamp with time zone, nullable
  - `email_change_token_current`: character varying, nullable, default: ''::character varying, len: 255
  - `email_change_confirm_status`: smallint, nullable, default: 0, prec: 16, scale: 0
  - `banned_until`: timestamp with time zone, nullable
  - `reauthentication_token`: character varying, nullable, default: ''::character varying, len: 255
  - `reauthentication_sent_at`: timestamp with time zone, nullable
  - `is_sso_user`: boolean, not null, default: false
  - `deleted_at`: timestamp with time zone, nullable
  - `is_anonymous`: boolean, not null, default: false
- Primary key: (id)
- Indexes:
  - confirmation_token_idx: CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text)
  - email_change_token_current_idx: CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text)
  - email_change_token_new_idx: CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text)
  - reauthentication_token_idx: CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text)
  - recovery_token_idx: CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text)
  - users_email_partial_key: CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false)
  - users_instance_id_email_idx: CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text))
  - users_instance_id_idx: CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id)
  - users_is_anonymous_idx: CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous)
  - users_phone_key: CREATE UNIQUE INDEX users_phone_key ON auth.users USING btree (phone)
  - users_pkey: CREATE UNIQUE INDEX users_pkey ON auth.users USING btree (id)

## drizzle.__drizzle_migrations

- Columns:
  - `id`: integer, not null, default: nextval('drizzle.__drizzle_migrations_id_seq'::regclass), prec: 32, scale: 0
  - `hash`: text, not null
  - `created_at`: bigint, nullable, prec: 64, scale: 0
- Primary key: (id)
- Indexes:
  - __drizzle_migrations_pkey: CREATE UNIQUE INDEX __drizzle_migrations_pkey ON drizzle.__drizzle_migrations USING btree (id)

## public.assessment_logs

- Columns:
  - `id`: bigint, not null, default: nextval('assessment_logs_id_seq'::regclass), prec: 64, scale: 0
  - `symbol`: text, not null
  - `request_payload`: jsonb, not null
  - `context_payload`: jsonb, nullable
  - `assessment_payload`: jsonb, not null
  - `raw_text`: text, nullable
  - `created_at`: timestamp with time zone, not null, default: now()
  - `prompt_text`: text, nullable
  - `system_prompt`: text, nullable
- Primary key: (id)
- Indexes:
  - assessment_logs_pkey: CREATE UNIQUE INDEX assessment_logs_pkey ON public.assessment_logs USING btree (id)
  - idx_assessment_logs_symbol_created_at: CREATE INDEX idx_assessment_logs_symbol_created_at ON public.assessment_logs USING btree (symbol, created_at DESC)

## realtime.messages

- Columns:
  - `topic`: text, not null
  - `extension`: text, not null
  - `payload`: jsonb, nullable
  - `event`: text, nullable
  - `private`: boolean, nullable, default: false
  - `updated_at`: timestamp without time zone, not null, default: now()
  - `inserted_at`: timestamp without time zone, not null, default: now()
  - `id`: uuid, not null, default: gen_random_uuid()
- Primary key: (id, inserted_at)
- Indexes:
  - messages_inserted_at_topic_index: CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE))
  - messages_pkey: CREATE UNIQUE INDEX messages_pkey ON ONLY realtime.messages USING btree (id, inserted_at)

## realtime.schema_migrations

- Columns:
  - `version`: bigint, not null, prec: 64, scale: 0
  - `inserted_at`: timestamp without time zone, nullable
- Primary key: (version)
- Indexes:
  - schema_migrations_pkey: CREATE UNIQUE INDEX schema_migrations_pkey ON realtime.schema_migrations USING btree (version)

## realtime.subscription

- Columns:
  - `id`: bigint, not null, prec: 64, scale: 0
  - `subscription_id`: uuid, not null
  - `entity`: regclass, not null
  - `filters`: ARRAY, not null, default: '{}'::realtime.user_defined_filter[]
  - `claims`: jsonb, not null
  - `claims_role`: regrole, not null
  - `created_at`: timestamp without time zone, not null, default: timezone('utc'::text, now())
- Primary key: (id)
- Indexes:
  - ix_realtime_subscription_entity: CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity)
  - pk_subscription: CREATE UNIQUE INDEX pk_subscription ON realtime.subscription USING btree (id)
  - subscription_subscription_id_entity_filters_key: CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_key ON realtime.subscription USING btree (subscription_id, entity, filters)

## storage.buckets

- Columns:
  - `id`: text, not null
  - `name`: text, not null
  - `owner`: uuid, nullable
  - `created_at`: timestamp with time zone, nullable, default: now()
  - `updated_at`: timestamp with time zone, nullable, default: now()
  - `public`: boolean, nullable, default: false
  - `avif_autodetection`: boolean, nullable, default: false
  - `file_size_limit`: bigint, nullable, prec: 64, scale: 0
  - `allowed_mime_types`: ARRAY, nullable
  - `owner_id`: text, nullable
  - `type`: USER-DEFINED, not null, default: 'STANDARD'::storage.buckettype
- Primary key: (id)
- Indexes:
  - bname: CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name)
  - buckets_pkey: CREATE UNIQUE INDEX buckets_pkey ON storage.buckets USING btree (id)

## storage.buckets_analytics

- Columns:
  - `id`: text, not null
  - `type`: USER-DEFINED, not null, default: 'ANALYTICS'::storage.buckettype
  - `format`: text, not null, default: 'ICEBERG'::text
  - `created_at`: timestamp with time zone, not null, default: now()
  - `updated_at`: timestamp with time zone, not null, default: now()
- Primary key: (id)
- Indexes:
  - buckets_analytics_pkey: CREATE UNIQUE INDEX buckets_analytics_pkey ON storage.buckets_analytics USING btree (id)

## storage.migrations

- Columns:
  - `id`: integer, not null, prec: 32, scale: 0
  - `name`: character varying, not null, len: 100
  - `hash`: character varying, not null, len: 40
  - `executed_at`: timestamp without time zone, nullable, default: CURRENT_TIMESTAMP
- Indexes:
  - migrations_name_key: CREATE UNIQUE INDEX migrations_name_key ON storage.migrations USING btree (name)
  - migrations_pkey: CREATE UNIQUE INDEX migrations_pkey ON storage.migrations USING btree (id)

## storage.objects

- Columns:
  - `id`: uuid, not null, default: gen_random_uuid()
  - `bucket_id`: text, nullable
  - `name`: text, nullable
  - `owner`: uuid, nullable
  - `created_at`: timestamp with time zone, nullable, default: now()
  - `updated_at`: timestamp with time zone, nullable, default: now()
  - `last_accessed_at`: timestamp with time zone, nullable, default: now()
  - `metadata`: jsonb, nullable
  - `path_tokens`: ARRAY, nullable
  - `version`: text, nullable
  - `owner_id`: text, nullable
  - `user_metadata`: jsonb, nullable
  - `level`: integer, nullable, prec: 32, scale: 0
- Primary key: (id)
- Indexes:
  - bucketid_objname: CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name)
  - idx_name_bucket_level_unique: CREATE UNIQUE INDEX idx_name_bucket_level_unique ON storage.objects USING btree (name COLLATE "C", bucket_id, level)
  - idx_objects_bucket_id_name: CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C")
  - idx_objects_lower_name: CREATE INDEX idx_objects_lower_name ON storage.objects USING btree ((path_tokens[level]), lower(name) text_pattern_ops, bucket_id, level)
  - name_prefix_search: CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops)
  - objects_bucket_id_level_idx: CREATE UNIQUE INDEX objects_bucket_id_level_idx ON storage.objects USING btree (bucket_id, level, name COLLATE "C")
  - objects_pkey: CREATE UNIQUE INDEX objects_pkey ON storage.objects USING btree (id)

## storage.prefixes

- Columns:
  - `bucket_id`: text, not null
  - `name`: text, not null
  - `level`: integer, not null, prec: 32, scale: 0
  - `created_at`: timestamp with time zone, nullable, default: now()
  - `updated_at`: timestamp with time zone, nullable, default: now()
- Primary key: (bucket_id, level, name)
- Indexes:
  - idx_prefixes_lower_name: CREATE INDEX idx_prefixes_lower_name ON storage.prefixes USING btree (bucket_id, level, ((string_to_array(name, '/'::text))[level]), lower(name) text_pattern_ops)
  - prefixes_pkey: CREATE UNIQUE INDEX prefixes_pkey ON storage.prefixes USING btree (bucket_id, level, name)

## storage.s3_multipart_uploads

- Columns:
  - `id`: text, not null
  - `in_progress_size`: bigint, not null, default: 0, prec: 64, scale: 0
  - `upload_signature`: text, not null
  - `bucket_id`: text, not null
  - `key`: text, not null
  - `version`: text, not null
  - `owner_id`: text, nullable
  - `created_at`: timestamp with time zone, not null, default: now()
  - `user_metadata`: jsonb, nullable
- Primary key: (id)
- Indexes:
  - idx_multipart_uploads_list: CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at)
  - s3_multipart_uploads_pkey: CREATE UNIQUE INDEX s3_multipart_uploads_pkey ON storage.s3_multipart_uploads USING btree (id)

## storage.s3_multipart_uploads_parts

- Columns:
  - `id`: uuid, not null, default: gen_random_uuid()
  - `upload_id`: text, not null
  - `size`: bigint, not null, default: 0, prec: 64, scale: 0
  - `part_number`: integer, not null, prec: 32, scale: 0
  - `bucket_id`: text, not null
  - `key`: text, not null
  - `etag`: text, not null
  - `owner_id`: text, nullable
  - `version`: text, not null
  - `created_at`: timestamp with time zone, not null, default: now()
- Primary key: (id)
- Indexes:
  - s3_multipart_uploads_parts_pkey: CREATE UNIQUE INDEX s3_multipart_uploads_parts_pkey ON storage.s3_multipart_uploads_parts USING btree (id)

## vault.secrets

- Columns:
  - `id`: uuid, not null, default: gen_random_uuid()
  - `name`: text, nullable
  - `description`: text, not null, default: ''::text
  - `secret`: text, not null
  - `key_id`: uuid, nullable
  - `nonce`: bytea, nullable, default: vault._crypto_aead_det_noncegen()
  - `created_at`: timestamp with time zone, not null, default: CURRENT_TIMESTAMP
  - `updated_at`: timestamp with time zone, not null, default: CURRENT_TIMESTAMP
- Primary key: (id)
- Indexes:
  - secrets_name_idx: CREATE UNIQUE INDEX secrets_name_idx ON vault.secrets USING btree (name) WHERE (name IS NOT NULL)
  - secrets_pkey: CREATE UNIQUE INDEX secrets_pkey ON vault.secrets USING btree (id)
