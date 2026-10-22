-- Production SQL deployed to Supabase, 2026-10-22
CREATE OR REPLACE FUNCTION velanio_private.reconcile_perm_stage0_imports_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'velanio', 'velanio_private', 'public', 'pg_temp'
AS $function$
declare v_docs jsonb; v_count int; v_applied jsonb;
begin
  if not pg_try_advisory_xact_lock(82931,251053) then return 0; end if;
  with candidates as (
    select r.*,q.title,q.location,q.url,q.seniority,q.raw_score,q.classified_geo,
      q.company_name,q.owner_agent,q.lane,q.contract_hint,c.proposed_owner_agent,
      l.checked_at,l.checked_provider,
      (
        select cc.id
        from velanio.companies cc
        where lower(btrim(cc.name))=lower(btrim(q.company_name))
        and coalesce(cc.country,'')=q.classified_geo
        and (select count(*) from velanio.companies cm where lower(btrim(cm.name))=lower(btrim(q.company_name)) and coalesce(cm.country,'')=q.classified_geo)=1
        limit 1
      ) as company_id,
      left('sheet-'||regexp_replace(lower(r.dedupe_key),'[^a-z0-9]+','-','g'),70) as canonical_id
    from velanio.agent_stage0_publish_receipts_v1 r
    join velanio.perm_search_queue q on q.discovery_id=r.discovery_id
    join velanio_private.agent_candidate_qualification_v1 c on c.discovery_id=r.discovery_id
    join velanio.agent_original_livecheck_v1 l on l.discovery_id=r.discovery_id
    where r.stage in ('SHEET_PUBLISHED_PENDING_SYNC','SYNC_REVIEW')
      and r.reported_at>=now()-interval '7 days'
      and c.evaluated_at>=now()-interval '12 hours'
      and c.ownership_checked_at>=now()-interval '12 hours'
      and l.checked_at>=now()-interval '12 hours'
      and l.original_url=q.url
      and l.check_status='LIVE_CONFIRMED'
      and l.source_title_match is true
      and l.checked_provider in ('greenhouse','smartrecruiters','personio')
      and (l.checked_provider<>'personio' or l.reason_code='OFFICIAL_XML_JOB_AND_TITLE_MATCH_PERMANENT')
      and c.status='REVIEW_LIVE_AD_AND_ACCOUNT_OWNERSHIP'
      and c.ownership_status='NO_EXACT_TARGET_MATCH_REVIEW'
      and c.account_route_block is true
      and c.production_write_allowed is false
      and c.original_url=q.url
      and c.job_title=q.title
      and c.company_name=q.company_name
      and q.prefilter_relevant is true
      and q.contract_hint='PERM'
      and q.classified_geo in ('DE','AT')
      and q.raw_score>=65
      and q.seniority in ('Expert','Leadership')
      and length(btrim(q.title))>=14
      and q.title !~* '(^|[^a-z])(junior|trainee|intern|azubi|werkstudent|praktikant|ausbildung|entry.level)([^a-z]|$)'
      and not(q.lane='HR & People' and q.title ~* 'generalist[[:space:]]*/[[:space:]]*assistenz')
      and q.url like 'https://%'
      and r.dedupe_key ~ '^[a-z0-9|_-]{12,150}$'
      and r.signal_id ~ '^SIG-AUTO-[a-f0-9]{20}$'
      and r.opportunity_id ~ '^DEAT-OPP-AUTO-[a-f0-9]{20}$'
      and r.source_tab=case
        when q.owner_agent='TECH' then case q.lane when 'Life Sciences' then '05 Life Sciences' when 'IT & Digital' then '06 IT & Digital' when 'Engineering' then '08 Engineering' when 'HR & People' then '10 HR & People' else null end
        when q.owner_agent='FIN' then case q.lane when 'Finance' then '03 Finance' when 'Financial Services' then '04 Financial Services' when 'Legal' then '11 Legal' else null end
        when q.owner_agent='CONSUMER' then case when q.lane='Sales & Marketing' then '07 DEAT Sales & Marketing – Consumer Goods & Handel' else null end
        else null
      end
      and c.proposed_owner_agent=case q.owner_agent when 'TECH' then 'PROD-SCOUT-TECH' when 'FIN' then 'PROD-SCOUT-FIN' when 'CONSUMER' then 'PROD-SCOUT-COM' else null end
      and not exists (
        select 1 from velanio.opportunities o where o.dedupe_key=r.dedupe_key
        or o.data->>'sourceUrl'=q.url
        or o.id=left('sheet-'||regexp_replace(lower(r.dedupe_key),'[^a-z0-9]+','-','g'),70)
      )
    order by r.reported_at asc
    limit 50
  ),eligible as(
    select * from candidates where company_id is not null
  ),payload as(
    select jsonb_build_object('collection','opportunities','id',canonical_id,'data',
      jsonb_build_object(
        'title',title,'company',company_id,'sourceUrl',url,'dedupeKey',dedupe_key,
        'sourceTab',source_tab,'fn',lane,'line','Perm','stage','Stage 0 – Company Signal',
        'region',classified_geo,'at',current_date::text,'created',current_date::text,
        'originType','JOB_AD','demandType','NONE','vacancy','LIVE',
        'oppStatus','CHECK PENDING','internalCheck','Offen','approvalStatus','Neu',
        'outreachAllowed',false,'discoveryId',discovery_id,'stage0ReceiptId',opportunity_id,
        'sourceVerificationMethod','OFFICIAL_ATS_PERM_STAGE0',
        'ownerHint',proposed_owner_agent,
        'why','Öffentliche, bestätigte Original-Stellenanzeige; kein externes Mandat belegt.',
        'nextStep','Account-/Off-Limit- und Entscheiderzugang prüfen; keine Ansprache vor Freigabe.',
        'details',jsonb_build_object('standort',coalesce(location,''),'vertrag','PERM',
          'originalquelle',url,'senioritaet',seniority)
      )
    ) as doc
    from eligible
  )
  select coalesce(jsonb_agg(doc),'[]'::jsonb),count(*) into v_docs,v_count from payload;

  if v_count>0 then
    select public.velanio_apply_batch(
      'PERM-STAGE0-BRIDGE-'||to_char(clock_timestamp() at time zone 'UTC','YYYYMMDDHH24MISSUS'),
      v_docs,
      jsonb_build_object('provider','perm-stage0-receipt-bridge-v1','stage','STAGE0_ONLY','outreach_allowed',false),
      'perm-stage0-receipt-bridge','radar'
    ) into v_applied;
    if coalesce(v_applied->>'status','')<>'applied'
       or coalesce((v_applied->>'inserted')::integer,0)<>v_count then
      raise exception 'Perm Stage0 bridge did not apply expected docs: %',v_applied;
    end if;
  end if;
  perform velanio_private.refresh_agent_stage0_sync_receipts_v1();
  return v_count;
end;
$function$
;

REVOKE ALL ON FUNCTION velanio_private.reconcile_perm_stage0_imports_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION velanio_private.reconcile_perm_stage0_imports_v1() TO postgres,service_role;
SELECT cron.schedule('velanio-perm-stage0-receipt-bridge-v1','53 * * * *',$cron$select velanio_private.reconcile_perm_stage0_imports_v1()$cron$);
