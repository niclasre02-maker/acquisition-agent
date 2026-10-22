-- Deployed to Supabase 2026-10-22. Receipts are issued only after three Sheet read-backs.
-- Idempotent Stage-0 bridge; no outreach, conservative source verification.
CREATE OR REPLACE FUNCTION velanio_private.reconcile_scoped_stage0_imports_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'velanio', 'velanio_private', 'public', 'pg_temp'
AS $function$
declare
  v_docs jsonb;
  v_count integer := 0;
  v_applied jsonb;
begin
  -- A single bridge execution at a time; skip concurrent invocations.
  if not pg_catalog.pg_try_advisory_xact_lock(82931, 251052) then
    return 0;
  end if;

  with eligible as (
    select
      r.discovery_id, r.source_key, r.source_tab, r.opportunity_id,
      d.data as original,
      v.owner_agent, v.lane, v.job_function, v.contract_hint, v.source_country,
      v.original_url, v.live_checked_at,
      left(
        'sheet-' || regexp_replace(lower(r.source_key), '[^a-z0-9]+', '-', 'g'),
        70
      ) as canonical_id
    from velanio.agent_scoped_publish_receipts_v1 r
    inner join velanio.search_discoveries d on d.id = r.discovery_id
    inner join velanio.agent_scoped_publish_routable_v1 v on v.discovery_id = r.discovery_id
    where r.status in ('SHEET_PUBLISHED_PENDING_SYNC','SYNC_REVIEW')
      and r.reported_at >= now() - interval '48 hours'
      and v.live_checked_at >= now() - interval '6 hours'
      and v.source_country in ('DE','AT')
      and r.source_key ~ '^[a-z0-9|_-]{12,150}$'
      and r.signal_id ~ '^SIG-SCOPE-[a-f0-9]{20}$'
      and r.opportunity_id ~ '^DEAT-OPP-SCOPE-[a-f0-9]{20}$'
      and coalesce(d.data->>'url','') ~ '^https://'
      and d.data->>'url' = v.original_url
      and coalesce(d.data->>'title','') <> ''
      and exists (
        select 1 from velanio.companies c
        where c.id = d.data->>'company'
      )
      and r.source_tab = case
        when v.owner_agent = 'PROD-MASTER' then
          case
            when v.contract_hint = 'INTERIM_B2B' then '01 Interim B2B'
            when v.contract_hint = 'FIXED_TERM' then '02 Befristet Interim'
            else case v.job_function
              when 'Finance' then '03 Finance'
              when 'Financial Services' then '04 Financial Services'
              when 'Life Sciences' then '05 Life Sciences'
              when 'IT & Digital' then '06 IT & Digital'
              when 'Sales & Marketing' then '07 DEAT Sales & Marketing – Consumer Goods & Handel'
              when 'Engineering' then '08 Engineering'
              when 'HR & People' then '10 HR & People'
              when 'Legal' then '11 Legal'
              else null
            end
          end
        when v.owner_agent = 'PROD-INTERIM-EXEC' then
          case v.lane
            when 'B1_EXPLICIT_INTERIM_FREELANCE' then '01 Interim B2B'
            when 'B2_EXPLICIT_FIXED_TERM' then '02 Befristet Interim'
            when 'EXEC_DIRECT_HIRING' then '25 Executive Demand Radar'
            else null
          end
        else null
      end
      and not exists (
        select 1 from velanio.opportunities o
        where o.dedupe_key = r.source_key
           or o.data->>'sourceUrl' = d.data->>'url'
           or o.id = left(
             'sheet-' || regexp_replace(lower(r.source_key), '[^a-z0-9]+', '-', 'g'),
             70
           )
      )
    order by r.reported_at asc
    limit 50
  ), payloads as (
    select jsonb_build_object(
      'collection','opportunities',
      'id',canonical_id,
      'data',jsonb_build_object(
        'title',original->>'title',
        'company',original->>'company',
        'sourceUrl',original->>'url',
        'dedupeKey',source_key,
        'sourceTab',source_tab,
        'fn',job_function,
        'line',case
          when lane in ('B1_EXPLICIT_INTERIM_FREELANCE','B2_EXPLICIT_FIXED_TERM') then 'Interim'
          when lane = 'EXEC_DIRECT_HIRING' then 'Executive'
          else 'Perm'
        end,
        'stage','Stage 0 – Company Signal',
        'region',source_country,
        'at',current_date::text,
        'created',current_date::text,
        'originType','JOB_AD',
        'demandType','NONE',
        'vacancy','LIVE',
        'oppStatus','CHECK PENDING',
        'internalCheck','Offen',
        'approvalStatus','Neu',
        'outreachAllowed',false,
        'discoveryId',discovery_id,
        'scopeReceiptId',opportunity_id,
        'sourceVerificationMethod','OFFICIAL_ATS_SCOPED_STAGE0',
        'ownerHint',owner_agent,
        'why','Aktive originale Arbeitgeber-Ausschreibung; kein bestätigtes externes Mandat.',
        'nextStep','Account-/Off-Limit-/Direktzugang prüfen; keine Ansprache ohne Freigabe.',
        'details',jsonb_build_object(
          'standort',coalesce(original->>'location',''),
          'vertrag',contract_hint,
          'originalquelle',original->>'url'
        )
      )
    ) as doc
    from eligible
  )
  select coalesce(jsonb_agg(doc),'[]'::jsonb),count(*)
    into v_docs,v_count
  from payloads;

  if v_count > 0 then
    select public.velanio_apply_batch(
      'SCOPE-STAGE0-BRIDGE-' || to_char(clock_timestamp() at time zone 'UTC','YYYYMMDDHH24MISSUS'),
      v_docs,
      jsonb_build_object(
        'provider','scoped-stage0-receipt-bridge-v1',
        'stage','STAGE0_ONLY',
        'outreach_allowed',false
      ),
      'scoped-stage0-receipt-bridge',
      'radar'
    ) into v_applied;
    if coalesce(v_applied->>'status','') <> 'applied'
       or coalesce((v_applied->>'inserted')::integer,0) <> v_count then
      raise exception 'Scoped Stage-0 bridge did not apply expected documents: %',v_applied;
    end if;
  end if;

  perform velanio_private.refresh_scoped_publish_receipts_v1();
  return v_count;
end;
$function$
;

REVOKE ALL ON FUNCTION velanio_private.reconcile_scoped_stage0_imports_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION velanio_private.reconcile_scoped_stage0_imports_v1() TO postgres, service_role;

SELECT cron.schedule('velanio-scoped-stage0-receipt-bridge-v1','52 * * * *',
  $cron$select velanio_private.reconcile_scoped_stage0_imports_v1()$cron$);
