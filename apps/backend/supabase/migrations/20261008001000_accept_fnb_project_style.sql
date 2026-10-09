begin;

-- Existing deployments may restrict backing projects to creative-mode. The F&B
-- campaign owns its validated style tokens; bold_pop is only backing metadata.
-- Keep the deployment's prior choices and add the value this campaign uses.
do $$
declare
  previous_expression text;
begin
  select pg_get_expr(conbin, conrelid) into previous_expression
  from pg_constraint
  where conrelid = 'public.video_projects'::regclass
    and conname = 'video_projects_style_id_check';

  if previous_expression is not null then
    alter table public.video_projects drop constraint video_projects_style_id_check;
    execute format(
      'alter table public.video_projects add constraint video_projects_style_id_check check ((%s) or style_id = %L)',
      previous_expression, 'bold_pop'
    );
  end if;
end;
$$;

commit;
