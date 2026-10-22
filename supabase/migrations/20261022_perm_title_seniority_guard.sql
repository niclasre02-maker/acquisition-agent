CREATE OR REPLACE VIEW velanio.agent_stage0_publish_ready_v1 AS  SELECT q.discovery_id,
    q.owner_agent,
    q.lane,
    q.company_name,
    q.title,
    q.location,
    q.company_industry,
    q.company_sector,
    q.seniority,
    q.contract_hint,
    q.source_country,
    q.classified_geo,
    q.raw_score,
    q.url AS original_url,
    q.ats,
    q.source_id,
    q.description,
    q.first_seen_at,
    q.queue_fresh_at,
    c.status AS qualification_status,
    c.ownership_status,
    c.proposed_owner_agent,
    l.check_status AS live_status,
    l.checked_provider,
    l.checked_at,
    'STAGE0_ONLY'::text AS publish_scope
   FROM velanio.perm_search_queue q
     JOIN velanio_private.agent_candidate_qualification_v1 c ON c.discovery_id = q.discovery_id
     JOIN velanio.agent_original_livecheck_v1 l ON l.discovery_id = q.discovery_id
  WHERE q.prefilter_relevant IS TRUE AND (q.owner_agent = ANY (ARRAY['TECH'::text, 'FIN'::text, 'CONSUMER'::text])) AND (q.owner_agent = 'TECH'::text AND (q.lane = ANY (ARRAY['Life Sciences'::text, 'IT & Digital'::text, 'Engineering'::text, 'HR & People'::text])) OR q.owner_agent = 'FIN'::text AND (q.lane = ANY (ARRAY['Finance'::text, 'Financial Services'::text, 'Legal'::text])) OR q.owner_agent = 'CONSUMER'::text AND q.lane = 'Sales & Marketing'::text) AND q.contract_hint = 'PERM'::text AND (q.classified_geo = ANY (ARRAY['DE'::text, 'AT'::text])) AND (q.seniority = ANY (ARRAY['Leadership'::text, 'Expert'::text])) AND q.raw_score >= 60 AND (q.seniority = 'Leadership'::text OR q.raw_score >= 65) AND length(btrim(q.title)) >= 14 AND q.title !~* '(^|[^a-z])(junior|trainee|intern|azubi|werkstudent|praktikant|ausbildung|entry.level|mitarbeiter produktion|production specialist|pharmakant|chemikant|personal banking)([^a-z]|$)'::text AND (q.lane <> 'Legal'::text OR q.title ~* '(legal|compliance|regulat|rechts|contract|datenschutz|governance|aml|privacy|dora)'::text) AND (q.owner_agent <> 'CONSUMER'::text OR COALESCE(q.company_sector, ''::text) ~* '(consumer|health|beauty|food|retail|commerce|lifestyle|fitness|sports|nutrition|fmcg|fashion|household)'::text) AND c.status = 'REVIEW_LIVE_AD_AND_ACCOUNT_OWNERSHIP'::text AND c.ownership_status = 'NO_EXACT_TARGET_MATCH_REVIEW'::text AND c.proposed_owner_agent =
        CASE q.owner_agent
            WHEN 'TECH'::text THEN 'PROD-SCOUT-TECH'::text
            WHEN 'FIN'::text THEN 'PROD-SCOUT-FIN'::text
            WHEN 'CONSUMER'::text THEN 'PROD-SCOUT-COM'::text
            ELSE NULL::text
        END AND c.account_route_block IS TRUE AND c.production_write_allowed IS FALSE AND c.matched_target_company IS NULL AND c.ownership_checked_at >= (now() - '12:00:00'::interval) AND c.evaluated_at >= (now() - '12:00:00'::interval) AND c.original_url = q.url AND c.job_title = q.title AND c.company_name = q.company_name AND l.check_status = 'LIVE_CONFIRMED'::text AND l.source_title_match = true AND (l.checked_provider = ANY (ARRAY['greenhouse'::text, 'smartrecruiters'::text, 'personio'::text])) AND (l.checked_provider <> 'personio'::text OR l.reason_code = 'OFFICIAL_XML_JOB_AND_TITLE_MATCH_PERMANENT'::text) AND l.checked_at >= (now() - '12:00:00'::interval) AND l.original_url = q.url AND q.queue_fresh_at >= (now() - '72:00:00'::interval) AND q.url ~~ 'https://%'::text AND q.company_name !~~ '% / %'::text AND q.company_name !~~ '% | %'::text AND q.company_name !~* '(recruiting.agentur|personalberatung|personalvermittlung|headhunter|staffing agency|recruitment agency)'::text AND NOT (EXISTS ( SELECT 1
           FROM velanio.opportunities o
          WHERE lower(regexp_replace(split_part(split_part(COALESCE(o.data ->> 'sourceUrl'::text, ''::text), '?'::text, 1), '#'::text, 1), '/$'::text, ''::text)) = lower(regexp_replace(split_part(split_part(q.url, '?'::text, 1), '#'::text, 1), '/$'::text, ''::text)))) AND NOT (EXISTS ( SELECT 1
           FROM velanio_private.agent_candidate_qualification_v1 other
          WHERE other.discovery_id <> c.discovery_id AND other.canonical_url = c.canonical_url AND other.queue_fresh_at > c.queue_fresh_at)) AND NOT (q.lane = 'HR & People' AND q.title ~* 'generalist[[:space:]]*/[[:space:]]*assistenz');
